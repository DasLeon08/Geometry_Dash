/*
 * Neon Hop – Mehrspieler-Server.
 *
 * Ein kleiner WebSocket-Server, der Räume verwaltet und Nachrichten zwischen
 * den Spielern weiterleitet. Alle Spieler verbinden sich nur mit diesem Server
 * (keine direkten Verbindungen zwischen Handys), darum klappt es in jedem Netz.
 *
 * Start:  npm install && npm start      (Port aus $PORT, sonst 8787)
 * Umgebungsvariablen:
 *   PORT             Port (setzen Hoster wie Render automatisch)
 *   HOST             Adresse zum Lauschen (Standard 0.0.0.0)
 *   ALLOWED_ORIGINS  Komma-Liste erlaubter Seiten, "*" für einen Namensteil, z.B.
 *                    "https://*.playtoki.app,https://playtoki.app,https://toki-ashy.vercel.app"
 *                    Leer = alle Seiten erlaubt.
 *
 * Protokoll (JSON über WebSocket):
 *   → {op:'host'}                       ← {op:'hosted', code, id}
 *   → {op:'join', code}                 ← {op:'joined', code, id, host} | {op:'error', reason}
 *   → {op:'send', data, to?, except?}   Host: an einen Gast (to) oder an alle Gäste (ausser except)
 *                                       Gast: immer an den Host
 *                                       ← beim Empfänger {op:'msg', from, data}
 *   → {op:'kick', id}                   nur Host
 *   ← {op:'guest-joined', id} / {op:'guest-left', id} / {op:'host-left'}
 */
'use strict';

const http = require('http');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT) || 8787;
const HOST = process.env.HOST || '0.0.0.0';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map((s) => s.trim().replace(/\/$/, '').toLowerCase()).filter(Boolean);
// "*" steht für genau einen Teil des Namens: https://*.playtoki.app erlaubt https://neon-hop.playtoki.app
const ORIGIN_PATTERNS = ALLOWED_ORIGINS.map((o) =>
  new RegExp('^' + o.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[a-z0-9-]+') + '$'));

const MAX_PLAYERS = 4;          // Host + 3 Gäste
const MAX_ROOMS = 5000;
const MAX_MESSAGE_BYTES = 4096;
const MESSAGES_PER_SECOND = 80; // pro Verbindung, danach wird verworfen
const CODE_LEN = 5;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // ohne 0/O und 1/I

const rooms = new Map();        // Code -> { code, host, guests: Map(id -> Client) }

function newCode() {
  for (let tries = 0; tries < 50; tries++) {
    const bytes = crypto.randomBytes(CODE_LEN);
    let code = '';
    for (let i = 0; i < CODE_LEN; i++) code += ALPHABET[bytes[i] % ALPHABET.length];
    if (!rooms.has(code)) return code;
  }
  return null;
}

function send(client, obj) {
  if (client.ws.readyState === 1) client.ws.send(JSON.stringify(obj));
}

function originAllowed(origin) {
  if (!ORIGIN_PATTERNS.length) return true;
  const o = String(origin || '').replace(/\/$/, '').toLowerCase();
  return ORIGIN_PATTERNS.some((re) => re.test(o));
}

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
    res.end('Neon Hop Mehrspieler-Server läuft. Offene Räume: ' + rooms.size + '\n');
    return;
  }
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('Nicht gefunden\n');
});

const wss = new WebSocketServer({
  server,
  maxPayload: MAX_MESSAGE_BYTES,
  verifyClient: (info) => originAllowed(info.origin),
});

wss.on('connection', (ws) => {
  const client = {
    ws, id: crypto.randomBytes(6).toString('hex'), room: null, isHost: false,
    alive: true, tokens: MESSAGES_PER_SECOND, last: Date.now(),
  };
  ws.client = client;
  ws.on('pong', () => { client.alive = true; });
  ws.on('message', (raw, isBinary) => {
    if (isBinary) return;
    // einfache Begrenzung, damit niemand den Server mit Nachrichten flutet
    const now = Date.now();
    client.tokens = Math.min(MESSAGES_PER_SECOND, client.tokens + (now - client.last) / 1000 * MESSAGES_PER_SECOND);
    client.last = now;
    if (client.tokens < 1) return;
    client.tokens -= 1;
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch (e) { return; }
    if (msg && typeof msg === 'object') handle(client, msg);
  });
  ws.on('close', () => drop(client));
  ws.on('error', () => { /* Verbindungsfehler: close folgt */ });
});

function handle(c, m) {
  switch (m.op) {
    case 'host': {
      if (c.room) return;
      const code = rooms.size < MAX_ROOMS ? newCode() : null;
      if (!code) { send(c, { op: 'error', reason: 'busy' }); return; }
      const room = { code, host: c, guests: new Map() };
      rooms.set(code, room);
      c.room = room;
      c.isHost = true;
      send(c, { op: 'hosted', code, id: c.id });
      break;
    }
    case 'join': {
      if (c.room) return;
      const code = String(m.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LEN);
      const room = rooms.get(code);
      if (!room) { send(c, { op: 'error', reason: 'not-found' }); return; }
      if (room.guests.size + 1 >= MAX_PLAYERS) { send(c, { op: 'error', reason: 'full' }); return; }
      room.guests.set(c.id, c);
      c.room = room;
      send(c, { op: 'joined', code, id: c.id, host: room.host.id });
      send(room.host, { op: 'guest-joined', id: c.id });
      break;
    }
    case 'send': {
      const room = c.room;
      if (!room) return;
      const out = { op: 'msg', from: c.id, data: m.data };
      if (c.isHost) {
        if (typeof m.to === 'string') {
          const g = room.guests.get(m.to);
          if (g) send(g, out);
        } else {
          room.guests.forEach((g, id) => { if (id !== m.except) send(g, out); });
        }
      } else {
        send(room.host, out);
      }
      break;
    }
    case 'kick': {
      const room = c.room;
      if (!room || !c.isHost) return;
      const g = room.guests.get(String(m.id));
      if (g) { send(g, { op: 'kicked' }); g.ws.close(4000, 'kicked'); }
      break;
    }
    case 'ping':
      send(c, { op: 'pong' });
      break;
    default:
  }
}

function drop(c) {
  const room = c.room;
  if (!room) return;
  c.room = null;
  if (c.isHost) {
    rooms.delete(room.code);
    room.guests.forEach((g) => {
      g.room = null;
      send(g, { op: 'host-left' });
      g.ws.close(1000, 'host left');
    });
  } else if (room.guests.delete(c.id)) {
    send(room.host, { op: 'guest-left', id: c.id });
  }
}

// Tote Verbindungen (z.B. Handy im Funkloch) regelmässig aufräumen
const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    const c = ws.client;
    if (!c) return;
    if (!c.alive) { ws.terminate(); return; }
    c.alive = false;
    ws.ping();
  });
}, 25000);
wss.on('close', () => clearInterval(heartbeat));

server.listen(PORT, HOST, () => {
  console.log('Neon Hop Mehrspieler-Server läuft auf ' + HOST + ':' + PORT +
    (ALLOWED_ORIGINS.length ? ' (erlaubt: ' + ALLOWED_ORIGINS.join(', ') + ')' : ' (alle Seiten erlaubt)'));
});

module.exports = { server, wss, rooms };
