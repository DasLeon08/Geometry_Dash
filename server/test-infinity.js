/*
 * Tests für die Infinity-Rangliste:  npm test
 * Läuft mit dem Arbeitsspeicher und mit Postgres (nachgebildet durch pg-mem).
 */
'use strict';
const http = require('http');
const path = require('path');
const { newDb } = require('pg-mem');
const engine = require(path.join(__dirname, '..', 'js', 'engine.js'));
const infinite = require(path.join(__dirname, '..', 'js', 'infinite.js'));
const { MemoryStore, PgStore } = require('./store');
const { createLevelApi } = require('./levels');
const { createInfinityApi } = require('./infinity');

let failed = 0;
function ok(cond, text) {
  console.log((cond ? 'OK     ' : 'FEHLER ') + text);
  if (!cond) failed++;
}
function request(port, method, p, body, headers) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : (typeof body === 'string' ? body : JSON.stringify(body));
    const req = http.request({ host: '127.0.0.1', port, method, path: p, headers: Object.assign({ 'content-type': 'application/json' }, headers || {}) }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (e) { json = null; }
        resolve({ status: res.statusCode, json });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}
/** Zufällige Läufe (fester Zufall) ausprobieren und den weitesten nehmen. */
function bestReplay(seed, tries) {
  let best = { distance: -1 };
  let z = 12345;
  const rnd = () => { z = (z * 1103515245 + 12345) % 2147483648; return z / 2147483648; };
  for (let k = 0; k < tries; k++) {
    const t = [];
    let step = 0;
    while (step < 6000) { step += 20 + Math.floor(rnd() * 120); t.push(step); }
    const rp = { h0: false, t };
    const r = infinite.runReplay(seed, rp, 20000);
    if (r.distance > best.distance) best = { distance: r.distance, replay: rp };
  }
  return best;
}

const KEY_A = 'spieler-schluessel-aaaaaaaa';
const KEY_B = 'spieler-schluessel-bbbbbbbb';

async function suite(label, store) {
  console.log('--- ' + label);
  const api = createLevelApi({
    store, engine, infinite, adminToken: 'admin-geheim-123',
    originAllowed: (o) => o === 'https://toki.example', log: () => {},
  });
  await api.init();
  const srv = http.createServer(async (req, res) => { if (!(await api.handle(req, res))) { res.writeHead(404); res.end(); } });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  let ip = 1;
  const fresh = () => ({ 'x-forwarded-for': '10.1.0.' + (ip++) });

  // Lauf holen und ohne Eingabe abgeben
  let r = await request(port, 'POST', '/api/infinity/start', {}, fresh());
  ok(r.status === 200 && /^[a-f0-9]{18}$/.test(r.json.run) && Number.isInteger(r.json.seed), 'Start liefert Lauf und Seed');
  const runA = r.json;
  const none = infinite.runReplay(runA.seed, { h0: false, t: [] });
  r = await request(port, 'POST', '/api/infinity/submit', { run: runA.run, replay: { h0: false, t: [] }, name: 'Anna', playerKey: KEY_A, distance: 99999 }, fresh());
  ok(r.status === 200 && r.json.distance === none.distance, 'Server bestimmt die Distanz selbst (' + (r.json && r.json.distance) + ' m, behauptet 99999)');
  ok(r.json.rankDay === 1 && r.json.rankAll === 1, 'erster Eintrag ist Rang 1');
  r = await request(port, 'POST', '/api/infinity/submit', { run: runA.run, replay: { h0: false, t: [] }, name: 'Anna', playerKey: KEY_A }, fresh());
  ok(r.status === 409 && r.json.error === 'run', 'derselbe Lauf zählt nur einmal');
  r = await request(port, 'POST', '/api/infinity/submit', { run: 'abcdefabcdefabcdef', replay: { h0: false, t: [] }, name: 'Anna', playerKey: KEY_A }, fresh());
  ok(r.status === 409, 'unbekannter Lauf wird abgelehnt');

  // Ben läuft weiter
  r = await request(port, 'POST', '/api/infinity/start', {}, fresh());
  const runB = r.json;
  const best = bestReplay(runB.seed, 150);
  r = await request(port, 'POST', '/api/infinity/submit', { run: runB.run, replay: best.replay, name: 'Ben', playerKey: KEY_B }, fresh());
  ok(r.status === 200 && r.json.distance === best.distance, 'Lauf mit Eingaben wird genau nachgespielt (' + best.distance + ' m)');
  const benBetter = best.distance > none.distance;

  r = await request(port, 'GET', '/api/infinity/top?range=all&player=' + KEY_A, undefined, fresh());
  ok(r.status === 200 && r.json.items.length === 2, 'Rangliste hat zwei Einträge');
  if (benBetter) ok(r.json.items[0].name === 'Ben' && r.json.items[1].name === 'Anna' && r.json.items[1].me && !r.json.items[0].me, 'sortiert nach Distanz, eigener Eintrag markiert');
  ok(r.json.me && r.json.me.rank === (benBetter ? 2 : 1), 'eigener Rang wird mitgeliefert');
  ok(!JSON.stringify(r.json).includes(KEY_A) && r.json.items.every((x) => !('player' in x)), 'Schlüssel und Spieler-Kennung werden nicht verraten');
  r = await request(port, 'GET', '/api/infinity/top?range=day', undefined, fresh());
  ok(r.status === 200 && r.json.items.length === 2 && /^\d{4}-\d{2}-\d{2}$/.test(r.json.day), 'Tages-Rangliste');

  // schlechterer Lauf ändert den Bestwert nicht
  r = await request(port, 'POST', '/api/infinity/start', {}, fresh());
  const runB2 = r.json;
  r = await request(port, 'POST', '/api/infinity/submit', { run: runB2.run, replay: { h0: true, t: [1] }, name: 'Benjamin', playerKey: KEY_B }, fresh());
  ok(r.status === 200 && r.json.bestAll === Math.max(best.distance, r.json.distance), 'pro Spieler zählt der beste Lauf');
  r = await request(port, 'GET', '/api/infinity/top?range=all', undefined, fresh());
  ok(r.json.items.some((x) => x.name === 'Benjamin') && r.json.items.length === 2, 'Name wird übernommen, kein zweiter Eintrag');

  // Fehlerfälle
  r = await request(port, 'POST', '/api/infinity/start', {}, fresh());
  const runC = r.json;
  r = await request(port, 'POST', '/api/infinity/submit', { run: runC.run, replay: { h0: false, t: [] }, name: 'fuck', playerKey: KEY_A }, fresh());
  ok(r.status === 400 && r.json.error === 'name', 'Schimpfwort als Name wird abgelehnt');
  r = await request(port, 'POST', '/api/infinity/submit', { run: runC.run, replay: { h0: false, t: [5, 3] }, name: 'Anna', playerKey: KEY_A }, fresh());
  ok(r.status === 400 && r.json.error === 'format', 'ungeordnete Aufnahme wird abgelehnt');
  r = await request(port, 'POST', '/api/infinity/submit', { run: runC.run, replay: { h0: false, t: [] }, name: 'Anna' }, fresh());
  ok(r.status === 400, 'ohne Spieler-Schlüssel abgelehnt');
  const sameIp = { 'x-forwarded-for': '10.9.9.9' };
  const codes = [];
  for (let i = 0; i < 11; i++) {
    r = await request(port, 'POST', '/api/infinity/submit', { run: 'ffffffffffffffff0' + (i % 10), replay: { h0: false, t: [] }, name: 'Anna', playerKey: KEY_A }, sameIp);
    codes.push(r.status);
  }
  ok(codes.slice(0, 10).every((c) => c === 409) && codes[10] === 429, 'höchstens 10 Abgaben pro Minute und Adresse');
  r = await request(port, 'POST', '/api/infinity/start', {}, { origin: 'https://boese.example' });
  ok(r.status === 403, 'fremde Seite wird abgewiesen (CORS)');
  r = await request(port, 'POST', '/api/infinity/start', {}, Object.assign({ origin: 'https://toki.example' }, fresh()));
  ok(r.status === 200, 'Toki darf');

  // Verwaltung
  r = await request(port, 'GET', '/api/admin/infinity', undefined, fresh());
  ok(r.status === 403, 'Verwaltung ohne Token gesperrt');
  r = await request(port, 'GET', '/api/admin/infinity', undefined, Object.assign({ 'x-admin-token': 'admin-geheim-123' }, fresh()));
  ok(r.status === 200 && r.json.items.length === 2, 'Verwaltung sieht die Rangliste');
  const del = r.json.items.find((x) => x.name === 'Anna');
  r = await request(port, 'POST', '/api/admin/infinity/' + del.id + '/delete', {}, Object.assign({ 'x-admin-token': 'admin-geheim-123' }, fresh()));
  ok(r.status === 200, 'Verwaltung entfernt einen Eintrag');
  r = await request(port, 'GET', '/api/infinity/top?range=all', undefined, fresh());
  ok(r.json.items.length === 1 && r.json.items[0].name !== 'Anna', 'Eintrag ist weg');

  srv.close();
}

(async () => {
  await suite('Arbeitsspeicher', new MemoryStore());
  const db = newDb();
  const { Pool } = db.adapters.createPg();
  await suite('Postgres (pg-mem)', new PgStore(new Pool()));

  // Läufe verfallen nach 2 Stunden
  let t = 1000000;
  const api = createInfinityApi({ store: new MemoryStore(), infinite, log: () => {}, now: () => t });
  const s = api.start().body;
  t += 3 * 60 * 60 * 1000;
  const r = await api.submit({ run: s.run, replay: { h0: false, t: [] }, name: 'Zu spät', playerKey: KEY_A });
  ok(r.status === 409, 'abgelaufener Lauf wird abgelehnt');

  console.log(failed ? failed + ' Test(s) fehlgeschlagen' : 'Alle Infinity-Tests bestanden');
  process.exit(failed ? 1 : 0);
})();
