/*
 * Neon Hop – HTTP-API für Online-Level.
 *
 *   GET  /api/levels?sort=neu|beliebt|gespielt&q=&seite=1   Liste (8 pro Seite)
 *   GET  /api/levels/:id                                     ein Level
 *   POST /api/levels                                         veröffentlichen
 *        { name, author, theme, music, difficulty, rows, replay, authorKey }
 *   POST /api/levels/:id/play | like | report                { voterKey }
 *   POST /api/levels/:id/delete                              { authorKey }  (eigenes Level)
 *   GET  /api/admin/levels?filter=gemeldet|neu               Kopfzeile x-admin-token
 *   POST /api/admin/levels/:id/hide | show | delete
 *   GET  /admin                                              Verwaltungsseite
 *
 * Ein Level wird nur gespeichert, wenn der mitgeschickte Lauf (replay) mit der
 * Spielphysik aus js/engine.js nachgespielt das Ziel erreicht.
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { cleanText, isBlocked } = require('./filter');
const { publicLevel } = require('./store');

const ROWS = 10;
const MIN_COLS = 30;
const MAX_COLS = 1012;
const MIN_OBJECTS = 5;
const MAX_TOGGLES = 50000;
const MAX_BODY = 64 * 1024;
const HIDE_AT_REPORTS = 5;
const THEMES = 15;

const MESSAGES = {
  name: 'Dieser Name ist nicht erlaubt. Bitte wähle einen anderen.',
  author: 'Dein Spielername ist nicht erlaubt. Bitte ändere ihn im Mehrspieler-Fenster.',
  format: 'Das Level ist ungültig.',
  small: 'Das Level ist zu klein (mindestens 5 Objekte und 30 Spalten).',
  unbeaten: 'Der Lauf erreicht das Ziel nicht. Bitte schaffe das Level im Editor nochmal von Anfang an.',
  rate: 'Zu viele Anfragen. Bitte versuche es später nochmal.',
  notfound: 'Dieses Level gibt es nicht (mehr).',
  forbidden: 'Das darfst du nicht.',
  body: 'Die Anfrage ist zu gross oder kaputt.',
  db: 'Die Level-Datenbank ist gerade nicht erreichbar.',
};

function hash(text) { return crypto.createHash('sha256').update(String(text)).digest('hex'); }
function newId() { return BigInt('0x' + crypto.randomBytes(8).toString('hex')).toString(36).slice(0, 10); }
function validKey(k) { return typeof k === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(k); }
function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** Einfache Begrenzung: höchstens max Anfragen pro Zeitfenster und Schlüssel. */
function limiter(max, windowMs) {
  const hits = new Map();
  setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (v.until < now) hits.delete(k); }, windowMs).unref();
  return (key) => {
    const now = Date.now();
    const v = hits.get(key);
    if (!v || v.until < now) { hits.set(key, { n: 1, until: now + windowMs }); return true; }
    v.n++;
    return v.n <= max;
  };
}

function createLevelApi({ store, engine, originAllowed, adminToken, log }) {
  const allowedChars = new Set(Object.keys(engine.CHAR_TYPES).concat('.'));
  const limitPublish = limiter(5, 60 * 60 * 1000);
  const limitGeneral = limiter(120, 60 * 1000);
  const limitPlay = limiter(1, 30 * 1000);
  const adminHtml = fs.readFileSync(path.join(__dirname, 'admin.html'), 'utf8');
  const adminJs = fs.readFileSync(path.join(__dirname, 'admin.js'), 'utf8');
  let storeOk = false;
  let lastInit = 0;
  /** Datenbank bereit? Wenn nicht, höchstens alle 20 s neu verbinden (Neon schläft manchmal). */
  async function ensureStore() {
    if (storeOk) return true;
    if (Date.now() - lastInit < 20000) return false;
    lastInit = Date.now();
    try { await store.init(); storeOk = true; } catch (e) { log('Level-Datenbank nicht erreichbar: ' + e.message); }
    return storeOk;
  }

  function clientIp(req) {
    // Der Hoster (Render) hängt die echte Adresse hinten an; vordere Einträge kann jeder fälschen
    const fwd = String(req.headers['x-forwarded-for'] || '').split(',').pop().trim();
    return fwd || req.socket.remoteAddress || '?';
  }
  function sameOrigin(req, origin) {
    return origin === 'https://' + req.headers.host || origin === 'http://' + req.headers.host;
  }
  function send(res, status, obj, origin) {
    const headers = {
      'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
      'x-content-type-options': 'nosniff', vary: 'Origin',
    };
    if (origin) {
      headers['access-control-allow-origin'] = origin;
      headers['access-control-allow-methods'] = 'GET, POST, OPTIONS';
      headers['access-control-allow-headers'] = 'content-type, x-admin-token';
      headers['access-control-max-age'] = '600';
    }
    res.writeHead(status, headers);
    res.end(status === 204 ? '' : JSON.stringify(obj));
  }
  function fail(res, status, code, origin) { send(res, status, { error: code, message: MESSAGES[code] || code }, origin); }

  function readBody(req) {
    return new Promise((resolve) => {
      let size = 0;
      const chunks = [];
      let tooBig = false;
      req.on('data', (c) => {
        if (tooBig) return;
        size += c.length;
        // zu gross: sofort ablehnen, Rest nicht mehr ansehen (Verbindung wird nach der Antwort getrennt)
        if (size > MAX_BODY) { tooBig = true; chunks.length = 0; resolve(null); return; }
        chunks.push(c);
      });
      req.on('end', () => {
        if (tooBig) { resolve(null); return; }
        try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { resolve(null); }
      });
      req.on('error', () => resolve(null));
    });
  }

  /** Level aus der Anfrage prüfen und nachspielen. Gibt { error } oder { rec } zurück. */
  function checkLevel(b) {
    if (!b || typeof b !== 'object') return { error: 'format' };
    const name = cleanText(b.name, 24);
    if (!name) return { error: 'name' };
    if (isBlocked(name)) return { error: 'name' };
    const author = cleanText(b.author, 16) || 'Spieler';
    if (isBlocked(author)) return { error: 'author' };
    const rows = b.rows;
    if (!Array.isArray(rows) || rows.length !== ROWS || !rows.every((r) => typeof r === 'string')) return { error: 'format' };
    const w = rows[0].length;
    if (w > MAX_COLS || !rows.every((r) => r.length === w)) return { error: 'format' };
    let objects = 0;
    for (const r of rows) for (const ch of r) { if (!allowedChars.has(ch)) return { error: 'format' }; if (ch !== '.') objects++; }
    if (w < MIN_COLS || objects < MIN_OBJECTS) return { error: 'small' };
    const theme = Number(b.theme), music = Number(b.music), difficulty = Number(b.difficulty);
    if (![theme, music].every((n) => Number.isInteger(n) && n >= 0 && n < THEMES)) return { error: 'format' };
    if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 4) return { error: 'format' };
    if (!validKey(b.authorKey)) return { error: 'format' };
    const rp = b.replay;
    if (!rp || typeof rp !== 'object' || !Array.isArray(rp.t) || rp.t.length > MAX_TOGGLES) return { error: 'format' };
    for (let i = 0; i < rp.t.length; i++) {
      if (!Number.isInteger(rp.t[i]) || rp.t[i] < 0 || (i && rp.t[i] <= rp.t[i - 1])) return { error: 'format' };
    }
    const result = engine.runReplay({ id: 'pruefung', map: [rows] }, { h0: rp.h0 === true, t: rp.t });
    if (!result.won) return { error: 'unbeaten' };
    return {
      rec: {
        name, author, author_hash: hash(b.authorKey), theme, music, difficulty,
        data: JSON.stringify(rows), length: w, objects,
      },
    };
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;
    if (p === '/admin' || p === '/admin.js') {
      const js = p === '/admin.js';
      res.writeHead(200, {
        'content-type': (js ? 'text/javascript' : 'text/html') + '; charset=utf-8',
        'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY',
        'content-security-policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'",
      });
      res.end(js ? adminJs : adminHtml);
      return true;
    }
    if (!p.startsWith('/api/')) return false;

    const origin = req.headers.origin;
    const corsOrigin = origin && (originAllowed(origin) || sameOrigin(req, origin)) ? origin : null;
    if (origin && !corsOrigin) { fail(res, 403, 'forbidden'); return true; }
    if (req.method === 'OPTIONS') { send(res, 204, null, corsOrigin); return true; }
    const ip = clientIp(req);
    if (!limitGeneral(ip)) { fail(res, 429, 'rate', corsOrigin); return true; }
    if (!(await ensureStore())) { fail(res, 503, 'db', corsOrigin); return true; }

    const parts = p.split('/').filter(Boolean);   // ['api', 'levels', id?, action?]
    try {
      // ----- Verwaltung -----
      if (parts[1] === 'admin') {
        if (!adminToken || !safeEqual(req.headers['x-admin-token'] || '', adminToken)) { fail(res, 403, 'forbidden', corsOrigin); return true; }
        if (req.method === 'GET' && parts[2] === 'levels' && !parts[3]) {
          send(res, 200, { items: await store.adminList(url.searchParams.get('filter') === 'gemeldet' ? 'gemeldet' : 'neu') }, corsOrigin);
          return true;
        }
        if (req.method === 'POST' && parts[2] === 'levels' && parts[3] && parts[4]) {
          const id = parts[3].slice(0, 20);
          let ok = false;
          if (parts[4] === 'hide') ok = await store.setHidden(id, true);
          else if (parts[4] === 'show') ok = await store.setHidden(id, false);
          else if (parts[4] === 'delete') ok = await store.remove(id);
          if (!ok) { fail(res, 404, 'notfound', corsOrigin); return true; }
          log('Verwaltung: ' + parts[4] + ' ' + id);
          send(res, 200, { ok: true }, corsOrigin);
          return true;
        }
        fail(res, 404, 'notfound', corsOrigin);
        return true;
      }
      if (parts[1] !== 'levels') { fail(res, 404, 'notfound', corsOrigin); return true; }

      // ----- Liste / ein Level -----
      if (req.method === 'GET' && !parts[2]) {
        const sort = ['neu', 'beliebt', 'gespielt'].includes(url.searchParams.get('sort')) ? url.searchParams.get('sort') : 'neu';
        const q = cleanText(url.searchParams.get('q') || '', 30);
        const page = Math.max(1, Math.min(500, Number(url.searchParams.get('seite')) || 1));
        const r = await store.list({ sort, q, page });
        send(res, 200, { items: r.items, page, pages: Math.max(1, Math.ceil(r.total / 8)), total: r.total }, corsOrigin);
        return true;
      }
      if (req.method === 'GET' && parts[2] && !parts[3]) {
        const l = await store.get(parts[2].slice(0, 20));
        if (!l) { fail(res, 404, 'notfound', corsOrigin); return true; }
        send(res, 200, publicLevel(l, true), corsOrigin);
        return true;
      }
      if (req.method !== 'POST') { fail(res, 404, 'notfound', corsOrigin); return true; }

      const body = await readBody(req);
      if (body === null) {
        res.setHeader('connection', 'close');
        res.on('finish', () => req.destroy());
        fail(res, 413, 'body', corsOrigin);
        return true;
      }

      // ----- Veröffentlichen -----
      if (!parts[2]) {
        if (!limitPublish(ip)) { fail(res, 429, 'rate', corsOrigin); return true; }
        const c = checkLevel(body);
        if (c.error) { fail(res, 400, c.error, corsOrigin); return true; }
        const dup = await store.findDuplicate(c.rec.author_hash, c.rec.data);
        if (dup) { send(res, 200, { id: dup, duplicate: true }, corsOrigin); return true; }
        const rec = Object.assign({ id: newId(), created_at: Date.now() }, c.rec);
        await store.create(rec);
        log('Neues Level ' + rec.id + ' „' + rec.name + '“ von ' + rec.author);
        send(res, 201, { id: rec.id }, corsOrigin);
        return true;
      }

      // ----- Aktionen zu einem Level -----
      const id = parts[2].slice(0, 20);
      const action = parts[3];
      if (action === 'play') {
        const plays = limitPlay(ip + '|' + id) ? await store.addPlay(id) : -1;
        if (plays === null) { fail(res, 404, 'notfound', corsOrigin); return true; }
        send(res, 200, { ok: true }, corsOrigin);
        return true;
      }
      if (action === 'like' || action === 'report') {
        if (!validKey(body.voterKey)) { fail(res, 400, 'format', corsOrigin); return true; }
        const voter = hash('voter:' + body.voterKey);
        const r = action === 'like' ? await store.toggleLike(id, voter) : await store.report(id, voter, HIDE_AT_REPORTS);
        if (!r) { fail(res, 404, 'notfound', corsOrigin); return true; }
        if (action === 'report' && r.hidden && !r.already) log('Level ' + id + ' nach Meldungen versteckt');
        send(res, 200, r, corsOrigin);
        return true;
      }
      if (action === 'delete') {
        const l = await store.get(id, true);
        if (!l) { fail(res, 404, 'notfound', corsOrigin); return true; }
        if (!validKey(body.authorKey) || !safeEqual(hash(body.authorKey), l.author_hash)) { fail(res, 403, 'forbidden', corsOrigin); return true; }
        await store.remove(id);
        send(res, 200, { ok: true }, corsOrigin);
        return true;
      }
      fail(res, 404, 'notfound', corsOrigin);
      return true;
    } catch (e) {
      log('Fehler in der Level-API: ' + (e && e.message));
      // Verbindung zur Datenbank weg? Dann beim nächsten Mal neu verbinden
      if (store.kind === 'postgres' && e && (/^(ECONN|ETIMEDOUT|EPIPE|57P0)/.test(String(e.code || '')) || /terminat|connect/i.test(String(e.message)))) storeOk = false;
      fail(res, 503, 'db', corsOrigin);
      return true;
    }
  }

  return {
    handle,
    init: ensureStore,
  };
}

module.exports = { createLevelApi, MESSAGES };
