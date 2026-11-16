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

// Fehler aus dem Video: Rakete fliegt an der Decke bzw. am Boden am Würfel-Portal vorbei
{
  const items = [['S', 2, 1]];
  for (let x = 4; x < 32; x++) for (let y = 4; y < 10; y++) items.push(['#', x, y]);    // tiefe Decke wie am Ende von ship()
  items.push(['C', 26, 1]);
  const ceil = run(rowsWith(40, items), 35, () => true);           // immer halten: klebt an der Decke
  ok(!ceil.s.dead && ceil.s.mode === 'cube', 'Rakete an der Decke wird am Ende zum Würfel');
  const floor = run(rowsWith(40, items), 35, () => false);         // nie halten: rutscht am Boden
  ok(!floor.s.dead && floor.s.mode === 'cube', 'Rakete am Boden wird am Ende zum Würfel');
  const high = run(rowsWith(40, [['S', 2, 1], ['C', 26, 1]]), 35, () => true);
  ok(high.s.mode === 'cube', 'Würfel-Portal wirkt auch hoch oben (ganze Spalte)');
}

// ---- Neue Spielmodi ----
const modeRun = (ch, untilX, heldFn, extra) => run(rowsWith(60, [[ch, 2, 1]].concat(extra || [])), untilX, heldFn);
// Kugel: einmal tippen am Boden -> Schwerkraft dreht, rollt an die Decke
{
  const r = modeRun('B', 20, (s) => s.x > 6 && s.x < 6.1);
  ok(r.s.mode === 'ball' && r.s.gs === -1 && Math.abs(r.s.y + 1 - E.C.ROOF) < 1e-9, 'Kugel rollt nach einem Tipp an die Decke');
  const r2 = modeRun('B', 30, (s) => (s.x > 6 && s.x < 6.1) || (s.x > 16 && s.x < 16.1));
  ok(r2.s.gs === 1 && r2.s.y === 0, 'Kugel kommt mit dem zweiten Tipp wieder runter');
}
// Ufo: mehrmals tippen -> steigt immer höher
{
  const taps = (n) => modeRun('F', 4 + n * 2 + 1, (s) => { const k = (s.x - 4) / 2; return k >= 0 && k < n && (s.x - 4) % 2 < 0.15; }).s.y;
  const one = modeRun('F', 9, (s) => s.x > 4 && s.x < 4.15).maxY, three = modeRun('F', 13, (s) => s.x > 4 && (s.x - 4) % 2 < 0.15 && s.x < 9).maxY;
  ok(three > one + 1.5, 'Ufo steigt mit mehreren Tipps höher (' + three.toFixed(2) + ' statt ' + one.toFixed(2) + ')');
  void taps;
}
// Welle: beim Halten genau 1 Kachel hoch pro Kachel vorwärts
{
  const lvl = E.parseLevel({ map: [rowsWith(40, [['W', 2, 1]])] });
  const s = E.createState();
  while (s.x < 5) E.step(s, lvl, false, E.C.DT);
  const x0 = s.x, y0 = s.y;
  while (s.x < x0 + 3) E.step(s, lvl, true, E.C.DT);
  ok(s.mode === 'wave' && Math.abs((s.y - y0) - (s.x - x0)) < 0.05, 'Welle steigt 1:1 (' + (s.y - y0).toFixed(2) + ' auf ' + (s.x - x0).toFixed(2) + ')');
  while (s.x < x0 + 6) E.step(s, lvl, false, E.C.DT);
  ok(s.y < 0.5 + (y0 + 3) - 2.9, 'Welle sinkt beim Loslassen wieder');
}
// Roboter: kurz tippen = kleiner Sprung, lange halten = hoher Sprung
{
  const shortJ = modeRun('R', 20, (s) => s.x > 6 && s.x < 6.05).maxY;
  const longJ = modeRun('R', 20, (s) => s.x > 6 && s.x < 9).maxY;
  ok(shortJ > 0.5 && shortJ < 1.3 && longJ > shortJ + 1.5, 'Roboter springt bei langem Halten höher (' + longJ.toFixed(2) + ' statt ' + shortJ.toFixed(2) + ')');
}
// Spinne: Tipp -> sofort an der Decke bzw. unter einem Block
{
  const lvl = E.parseLevel({ map: [rowsWith(40, [['P', 2, 1]])] });
  const s = E.createState();
  while (s.x < 6) E.step(s, lvl, false, E.C.DT);
  E.step(s, lvl, true, E.C.DT);
  ok(s.mode === 'spider' && s.gs === -1 && Math.abs(s.y + 1 - E.C.ROOF) < 1e-9, 'Spinne springt in einem Schritt an die Decke');
  const items = [['P', 2, 1]];
  for (let x = 4; x < 16; x++) items.push(['#', x, 5]);
  const r = run(rowsWith(40, items), 12, (s) => s.x > 6 && s.x < 6.05);
  ok(r.s.gs === -1 && Math.abs(r.s.y - 4) < 1e-9 && !r.s.dead, 'Spinne hängt unter dem Block');
}
// Schaukel: ohne Tippen fällt sie, ein Tipp dreht die Richtung
{
  const r = modeRun('X', 9, (s) => s.x > 6 && s.x < 6.05);
  ok(r.s.mode === 'swing' && r.s.gs === -1 && r.s.vy > 0 && r.s.y > 0.5, 'Schaukel dreht mit einem Tipp nach oben');
}
// Alle Modus-Portale über die ganze Höhe
ok(Object.keys(E.MODE_PORTALS).every((t) => {
  const ch = Object.keys(E.CHAR_TYPES).find((c) => E.CHAR_TYPES[c] === t);
  const o = E.parseLevel({ map: [rowsWith(10, [[ch, 3, 1]])] }).objects[0];
  return o.hb[1] === 0 && o.hb[3] === E.C.ROOF;
}), 'alle 8 Modus-Portale reichen vom Boden bis zur Decke');
// Ganzer Lauf durch alle Modi lässt sich nachspielen (Determinismus)
{
  const items = [['B', 5, 1], ['F', 15, 1], ['W', 25, 1], ['R', 35, 1], ['P', 45, 1], ['X', 55, 1], ['C', 70, 1]];
  const lv = { map: [rowsWith(90, items)] };
  const lvl = E.parseLevel(lv);
  const s = E.createState();
  const t = [];
  let held = false, i = 0;
  while (!s.won && !s.dead && i < 20000) {
    const want = Math.floor(i / 37) % 3 === 0;
    if (want !== held) { t.push(i); held = want; }
    E.step(s, lvl, held, E.C.DT); s.events.length = 0; i++;
  }
  const rr = E.runReplay(lv, { h0: false, t });
  ok(s.won && rr.won && rr.steps === i, 'Lauf durch alle Modi ist nachspielbar (' + i + ' Schritte)');
}

// Nachspielen mit neuen Objekten
const lv = { map: [rowsWith(60, [['3', 4, 1], ['p', 14, 0], ['c', 25, 2], ['K', 30, 1], ['c', 40, 1], ['N', 45, 1], ['c', 50, 2]])] };
const rr = E.runReplay(lv, { h0: false, t: [] });
ok(rr.won, 'Level mit neuen Objekten lässt sich nachspielen');

console.log(failed ? failed + ' Test(s) fehlgeschlagen' : 'Alle Objekt-Tests bestanden');
process.exit(failed ? 1 : 0);
