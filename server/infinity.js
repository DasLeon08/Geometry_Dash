/*
 * Neon Hop – Infinity-Rangliste.
 *
 *   POST /api/infinity/start                  -> { run, seed }   neuer Lauf mit Seed vom Server
 *   POST /api/infinity/submit                 { run, replay, name, playerKey }
 *                                             -> { distance, rankDay, rankAll, bestAll }
 *   GET  /api/infinity/top?range=day|all&player=<Schlüssel>   Top 50 (+ eigener Rang)
 *   GET  /api/admin/infinity                  Top 100 insgesamt (Kopfzeile x-admin-token)
 *   POST /api/admin/infinity/:player/delete   Spieler aus der Rangliste entfernen
 *
 * Der Server vergibt den Seed, spielt den Lauf mit js/infinite.js nach und bestimmt
 * die Distanz selbst. Jeder vergebene Lauf zählt nur einmal und verfällt nach 2 Stunden.
 * Begrenzung (in levels.js): 30 Starts und 10 Abgaben pro Minute, 300 Abgaben pro Tag und Adresse.
 */
'use strict';

const crypto = require('crypto');
const { cleanText, isBlocked } = require('./filter');

const RUN_TTL = 2 * 60 * 60 * 1000;
const MAX_RUNS = 50000;
const MAX_TOGGLES = 20000;
const MAX_STEPS = 240 * 60 * 30;   // höchstens 30 Minuten Lauf
const TOP = 50;

const MESSAGES = {
  run: 'Dieser Lauf ist abgelaufen oder wurde schon eingetragen.',
  name: 'Dein Spielername ist nicht erlaubt. Bitte ändere ihn im Mehrspieler-Fenster.',
};

function hash(text) { return crypto.createHash('sha256').update(String(text)).digest('hex'); }
function validKey(k) { return typeof k === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(k); }
/** Tag in UTC, z.B. "2026-11-26" (die Tages-Rangliste beginnt um Mitternacht UTC neu). */
function today(now) { return new Date(now).toISOString().slice(0, 10); }

function createInfinityApi({ store, infinite, log, now }) {
  const clock = now || (() => Date.now());
  const runs = new Map();   // Lauf-ID -> { seed, until }
  setInterval(() => { const t = clock(); for (const [k, v] of runs) if (v.until < t) runs.delete(k); }, 10 * 60 * 1000).unref();

  function start() {
    if (runs.size >= MAX_RUNS) {
      // älteste zuerst wegwerfen
      const first = runs.keys().next().value;
      runs.delete(first);
    }
    const run = crypto.randomBytes(9).toString('hex');
    const seed = crypto.randomBytes(4).readUInt32BE(0);
    runs.set(run, { seed, until: clock() + RUN_TTL });
    return { status: 200, body: { run, seed } };
  }

  async function submit(b) {
    if (!b || typeof b !== 'object') return { status: 400, error: 'format' };
    const runId = typeof b.run === 'string' && /^[a-f0-9]{18}$/.test(b.run) ? b.run : null;
    const rp = b.replay;
    if (!runId || !validKey(b.playerKey) || !rp || typeof rp !== 'object' || !Array.isArray(rp.t) || rp.t.length > MAX_TOGGLES) {
      return { status: 400, error: 'format' };
    }
    for (let i = 0; i < rp.t.length; i++) {
      if (!Number.isInteger(rp.t[i]) || rp.t[i] < 0 || rp.t[i] > MAX_STEPS || (i && rp.t[i] <= rp.t[i - 1])) return { status: 400, error: 'format' };
    }
    const name = cleanText(b.name, 16) || 'Spieler';
    if (isBlocked(name)) return { status: 400, error: 'name', message: MESSAGES.name };
    const run = runs.get(runId);
    if (!run || run.until < clock()) return { status: 409, error: 'run', message: MESSAGES.run };
    runs.delete(runId);   // jeder Lauf zählt nur einmal
    const result = infinite.runReplay(run.seed, { h0: rp.h0 === true, t: rp.t }, MAX_STEPS);
    const distance = result.distance;
    const player = hash('infinity:' + b.playerKey);
    const day = today(clock());
    await store.infSave({ player, name, distance, day, at: clock() });
    const [rd, ra] = await Promise.all([store.infRank('day', day, player), store.infRank('all', day, player)]);
    log('Infinity: ' + name + ' ' + distance + ' m');
    return { status: 200, body: { distance, rankDay: rd ? rd.rank : null, rankAll: ra ? ra.rank : null, bestDay: rd ? rd.distance : distance, bestAll: ra ? ra.distance : distance } };
  }

  async function top(range, playerKey) {
    range = range === 'day' ? 'day' : 'all';
    const day = today(clock());
    const me = validKey(playerKey) ? hash('infinity:' + playerKey) : null;
    const rows = await store.infTop(range, day, TOP);
    const items = rows.map((r, i) => ({ rank: i + 1, name: r.name, distance: r.distance, me: r.player === me }));
    const mine = me ? await store.infRank(range, day, me) : null;
    return { status: 200, body: { range, day, items, me: mine } };
  }

  async function adminList() {
    const rows = await store.infTop('all', today(clock()), 100);
    return { status: 200, body: { items: rows.map((r, i) => ({ rank: i + 1, id: r.player.slice(0, 24), name: r.name, distance: r.distance, created: r.created_at })) } };
  }
  async function adminDelete(idPrefix) {
    const rows = await store.infTop('all', today(clock()), 1000);
    const hit = rows.find((r) => r.player.slice(0, 24) === idPrefix);
    if (!hit) return { status: 404, error: 'notfound' };
    await store.infRemove(hit.player);
    log('Verwaltung: Infinity-Eintrag entfernt (' + hit.name + ')');
    return { status: 200, body: { ok: true } };
  }

  return { start, submit, top, adminList, adminDelete, runs };
}

module.exports = { createInfinityApi, MESSAGES };
