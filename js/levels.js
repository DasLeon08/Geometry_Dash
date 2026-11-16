/*
 * Neon Hop – Level.
 *
 * Jedes Level besteht aus Abschnitten, die nebeneinander gehängt werden.
 * Ein Abschnitt ist eine Liste von Textzeilen (oben -> unten, die letzte
 * Zeile liegt auf dem Boden, max. 10 Zeilen). Zeichen:
 *
 *   .  leer            #  Block           ^  Stachel
 *   v  Stachel (hängt) m  kleiner Stachel _  Sprungfeld
 *   o  gelber Ring     b  blauer Ring (Schwerkraft umdrehen)
 *   c  Münze           S  Raketen-Portal  C  Würfel-Portal
 *   U  Schwerkraft-Portal (nach oben)     D  Schwerkraft-Portal (nach unten)
 *   p  rosa Sprungfeld   r  rosa Ring (beide springen weniger hoch)
 *   1–4 Tempo-Portale (langsam, normal, schnell, sehr schnell)
 *   K  Mini-Portal (halbe Grösse)          N  Normal-Portal (wieder gross)
 *   Spielmodus-Portale (wirken über die ganze Höhe):
 *   S Rakete  C Würfel  B Kugel  F Ufo  W Welle  R Roboter  P Spinne  X Schaukel
 *   g  grüner Ring (Schwerkraft drehen + Sprung)  n  schwarzer Ring (nach unten)
 *   u  blaues Sprungfeld (Schwerkraft drehen)     z  Sägeblatt (Gefahr)
 *   T  Teleport-Eingang -> führt zum nächsten t (Ausgang) rechts davon
 *
 * Andere Portale sind 3 Kacheln hoch und werden auf die mittlere Kachel gesetzt.
 * Nach jeder Änderung prüfen:  node tools/verify-levels.js
 */
(function (root) {
  'use strict';

  // Hilfsfunktion für Abschnitte, die man leichter per Code baut
  // (z.B. lange Raketen-Tunnel). Koordinaten: x nach rechts, y nach oben.
  function seg(width) {
    const g = [];
    for (let i = 0; i < 10; i++) g.push(new Array(width).fill('.'));
    const api = {
      put(ch, x, y) { g[9 - y][x] = ch; return api; },
      fill(ch, x, y, w, h) {
        for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) api.put(ch, x + i, y + j);
        return api;
      },
      floor(x, w, h) { return api.fill('#', x, 0, w, h); },
      ceil(x, w, h) { return api.fill('#', x, 10 - h, w, h); },
      rows() { return g.map((r) => r.join('')); },
    };
    return api;
  }

  const LEVELS = [
    // ------------------------------------------------------------------
    {
      id: 'erster-sprung',
      name: 'Erster Sprung',
      difficulty: 1,
      colors: { bgTop: '#1b2a6b', bgBottom: '#3156d3', accent: '#7fd3ff', ground: '#1a2f8a' },
      music: { bpm: 124, root: 45, scale: [0, 2, 4, 7, 9], prog: [0, 3, 4, 2], lead: [0, 2, 4, 2, 5, 4, 2, 1] },
      map: [
        ['..................^...........^...........^............^^..........'],
        [
          '...........##.........###...........',
          '......##...##....##...###......^....',
        ],
        [
          '.............c.........',
          '.......................',
          '.......................',
          '...........####........',
          '...........####........',
          '........_..####.....^..',
        ],
        [
          '..........o...........',
          '......................',
          '.......^^^^.......^...',
        ],
        [
          '.....................###..........',
          '...............###...###..........',
          '.........###...###...###..........',
          '....##...###...###...###.^^^......',
        ],
        [
          '....................c.........',
          '..............................',
          '..............o...o...o.......',
          '..............................',
          '............^^^^^^^^^^^^^.....',
        ],
        [
          '..........^.............^..........',
          '....##########......##########.....',
        ],
        [
          '..........................c...........',
          '......................................',
          '......................................',
          '.............................#........',
          '.........................#...#........',
          '...........^^.......#....#...#........',
          '....................#....#...#^^^^....',
        ],
        ['..................^.^.......^^........................'],
      ],
    },

    // ------------------------------------------------------------------
    {
      id: 'neon-himmel',
      name: 'Neon-Himmel',
      difficulty: 2,
      colors: { bgTop: '#3b0f5c', bgBottom: '#b0268f', accent: '#ff8ae2', ground: '#4a0f66' },
      music: { bpm: 136, root: 43, scale: [0, 3, 5, 7, 10], prog: [0, 5, 3, 4], lead: [0, 3, 4, 2, 4, 1, 3, 0] },
      map: [
        ['..................^^..........^.........^^..........'],
        [
          '..............#..........',
          '.........#....#....#.....',
          '....#....#....#....#..^^.',
        ],
        [
          '.........................',
          '...........c.............',
          '.........................',
          '..........o..............',
          '.........................',
          '......^^^^^^^^...........',
        ],
        (function () {
          const s = seg(90);
          s.put('S', 4, 1);
          s.floor(14, 3, 4);
          s.ceil(24, 3, 4);
          s.floor(34, 3, 5);
          s.ceil(44, 3, 5);
          s.put('c', 52, 8);
          s.floor(56, 2, 3).put('^', 56, 3).put('^', 57, 3);
          s.ceil(64, 14, 3);
          s.floor(64, 14, 2);
          s.fill('^', 68, 2, 2, 1);
          s.put('C', 84, 2);
          return s.rows();
        })(),
        [
          '..................................',
          '..........^..........#.....^^.....',
          '....##########....#..#...#####....',
        ],
        [
          '..............###...........',
          '..............###...........',
          '..............###...........',
          '..........................  ',
          '.........._.........^^^.....',
        ],
        [
          '..........o...o...o...o...o..........',
          '.....................................',
          '........^^^^^^^^^^^^^^^^^^^^^........',
        ],
        [
          '..................c.................',
          '....................................',
          '....................................',
          '...............#....................',
          '...........#...#...#................',
          '.......#...#...#...#...#............',
          '...#...#...#...#...#...#...^^^......',
        ],
        ['.................^^..........^^^.........................'],
      ],
    },

    // ------------------------------------------------------------------
    {
      id: 'umkehr',
      name: 'Umkehr',
      difficulty: 3,
      colors: { bgTop: '#062b22', bgBottom: '#0f8a5f', accent: '#7dffc4', ground: '#063d2c' },
      music: { bpm: 148, root: 40, scale: [0, 2, 3, 7, 8], prog: [0, 4, 3, 1], lead: [0, 4, 3, 2, 0, 4, 2, 3] },
      map: [
        ['..................^^..........^^^.........^.^...........'],
        [
          '...............###.........',
          '..........##...###.........',
          '.....#....##...###...^^^...',
        ],
        (function () {
          const s = seg(76);
          s.put('U', 4, 1);
          s.fill('^', 6, 0, 54, 1);
          s.put('v', 18, 9);
          s.fill('v', 27, 9, 2, 1);
          s.ceil(38, 4, 2);
          s.put('v', 39, 7).put('c', 40, 5);
          s.fill('v', 48, 9, 3, 1);
          s.put('D', 62, 8);
          return s.rows();
        })(),
        [
          '..........................',
          '..........................',
          '.........b................',
          '.........................',
          '......^^^^^^^^^^^^^^^^^^^^',
        ],
        (function () {
          const s = seg(40);
          s.fill('^', 0, 0, 17, 1);
          s.put('v', 6, 9);
          s.put('b', 14, 6);
          return s.rows();
        })(),
        (function () {
          const s = seg(33);
          s.fill('v', 0, 9, 33, 1); // kein Abkürzen an der Decke
          s.floor(11, 3, 2).floor(23, 3, 2);
          s.put('^', 7, 0).put('^', 18, 0).put('^', 28, 0).put('^', 29, 0);
          return s.rows();
        })(),
        (function () {
          const s = seg(110);
          s.put('S', 4, 1);
          s.floor(16, 2, 4);
          s.ceil(26, 2, 4);
          s.floor(35, 2, 5);
          s.ceil(44, 2, 5);
          s.floor(52, 12, 2).ceil(52, 12, 4);
          s.fill('^', 56, 2, 1, 1).fill('v', 61, 5, 1, 1);
          s.put('c', 66, 1);
          s.floor(70, 3, 3).ceil(78, 3, 3);
          s.floor(86, 3, 4).ceil(86, 3, 2);
          s.put('C', 100, 2);
          return s.rows();
        })(),
        [
          '.......o...o...o...o...o................',
          '........................................',
          '.....^^^^^^^^^^^^^^^^^^^^^..............',
        ],
        [
          '.....................c..........',
          '..........................',
          '.....................#..........',
          '.................#...#..........',
          '.............#...#...#..........',
          '...^^^...#...#...#...#.^^^......',
        ],
        ['...............^^^........^^.^^.......................'],
      ],
    },
  ];

  // ====================================================================
  // Bausteine für weitere Level. Jeder Baustein beginnt und endet am Boden
  // im Würfel-Modus mit normaler Schwerkraft. Mit o.put = [[zeichen, x, y]]
  // lassen sich Extras (z.B. Münzen) einfügen.
  // ====================================================================
  function finish(s, o) {
    (o.put || []).forEach((p) => s.put(p[0], p[1], p[2]));
    return s.rows();
  }
  /** Eine Bodenzeile als Text, z.B. '....^...^^...'. */
  function run(str) { return [str]; }
  /** Einzelne Säulen mit Höhen hs. */
  function pillars(hs, o = {}) {
    const gap = o.gap || 4, w = o.w || 1, lead = 4;
    const s = seg(lead + hs.length * (w + gap) + 4);
    let x = lead;
    hs.forEach((h) => { if (h > 0) s.floor(x, w, h); x += w + gap; });
    return finish(s, o);
  }
  /** Treppe aus Blöcken, danach o.spikes Stacheln. */
  function stairs(hs, o = {}) {
    const w = o.w || 3, gap = o.gap || 3, n = o.spikes || 0;
    const s = seg(4 + hs.length * (w + gap) + n + 6);
    let x = 4;
    hs.forEach((h) => { s.floor(x, w, h); x += w + gap; });
    s.fill('^', x - gap + 1, 0, n, 1);
    return finish(s, o);
  }
  /** Sprungfeld vor einem Turm (Höhe o.h), Münze optional oben drauf. */
  function padTower(o = {}) {
    const h = o.h || 3;
    const s = seg(24);
    s.put('_', 8, 0).floor(11, 4, h);
    if (o.spike !== false) s.put('^', 20, 0);
    if (o.coin) s.put('c', 13, h + 2);
    return finish(s, o);
  }
  /** n Stacheln mit einem gelben Ring darüber. */
  function orbOver(n, o = {}) {
    const s = seg(n + 14);
    s.fill('^', 7, 0, n, 1).put('o', 6 + n, 2);
    return finish(s, o);
  }
  /** k gelbe Ringe über einem langen Stachelfeld. */
  function orbChain(k, o = {}) {
    const end = 14 + 4 * (k - 1) + 2;
    const s = seg(end + 8);
    s.fill('^', 12, 0, end - 11, 1);
    for (let i = 0; i < k; i++) s.put('o', 14 + 4 * i, 2);
    if (o.coin) s.put('c', 16 + 4 * (k - 2), 4);
    return finish(s, o);
  }
  /** Plattformen: [x, Länge, Höhe, [Stacheln oben drauf (x)]]. */
  function plats(list, o = {}) {
    let width = 0;
    list.forEach((p) => { width = Math.max(width, p[0] + p[1] + 6); });
    const s = seg(width);
    list.forEach((p) => {
      s.floor(p[0], p[1], p[2]);
      (p[3] || []).forEach((x) => s.put('^', x, p[2]));
    });
    return finish(s, o);
  }
  /** Raketen-Tunnel. Am Ende senkt sich die Decke, damit man sicher ins Würfel-Portal fliegt. */
  function ship(o) {
    const s = seg(o.w);
    s.put('S', 4, 1);
    (o.floor || []).forEach((f) => s.floor(f[0], f[1], f[2]));
    (o.ceil || []).forEach((c) => s.ceil(c[0], c[1], c[2]));
    (o.spikes || []).forEach((p) => s.put(p[0], p[1], p[2]));
    s.ceil(o.w - 12, 12, 6);
    s.put('C', o.w - 6, 1);
    return finish(s, o);
  }
  /** Schwerkraft-Abschnitt: an der Decke laufen, Stacheln am Boden. */
  function grav(o) {
    const w = o.w;
    const s = seg(w);
    s.put('U', 4, 1).fill('^', 6, 0, w - 22, 1);
    (o.v || []).forEach((x) => s.put('v', x, 9));
    (o.ceil || []).forEach((c) => {
      s.ceil(c[0], c[1], c[2]);
      if (c[3] !== undefined) s.put('v', c[3], 9 - c[2]);
    });
    s.put('D', w - 14, 8);
    return finish(s, o);
  }
  /** Zwei blaue Ringe: hoch an die Decke und wieder runter. */
  function blue(o = {}) {
    const a = seg(26);
    a.fill('^', 6, 0, 20, 1).put('b', 9, 2);
    const b = seg(40);
    b.fill('^', 0, 0, 17, 1);
    (o.v || [6]).forEach((x) => b.put('v', x, 9));
    b.put('b', 14, 6);
    if (o.coin) b.put('c', 10, 8);
    const c = seg(33);
    c.fill('v', 0, 9, 33, 1).floor(11, 3, 2).floor(23, 3, 2);
    c.put('^', 7, 0).put('^', 18, 0).put('^', 28, 0).put('^', 29, 0);
    return [a.rows(), b.rows(), c.rows()];
  }
  // ====================================================================
  // Bausteine für Welt 2 (neue Modi). Auch sie beginnen und enden am Boden
  // im Würfel-Modus mit normaler Schwerkraft.
  // ====================================================================
  /**
   * Flieger-Tunnel für Rakete (S), Ufo (F), Welle (W) oder Schaukel (X).
   * Am Ende wird der Gang 3 Kacheln niedrig; dort stehen Schwerkraft-, Tempo-
   * und Würfel-Portal, die den ganzen Gang abdecken (man landet sicher am Boden).
   */
  function flyer(ch, o) {
    const s = seg(o.w);
    s.put(ch, 4, 1);
    if (o.speed) s.put(o.speed, 6, 1);
    (o.floor || []).forEach((f) => s.floor(f[0], f[1], f[2]));
    (o.ceil || []).forEach((c) => s.ceil(c[0], c[1], c[2]));
    (o.blocks || []).forEach((b) => s.fill('#', b[0], b[1], b[2], b[3]));
    (o.spikes || []).forEach((p) => s.put(p[0], p[1], p[2]));
    s.ceil(o.w - 12, 12, 7);
    s.put('D', o.w - 10, 1);
    if (o.speed) s.put('2', o.w - 8, 1);
    s.put('C', o.w - 6, 1);
    return finish(s, o);
  }
  /**
   * Kugel (B) oder Spinne (P): rollt/läuft am Boden oder an der Decke.
   * low = Stachelreihen am Boden [x, n], high = an der Decke [x, n].
   * Die letzten 14 Kacheln hängen Stacheln an der Decke: man muss unten ankommen.
   */
  function roller(ch, o) {
    const w = o.w, s = seg(w);
    s.put(ch, 4, 1);
    if (o.speed) s.put(o.speed, 6, 1);
    (o.low || []).forEach((r) => s.fill('^', r[0], 0, r[1], 1));
    (o.high || []).forEach((r) => s.fill('v', r[0], 9, r[1], 1));
    (o.blocks || []).forEach((b) => s.fill('#', b[0], b[1], b[2], b[3]));
    (o.spikes || []).forEach((p) => s.put(p[0], p[1], p[2]));
    s.fill('v', w - 14, 9, 14, 1);
    if (o.speed) s.put('2', w - 8, 1);
    s.put('C', w - 6, 1);
    return finish(s, o);
  }
  /** Roboter-Strecke: walls = [x, Breite, Höhe], low = Stachelreihen [x, n]. */
  function robot(o) {
    const s = seg(o.w);
    s.put('R', 4, 1);
    if (o.speed) s.put(o.speed, 6, 1);
    (o.walls || []).forEach((b) => s.floor(b[0], b[1], b[2]));
    (o.low || []).forEach((r) => s.fill('^', r[0], 0, r[1], 1));
    (o.spikes || []).forEach((p) => s.put(p[0], p[1], p[2]));
    if (o.speed) s.put('2', o.w - 8, 1);
    s.put('C', o.w - 6, 1);
    return finish(s, o);
  }
  /** Teleport über ein Stachelfeld: hinauf auf eine Plattform und am Ende wieder runter. */
  function tele(o = {}) {
    const len = o.len || 16, s = seg(len + 18);
    s.put('T', 6, 1).put('t', 8, 6);
    s.fill('#', 7, 4, len, 1);
    s.fill('^', 9, 0, len, 1);
    s.put('T', 6 + len, 6).put('t', 8 + len, 1);
    (o.top || []).forEach((x) => s.put('^', x, 5));
    if (o.coin) s.put('c', 7 + Math.round(len / 2), 7);
    return finish(s, o);
  }
  /** Grüne Ringe: an die Decke und wieder runter über ein langes Stachelfeld. */
  function greens(o = {}) {
    const s = seg(46);
    s.fill('^', 8, 0, 17, 1).put('g', 9, 2);
    s.fill('v', 23, 9, 14, 1).put('g', 21, 8);
    (o.v || []).forEach((x) => s.put('v', x, 9));
    if (o.coin) s.put('c', 16, 9);
    return finish(s, o);
  }
  /** Sägeblätter am Boden und in der Luft. saws = [x, y]. */
  function saws(o) {
    const s = seg(o.w);
    (o.saws || []).forEach((p) => s.put('z', p[0], p[1]));
    (o.walls || []).forEach((b) => s.floor(b[0], b[1], b[2]));
    (o.spikes || []).forEach((p) => s.put(p[0], p[1], p[2]));
    return finish(s, o);
  }

  /** Ein einzelnes Portal am Boden (z.B. 'N' = wieder gross, '2' = normales Tempo). */
  function gate(ch) {
    const s = seg(10);
    s.put(ch, 4, 1);
    return s.rows();
  }

  /** Abschnitte zusammenfügen (Bausteine dürfen mehrere Abschnitte liefern). */
  function segs() {
    const out = [];
    for (let i = 0; i < arguments.length; i++) {
      const it = arguments[i];
      if (it.fx || typeof it[0] === 'string') out.push(it);
      else it.forEach((x) => out.push(x));
    }
    return out;
  }
  /**
   * Effekt-Trigger zwischen Abschnitten: fx('color', { theme: 3, fade: 1 }, dx, y).
   * Wird beim Laden in def.extras umgewandelt (x = Spalte, an der er steht, + dx).
   */
  function fx(t, p, dx, y) { return { fx: true, t, p: p || {}, dx: dx || 0, y: y === undefined ? 5 : y }; }

  /** Effekt-Marken aus der Karte holen und als extras ablegen. */
  function takeFx(def) {
    const map = [], extras = [];
    let x = 0;
    def.map.forEach((it) => {
      if (it.fx) { extras.push({ x: x + it.dx, y: it.y, t: it.t, p: it.p }); return; }
      map.push(it);
      x += Math.max.apply(null, it.map((r) => r.length));
    });
    def.map = map;
    if (extras.length) def.extras = (def.extras || []).concat(extras);
  }

  /**
   * Effekte für Level ohne eigene Trigger: aus dem Aufbau abgeleitet.
   * Start-Drop: Blitz + Puls; Rakete: andere Farben + Zoom; Schwerkraft: Neigen;
   * vor dem Ziel: Puls. Ändert nur die Optik, nicht die Strecke.
   */
  function autoFx(def, own, partner) {
    const out = [];
    const at = (x, t, p, y) => out.push({ x, y: y === undefined ? 5 : y, t, p });
    let x = 0, len = 0;
    def.map.forEach((rows) => { len += Math.max.apply(null, rows.map((r) => r.length)); });
    at(18, 'flash', { color: 0, dur: 0.4 }, 6);
    at(18, 'pulse', { power: 2, dur: 6 }, 4);
    let inShip = false;
    def.map.forEach((rows) => {
      const w = Math.max.apply(null, rows.map((r) => r.length));
      for (let j = 0; j < w; j++) {
        for (let i = 0; i < rows.length; i++) {
          const ch = rows[i][j];
          const cx = x + j;
          if (ch === 'S' && !inShip) {
            inShip = true;
            at(cx, 'color', { theme: partner, fade: 0.6 }, 8);
            at(cx, 'zoom', { zoom: 1.1, dur: 1.2 }, 7);
            at(cx, 'pulse', { power: 3, dur: 4 }, 6);
          } else if (ch === 'C' && inShip) {
            inShip = false;
            at(cx, 'color', { theme: own, fade: 0.8 }, 8);
            at(cx, 'zoom', { zoom: 1, dur: 0.8 }, 7);
            at(cx, 'flash', { color: 2, dur: 0.5 }, 6);
          } else if (ch === 'U') {
            at(cx, 'tilt', { angle: -5, dur: 1 }, 8);
          } else if (ch === 'D') {
            at(cx, 'tilt', { angle: 0, dur: 0.8 }, 2);
            at(cx, 'shake', { power: 1, dur: 0.3 }, 3);
          }
        }
      }
      x += w;
    });
    if (!out.some((e) => e.t === 'color')) {
      // ohne Raketen-Abschnitt: Farbwechsel in der Mitte, kurz vor dem Ziel zurück
      at(Math.round(len / 2), 'color', { theme: partner, fade: 2 }, 8);
      at(Math.round(len / 2), 'shake', { power: 1, dur: 0.3 }, 3);
      at(Math.max(20, len - 60), 'color', { theme: own, fade: 1.5 }, 8);
    }
    at(Math.max(20, len - 60), 'pulse', { power: 3, dur: 6 }, 5);
    return out;
  }
  const START = run('..................');
  const END = run('................................');

  const MORE = [
    {
      id: 'sonnenpfad', name: 'Sonnenpfad', difficulty: 1,
      colors: { bgTop: '#4a1d0f', bgBottom: '#e0662a', accent: '#ffd27a', ground: '#5a230d' },
      music: { bpm: 120, root: 48, scale: [0, 2, 4, 7, 9], prog: [0, 4, 5, 3], lead: [0, 2, 4, 5, 4, 2, 1, 2] },
      map: segs(
        START,
        run('^............^^...........^...........'),
        pillars([1, 2, 1, 2], { gap: 5 }),
        run('.......^.......^^.........'),
        padTower({ coin: true }),
        stairs([1, 2, 3], { spikes: 2 }),
        orbOver(4),
        pillars([1, 2, 3], { gap: 5, put: [['c', 16, 5]] }),
        run('.....^^........^.........'),
        orbChain(2, { coin: true }),
        run('...........^^..........^.......'),
        END
      ),
    },
    {
      id: 'kristallhoehle', name: 'Kristallhöhle', difficulty: 1,
      colors: { bgTop: '#0b2a3a', bgBottom: '#1f8fb0', accent: '#a8f4ff', ground: '#0d3646' },
      music: { bpm: 126, root: 50, scale: [0, 2, 3, 7, 9], prog: [0, 3, 4, 1], lead: [0, 1, 2, 4, 3, 2, 0, 4] },
      map: segs(
        START,
        run('m.m.........^..........m.^.m..........'),
        stairs([1, 2, 3, 4], { spikes: 3 }),
        run('......mm.......^^......'),
        padTower({ coin: true }),
        orbOver(5),
        plats([[4, 10, 1, [9]], [20, 8, 2], [32, 8, 1, [35]]]),
        pillars([2, 3, 2], { put: [['c', 9, 5]] }),
        orbChain(3, { coin: true }),
        run('.......m^m..........^^........'),
        END
      ),
    },
    {
      id: 'erster-flug', name: 'Erster Flug', difficulty: 1,
      colors: { bgTop: '#0f3b5c', bgBottom: '#3aa0d8', accent: '#fff07a', ground: '#0f3550' },
      music: { bpm: 128, root: 45, scale: [0, 2, 4, 5, 7, 9, 11], prog: [0, 5, 3, 4], lead: [0, 2, 4, 6, 4, 2, 1, 3] },
      map: segs(
        START,
        run('^...........^^.............'),
        pillars([1, 2, 1], { gap: 5 }),
        ship({ w: 74, floor: [[16, 3, 2], [38, 3, 3]], ceil: [[27, 3, 3], [49, 3, 3]], put: [['c', 33, 5]] }),
        run('.....^.........^^......'),
        padTower({ coin: true }),
        orbOver(4),
        stairs([1, 2, 3], { spikes: 2, put: [['c', 17, 5]] }),
        run('........^^.........^..........'),
        END
      ),
    },
    {
      id: 'tiefsee', name: 'Tiefsee', difficulty: 2,
      colors: { bgTop: '#050d2e', bgBottom: '#173a8a', accent: '#5effe1', ground: '#06123a' },
      music: { bpm: 132, root: 41, scale: [0, 2, 3, 5, 7, 8, 10], prog: [0, 5, 3, 6], lead: [0, 4, 2, 5, 4, 2, 6, 4] },
      map: segs(
        START,
        run('^^..........^.^..........^^...........'),
        stairs([1, 2, 3, 2], { spikes: 3 }),
        orbOver(5),
        ship({
          w: 96, floor: [[14, 3, 4], [33, 3, 5], [52, 3, 4]], ceil: [[24, 3, 4], [43, 3, 5], [62, 3, 5]],
          put: [['c', 47, 1]],
        }),
        run('....^^^.......'),
        padTower({ h: 4, coin: true }),
        orbChain(3),
        pillars([1, 2, 3, 4], { put: [['c', 19, 6]] }),
        run('......^^.....^^^.........'),
        END
      ),
    },
    {
      id: 'vulkan', name: 'Vulkan', difficulty: 2,
      colors: { bgTop: '#2a0505', bgBottom: '#b3200f', accent: '#ffb347', ground: '#3a0a05' },
      music: { bpm: 140, root: 40, scale: [0, 1, 4, 5, 7, 8, 10], prog: [0, 1, 0, 6], lead: [0, 2, 1, 4, 2, 5, 4, 1] },
      map: segs(
        START,
        run('^^^...........^^..........^^^..........'),
        padTower({ h: 4 }),
        plats([[4, 6, 1], [14, 6, 2, [16]], [24, 6, 3], [34, 6, 1, [36]]]),
        orbChain(4, { coin: true }),
        run('....m^m........^^^......'),
        stairs([2, 3, 4], { spikes: 4, put: [['c', 11, 5]] }),
        orbOver(5, { put: [['c', 13, 3]] }),
        run('.......^^^..........^^.^^.........'),
        END
      ),
    },
    {
      id: 'polarlicht', name: 'Polarlicht', difficulty: 2,
      colors: { bgTop: '#0a0f2a', bgBottom: '#2f6b5e', accent: '#c9a0ff', ground: '#0c1a2e' },
      music: { bpm: 134, root: 43, scale: [0, 2, 4, 7, 9], prog: [0, 3, 5, 4], lead: [4, 2, 0, 2, 5, 4, 2, 0] },
      map: segs(
        START,
        run('^^..........^...........^^...........'),
        pillars([1, 2, 3, 2, 1]),
        grav({ w: 64, v: [18, 30, 31], put: [['c', 24, 7]] }),
        run('......^^........^......'),
        orbChain(3),
        padTower({ coin: true }),
        ship({ w: 80, floor: [[16, 3, 4], [36, 3, 4], [56, 2, 5]], ceil: [[26, 3, 4], [46, 3, 4]], put: [['c', 51, 8]] }),
        stairs([1, 2, 3], { spikes: 3 }),
        END
      ),
    },
    {
      id: 'turbo-tunnel', name: 'Turbo-Tunnel', difficulty: 2,
      colors: { bgTop: '#1a0630', bgBottom: '#7a1fa8', accent: '#5ee6ff', ground: '#22083d' },
      music: { bpm: 144, root: 42, scale: [0, 3, 5, 7, 10], prog: [0, 2, 3, 4], lead: [0, 2, 4, 3, 2, 4, 1, 3] },
      map: segs(
        START,
        run('^.^..........^^...........'),
        ship({
          w: 110,
          floor: [[14, 3, 4], [30, 3, 5], [46, 2, 3], [62, 16, 2], [88, 3, 3]],
          ceil: [[22, 3, 4], [38, 3, 4], [54, 2, 6], [62, 16, 4]],
          spikes: [['^', 66, 2], ['v', 72, 5]],
          put: [['c', 18, 5]],
        }),
        run('....^^.......^^^.......'),
        orbOver(4, { put: [['c', 12, 3]] }),
        stairs([1, 2, 3], { spikes: 3, put: [['c', 17, 5]] }),
        ship({
          w: 90, floor: [[14, 2, 3], [26, 2, 5], [38, 2, 3], [50, 2, 5]], ceil: [[20, 2, 5], [32, 2, 3], [44, 2, 5], [56, 2, 3]],
        }),
        run('......^^..........^^^.........'),
        END
      ),
    },
    {
      id: 'schattenwerk', name: 'Schattenwerk', difficulty: 3,
      colors: { bgTop: '#0d0d12', bgBottom: '#3d2a3a', accent: '#ff5e7e', ground: '#151018' },
      music: { bpm: 150, root: 38, scale: [0, 1, 3, 5, 7, 8, 10], prog: [0, 6, 5, 4], lead: [0, 1, 3, 4, 3, 1, 0, 6] },
      map: segs(
        START,
        run('^^^.........^^.^^.........^^^..........'),
        grav({ w: 70, v: [16, 25, 26, 44, 45], ceil: [[33, 4, 2, 34]], put: [['c', 35, 5]] }),
        run('.....^^^.......'),
        blue({ coin: true }),
        ship({
          w: 96, floor: [[14, 2, 5], [30, 2, 5], [46, 10, 3]], ceil: [[22, 2, 4], [38, 2, 4], [46, 10, 4]],
          spikes: [['^', 50, 3]], put: [['c', 62, 8]],
        }),
        orbChain(4),
        stairs([2, 3, 4], { spikes: 4 }),
        END
      ),
    },
    {
      id: 'sternenstaub', name: 'Sternenstaub', difficulty: 3,
      colors: { bgTop: '#0a0a2a', bgBottom: '#3b2b8a', accent: '#ffd84a', ground: '#120f3a' },
      music: { bpm: 152, root: 44, scale: [0, 2, 4, 7, 9], prog: [0, 4, 2, 3], lead: [0, 4, 2, 6, 4, 7, 5, 2] },
      map: segs(
        START,
        run('^^^..........m^m..........^^^.........'),
        orbChain(5, { coin: true }),
        pillars([2, 3, 4, 3, 4], { gap: 3 }),
        run('.....^^^......^^^.......'),
        padTower({ h: 4, coin: true }),
        orbOver(5),
        plats([[4, 5, 1, [6]], [13, 5, 2, [15]], [22, 5, 3, [24]], [31, 5, 2, [33]]]),
        grav({ w: 60, v: [16, 17, 28, 29, 30], put: [['c', 40, 8]] }),
        run('.....^^^........m^m.......'),
        END
      ),
    },
    {
      id: 'glitch', name: 'Glitch', difficulty: 3,
      colors: { bgTop: '#020a02', bgBottom: '#0f4a1a', accent: '#b6ff3b', ground: '#051a08' },
      music: { bpm: 156, root: 39, scale: [0, 1, 5, 7, 8], prog: [0, 3, 1, 4], lead: [0, 3, 1, 4, 2, 0, 3, 1] },
      map: segs(
        START,
        run('^^...........^^^..........^.^.^.........'),
        ship({
          w: 104, floor: [[13, 2, 5], [24, 2, 5], [35, 2, 4], [46, 12, 3]], ceil: [[18, 2, 4], [29, 2, 4], [40, 2, 5], [46, 12, 4]],
          spikes: [['^', 49, 3], ['v', 54, 5]], put: [['c', 70, 1]],
        }),
        blue({ v: [6, 26] }),
        orbChain(4, { coin: true }),
        grav({ w: 72, v: [14, 22, 23, 50, 51], ceil: [[30, 5, 2, 32], [42, 2, 2]], put: [['c', 43, 5]] }),
        stairs([2, 3, 4, 3], { spikes: 3 }),
        END
      ),
    },
    {
      id: 'nachtschicht', name: 'Nachtschicht', difficulty: 4,
      colors: { bgTop: '#000000', bgBottom: '#2a0a2e', accent: '#ff4fd8', ground: '#0a020c' },
      music: { bpm: 162, root: 37, scale: [0, 2, 3, 7, 8], prog: [0, 3, 4, 2], lead: [0, 2, 4, 3, 2, 0, 4, 1] },
      map: segs(
        START,
        run('^^^.........^^^..........^^^........'),
        orbChain(5),
        blue({ v: [6, 24], coin: true }),
        ship({
          w: 110, floor: [[12, 2, 5], [22, 2, 5], [32, 2, 6], [44, 14, 3], [72, 2, 4]],
          ceil: [[17, 2, 4], [27, 2, 3], [37, 2, 4], [44, 14, 4], [78, 2, 4]],
          spikes: [['^', 47, 3], ['v', 51, 5], ['^', 55, 3]], put: [['c', 64, 8]],
        }),
        stairs([2, 3, 4], { spikes: 5 }),
        grav({ w: 70, v: [14, 15, 24, 25, 26, 46, 47], ceil: [[32, 4, 2, 33]], put: [['c', 34, 5]] }),
        orbOver(5),
        END
      ),
    },
    {
      id: 'neon-kern', name: 'Neon-Kern', difficulty: 4,
      colors: { bgTop: '#06061a', bgBottom: '#1a5c7a', accent: '#ffffff', ground: '#070a24' },
      music: { bpm: 170, root: 45, scale: [0, 2, 3, 5, 7, 8, 11], prog: [0, 5, 3, 4], lead: [0, 4, 2, 6, 4, 2, 7, 4] },
      map: segs(
        START,
        run('^^^..........^^^.........m^m.........'),
        padTower({ h: 4, coin: true }),
        orbChain(6),
        grav({ w: 76, v: [14, 15, 22, 23, 24, 52, 53], ceil: [[30, 4, 2, 31], [42, 4, 2, 43]] }),
        blue({ v: [6, 22, 30] }),
        ship({
          w: 120, floor: [[12, 2, 5], [21, 2, 6], [30, 2, 5], [42, 16, 3], [70, 2, 5], [86, 2, 5]],
          ceil: [[16, 2, 3], [25, 2, 3], [35, 2, 4], [42, 16, 4], [78, 2, 4], [94, 2, 3]],
          spikes: [['^', 45, 3], ['v', 49, 5], ['^', 53, 3]], put: [['c', 62, 1]],
        }),
        stairs([2, 3, 4, 3, 4], { spikes: 5, put: [['c', 23, 6]] }),
        END
      ),
    },
  ];

  // ====================================================================
  // Welt 2: neue Fähigkeiten
  // ====================================================================
  const WORLD2 = [
    {
      id: 'kugelblitz', name: 'Kugelblitz', difficulty: 1,
      colors: { bgTop: '#2a0a3a', bgBottom: '#d0406a', accent: '#ffd0a0', ground: '#3a0a30' },
      music: { bpm: 126, root: 46, scale: [0, 2, 4, 7, 9], prog: [0, 3, 5, 4], lead: [0, 4, 2, 4, 5, 4, 2, 0] },
      map: segs(
        START,
        fx('flash', { color: 1, dur: 0.4 }), fx('pulse', { power: 2, dur: 5 }, 0, 4),
        run('^...........^^.............^......'),
        pillars([1, 2, 1], { gap: 5 }),
        fx('color', { theme: 1, fade: 0.8 }, 4, 8), fx('zoom', { zoom: 1.1, dur: 1 }, 4, 7),
        roller('B', { w: 80, low: [[16, 8], [44, 10]], high: [[30, 8]], put: [['c', 38, 5]] }),
        fx('color', { theme: 15, fade: 0.8 }, 0, 8), fx('zoom', { zoom: 1, dur: 0.8 }, 0, 7),
        run('.....^^.........^........'),
        orbOver(3, { coin: true, put: [['c', 9, 4]] }),
        roller('B', { w: 70, low: [[14, 6], [36, 8]], high: [[24, 8]] }),
        fx('pulse', { power: 3, dur: 5 }),
        stairs([1, 2, 3], { spikes: 2, put: [['c', 17, 5]] }),
        END
      ),
    },
    {
      id: 'schwebeflug', name: 'Schwebeflug', difficulty: 1,
      colors: { bgTop: '#0a2a3a', bgBottom: '#2ab0a0', accent: '#fff4a0', ground: '#08323a' },
      music: { bpm: 122, root: 45, scale: [0, 2, 4, 5, 7, 9, 11], prog: [0, 4, 5, 3], lead: [0, 2, 4, 2, 6, 4, 2, 1] },
      map: segs(
        START,
        fx('flash', { color: 2, dur: 0.4 }), fx('pulse', { power: 2, dur: 5 }, 0, 4),
        run('^............^^............'),
        fx('color', { theme: 3, fade: 1 }, 4, 8), fx('pulse', { power: 3, dur: 6 }, 4, 6),
        flyer('F', { w: 84, floor: [[16, 3, 2], [36, 3, 3], [56, 3, 2]], ceil: [[26, 3, 4], [46, 3, 4]], put: [['c', 41, 6]] }),
        fx('color', { theme: 16, fade: 1 }, 0, 8),
        run('.....^.........^^......'),
        padTower({ coin: true }),
        flyer('F', { w: 72, floor: [[14, 2, 3], [30, 2, 4]], ceil: [[22, 2, 4], [38, 2, 3]], spikes: [['^', 46, 0], ['^', 47, 0], ['^', 48, 0]], put: [['c', 26, 2]] }),
        fx('pulse', { power: 3, dur: 5 }),
        stairs([1, 2, 3], { spikes: 2 }),
        END
      ),
    },
    {
      id: 'zickzack', name: 'Zickzack', difficulty: 1,
      colors: { bgTop: '#0a0a3a', bgBottom: '#3a6ad0', accent: '#7dffea', ground: '#0a1440' },
      music: { bpm: 130, root: 43, scale: [0, 3, 5, 7, 10], prog: [0, 2, 3, 4], lead: [0, 2, 4, 2, 3, 4, 1, 3] },
      map: segs(
        START,
        fx('flash', { color: 2, dur: 0.4 }), fx('pulse', { power: 2, dur: 5 }, 0, 4),
        run('^^...........^............^^.......'),
        fx('color', { theme: 8, fade: 0.6 }, 4, 8), fx('zoom', { zoom: 1.12, dur: 1 }, 4, 7),
        flyer('W', { w: 80, floor: [[16, 4, 3], [40, 4, 4]], ceil: [[28, 4, 3], [52, 4, 4]], put: [['c', 34, 5]] }),
        fx('color', { theme: 17, fade: 0.8 }, 0, 8), fx('zoom', { zoom: 1, dur: 0.8 }, 0, 7),
        run('.....^^.........^.......'),
        orbChain(2, { coin: true }),
        flyer('W', { w: 76, floor: [[14, 3, 4], [26, 3, 2], [38, 3, 5]], ceil: [[20, 3, 3], [32, 3, 5], [44, 3, 3]], put: [['c', 29, 4]] }),
        fx('pulse', { power: 3, dur: 5 }),
        pillars([1, 2, 3, 2]),
        END
      ),
    },
    {
      id: 'blechpark', name: 'Blechpark', difficulty: 2,
      colors: { bgTop: '#1a1a22', bgBottom: '#6a6a80', accent: '#ffb03b', ground: '#202028' },
      music: { bpm: 134, root: 41, scale: [0, 2, 3, 5, 7, 9, 10], prog: [0, 3, 4, 0], lead: [0, 2, 3, 4, 2, 0, 4, 3] },
      map: segs(
        START,
        fx('flash', { color: 1, dur: 0.4 }), fx('pulse', { power: 2, dur: 5 }, 0, 4),
        run('^^..........^^^..........^.......'),
        fx('color', { theme: 6, fade: 0.8 }, 4, 8), fx('shake', { power: 1, dur: 0.3 }, 4, 3),
        robot({ w: 96, walls: [[14, 3, 1], [21, 3, 2], [28, 3, 3], [36, 3, 2], [43, 3, 1], [50, 3, 3], [58, 3, 2]],
          low: [[17, 4], [24, 4], [31, 5], [39, 4], [46, 4], [53, 5], [61, 6]], put: [['c', 37, 5]] }),
        fx('color', { theme: 18, fade: 0.8 }, 0, 8),
        run('......^^........^^^.......'),
        padTower({ h: 4, coin: true }),
        robot({ w: 84, walls: [[14, 2, 2], [20, 2, 3], [26, 2, 1], [31, 2, 3], [37, 2, 2]],
          low: [[16, 4], [22, 4], [28, 3], [33, 4], [39, 6]], put: [['c', 24, 6]] }),
        fx('pulse', { power: 3, dur: 5 }),
        stairs([2, 3, 2], { spikes: 3 }),
        END
      ),
    },
    {
      id: 'spinnennetz', name: 'Spinnennetz', difficulty: 2,
      colors: { bgTop: '#08040f', bgBottom: '#3a1a5a', accent: '#a0ff6a', ground: '#0e0618' },
      music: { bpm: 138, root: 40, scale: [0, 1, 3, 5, 7, 8, 10], prog: [0, 5, 6, 4], lead: [0, 3, 1, 4, 3, 5, 4, 1] },
      map: segs(
        START,
        fx('flash', { color: 4, dur: 0.4 }), fx('pulse', { power: 2, dur: 5 }, 0, 4),
        run('^^^..........^^...........^^.......'),
        fx('color', { theme: 12, fade: 0.6 }, 4, 8),
        roller('P', { w: 96, low: [[14, 10], [44, 12], [72, 8]], high: [[28, 10], [60, 8]], put: [['c', 50, 9]] }),
        fx('color', { theme: 19, fade: 0.8 }, 0, 8),
        run('.....^^^........^......'),
        orbChain(3, { coin: true }),
        fx('zoom', { zoom: 1.12, dur: 0.8 }, 4, 7),
        roller('P', { w: 90, low: [[12, 38]], high: [[52, 12]], blocks: [[16, 6, 14, 1], [36, 4, 10, 1]], put: [['c', 41, 5]] }),
        fx('zoom', { zoom: 1, dur: 0.8 }, 0, 7),
        fx('pulse', { power: 3, dur: 5 }),
        pillars([2, 3, 2, 1], { gap: 4 }),
        END
      ),
    },
    {
      id: 'pendel', name: 'Pendel', difficulty: 2,
      colors: { bgTop: '#2a1400', bgBottom: '#d08a20', accent: '#fff0c0', ground: '#3a1c00' },
      music: { bpm: 136, root: 44, scale: [0, 2, 4, 7, 9], prog: [0, 5, 3, 4], lead: [4, 2, 0, 2, 5, 4, 2, 0] },
      map: segs(
        START,
        fx('flash', { color: 1, dur: 0.4 }), fx('pulse', { power: 2, dur: 5 }, 0, 4),
        run('^..........^^^............^.......'),
        fx('color', { theme: 7, fade: 1 }, 4, 8), fx('tilt', { angle: 6, dur: 1.2 }, 4, 6),
        flyer('X', { w: 96, floor: [[16, 3, 4], [36, 3, 3], [56, 3, 5]], ceil: [[26, 3, 4], [46, 3, 5], [66, 3, 3]], put: [['c', 51, 2]] }),
        fx('tilt', { angle: 0, dur: 0.8 }, 0, 6), fx('color', { theme: 20, fade: 1 }, 0, 8),
        run('......^^.........^^^......'),
        orbOver(4, { put: [['c', 10, 4]] }),
        fx('tilt', { angle: -6, dur: 1.2 }, 4, 6),
        flyer('X', { w: 90, floor: [[14, 2, 5], [30, 2, 4], [46, 2, 5]], ceil: [[22, 2, 4], [38, 2, 5], [54, 2, 4]], put: [['c', 34, 7]] }),
        fx('tilt', { angle: 0, dur: 0.8 }, 0, 6),
        fx('pulse', { power: 3, dur: 5 }),
        stairs([1, 2, 3], { spikes: 3 }),
        END
      ),
    },
    {
      id: 'portalsprung', name: 'Portalsprung', difficulty: 2,
      colors: { bgTop: '#001a2a', bgBottom: '#0a6aa0', accent: '#ff9b3b', ground: '#00202e' },
      music: { bpm: 140, root: 42, scale: [0, 2, 3, 7, 9], prog: [0, 3, 1, 4], lead: [0, 4, 2, 3, 4, 1, 2, 0] },
      map: segs(
        START,
        fx('flash', { color: 2, dur: 0.4 }), fx('pulse', { power: 2, dur: 5 }, 0, 4),
        run('^^...........^^............^.......'),
        tele({ len: 16, top: [14], coin: true }),
        fx('shake', { power: 1, dur: 0.3 }, 0, 3),
        run('.....^^^........^^.......'),
        fx('color', { theme: 9, fade: 0.6 }, 6, 8),
        greens({ v: [], coin: true }),
        fx('color', { theme: 21, fade: 0.8 }, 0, 8),
        (function () {
          // blaues Sprungfeld: an die Decke, dort über hängende Stacheln, Schwerkraft-Portal zurück
          const t = seg(48);
          t.put('u', 8, 0).fill('^', 10, 0, 22, 1);
          t.put('v', 18, 9).put('v', 25, 9).put('v', 26, 9);
          t.put('D', 28, 8);
          t.put('c', 24, 6);
          return t.rows();
        })(),
        run('.....^^........'),
        (function () {
          // schwarzer Ring: nach dem Sprungfeld schnell runter unter den hängenden Block
          const t = seg(34);
          t.put('_', 6, 0).fill('^', 8, 0, 6, 1).put('n', 11, 4);
          t.fill('#', 14, 0, 10, 1).fill('#', 16, 3, 6, 7);
          return t.rows();
        })(),
        tele({ len: 12, top: [] }),
        fx('pulse', { power: 3, dur: 5 }),
        orbChain(3),
        END
      ),
    },
    {
      id: 'saegewerk', name: 'Sägewerk', difficulty: 3,
      colors: { bgTop: '#1a0a00', bgBottom: '#7a3a10', accent: '#ffd84a', ground: '#241000' },
      music: { bpm: 146, root: 39, scale: [0, 1, 4, 5, 7, 8, 10], prog: [0, 1, 4, 0], lead: [0, 1, 4, 2, 5, 4, 1, 0] },
      map: segs(
        START,
        fx('flash', { color: 1, dur: 0.4 }), fx('shake', { power: 2, dur: 0.4 }, 0, 3), fx('pulse', { power: 2, dur: 6 }, 0, 4),
        run('^^...........^^^..........'),
        saws({ w: 52, saws: [[8, 0], [16, 0], [17, 0], [26, 0], [34, 0], [35, 0], [36, 0], [44, 3]], walls: [[30, 3, 1]], put: [['c', 31, 3]] }),
        fx('color', { theme: 6, fade: 0.6 }, 4, 8),
        robot({ w: 90, speed: '3', walls: [[14, 3, 2], [22, 3, 3], [31, 3, 1], [39, 3, 3], [48, 3, 2], [57, 3, 3]],
          low: [[17, 5], [25, 6], [34, 5], [42, 6], [51, 6], [60, 8]], spikes: [['z', 23, 4], ['z', 40, 4]], put: [['c', 46, 6]] }),
        fx('color', { theme: 22, fade: 0.8 }, 0, 8),
        run('......^^.......^^^.......'),
        fx('zoom', { zoom: 1.12, dur: 0.8 }, 4, 7), fx('pulse', { power: 3, dur: 6 }, 4, 6),
        flyer('S', { w: 100, speed: '3', floor: [[16, 3, 4], [34, 3, 5], [52, 3, 3], [70, 3, 4]], ceil: [[25, 3, 4], [43, 3, 4], [61, 3, 5]],
          spikes: [['z', 30, 5], ['z', 48, 4], ['z', 66, 5]], put: [['c', 57, 6]] }),
        fx('zoom', { zoom: 1, dur: 0.8 }, 0, 7),
        saws({ w: 40, saws: [[8, 0], [9, 0], [18, 0], [19, 0], [20, 0], [28, 0]] }),
        END
      ),
    },
    {
      id: 'wellenbrecher', name: 'Wellenbrecher', difficulty: 3,
      colors: { bgTop: '#00101f', bgBottom: '#0050a0', accent: '#5effe1', ground: '#001428' },
      music: { bpm: 150, root: 41, scale: [0, 2, 3, 5, 7, 9, 10], prog: [0, 6, 5, 4], lead: [0, 2, 4, 6, 5, 4, 2, 1] },
      map: segs(
        START,
        fx('flash', { color: 2, dur: 0.4 }), fx('pulse', { power: 2, dur: 6 }, 0, 4),
        run('^^^..........^^...........^^^.......'),
        fx('color', { theme: 5, fade: 0.6 }, 4, 8), fx('zoom', { zoom: 1.15, dur: 1 }, 4, 7),
        flyer('W', { w: 100, floor: [[14, 3, 4], [24, 3, 2], [34, 3, 5], [44, 3, 3], [54, 3, 5], [64, 3, 2]],
          ceil: [[19, 3, 3], [29, 3, 5], [39, 3, 3], [49, 3, 4], [59, 3, 3], [69, 3, 5]], put: [['c', 42, 5]] }),
        fx('color', { theme: 23, fade: 0.8 }, 0, 8), fx('zoom', { zoom: 1, dur: 0.6 }, 0, 7),
        run('.....^^^.........^^......'),
        orbChain(4, { coin: true }),
        fx('pulse', { power: 3, dur: 6 }, 4, 6), fx('shake', { power: 1, dur: 0.4 }, 4, 3),
        flyer('S', { w: 92, speed: '3', floor: [[14, 2, 4], [28, 2, 5], [42, 2, 4], [56, 2, 5]], ceil: [[21, 2, 5], [35, 2, 4], [49, 2, 5], [63, 2, 4]] }),
        fx('zoom', { zoom: 1.15, dur: 0.8 }, 4, 7),
        flyer('W', { w: 96, speed: '3', floor: [[14, 4, 3], [28, 4, 4], [42, 4, 3], [56, 4, 4]], ceil: [[21, 4, 4], [35, 4, 3], [49, 4, 4], [63, 4, 3]], put: [['c', 39, 4]] }),
        fx('zoom', { zoom: 1, dur: 0.6 }, 0, 7),
        stairs([2, 3, 4], { spikes: 3 }),
        END
      ),
    },
    {
      id: 'spiegelwelt', name: 'Spiegelwelt', difficulty: 3,
      colors: { bgTop: '#14002a', bgBottom: '#7a3ad0', accent: '#ffffff', ground: '#1a0036' },
      music: { bpm: 148, root: 43, scale: [0, 2, 4, 6, 7, 9, 11], prog: [0, 4, 5, 2], lead: [0, 4, 6, 4, 2, 4, 1, 0] },
      map: segs(
        START,
        fx('flash', { color: 0, dur: 0.5 }), fx('pulse', { power: 2, dur: 5 }, 0, 4),
        run('^^...........^^^.........^.^.......'),
        fx('mirror', { on: 1, dur: 0.6 }, 2, 6), fx('color', { theme: 4, fade: 0.6 }, 2, 8),
        roller('B', { w: 90, low: [[14, 8], [36, 10], [60, 8]], high: [[24, 10], [48, 10]], blocks: [[30, 4, 3, 2]], put: [['c', 43, 5]] }),
        fx('mirror', { on: 0, dur: 0.6 }, 0, 6), fx('color', { theme: 24, fade: 0.6 }, 0, 8),
        run('.....^^^........^^.......'),
        padTower({ h: 4, coin: true }),
        fx('mirror', { on: 1, dur: 0.6 }, 2, 6),
        flyer('F', { w: 90, floor: [[14, 2, 3], [26, 2, 4], [38, 2, 3], [50, 2, 5]], ceil: [[20, 2, 5], [32, 2, 4], [44, 2, 5], [56, 2, 3]], put: [['c', 29, 2]] }),
        fx('mirror', { on: 0, dur: 0.6 }, 0, 6),
        fx('pulse', { power: 3, dur: 6 }),
        roller('B', { w: 64, low: [[12, 6], [28, 6]], high: [[20, 6], [36, 6]] }),
        pillars([2, 3, 2]),
        END
      ),
    },
    {
      id: 'nebelnacht', name: 'Nebelnacht', difficulty: 3,
      colors: { bgTop: '#020208', bgBottom: '#1a2a3a', accent: '#a0e0ff', ground: '#04060c' },
      music: { bpm: 144, root: 38, scale: [0, 2, 3, 7, 8], prog: [0, 5, 3, 4], lead: [0, 3, 2, 4, 3, 1, 0, 2] },
      map: segs(
        START,
        fx('dark', { power: 0.6, dur: 2 }, 0, 6), fx('pulse', { power: 1, dur: 6 }, 0, 4),
        run('^^...........^^^...........^.......'),
        stairs([1, 2, 3], { spikes: 3 }),
        fx('dark', { power: 0.85, dur: 1 }, 2, 6),
        roller('P', { w: 100, low: [[12, 12], [40, 12], [70, 10]], high: [[26, 10], [56, 10]], blocks: [[30, 5, 6, 1], [60, 4, 6, 1]], put: [['c', 32, 4], ['c', 62, 3]] }),
        fx('flash', { color: 2, dur: 0.6 }, 0, 4), fx('dark', { power: 0.5, dur: 1 }, 0, 6),
        run('.....^^^........^^.......'),
        orbChain(4, { coin: true }),
        fx('dark', { power: 0.9, dur: 0.8 }, 2, 6),
        roller('P', { w: 80, low: [[12, 30]], high: [[44, 12]], blocks: [[18, 6, 8, 1], [30, 3, 8, 1]] }),
        fx('dark', { power: 0, dur: 1.5 }, 0, 6), fx('flash', { color: 0, dur: 0.8 }, 0, 4), fx('pulse', { power: 3, dur: 6 }, 0, 5),
        pillars([2, 3, 4, 3]),
        END
      ),
    },
    {
      id: 'kaleidoskop', name: 'Kaleidoskop', difficulty: 3,
      colors: { bgTop: '#1a0030', bgBottom: '#d04a8a', accent: '#7dffea', ground: '#22003a' },
      music: { bpm: 152, root: 44, scale: [0, 2, 4, 7, 9], prog: [0, 3, 4, 5], lead: [0, 2, 4, 7, 4, 2, 5, 4] },
      map: segs(
        START,
        fx('flash', { color: 3, dur: 0.4 }), fx('pulse', { power: 3, dur: 6 }, 0, 4),
        run('^^^..........^^^..........'),
        fx('tilt', { angle: 8, dur: 1 }, 2, 6), fx('color', { theme: 2, fade: 0.5 }, 2, 8),
        roller('B', { w: 60, low: [[12, 8], [32, 8]], high: [[22, 8]] }),
        fx('tilt', { angle: -8, dur: 1 }, 0, 6), fx('color', { theme: 7, fade: 0.5 }, 0, 8),
        flyer('F', { w: 64, floor: [[14, 2, 3], [26, 2, 4]], ceil: [[20, 2, 4], [32, 2, 3]], put: [['c', 23, 6]] }),
        fx('tilt', { angle: 6, dur: 1 }, 0, 6), fx('color', { theme: 8, fade: 0.5 }, 0, 8),
        flyer('W', { w: 64, floor: [[14, 3, 3], [30, 3, 4]], ceil: [[22, 3, 4], [38, 3, 3]] }),
        fx('tilt', { angle: 0, dur: 0.8 }, 0, 6), fx('color', { theme: 26, fade: 0.5 }, 0, 8),
        greens({ coin: true }),
        fx('tilt', { angle: -10, dur: 1.2 }, 0, 6), fx('zoom', { zoom: 1.12, dur: 1 }, 0, 7),
        robot({ w: 70, walls: [[14, 3, 2], [21, 3, 3], [29, 3, 1], [36, 3, 3]], low: [[17, 4], [24, 5], [32, 4], [39, 6]], put: [['c', 22, 6]] }),
        fx('tilt', { angle: 0, dur: 0.8 }, 0, 6), fx('zoom', { zoom: 1, dur: 0.8 }, 0, 7),
        flyer('X', { w: 70, floor: [[14, 3, 4], [34, 3, 4]], ceil: [[24, 3, 4], [44, 3, 4]] }),
        fx('pulse', { power: 3, dur: 6 }),
        orbOver(4),
        END
      ),
    },
    {
      id: 'ueberladung', name: 'Überladung', difficulty: 4,
      colors: { bgTop: '#000a14', bgBottom: '#00506a', accent: '#ff5ec8', ground: '#000e1a' },
      music: { bpm: 164, root: 40, scale: [0, 1, 3, 7, 8], prog: [0, 3, 4, 1], lead: [0, 3, 1, 4, 3, 0, 4, 2] },
      map: segs(
        START,
        fx('flash', { color: 3, dur: 0.4 }), fx('shake', { power: 2, dur: 0.4 }, 0, 3), fx('pulse', { power: 3, dur: 6 }, 0, 4),
        run('^^^.........^^^..........'),
        gate('K'),
        run('.....^.^......^^........^.^.^.......'),
        fx('color', { theme: 13, fade: 0.5 }, 2, 8), fx('zoom', { zoom: 1.2, dur: 1 }, 2, 7),
        flyer('S', { w: 90, floor: [[12, 2, 4], [22, 2, 5], [32, 2, 3], [42, 10, 3], [60, 2, 5]], ceil: [[17, 2, 4], [27, 2, 3], [37, 2, 5], [42, 10, 5], [66, 2, 5]],
          spikes: [['^', 45, 3], ['v', 49, 4]], put: [['c', 56, 4]] }),
        fx('color', { theme: 8, fade: 0.5 }, 0, 8),
        flyer('W', { w: 84, floor: [[12, 3, 4], [20, 3, 5], [28, 3, 4], [36, 3, 5], [44, 3, 4]], ceil: [[16, 3, 4], [24, 3, 3], [32, 3, 4], [40, 3, 3], [48, 3, 4]], put: [['c', 30, 5]] }),
        fx('color', { theme: 27, fade: 0.5 }, 0, 8),
        flyer('F', { w: 76, floor: [[12, 2, 3], [22, 2, 4], [32, 2, 3]], ceil: [[17, 2, 5], [27, 2, 4], [37, 2, 5]], spikes: [['^', 44, 0], ['^', 45, 0], ['^', 46, 0], ['^', 47, 0]] }),
        gate('N'),
        fx('zoom', { zoom: 1, dur: 0.8 }), fx('flash', { color: 0, dur: 0.5 }, 0, 4),
        flyer('X', { w: 90, speed: '3', floor: [[14, 3, 4], [30, 3, 5], [46, 3, 4]], ceil: [[22, 3, 4], [38, 3, 4], [54, 3, 4]], put: [['c', 41, 6]] }),
        fx('pulse', { power: 3, dur: 6 }),
        stairs([2, 3, 4], { spikes: 4 }),
        END
      ),
    },
    {
      id: 'sturmkern', name: 'Sturmkern', difficulty: 4,
      colors: { bgTop: '#0a0014', bgBottom: '#3a0a6a', accent: '#ffe14a', ground: '#0e001c' },
      music: { bpm: 168, root: 42, scale: [0, 2, 3, 5, 7, 8, 10], prog: [0, 5, 6, 4], lead: [0, 2, 3, 5, 7, 5, 3, 2] },
      map: segs(
        START,
        fx('flash', { color: 1, dur: 0.4 }), fx('shake', { power: 2, dur: 0.4 }, 0, 3), fx('pulse', { power: 3, dur: 8 }, 0, 4),
        run('^^^..........^^^.........'),
        fx('color', { theme: 1, fade: 0.3 }, 2, 8),
        roller('B', { w: 50, speed: '3', low: [[12, 6]], high: [[20, 8]], put: [['c', 17, 5]] }),
        fx('color', { theme: 3, fade: 0.3 }, 0, 8), fx('tilt', { angle: 5, dur: 0.6 }, 0, 6),
        flyer('F', { w: 50, speed: '3', floor: [[14, 2, 3]], ceil: [[22, 2, 4]], spikes: [['^', 30, 0], ['^', 31, 0], ['^', 32, 0]] }),
        fx('color', { theme: 17, fade: 0.3 }, 0, 8), fx('tilt', { angle: -5, dur: 0.6 }, 0, 6),
        flyer('W', { w: 54, speed: '3', floor: [[14, 3, 4], [26, 3, 3]], ceil: [[20, 3, 3], [32, 3, 4]] }),
        fx('color', { theme: 18, fade: 0.3 }, 0, 8), fx('tilt', { angle: 0, dur: 0.6 }, 0, 6),
        robot({ w: 54, speed: '3', walls: [[14, 3, 2], [22, 3, 3], [31, 3, 2]], low: [[17, 5], [25, 6], [34, 6]], put: [['c', 24, 6]] }),
        fx('color', { theme: 19, fade: 0.3 }, 0, 8), fx('dark', { power: 0.6, dur: 0.5 }, 0, 6),
        roller('P', { w: 54, speed: '3', low: [[12, 10]], high: [[24, 8]], blocks: [[34, 5, 5, 1]] }),
        fx('color', { theme: 20, fade: 0.3 }, 0, 8), fx('dark', { power: 0, dur: 0.5 }, 0, 6),
        flyer('X', { w: 56, speed: '3', floor: [[14, 3, 4]], ceil: [[26, 3, 4]], put: [['c', 21, 3]] }),
        fx('color', { theme: 28, fade: 0.3 }, 0, 8), fx('zoom', { zoom: 1.15, dur: 0.6 }, 0, 7),
        flyer('S', { w: 70, speed: '4', floor: [[14, 2, 4], [30, 2, 5]], ceil: [[22, 2, 4], [38, 2, 4]] }),
        fx('zoom', { zoom: 1, dur: 0.6 }, 0, 7), fx('shake', { power: 2, dur: 0.4 }, 0, 3),
        orbChain(5),
        END
      ),
    },
    {
      id: 'neon-finale', name: 'Neon-Finale', difficulty: 4,
      colors: { bgTop: '#000000', bgBottom: '#26265a', accent: '#5ee6ff', ground: '#05051a' },
      music: { bpm: 174, root: 45, scale: [0, 2, 3, 5, 7, 8, 11], prog: [0, 3, 4, 5], lead: [0, 4, 2, 6, 7, 4, 2, 5] },
      map: segs(
        START,
        fx('flash', { color: 0, dur: 0.6 }), fx('shake', { power: 3, dur: 0.5 }, 0, 3), fx('pulse', { power: 3, dur: 8 }, 0, 4),
        run('^^^..........^^^........m^m........'),
        orbChain(5, { coin: true }),
        fx('color', { theme: 14, fade: 0.6 }, 4, 8), fx('zoom', { zoom: 1.12, dur: 1 }, 4, 7),
        flyer('S', { w: 96, floor: [[12, 2, 5], [22, 2, 6], [32, 2, 5], [44, 14, 3]], ceil: [[17, 2, 3], [27, 2, 3], [37, 2, 4], [44, 14, 4]],
          spikes: [['^', 48, 3], ['v', 52, 5]], put: [['c', 64, 7]] }),
        fx('zoom', { zoom: 1, dur: 0.6 }, 0, 7), fx('mirror', { on: 1, dur: 0.6 }, 0, 6), fx('color', { theme: 24, fade: 0.6 }, 0, 8),
        roller('B', { w: 70, low: [[12, 8], [36, 8]], high: [[24, 8], [48, 6]] }),
        fx('mirror', { on: 0, dur: 0.6 }, 0, 6), fx('color', { theme: 23, fade: 0.6 }, 0, 8),
        flyer('W', { w: 80, speed: '3', floor: [[14, 3, 4], [24, 3, 3], [34, 3, 5], [44, 3, 4]], ceil: [[19, 3, 4], [29, 3, 5], [39, 3, 3], [49, 3, 4]], put: [['c', 31, 3]] }),
        fx('tilt', { angle: 8, dur: 0.8 }, 0, 6), fx('color', { theme: 18, fade: 0.6 }, 0, 8),
        robot({ w: 64, walls: [[14, 3, 2], [21, 3, 3], [29, 3, 2], [36, 3, 3]], low: [[17, 4], [24, 5], [32, 4], [39, 6]], spikes: [['z', 22, 5]] }),
        fx('tilt', { angle: 0, dur: 0.6 }, 0, 6), fx('dark', { power: 0.8, dur: 0.6 }, 0, 6), fx('color', { theme: 25, fade: 0.6 }, 0, 8),
        roller('P', { w: 80, low: [[12, 12], [40, 12]], high: [[26, 10], [56, 10]], blocks: [[30, 5, 6, 1]] }),
        fx('dark', { power: 0, dur: 0.8 }, 0, 6), fx('flash', { color: 2, dur: 0.5 }, 0, 4),
        greens({}),
        fx('color', { theme: 20, fade: 0.6 }, 0, 8), fx('tilt', { angle: -8, dur: 0.8 }, 0, 6),
        flyer('X', { w: 80, speed: '3', floor: [[14, 3, 4], [30, 3, 5], [46, 3, 4]], ceil: [[22, 3, 4], [38, 3, 4]] }),
        fx('tilt', { angle: 0, dur: 0.6 }, 0, 6), fx('color', { theme: 29, fade: 0.6 }, 0, 8),
        flyer('F', { w: 64, floor: [[14, 2, 3], [26, 2, 4]], ceil: [[20, 2, 4], [32, 2, 3]] }),
        fx('pulse', { power: 3, dur: 8 }), fx('shake', { power: 2, dur: 0.5 }, 0, 3),
        stairs([2, 3, 4, 3, 4], { spikes: 5 }),
        END
      ),
    },
  ];

  // Reihenfolge = steigende Schwierigkeit
  const ORDER = [
    'erster-sprung', 'sonnenpfad', 'kristallhoehle', 'erster-flug',
    'neon-himmel', 'tiefsee', 'vulkan', 'polarlicht', 'turbo-tunnel',
    'umkehr', 'schattenwerk', 'sternenstaub', 'glitch',
    'nachtschicht', 'neon-kern',
    // Welt 2
    'kugelblitz', 'schwebeflug', 'zickzack',
    'blechpark', 'spinnennetz', 'pendel', 'portalsprung',
    'saegewerk', 'wellenbrecher', 'spiegelwelt', 'nebelnacht', 'kaleidoskop',
    'ueberladung', 'sturmkern', 'neon-finale',
  ];
  const ALL = LEVELS.concat(MORE, WORLD2);
  const SORTED = ORDER.map((id) => ALL.find((l) => l.id === id));
  SORTED.forEach((def, i) => {
    def.world = i < 15 ? 1 : 2;
    takeFx(def);
    if (!def.extras) def.extras = autoFx(def, i, (i + 5) % 15);
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = SORTED;
  else root.LEVELS = SORTED;
})(this);
