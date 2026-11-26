/*
 * Neon Hop – Bausteine für Level-Abschnitte.
 * Wird von js/levels.js (eingebaute Level) und js/infinite.js (Infinity-Modus) benutzt
 * und läuft auch in Node (tools/verify-levels.js, Server).
 * Ein Abschnitt ist eine Liste von 10 Textzeilen (oben -> unten), Zeichen wie in js/levels.js.
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

  const START = run('..................');
  const END = run('................................');

  const Kit = {
    seg, finish, run, pillars, stairs, padTower, orbOver, orbChain, plats, ship, grav, blue,
    flyer, roller, robot, tele, greens, saws, gate, segs, fx, takeFx, START, END,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Kit;
  else root.NeonKit = Kit;
})(this);
