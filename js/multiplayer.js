/*
 * Neon Hop – Mehrspieler-Verbindung.
 *
 * Die Spieler verbinden sich direkt miteinander (WebRTC über PeerJS).
 * Ein Vermittlungs-Server wird nur für den Verbindungsaufbau gebraucht;
 * standardmässig der öffentliche PeerJS-Server. Einen eigenen Server kann man
 * vor dem Laden des Spiels einstellen:
 *   window.NEONHOP_PEER = { host: 'mein-server.example', port: 443, path: '/', secure: true };
 *
 * Aufbau: Der Host hat die Peer-ID "neonhop-v1-<CODE>", alle anderen verbinden
 * sich mit ihm (Stern). Der Host leitet Nachrichten an alle weiter.
 */
(function (root) {
  'use strict';

  const PREFIX = 'neonhop-v1-';
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // ohne 0/O und 1/I
  const CODE_LEN = 5;
  const MAX_GUESTS = 3;                                   // + Host = 4 Spieler

  let peer = null;
  let isHost = false;
  let code = null;
  let hostConn = null;
  const guests = new Map();   // Peer-ID -> Verbindung (nur beim Host)
  const handlers = {};

  function on(event, fn) { handlers[event] = fn; }
  function emit(event, data) { if (handlers[event]) handlers[event](data); }

  function loadLibrary() {
    return new Promise((resolve, reject) => {
      if (root.Peer) { resolve(); return; }
      const s = document.createElement('script');
      s.src = 'js/vendor/peerjs.min.js';
      s.onload = () => (root.Peer ? resolve() : reject(new Error('Mehrspieler konnte nicht geladen werden.')));
      s.onerror = () => reject(new Error('Mehrspieler konnte nicht geladen werden.'));
      document.head.appendChild(s);
    });
  }

  function friendlyError(e) {
    const t = e && e.type;
    if (t === 'peer-unavailable') return 'Raum nicht gefunden. Stimmt der Code?';
    if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed') {
      return 'Keine Verbindung zum Mehrspieler-Server. Bitte Internet prüfen.';
    }
    if (t === 'browser-incompatible') return 'Dein Browser unterstützt keinen Mehrspieler.';
    return (e && e.message) || 'Verbindung fehlgeschlagen.';
  }

  function openPeer(id) {
    return new Promise((resolve, reject) => {
      const opts = Object.assign({ debug: 0 }, root.NEONHOP_PEER || {});
      const p = id ? new root.Peer(id, opts) : new root.Peer(opts);
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        p.destroy();
        reject({ type: 'network' });
      }, 12000);
      p.on('open', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(p);
      });
      p.on('error', (e) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          p.destroy();
          reject(e);
          return;
        }
        if (e.type === 'peer-unavailable') emit('joinFailed', friendlyError(e));
      });
      p.on('disconnected', () => {
        // Verbindung zum Vermittlungs-Server weg: bestehende Spieler-Verbindungen laufen weiter
        if (peer === p && !p.destroyed) { try { p.reconnect(); } catch (err) { /* egal */ } }
      });
    });
  }

  function randomCode() {
    let c = '';
    const buf = new Uint32Array(CODE_LEN);
    (root.crypto || root.msCrypto).getRandomValues(buf);
    for (let i = 0; i < CODE_LEN; i++) c += ALPHABET[buf[i] % ALPHABET.length];
    return c;
  }

  function cleanCode(c) {
    return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LEN);
  }

  /** Raum erstellen. Gibt den Raumcode zurück. */
  async function host() {
    leave();
    await loadLibrary();
    for (let tries = 0; tries < 5; tries++) {
      const c = randomCode();
      try {
        peer = await openPeer(PREFIX + c);
      } catch (e) {
        if (e && e.type === 'unavailable-id') continue;   // Code schon vergeben
        throw new Error(friendlyError(e));
      }
      code = c;
      isHost = true;
      if (window.toki) window.toki.room(c);
      peer.on('connection', (conn) => {
        if (guests.size >= MAX_GUESTS) {
          // kurz warten, damit die Nachricht sicher ankommt, dann trennen
          conn.on('open', () => { setTimeout(() => { if (conn.open) conn.send({ t: 'full' }); }, 250); setTimeout(() => conn.close(), 1500); });
          return;
        }
        conn.on('open', () => { guests.set(conn.peer, conn); emit('guestJoined', conn.peer); });
        conn.on('data', (msg) => emit('message', { from: conn.peer, msg }));
        conn.on('close', () => { if (guests.delete(conn.peer)) emit('guestLeft', conn.peer); });
        conn.on('error', () => { if (guests.delete(conn.peer)) emit('guestLeft', conn.peer); });
      });
      return c;
    }
    throw new Error('Kein freier Raumcode gefunden. Bitte nochmal versuchen.');
  }

  /** Einem Raum beitreten. */
  async function join(rawCode) {
    leave();
    const c = cleanCode(rawCode);
    if (c.length !== CODE_LEN) throw new Error('Der Raumcode hat ' + CODE_LEN + ' Zeichen.');
    await loadLibrary();
    try {
      peer = await openPeer(null);
    } catch (e) {
      throw new Error(friendlyError(e));
    }
    return new Promise((resolve, reject) => {
      let done = false;
      const fail = (text) => { if (done) return; done = true; leave(); reject(new Error(text)); };
      const timer = setTimeout(() => fail('Raum nicht gefunden. Stimmt der Code?'), 12000);
      on('joinFailed', (text) => { clearTimeout(timer); fail(text); });
      const conn = peer.connect(PREFIX + c, { reliable: true, serialization: 'json' });
      conn.on('open', () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        hostConn = conn;
        code = c;
        isHost = false;
        if (window.toki) window.toki.room(c);
        resolve(c);
      });
      conn.on('data', (msg) => emit('message', { from: 'host', msg }));
      conn.on('close', () => { if (hostConn === conn) { hostConn = null; emit('hostLeft'); } });
      conn.on('error', () => { if (hostConn === conn) { hostConn = null; emit('hostLeft'); } });
    });
  }

  /** Host: an alle (ausser except). Gast: an den Host. */
  function send(msg, except) {
    if (isHost) guests.forEach((conn, id) => { if (id !== except && conn.open) conn.send(msg); });
    else if (hostConn && hostConn.open) hostConn.send(msg);
  }
  function sendTo(id, msg) {
    const conn = guests.get(id);
    if (conn && conn.open) conn.send(msg);
  }
  function kick(id) {
    const conn = guests.get(id);
    if (conn) conn.close();
  }

  function leave() {
    guests.forEach((conn) => { try { conn.close(); } catch (e) { /* egal */ } });
    guests.clear();
    if (hostConn) { const c = hostConn; hostConn = null; try { c.close(); } catch (e) { /* egal */ } }
    if (peer) { const p = peer; peer = null; try { p.destroy(); } catch (e) { /* egal */ } }
    if (code && window.toki) window.toki.room(null);
    isHost = false;
    code = null;
  }

  root.Net = {
    host, join, send, sendTo, kick, leave, on, cleanCode,
    CODE_LEN,
    get isHost() { return isHost; },
    get code() { return code; },
    get id() { return peer ? peer.id : null; },
    get connected() { return !!peer && (isHost || !!hostConn); },
  };
})(this);
