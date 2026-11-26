/*
 * Neon Hop – Infinity-Modus: eine endlose, zufällige Strecke.
 *
 * Der Zufall kommt nur aus dem Seed (eigene Ganzzahl-Rechnung, kein Math.random),
 * darum erzeugt derselbe Seed überall dieselbe Strecke. So kann der Server einen
 * Lauf (Seed + Tastendrücke) nachspielen und die Distanz selbst bestimmen.
 *
 * Jeder Abschnitt beginnt und endet am Boden im Würfel-Modus mit normaler
 * Schwerkraft, Grösse und Tempo (wie die Bausteine in js/kit.js). Die Abschnitte
 * stammen aus erprobten Mustern; tools/verify-infinite.js prüft viele Seeds.
 *
 * Läuft im Browser (window.NeonInfinite) und in Node (require).
 */
(function (root) {
  'use strict';
  const isNode = typeof module !== 'undefined' && module.exports;
  const E = isNode ? require('./engine.js') : root.Engine;
  const K = isNode ? require('./kit.js') : root.NeonKit;
  const { seg, run, pillars, stairs, padTower, orbOver, orbChain, ship, grav, blue, flyer, roller, robot, tele, greens, saws, gate } = K;

  const TIER_LEN = 300;      // alle 300 Kacheln wird es eine Stufe schwerer
  const MAX_TIER = 4;
  const AHEAD = 120;         // so weit vor der Spielfigur muss die Strecke schon stehen

  /** Zufallszahlen aus einem Seed (xorshift32), nur Ganzzahl-Rechnung. */
  function rng(seed) {
    // Seed erst gut durchmischen (fmix32), sonst ähneln sich kleine Seeds
    let x = (seed >>> 0) ^ 0x9e3779b9;
    x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
    x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
    x = (x ^ (x >>> 16)) >>> 0 || 1;
    const next = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x; };
    return {
      int(n) { return next() % n; },
      pick(list) { return list[next() % list.length]; },
      chance(pct) { return next() % 100 < pct; },
    };
  }

  // ---------------------------------------------------------------------
  // Musterbibliothek: jede Funktion liefert einen oder mehrere Abschnitte
  // ---------------------------------------------------------------------
  /** Bodenzeile mit 1–3 Stacheln pro Gruppe und genug Platz dazwischen. */
  function spikes(r, max) {
    let str = '......';
    const groups = 2 + r.int(3);
    for (let i = 0; i < groups; i++) {
      str += '^'.repeat(1 + r.int(max)) + '.'.repeat(9 + r.int(5));
    }
    return run(str + '....');
  }
  const P = {
    spikes1: (r) => spikes(r, 2),
    spikes2: (r) => spikes(r, 3),
    pillars: (r) => pillars(r.pick([[1, 2, 1], [1, 2, 3], [2, 1, 2], [1, 2, 1, 2]]), { gap: 5 }),
    pillarsHi: (r) => pillars(r.pick([[2, 3, 2], [1, 2, 3, 2], [2, 3, 4, 3]])),
    stairs: (r) => stairs(r.pick([[1, 2, 3], [1, 2, 3, 2], [2, 3, 2]]), { spikes: 2 + r.int(2) }),
    stairsHi: () => stairs([2, 3, 4], { spikes: 3 }),
    pad: (r) => padTower({ h: r.pick([3, 4]) }),
    orbOver: (r) => orbOver(r.pick([3, 4])),
    orbOver5: () => orbOver(5),
    orbChain: (r) => orbChain(r.pick([2, 3])),
    orbChain4: (r) => orbChain(r.pick([4, 5])),
    ball: (r) => roller('B', r.pick([
      { w: 60, low: [[14, 6]], high: [[26, 8]] },
      { w: 70, low: [[14, 6], [36, 8]], high: [[24, 8]] },
    ])),
    ballFast: () => roller('B', { w: 50, speed: '3', low: [[12, 6]], high: [[20, 8]] }),
    ufo: (r) => flyer('F', r.pick([
      { w: 64, floor: [[14, 2, 3], [26, 2, 4]], ceil: [[20, 2, 4], [32, 2, 3]] },
      { w: 76, floor: [[16, 3, 2], [36, 3, 3]], ceil: [[26, 3, 4], [46, 3, 4]] },
    ])),
    ship: (r) => flyer('S', r.pick([
      { w: 80, floor: [[16, 3, 3], [36, 3, 4]], ceil: [[26, 3, 4], [46, 3, 3]] },
      { w: 90, floor: [[16, 3, 4], [36, 3, 5], [56, 3, 4]], ceil: [[26, 3, 4], [46, 3, 4]] },
    ])),
    shipFast: () => flyer('S', { w: 70, speed: '4', floor: [[14, 2, 4], [30, 2, 5]], ceil: [[22, 2, 4], [38, 2, 4]] }),
    wave: (r) => flyer('W', r.pick([
      { w: 76, floor: [[16, 4, 3], [38, 4, 3]], ceil: [[27, 4, 3], [49, 4, 3]] },
      { w: 64, floor: [[14, 3, 3], [30, 3, 4]], ceil: [[22, 3, 4], [38, 3, 3]] },
    ])),
    waveFast: () => flyer('W', { w: 54, speed: '3', floor: [[14, 3, 4], [26, 3, 3]], ceil: [[20, 3, 3], [32, 3, 4]] }),
    swing: (r) => flyer('X', r.pick([
      { w: 70, floor: [[14, 3, 4], [34, 3, 4]], ceil: [[24, 3, 4], [44, 3, 4]] },
      { w: 90, floor: [[14, 3, 4], [30, 3, 5], [46, 3, 4]], ceil: [[22, 3, 4], [38, 3, 4], [54, 3, 4]] },
    ])),
    robot: (r) => robot(r.pick([
      { w: 70, walls: [[14, 3, 2], [21, 3, 3], [29, 3, 1], [36, 3, 3]], low: [[17, 4], [24, 5], [32, 4], [39, 6]] },
      { w: 60, walls: [[14, 3, 1], [21, 3, 2], [28, 3, 3]], low: [[17, 4], [24, 4], [31, 5]] },
    ])),
    robotFast: () => robot({ w: 54, speed: '3', walls: [[14, 3, 2], [22, 3, 3], [31, 3, 2]], low: [[17, 5], [25, 6], [34, 6]] }),
    spider: (r) => roller('P', r.pick([
      { w: 70, low: [[14, 10]], high: [[28, 10]] },
      { w: 96, low: [[14, 10], [44, 12], [72, 8]], high: [[28, 10], [60, 8]] },
    ])),
    spiderBars: () => roller('P', { w: 80, low: [[12, 12], [40, 12]], high: [[26, 10], [56, 10]], blocks: [[30, 5, 6, 1]] }),
    tele: (r) => tele({ len: r.pick([12, 16]), top: [] }),
    greens: () => greens({}),
    saws: (r) => saws(r.pick([
      { w: 40, saws: [[8, 0], [9, 0], [18, 0], [19, 0], [28, 0]] },
      { w: 52, saws: [[8, 0], [16, 0], [17, 0], [26, 0], [34, 0], [35, 0], [36, 0], [44, 3]], walls: [[30, 3, 1]] },
    ])),
    grav: () => grav({ w: 64, v: [18, 30, 31] }),
    blue: () => blue({ v: [6, 26] }),
    mini: () => [gate('K'), run('.....^.^......^^........^.^.......'),
      flyer('S', { w: 76, floor: [[12, 2, 4], [22, 2, 5], [32, 2, 3]], ceil: [[17, 2, 4], [27, 2, 3], [37, 2, 5]] }), gate('N')],
  };
  // Welche Muster es in welcher Stufe gibt (Gewicht durch Mehrfachnennung)
  const TIERS = [
    ['spikes1', 'spikes1', 'pillars', 'stairs', 'pad', 'orbOver', 'ball', 'ufo', 'ship'],
    ['spikes2', 'pillars', 'pillarsHi', 'stairs', 'orbChain', 'ball', 'ufo', 'ship', 'wave', 'robot', 'spider', 'greens', 'grav'],
    ['spikes2', 'pillarsHi', 'stairsHi', 'orbChain', 'orbOver5', 'wave', 'swing', 'robot', 'spider', 'tele', 'saws', 'ship', 'ball', 'blue', 'greens'],
    ['spikes2', 'stairsHi', 'orbChain4', 'orbOver5', 'waveFast', 'swing', 'robotFast', 'spiderBars', 'tele', 'saws', 'ballFast', 'shipFast', 'mini', 'blue'],
    ['orbChain4', 'waveFast', 'robotFast', 'spiderBars', 'saws', 'ballFast', 'shipFast', 'mini', 'swing', 'stairsHi', 'blue', 'greens'],
  ];

  /** Abschnitte eines Musters als flache Liste (manche Bausteine liefern mehrere). */
  function flat(out) {
    if (typeof out[0] === 'string') return [out];
    const list = [];
    out.forEach((x) => { if (x && x.length) list.push.apply(list, flat(x)); });
    return list;
  }

  /**
   * Generator für einen Seed. next() liefert das nächste Stück:
   * { rows: [Abschnitte], fx: [Effekt-Trigger mit absoluter Spalte] }
   */
  function create(seed) {
    const r = rng(seed);
    let x = 0, tier = -1, n = 0, last = '';
    const looks = [1, 3, 4, 2, 5, 0];
    function next() {
      const out = [], fx = [];
      if (n === 0) out.push(run('.'.repeat(24)));    // ruhiger Anlauf
      const t = Math.min(MAX_TIER, Math.floor(x / TIER_LEN));
      let at = x + (n === 0 ? 24 : 0);
      if (t !== tier) {
        // neue Stufe: Farben, Hintergrund, Einflug, Schockwelle
        tier = t;
        fx.push({ x: at + 2, y: 9, t: 'color', p: { theme: r.int(50), fade: 0.8 } });
        fx.push({ x: at + 2, y: 8, t: 'bg', p: { style: looks[(t + r.int(6)) % 6], ground: r.int(4) } });
        fx.push({ x: at + 2, y: 7, t: 'area', p: { style: 1 + r.int(5) } });
        fx.push({ x: at + 2, y: 6, t: 'particles', p: { kind: 1 + r.int(3) } });
        if (t > 0) {
          fx.push({ x: at + 2, y: 5, t: 'shock', p: { power: 3 } });
          fx.push({ x: at + 2, y: 4, t: 'flash', p: { color: r.int(6), dur: 0.5 } });
          fx.push({ x: at + 2, y: 3, t: 'pulse', p: { power: Math.min(3, t), dur: 8 } });
          if (t >= 2) fx.push({ x: at + 2, y: 2, t: 'glitch', p: { power: 2, dur: 0.4 } });
        }
      }
      // ein Muster (nicht zweimal dasselbe hintereinander)
      const pool = TIERS[t];
      let name = r.pick(pool);
      if (name === last) name = r.pick(pool);
      last = name;
      const segsOut = flat(P[name](r));
      if (n % 3 === 2) fx.push({ x: at + 1, y: 1, t: 'shock', p: { power: 1 } });
      if (t >= 2 && r.chance(20)) fx.push({ x: at + 1, y: 0, t: 'chroma', p: { power: 1, dur: 0.3 } });
      segsOut.forEach((rows) => out.push(rows));
      out.forEach((rows) => { x += Math.max.apply(null, rows.map((q) => q.length)); });
      n++;
      return { rows: out, fx };
    }
    return { next, get length() { return x; }, get tier() { return tier; } };
  }

  /** Level zum Seed starten und so weit füllen, dass bis 'until' Strecke steht. */
  function fill(gen, level, until, fxOut) {
    while (level.length < until) {
      const piece = gen.next();
      piece.rows.forEach((rows) => E.extendLevel(level, rows));
      if (fxOut) piece.fx.forEach((f) => fxOut.push(f));
    }
  }

  /**
   * Lauf nachspielen (Server): replay = { h0, t: [Schritte, vor denen die Taste wechselt] }.
   * Liefert die erreichte Distanz (ganze Kacheln) beim Tod oder nach maxSteps.
   */
  function runReplay(seed, replay, maxSteps) {
    const gen = create(seed);
    const level = E.endlessLevel({ id: 'infinity' });
    fill(gen, level, AHEAD + 40);
    const s = E.createState();
    const t = (replay && Array.isArray(replay.t)) ? replay.t : [];
    let held = !!(replay && replay.h0);
    s.prevHeld = held;
    let ti = 0;
    const limit = maxSteps || 240 * 60 * 30;   // höchstens 30 Minuten
    for (let i = 0; i < limit; i++) {
      while (ti < t.length && t[ti] === i) { held = !held; ti++; }
      if (s.x > level.length - AHEAD) fill(gen, level, s.x + AHEAD + 40);
      E.step(s, level, held, E.C.DT);
      s.events.length = 0;
      if (s.dead) return { distance: Math.floor(s.x), dead: true, steps: i + 1 };
    }
    return { distance: Math.floor(s.x), dead: false, steps: limit };
  }

  const Infinite = { create, fill, runReplay, rng, AHEAD, TIER_LEN, PATTERNS: P, TIERS };
  if (isNode) module.exports = Infinite;
  else root.NeonInfinite = Infinite;
})(this);
