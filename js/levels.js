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
 *
 * Portale sind 3 Kacheln hoch und werden auf die mittlere Kachel gesetzt.
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
          '..................o.......o..........',
          '.....................................',
          '...........o.........................',
          '.....................................',
          '........^^^^^^^^^^^^^^^^^^^^^^.......',
        ],
        [
          '.........................c..........',
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
          '...............o.........o..............',
          '........................................',
          '........................................',
          '.....^^^^^^^^^^^^^^^^^^^^^^^^^^^^.......',
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
  /** Abschnitte zusammenfügen (Bausteine dürfen mehrere Abschnitte liefern). */
  function segs() {
    const out = [];
    for (let i = 0; i < arguments.length; i++) {
      const it = arguments[i];
      if (typeof it[0] === 'string') out.push(it);
      else it.forEach((x) => out.push(x));
    }
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
        grav({ w: 72, v: [14, 22, 23, 50, 51], ceil: [[30, 5, 2, 32], [42, 2, 3]], put: [['c', 43, 5]] }),
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
        orbOver(6),
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

  // Reihenfolge = steigende Schwierigkeit
  const ORDER = [
    'erster-sprung', 'sonnenpfad', 'kristallhoehle', 'erster-flug',
    'neon-himmel', 'tiefsee', 'vulkan', 'polarlicht', 'turbo-tunnel',
    'umkehr', 'schattenwerk', 'sternenstaub', 'glitch',
    'nachtschicht', 'neon-kern',
  ];
  const ALL = LEVELS.concat(MORE);
  const SORTED = ORDER.map((id) => ALL.find((l) => l.id === id));

  if (typeof module !== 'undefined' && module.exports) module.exports = SORTED;
  else root.LEVELS = SORTED;
})(this);
