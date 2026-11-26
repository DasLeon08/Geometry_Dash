#!/usr/bin/env node
/*
 * Prüft den Infinity-Generator (js/infinite.js):
 *  1. jedes Muster (jede Variante) einzeln ist schaffbar,
 *  2. viele zufällige Seeds sind auf einer langen Strecke schaffbar,
 *  3. derselbe Seed ergibt dieselbe Strecke, und runReplay ist deterministisch.
 *
 *   node tools/verify-infinite.js            # 30 Seeds × 2000 Kacheln
 *   SEEDS=200 LEN=3000 node tools/verify-infinite.js
 */
'use strict';
const path = require('path');
const E = require(path.join(__dirname, '..', 'js', 'engine.js'));
const I = require(path.join(__dirname, '..', 'js', 'infinite.js'));
const { verify, snippet } = require('./verify-levels.js');

const SEEDS = Number(process.env.SEEDS || 30);
const LEN = Number(process.env.LEN || 2000);
let failed = 0;
const flat = (out) => (typeof out[0] === 'string' ? [out] : out.reduce((a, x) => a.concat(x && x.length ? flat(x) : []), []));

// 1. Muster einzeln: jede Variante (Zufall über viele Seeds abdecken)
const names = Object.keys(I.PATTERNS);
names.forEach((name) => {
  const seen = new Set();
  for (let k = 1; k <= 40; k++) {
    const map = [['.'.repeat(20)]].concat(flat(I.PATTERNS[name](I.rng(k * 7919))));
    const key = JSON.stringify(map);
    if (seen.has(key)) continue;
    seen.add(key);
    const r = verify({ id: name, map });
    if (!r.ok) { failed++; console.log('FEHLER Muster ' + name + ' (Variante ' + seen.size + '), weiteste Position ' + r.furthest.toFixed(2)); console.log(snippet({ id: name, map }, r.furthest)); }
  }
  console.log('OK     Muster ' + name + ' (' + seen.size + ' Varianten)');
});

// 2. Zufällige Seeds auf langer Strecke
for (let i = 0; i < SEEDS; i++) {
  const seed = (i * 2654435761) >>> 0 || 1;
  const gen = I.create(seed);
  const map = [];
  while (gen.length < LEN) gen.next().rows.forEach((rows) => map.push(rows));
  const t0 = Date.now();
  const r = verify({ id: 'seed' + seed, map });
  if (!r.ok) { failed++; console.log('FEHLER Seed ' + seed + ': weiteste Position ' + r.furthest.toFixed(2) + ' von ' + r.length); console.log(snippet({ id: 's', map }, r.furthest)); }
  else console.log('OK     Seed ' + seed + ' (' + r.length + ' Kacheln, ' + (Date.now() - t0) + ' ms)');
}

// 3. Gleicher Seed = gleiche Strecke; Nachspielen ist deterministisch
const a = I.create(123), b = I.create(123);
let same = true;
for (let i = 0; i < 60; i++) if (JSON.stringify(a.next()) !== JSON.stringify(b.next())) same = false;
const rep = { h0: false, t: [100, 140, 400, 430, 900, 940] };
const r1 = I.runReplay(5, rep), r2 = I.runReplay(5, rep);
if (!same || r1.distance !== r2.distance) { failed++; console.log('FEHLER Determinismus'); } else console.log('OK     gleicher Seed = gleiche Strecke, Nachspielen gleich (' + r1.distance + ')');

console.log(failed ? failed + ' Fehler' : 'Infinity-Generator in Ordnung');
process.exit(failed ? 1 : 0);
