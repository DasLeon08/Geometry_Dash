#!/usr/bin/env node
/*
 * Prüft die Spielobjekte aus Etappe 3: Tempo-Portale, rosa Sprungfeld/Ring,
 * Mini- und Normal-Portal.   node tools/test-objects.js
 */
'use strict';
const path = require('path');
const E = require(path.join(__dirname, '..', 'js', 'engine.js'));

let failed = 0;
function ok(cond, text) { console.log((cond ? 'OK     ' : 'FEHLER ') + text); if (!cond) failed++; }

function rowsWith(cols, items) {
  const g = [];
  for (let i = 0; i < 10; i++) g.push(new Array(cols).fill('.'));
  items.forEach(([ch, x, y]) => { g[9 - y][x] = ch; });
  return g.map((r) => r.join(''));
}
/** Simulieren, bis x erreicht ist; liefert Zustand und höchste Höhe. */
function run(rows, untilX, heldFn) {
  const lvl = E.parseLevel({ map: [rows] });
  const s = E.createState();
  let maxY = 0, steps = 0;
  while (s.x < untilX && !s.dead && !s.won && steps < 20000) {
    E.step(s, lvl, heldFn ? heldFn(s) : false, E.C.DT);
    s.events.length = 0;
    maxY = Math.max(maxY, s.y);
    steps++;
  }
  return { s, maxY, steps };
}
const jumpHeight = (rows) => run(rows, 30, (s) => s.x > 8 && s.x < 8.2).maxY;

// Tempo
for (const [ch, k] of [['1', 0.8], ['2', 1], ['3', 1.3], ['4', 1.6]]) {
  const r = run(rowsWith(40, [[ch, 5, 1]]), 20);
  ok(r.s.speed === k, 'Tempo-Portal ' + ch + ' setzt Tempo ' + k);
}
const slow = run(rowsWith(60, [['1', 3, 1]]), 50).steps, fast = run(rowsWith(60, [['4', 3, 1]]), 50).steps;
ok(slow > fast * 1.8, 'langsam braucht deutlich länger als sehr schnell (' + slow + ' vs ' + fast + ' Schritte)');

// Sprungfelder und Ringe
const padH = run(rowsWith(40, [['_', 10, 0]]), 25).maxY;
const pinkH = run(rowsWith(40, [['p', 10, 0]]), 25).maxY;
ok(padH > 4 && pinkH > 1.5 && pinkH < padH * 0.6, 'rosa Sprungfeld springt niedriger (' + pinkH.toFixed(2) + ' statt ' + padH.toFixed(2) + ')');
const orbAt = (ch) => run(rowsWith(40, [[ch, 10, 2]]), 25, (s) => (s.x > 6.0 && s.x < 6.05) || (s.x > 9.4 && s.x < 9.45)).maxY;
const yH = orbAt('o'), pH = orbAt('r');
ok(pH < yH - 0.5, 'rosa Ring springt niedriger als gelber (' + pH.toFixed(2) + ' statt ' + yH.toFixed(2) + ')');

// Mini
const normalJump = jumpHeight(rowsWith(40, []));
const miniJump = jumpHeight(rowsWith(40, [['K', 3, 1]]));
ok(miniJump < normalJump * 0.75, 'Mini-Würfel springt niedriger (' + miniJump.toFixed(2) + ' statt ' + normalJump.toFixed(2) + ')');
const m = run(rowsWith(40, [['K', 3, 1]]), 10);
ok(m.s.size === 0.5, 'Mini-Portal macht den Würfel halb so gross');
// Hängende Stacheln in der Bodenreihe reichen bis 0.45 über den Boden: Mini (0.5 hoch) läuft drunter durch
const tunnel = [['K', 3, 1]];
for (let x = 10; x < 20; x++) tunnel.push(['v', x, 0]);
const tm = run(rowsWith(30, tunnel), 25), tn = run(rowsWith(30, tunnel.slice(1)), 25);
ok(!tm.s.dead && tn.s.dead, 'Mini passt unter tiefen Stacheln durch, normal nicht');
const back = run(rowsWith(40, [['K', 3, 1], ['N', 12, 1]]), 20);
ok(back.s.size === 1, 'Normal-Portal macht wieder gross');
// Mini an der Decke (umgekehrte Schwerkraft) bleibt oben bündig
const roof = run(rowsWith(40, [['U', 3, 1], ['K', 12, 8]]), 25);
ok(roof.s.size === 0.5 && Math.abs(roof.s.y + roof.s.size - E.C.ROOF) < 1e-9 && !roof.s.dead, 'Mini an der Decke liegt oben an');

// Nachspielen mit neuen Objekten
const lv = { map: [rowsWith(60, [['3', 4, 1], ['p', 14, 0], ['c', 25, 2], ['K', 30, 1], ['c', 40, 1], ['N', 45, 1], ['c', 50, 2]])] };
const rr = E.runReplay(lv, { h0: false, t: [] });
ok(rr.won, 'Level mit neuen Objekten lässt sich nachspielen');

console.log(failed ? failed + ' Test(s) fehlgeschlagen' : 'Alle Objekt-Tests bestanden');
process.exit(failed ? 1 : 0);
