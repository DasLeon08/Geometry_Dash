/*
 * Tests für die Online-Level-API:  npm test
 * Läuft zweimal durch: mit dem Arbeitsspeicher und mit Postgres (nachgebildet durch pg-mem).
 * Zum Schluss ein kurzer Test des echten server.js als eigener Prozess.
 */
'use strict';
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { newDb } = require('pg-mem');
const engine = require(path.join(__dirname, '..', 'js', 'engine.js'));
const { MemoryStore, PgStore } = require('./store');
const { createLevelApi } = require('./levels');

let failed = 0;
function ok(cond, text) {
  console.log((cond ? 'OK     ' : 'FEHLER ') + text);
  if (!cond) failed++;
}

// ----- Hilfen ------------------------------------------------------------
function rowsWith(cols, items) {
  const g = [];
  for (let i = 0; i < 10; i++) g.push(new Array(cols).fill('.'));
  items.forEach(([ch, x, y]) => { g[9 - y][x] = ch; });
  return g.map((r) => r.join(''));
}
/** Lösung per Breitensuche finden und als Replay (Wechsel-Schritte) zurückgeben. */
function solve(rows) {
  const lvl = engine.parseLevel({ map: [rows] });
  const SUB = 8;
  let fr = [{ s: engine.createState(), h: [] }];
  for (let guard = 0; guard < 4000 && fr.length; guard++) {
    const next = new Map();
    for (const st of fr) {
      for (const held of [false, true]) {
        const s = engine.cloneState(st.s);
        let dead = false;
        for (let i = 0; i < SUB && !s.won; i++) { engine.step(s, lvl, held, engine.C.DT); s.events.length = 0; if (s.dead) { dead = true; break; } }
        if (dead) continue;
        const h = st.h.concat([held]);
        if (s.won) {
          const t = [];
          let last = false;
          h.forEach((v, i) => { if (v !== last) { t.push(i * SUB); last = v; } });
          return { h0: false, t };
        }
        const k = [Math.round(s.y * 40), Math.round(s.vy * 4), s.prevHeld, s.onGround, s.buffer > 0].join('|');
        if (!next.has(k)) next.set(k, { s, h });
      }
    }
    fr = [...next.values()];
  }
  return null;
}
function request(port, method, p, body, headers) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : (typeof body === 'string' ? body : JSON.stringify(body));
    const req = http.request({ host: '127.0.0.1', port, method, path: p, headers: Object.assign({ 'content-type': 'application/json' }, headers || {}) }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch (e) { json = null; }
        resolve({ status: res.statusCode, headers: res.headers, json, text });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

const KEY_A = 'autor-schluessel-1234567890';
const KEY_B = 'anderer-autor-abcdefghijkl';
const COINS = rowsWith(40, [['c', 10, 3], ['c', 12, 3], ['c', 14, 3], ['c', 16, 3], ['c', 18, 3]]);
const SPIKES = rowsWith(45, [['^', 12, 0], ['^', 20, 0], ['^', 21, 0], ['c', 26, 3], ['^', 30, 0]]);

async function suite(label, store) {
  console.log('--- ' + label);
  const logs = [];
  const api = createLevelApi({
    store, engine, adminToken: 'admin-geheim-123',
    originAllowed: (o) => o === 'https://toki.example' || /^https:\/\/[a-z0-9-]+\.playtoki\.app$/.test(o),
    log: (m) => logs.push(m),
  });
  await api.init();
  const srv = http.createServer(async (req, res) => { if (!(await api.handle(req, res))) { res.writeHead(404); res.end(); } });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  let ip = 1;
  const fresh = () => ({ 'x-forwarded-for': 'gefaelscht, 10.0.0.' + (ip++) });   // jede Gruppe eigene Adresse
  const pub = (body, h) => request(port, 'POST', '/api/levels', body, h || fresh());
  const base = { name: 'Münzregen', author: 'Leon', theme: 2, music: 3, difficulty: 1, authorKey: KEY_A };

  try {
    let r = await request(port, 'GET', '/api/levels');
    ok(r.status === 200 && r.json.items.length === 0, 'leere Liste');

    // Veröffentlichen
    r = await pub(Object.assign({}, base, { rows: COINS, replay: { h0: false, t: [] } }));
    ok(r.status === 201 && /^[a-z0-9]+$/.test(r.json.id), 'Level ohne Hindernis mit leerem Lauf veröffentlicht');
    const idCoins = r.json.id;
    r = await pub(Object.assign({}, base, { rows: COINS, replay: { h0: false, t: [] } }));
    ok(r.json.id === idCoins && r.json.duplicate, 'gleiches Level nochmal -> keine Kopie');
    r = await pub(Object.assign({}, base, { name: 'Stachelfeld', rows: SPIKES, replay: { h0: false, t: [] } }));
    ok(r.status === 400 && r.json.error === 'unbeaten', 'Lauf ohne Springen stirbt -> abgelehnt');
    const sol = solve(SPIKES);
    ok(!!sol, 'Lösung für Stachel-Level gefunden (' + (sol ? sol.t.length : 0) + ' Wechsel)');
    r = await pub(Object.assign({}, base, { name: 'Stachelfeld', rows: SPIKES, replay: sol }));
    ok(r.status === 201, 'Stachel-Level mit echter Lösung veröffentlicht');
    const idSpikes = r.json.id;
    const late = { h0: false, t: sol.t.map((n) => n + 60) };   // jede Eingabe 1/4 s zu spät
    ok(!engine.runReplay({ map: [SPIKES] }, late).won, 'verspäteter Lauf scheitert laut Spielphysik');
    r = await pub(Object.assign({}, base, { name: 'Stachelfeld 2', rows: SPIKES, replay: late }));
    ok(r.status === 400 && r.json.error === 'unbeaten', 'verspäteter (gefälschter) Lauf -> abgelehnt');

    // Neue Objekte (Etappe 3): Tempo, rosa Feld, Mini/Normal
    const NEW = rowsWith(60, [['3', 4, 1], ['p', 14, 0], ['K', 30, 1], ['c', 40, 1], ['N', 45, 1], ['1', 50, 1]]);
    r = await pub(Object.assign({}, base, { name: 'Neue Teile', rows: NEW, replay: { h0: false, t: [] } }));
    ok(r.status === 201, 'Level mit neuen Objekten veröffentlicht');
    const newObjId = r.json.id;
    const fxId = (await pub(Object.assign({}, base, { name: 'Mit Effekten', rows: NEW, replay: { h0: false, t: [] },
      extras: [{ x: 5, y: 2, t: 'color', p: { theme: 3, fade: 1 } }, { x: 9, y: 2, t: 'zoom', p: { zoom: 9 } }, { x: 9, y: 3, t: 'kaputt' }] }))).json.id;
    r = await request(port, 'GET', '/api/levels/' + fxId);
    ok(r.json.extras.length === 2 && r.json.extras[1].p.zoom === 1.3 && r.json.rows.length === 10, 'Effekte gespeichert und geprüft (unbekannte entfernt, Werte begrenzt)');
    await request(port, 'POST', '/api/admin/levels/' + fxId + '/delete', {}, { 'x-admin-token': 'admin-geheim-123' });
    await request(port, 'POST', '/api/admin/levels/' + newObjId + '/delete', {}, { 'x-admin-token': 'admin-geheim-123' });

    // Prüfungen
    r = await pub(Object.assign({}, base, { name: 'Fick dich', rows: COINS, replay: { h0: false, t: [] } }));
    ok(r.status === 400 && r.json.error === 'name', 'Schimpfwort im Namen -> abgelehnt');
    r = await pub(Object.assign({}, base, { name: 'Ok', author: 'www.spam.ch', rows: COINS, replay: { h0: false, t: [] } }));
    ok(r.status === 400 && r.json.error === 'author', 'Link als Spielername -> abgelehnt');
    r = await pub(Object.assign({}, base, { rows: COINS.slice(0, 9), replay: { h0: false, t: [] } }));
    ok(r.status === 400 && r.json.error === 'format', '9 Zeilen -> ungültig');
    r = await pub(Object.assign({}, base, { rows: COINS.map((x, i) => (i === 0 ? 'X' + x.slice(1) : x)), replay: { h0: false, t: [] } }));
    ok(r.status === 400 && r.json.error === 'format', 'unbekanntes Zeichen -> ungültig');
    r = await pub(Object.assign({}, base, { rows: rowsWith(40, [['c', 10, 3]]), replay: { h0: false, t: [] } }));
    ok(r.status === 400 && r.json.error === 'small', 'nur 1 Objekt -> zu klein');
    r = await pub(Object.assign({}, base, { rows: COINS, replay: { h0: false, t: [5, 3] } }));
    ok(r.status === 400 && r.json.error === 'format', 'Lauf nicht aufsteigend -> ungültig');
    r = await pub(Object.assign({}, base, { rows: COINS, authorKey: 'kurz', replay: { h0: false, t: [] } }));
    ok(r.status === 400, 'zu kurzer Autor-Schlüssel -> ungültig');
    r = await pub('{kaputt');
    ok(r.status === 413 || r.status === 400, 'kaputtes JSON -> abgelehnt');
    r = await pub('x'.repeat(70000));
    ok(r.status === 413, 'zu grosse Anfrage -> 413');
    // Begrenzung: 5 pro Stunde und Adresse
    const same = { 'x-forwarded-for': '10.9.9.9' };
    let blocked = 0;
    for (let i = 0; i < 7; i++) { const x = await pub(Object.assign({}, base, { name: 'Spam ' + i, rows: COINS, replay: { h0: false, t: [] } }), same); if (x.status === 429) blocked++; }
    ok(blocked === 2, 'mehr als 5 Veröffentlichungen pro Stunde -> gebremst');
    const spoof = await pub(Object.assign({}, base, { name: 'Trick', rows: COINS, replay: { h0: false, t: [] } }), { 'x-forwarded-for': '1.2.3.4, 10.9.9.9' });
    ok(spoof.status === 429, 'gefälschte vordere Adresse umgeht die Bremse nicht');

    // Liste, Suche, einzelnes Level
    r = await request(port, 'GET', '/api/levels?sort=neu');
    ok(r.json.items.length === 2 && r.json.items[0].id === idSpikes && Array.isArray(r.json.items[0].rows), 'Liste neueste zuerst, mit Level-Daten');
    r = await request(port, 'GET', '/api/levels?q=m%C3%BCnz');
    ok(r.json.items.length === 1 && r.json.items[0].id === idCoins, 'Suche nach Name');
    r = await request(port, 'GET', '/api/levels/' + idCoins);
    ok(r.status === 200 && r.json.rows.length === 10 && r.json.author === 'Leon' && !('author_hash' in r.json), 'einzelnes Level ohne geheime Felder');

    // Spielen, Liken, Melden
    r = await request(port, 'POST', '/api/levels/' + idCoins + '/play', {}, fresh());
    ok(r.status === 200, 'gespielt gezählt');
    const v1 = { voterKey: 'waehler-schluessel-0000001' };
    r = await request(port, 'POST', '/api/levels/' + idCoins + '/like', v1, fresh());
    ok(r.json.liked === true && r.json.likes === 1, 'Like gesetzt');
    r = await request(port, 'POST', '/api/levels/' + idCoins + '/like', v1, fresh());
    ok(r.json.liked === false && r.json.likes === 0, 'Like wieder weg');
    await request(port, 'POST', '/api/levels/' + idSpikes + '/like', v1, fresh());
    r = await request(port, 'GET', '/api/levels?sort=beliebt');
    ok(r.json.items[0].id === idSpikes, 'beliebteste zuerst');
    r = await request(port, 'POST', '/api/levels/' + idCoins + '/like', { voterKey: 'x' }, fresh());
    ok(r.status === 400, 'ungültiger Wähler-Schlüssel -> abgelehnt');
    for (let i = 0; i < 5; i++) r = await request(port, 'POST', '/api/levels/' + idCoins + '/report', { voterKey: 'meldung-schluessel-00000' + i }, fresh());
    ok(r.json.hidden === true, '5 Meldungen -> versteckt');
    r = await request(port, 'GET', '/api/levels');
    ok(r.json.items.length === 1, 'verstecktes Level nicht mehr in der Liste');
    r = await request(port, 'GET', '/api/levels/' + idCoins);
    ok(r.status === 404, 'verstecktes Level nicht abrufbar');

    // Verwaltung
    r = await request(port, 'GET', '/api/admin/levels?filter=gemeldet', undefined, { 'x-admin-token': 'falsch' });
    ok(r.status === 403, 'falsches Admin-Passwort -> verboten');
    r = await request(port, 'GET', '/api/admin/levels?filter=gemeldet', undefined, { 'x-admin-token': 'admin-geheim-123' });
    ok(r.status === 200 && r.json.items[0].id === idCoins && r.json.items[0].reports === 5, 'Verwaltung sieht gemeldetes Level');
    r = await request(port, 'POST', '/api/admin/levels/' + idCoins + '/show', {}, { 'x-admin-token': 'admin-geheim-123' });
    r = await request(port, 'GET', '/api/levels');
    ok(r.json.items.length === 2, 'Verwaltung gibt Level wieder frei');

    // Eigenes Level löschen
    r = await request(port, 'POST', '/api/levels/' + idCoins + '/delete', { authorKey: KEY_B }, fresh());
    ok(r.status === 403, 'fremdes Level löschen -> verboten');
    r = await request(port, 'POST', '/api/levels/' + idCoins + '/delete', { authorKey: KEY_A }, fresh());
    ok(r.status === 200, 'eigenes Level gelöscht');
    r = await request(port, 'POST', '/api/admin/levels/' + idSpikes + '/delete', {}, { 'x-admin-token': 'admin-geheim-123' });
    r = await request(port, 'GET', '/api/levels');
    ok(r.json.items.length === 0, 'Verwaltung löscht Level');

    // CORS
    r = await request(port, 'GET', '/api/levels', undefined, { origin: 'https://neon-hop.playtoki.app' });
    ok(r.headers['access-control-allow-origin'] === 'https://neon-hop.playtoki.app', 'Toki-Seite darf zugreifen (CORS)');
    r = await request(port, 'GET', '/api/levels', undefined, { origin: 'https://boese.example' });
    ok(r.status === 403, 'fremde Seite -> verboten');
    r = await request(port, 'OPTIONS', '/api/levels', undefined, { origin: 'https://toki.example', 'access-control-request-method': 'POST' });
    ok(r.status === 204 && /POST/.test(r.headers['access-control-allow-methods']), 'Vorab-Anfrage (OPTIONS) beantwortet');
    r = await request(port, 'GET', '/admin');
    ok(r.status === 200 && /frame-ancestors 'none'/.test(r.headers['content-security-policy']) && /Verwaltung|verwalten/.test(r.text), 'Verwaltungsseite mit Schutz-Kopfzeilen');
  } finally {
    srv.close();
  }
}

async function smokeRealServer() {
  console.log('--- server.js als Prozess');
  const port = 18790;
  const p = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    env: Object.assign({}, process.env, { PORT: String(port), HOST: '127.0.0.1', DATABASE_URL: '', ADMIN_TOKEN: '' }),
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((res) => p.stdout.on('data', (d) => { if (String(d).includes('läuft')) res(); }));
  try {
    const h = await request(port, 'GET', '/health');
    ok(h.status === 200 && /Arbeitsspeicher/.test(h.text), 'Gesundheitsseite nennt den Speicher');
    const l = await request(port, 'GET', '/api/levels');
    ok(l.status === 200 && Array.isArray(l.json.items), 'Level-Liste über server.js erreichbar');
    const a = await request(port, 'GET', '/api/admin/levels', undefined, { 'x-admin-token': '' });
    ok(a.status === 403, 'ohne ADMIN_TOKEN ist die Verwaltung gesperrt');
  } finally {
    p.kill();
  }
}

(async () => {
  await suite('Arbeitsspeicher', new MemoryStore());
  const db = newDb();
  const { Pool } = db.adapters.createPg();
  await suite('Postgres (pg-mem)', new PgStore(new Pool()));
  await smokeRealServer();
  console.log(failed ? failed + ' Test(s) fehlgeschlagen' : 'Alle Level-Tests bestanden');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
