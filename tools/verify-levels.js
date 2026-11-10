#!/usr/bin/env node
/*
 * Prüft, ob jedes Level schaffbar ist.
 * Sucht per Breitensuche über alle Eingabefolgen (gedrückt / nicht gedrückt),
 * wobei sich die Eingabe nur alle DECISION Frames ändern darf. Mit 30
 * Entscheidungen pro Sekunde ist ein Level damit auch für Menschen fair.
 *
 *   node tools/verify-levels.js            # alle Level
 *   node tools/verify-levels.js 2          # nur Level 2
 *   DECISION_HZ=20 node tools/verify-levels.js
 */
'use strict';
const path = require('path');
const E = require(path.join(__dirname, '..', 'js', 'engine.js'));
const LEVELS = require(path.join(__dirname, '..', 'js', 'levels.js'));

const HZ = Number(process.env.DECISION_HZ || 30);
const SUBSTEPS = Math.round(1 / E.C.DT / HZ);
const MAX_STATES = 4000;

function key(s, level, q) {
  const used = [];
  s.used.forEach((id) => { if (level.objects[id].hb[2] >= s.x - 0.5) used.push(id); });
  return [
    Math.round(s.y * 40 / q), Math.round(s.vy * 4 / q), s.gs, s.mode,
    s.prevHeld ? 1 : 0, s.onGround ? 1 : 0, s.buffer > 0 ? 1 : 0,
    s.coins.size, used.join('.'),
  ].join('|');
}

function verify(def) {
  const level = E.parseLevel(def);
  let frontier = [E.createState()];
  let furthest = 0;
  let best = null;
  let steps = 0;
  while (frontier.length) {
    const next = new Map();
    for (const st of frontier) {
      for (const held of [false, true]) {
        const s = E.cloneState(st);
        for (let i = 0; i < SUBSTEPS && !s.dead && !s.won; i++) E.step(s, level, held, E.C.DT);
        if (s.dead) continue;
        furthest = Math.max(furthest, s.x);
        if (s.won) {
          if (!best || s.coins.size > best.coins.size) best = s;
          continue;
        }
        const k = key(s, level, 1);
        if (!next.has(k)) next.set(k, s);
      }
    }
    frontier = Array.from(next.values());
    // Zu viele Zustände: gröber rastern (erhält die Vielfalt der Positionen),
    // dabei Zustände mit mehr Münzen bevorzugen.
    for (let q = 2; frontier.length > MAX_STATES; q *= 2) {
      const coarse = new Map();
      for (const s of frontier) {
        const k = key(s, level, q).replace(/\|\d+\|[^|]*$/, '');
        const prev = coarse.get(k);
        if (!prev || s.coins.size > prev.coins.size) coarse.set(k, s);
      }
      frontier = Array.from(coarse.values());
    }
    steps++;
  }
  return {
    ok: !!best,
    furthest,
    length: level.length,
    coins: best ? best.coins.size : 0,
    coinCount: level.coinCount,
    seconds: level.length / E.C.SPEED,
  };
}

function snippet(def, x) {
  const level = E.parseLevel(def);
  const from = Math.max(0, Math.floor(x) - 14);
  const to = Math.floor(x) + 10;
  const rev = {};
  Object.keys(E.CHAR_TYPES).forEach((ch) => { rev[E.CHAR_TYPES[ch]] = ch; });
  const lines = [];
  for (let y = E.C.ROOF - 1; y >= 0; y--) {
    let line = '';
    for (let cx = from; cx <= to; cx++) {
      const o = level.objects.find((ob) => ob.x === cx && ob.y === y);
      line += o ? rev[o.type] : (cx === Math.floor(x) ? ':' : '.');
    }
    lines.push('   ' + String(y).padStart(2) + ' ' + line);
  }
  lines.push('      x=' + from + ' … ' + to + '   (":" = weiteste erreichte Spalte)');
  return lines.join('\n');
}

const only = process.argv[2] ? Number(process.argv[2]) : null;
let failed = 0;
LEVELS.forEach((def, i) => {
  if (only && only !== i + 1) return;
  const t0 = Date.now();
  const r = verify(def);
  const ms = Date.now() - t0;
  const name = (i + 1) + '. ' + def.name;
  if (r.ok) {
    console.log('OK    ' + name + '  (' + r.length + ' Kacheln, ' + r.seconds.toFixed(1) + ' s, Münzen ' +
      r.coins + '/' + r.coinCount + ', ' + ms + ' ms)');
    if (r.coins < r.coinCount) {
      console.log('      Warnung: nicht alle Münzen erreichbar');
      failed++;
    }
  } else {
    failed++;
    console.log('FEHLER ' + name + ': nicht schaffbar, weiteste Position x=' + r.furthest.toFixed(2) + ' von ' + r.length);
    console.log(snippet(def, r.furthest));
  }
});
process.exit(failed ? 1 : 0);
