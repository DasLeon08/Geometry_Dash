/*
 * Neon Hop – Mehrspieler-Verbindung.
 *
 * Alle Spieler verbinden sich per WebSocket mit dem eigenen Mehrspieler-Server
 * (Ordner server/). Der Server verwaltet die Räume und leitet Nachrichten
 * weiter – es gibt keine direkten Verbindungen zwischen den Geräten, darum
 * funktioniert es auch im Handy-Netz.
 *
 * Die Adresse des Servers steht in js/config.js (NEONHOP_CONFIG.server).
 */
(function (root) {
  'use strict';

  const CODE_LEN = 5;
  const CONNECT_TIMEOUT = 45000;   // kostenlose Hoster brauchen beim Aufwachen etwas länger
  const SLOW_AFTER = 4000;
  const ERRORS = {
    'not-found': 'Raum nicht gefunden. Stimmt der Code?',
    full: 'Der Raum ist voll (max. 4 Spieler).',
    busy: 'Der Server ist gerade voll. Bitte später nochmal versuchen.',
  };
  const NO_CONNECTION = 'Keine Verbindung zum Mehrspieler-Server. Bitte Internet prüfen.';

  let ws = null;
  let isHost = false;
  let code = null;
  let myId = null;
  let pending = null;          // wartet auf 'hosted' / 'joined'
  let pingTimer = null;
  const handlers = {};

  function on(event, fn) { handlers[event] = fn; }
  function emit(event, data) { if (handlers[event]) handlers[event](data); }

  function serverUrl() {
    const cfg = root.NEONHOP_CONFIG || {};
    return String(root.NEONHOP_SERVER || cfg.server || '').trim();
  }
  /** Kostenlose Hoster legen den Server schlafen: früh anklopfen, damit er wach ist, wenn man klickt. */
  let lastWake = 0;
  function wake() {
    const url = serverUrl();
    if (!url || !root.fetch || Date.now() - lastWake < 60000) return;
    lastWake = Date.now();
    const http = url.replace(/^ws(s?):\/\//, 'http$1://').replace(/\/+$/, '') + '/health';
    try { root.fetch(http, { mode: 'no-cors', cache: 'no-store' }).catch(() => {}); } catch (e) { /* egal */ }
  }

  function cleanCode(c) {
    return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LEN);
  }

  function connect() {
    return new Promise((resolve, reject) => {
      const url = serverUrl();
      if (!url) { reject(new Error('Der Mehrspieler-Server ist noch nicht eingerichtet.')); return; }
      let s;
      try { s = new WebSocket(url); } catch (e) { reject(new Error('Die Adresse des Mehrspieler-Servers ist ungültig.')); return; }
      let settled = false;
      const slow = setTimeout(() => { if (!settled) emit('slow'); }, SLOW_AFTER);
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        clearTimeout(slow);
        try { s.close(); } catch (e) { /* egal */ }
        reject(new Error(NO_CONNECTION));
      }, CONNECT_TIMEOUT);
      s.onopen = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer); clearTimeout(slow);
        resolve(s);
      };
      s.onerror = () => { /* close folgt */ };
      s.onclose = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer); clearTimeout(slow);
        reject(new Error(NO_CONNECTION));
      };
    });
  }

  function attach(s) {
    ws = s;
    s.onmessage = (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m && typeof m === 'object') onServer(m);
    };
    s.onclose = () => {
      if (ws !== s) return;            // absichtlich getrennt (leave)
      const wasHost = isHost;
      const waiting = pending;
      reset();
      if (waiting) { waiting.reject(new Error(NO_CONNECTION)); return; }
      emit(wasHost ? 'disconnected' : 'hostLeft', { lost: true });
    };
    clearInterval(pingTimer);
    pingTimer = setInterval(() => raw({ op: 'ping' }), 20000);   // hält die Verbindung wach
  }

  function onServer(m) {
    if (pending && (m.op === pending.ok || m.op === 'error')) {
      const p = pending;
      pending = null;
      clearTimeout(p.timer);
      if (m.op === 'error') p.reject(new Error(ERRORS[m.reason] || 'Verbindung fehlgeschlagen.'));
      else p.resolve(m);
      return;
    }
    switch (m.op) {
      case 'guest-joined': emit('guestJoined', String(m.id)); break;
      case 'guest-left': emit('guestLeft', String(m.id)); break;
      case 'msg': emit('message', { from: isHost ? String(m.from) : 'host', msg: m.data }); break;
      case 'host-left': emit('hostLeft'); break;
      default:
    }
  }

  function request(obj, ok) {
    return new Promise((resolve, reject) => {
      pending = {
        ok, resolve, reject,
        timer: setTimeout(() => { if (pending && pending.ok === ok) { pending = null; reject(new Error('Der Server antwortet nicht.')); } }, 10000),
      };
      raw(obj);
    });
  }

  function raw(obj) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
  }

  function reset() {
    clearInterval(pingTimer);
    ws = null; isHost = false; code = null; myId = null; pending = null;
  }

  /** Raum erstellen. Gibt den Raumcode zurück. */
  async function host() {
    leave();
    attach(await connect());
    try {
      const r = await request({ op: 'host' }, 'hosted');
      isHost = true;
      code = r.code;
      myId = r.id;
      return code;
    } catch (e) {
      leave();
      throw e;
    }
  }

  /** Einem Raum beitreten. */
  async function join(rawCode) {
    leave();
    const c = cleanCode(rawCode);
    if (c.length !== CODE_LEN) throw new Error('Der Raumcode hat ' + CODE_LEN + ' Zeichen.');
    attach(await connect());
    try {
      const r = await request({ op: 'join', code: c }, 'joined');
      isHost = false;
      code = c;
      myId = r.id;
      return c;
    } catch (e) {
      leave();
      throw e;
    }
  }

  /** Host: an alle Gäste (ausser except). Gast: an den Host. */
  function send(msg, except) {
    raw(isHost ? { op: 'send', data: msg, except } : { op: 'send', data: msg });
  }
  function sendTo(id, msg) { if (isHost) raw({ op: 'send', to: id, data: msg }); }
  function kick(id) { if (isHost) raw({ op: 'kick', id }); }

  function leave() {
    const s = ws;
    reset();
    if (s) { try { s.close(1000); } catch (e) { /* egal */ } }
  }

  root.Net = {
    host, join, send, sendTo, kick, leave, on, cleanCode, wake,
    CODE_LEN,
    get isHost() { return isHost; },
    get code() { return code; },
    get id() { return myId; },
    get connected() { return !!ws && ws.readyState === 1; },
    get configured() { return !!serverUrl(); },
  };
})(this);
