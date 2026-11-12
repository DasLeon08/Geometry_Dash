/*
 * Neon Hop – Spiel-Physik.
 * Reine Logik ohne Browser-Abhängigkeiten, damit sie auch in Node
 * (tools/verify-levels.js) laufen kann. Alle Einheiten sind in Kacheln.
 */
(function (root) {
  'use strict';

  const C = {
    SPEED: 10.4,        // Kacheln pro Sekunde
    GRAVITY: 86.9,      // Kacheln / s²
    JUMP_V: 19.6,       // Sprunggeschwindigkeit (≈ 2.2 Kacheln hoch)
    PAD_V: 28.0,        // Sprungfeld (≈ 4.5 Kacheln hoch)
    ORB_V: 18.4,        // gelber Ring
    BLUE_ORB_V: 8,      // blauer Ring (Schwerkraft-Wechsel)
    SHIP_UP: 50,        // Rakete: Beschleunigung beim Halten
    SHIP_DOWN: 40,      // Rakete: Beschleunigung beim Loslassen
    SHIP_MAX: 9,        // Rakete: max. vertikale Geschwindigkeit
    MAX_FALL: 26,
    ROOF: 10,           // Decke der Welt (Kacheln über dem Boden)
    DT: 1 / 240,        // fester Simulationsschritt
    BUFFER: 0.1,        // Klick-Puffer für Ringe (Sekunden)
    SNAP: 0.4,          // wie weit man auf eine Kante "hochrutschen" darf
    INNER: 0.3,         // Rand der inneren Hitbox (Kollision mit Blöcken)
    HAZ: 0.12,          // Rand der Hitbox gegen Stacheln
    PINK: 0.72,         // rosa Sprungfeld / Ring: kleinerer Sprung
    MINI_SIZE: 0.5,     // Mini-Würfel: halbe Grösse
    MINI_JUMP: 0.82,    // Mini-Würfel springt etwas weniger hoch
  };
  // Tempo-Portale: langsam, normal, schnell, sehr schnell
  const SPEEDS = { speed1: 0.8, speed2: 1, speed3: 1.3, speed4: 1.6 };

  const CHAR_TYPES = {
    '#': 'block',
    '^': 'spike',
    'v': 'spikeDown',
    'm': 'mini',
    '_': 'pad',
    'o': 'orb',
    'b': 'gorb',
    'c': 'coin',
    'S': 'ship',
    'C': 'cube',
    'U': 'gravUp',
    'D': 'gravDown',
    'p': 'padPink',
    'r': 'orbPink',
    '1': 'speed1',
    '2': 'speed2',
    '3': 'speed3',
    '4': 'speed4',
    'K': 'miniPortal',
    'N': 'bigPortal',
  };

  const HAZARDS = { spike: 1, spikeDown: 1, mini: 1 };
  const PORTALS = { ship: 1, cube: 1, gravUp: 1, gravDown: 1, speed1: 1, speed2: 1, speed3: 1, speed4: 1, miniPortal: 1, bigPortal: 1 };

  function hitbox(type, x, y) {
    switch (type) {
      case 'block': return [x, y, x + 1, y + 1];
      case 'spike': return [x + 0.3, y, x + 0.7, y + 0.55];
      case 'spikeDown': return [x + 0.3, y + 0.45, x + 0.7, y + 1];
      case 'mini': return [x + 0.3, y, x + 0.7, y + 0.3];
      case 'pad':
      case 'padPink': return [x + 0.05, y, x + 0.95, y + 0.3];
      case 'orb':
      case 'orbPink':
      case 'gorb': return [x - 0.1, y - 0.1, x + 1.1, y + 1.1];
      case 'coin': return [x + 0.1, y + 0.1, x + 0.9, y + 0.9];
      default: return [x + 0.1, y - 1, x + 0.9, y + 2]; // Portale: 3 Kacheln hoch
    }
  }

  /**
   * Level-Definition -> Spielobjekte.
   * def.map ist eine Liste von Abschnitten; jeder Abschnitt ist eine Liste
   * von Zeilen (oben -> unten, letzte Zeile = Boden). Abschnitte werden
   * horizontal aneinandergehängt.
   */
  function parseLevel(def) {
    const objects = [];
    let offset = 0;
    def.map.forEach((rows, segIndex) => {
      if (rows.length > C.ROOF) {
        throw new Error(def.id + ': Abschnitt ' + segIndex + ' hat mehr als ' + C.ROOF + ' Zeilen');
      }
      const width = Math.max.apply(null, rows.map((r) => r.length));
      rows.forEach((row, i) => {
        const y = rows.length - 1 - i;
        for (let j = 0; j < row.length; j++) {
          const ch = row[j];
          if (ch === '.' || ch === ' ') continue;
          const type = CHAR_TYPES[ch];
          if (!type) throw new Error(def.id + ': unbekanntes Zeichen "' + ch + '" in Abschnitt ' + segIndex);
          const x = offset + j;
          objects.push({ type, x, y, hb: hitbox(type, x, y) });
        }
      });
      offset += width;
    });

    objects.sort((a, b) => a.x - b.x || a.y - b.y);
    objects.forEach((o, i) => { o.id = i; });

    // Nachbarn von Blöcken merken (für schönere Umrisse beim Zeichnen)
    const blockAt = new Set(objects.filter((o) => o.type === 'block').map((o) => o.x + ',' + o.y));
    objects.forEach((o) => {
      if (o.type !== 'block') return;
      o.n = {
        up: blockAt.has(o.x + ',' + (o.y + 1)),
        down: blockAt.has(o.x + ',' + (o.y - 1)),
        left: blockAt.has((o.x - 1) + ',' + o.y),
        right: blockAt.has((o.x + 1) + ',' + o.y),
      };
    });

    const length = offset;
    const cols = [];
    for (let i = 0; i <= length + 4; i++) cols.push([]);
    objects.forEach((o) => {
      const a = Math.max(0, Math.floor(o.hb[0]));
      const b = Math.min(cols.length - 1, Math.floor(o.hb[2]));
      for (let c = a; c <= b; c++) cols[c].push(o);
    });

    return {
      def,
      objects,
      cols,
      length,
      coinCount: objects.filter((o) => o.type === 'coin').length,
    };
  }

  function createState() {
    return {
      x: 0, y: 0, vy: 0,
      gs: 1,              // 1 = normale Schwerkraft, -1 = umgekehrt
      mode: 'cube',       // 'cube' | 'ship'
      size: 1,            // 1 = normal, 0.5 = Mini
      speed: 1,           // Tempo-Faktor (Tempo-Portale)
      onGround: true,
      prevHeld: false,
      buffer: 0,
      dead: false,
      won: false,
      time: 0,
      used: new Set(),    // benutzte Ringe / Sprungfelder
      coins: new Set(),
      events: [],
    };
  }

  function cloneState(s) {
    const c = Object.assign({}, s);
    c.used = new Set(s.used);
    c.coins = new Set(s.coins);
    c.events = [];
    return c;
  }

  function overlap(ax0, ay0, ax1, ay1, b) {
    const e = 1e-6;
    return ax0 < b[2] - e && ax1 > b[0] + e && ay0 < b[3] - e && ay1 > b[1] + e;
  }

  /** Einen festen Zeitschritt simulieren. held = Taste/Finger gedrückt. */
  function step(s, level, held, dt) {
    if (s.dead || s.won) return s;
    const pressed = held && !s.prevHeld;
    s.prevHeld = held;
    s.buffer = pressed ? C.BUFFER : Math.max(0, s.buffer - dt);
    s.time += dt;

    const y0 = s.y;
    const z = s.size;
    s.x += C.SPEED * s.speed * dt;

    if (s.mode === 'cube') {
      if (s.onGround && (held || s.buffer > 0)) {
        s.vy = s.gs * (z < 1 ? C.JUMP_V * C.MINI_JUMP : C.JUMP_V);
        s.onGround = false;
        s.buffer = 0;
        s.events.push('jump');
      }
      s.vy -= s.gs * C.GRAVITY * dt;
      if (s.vy * s.gs < -C.MAX_FALL) s.vy = -s.gs * C.MAX_FALL;
    } else {
      const acc = held ? C.SHIP_UP : -C.SHIP_DOWN;
      s.vy += s.gs * acc * dt;
      if (s.vy > C.SHIP_MAX) s.vy = C.SHIP_MAX;
      if (s.vy < -C.SHIP_MAX) s.vy = -C.SHIP_MAX;
    }
    s.y += s.vy * dt;
    s.onGround = false;

    const ship = s.mode === 'ship';
    const c0 = Math.max(0, Math.floor(s.x) - 1);
    const c1 = Math.min(level.cols.length - 1, Math.floor(s.x) + 2);
    const seen = [];

    // Blöcke
    for (let c = c0; c <= c1; c++) {
      const col = level.cols[c];
      for (let k = 0; k < col.length; k++) {
        const o = col[k];
        if (o.type !== 'block' || seen.indexOf(o) !== -1) continue;
        seen.push(o);
        const b = o.hb;
        if (!overlap(s.x, s.y, s.x + z, s.y + z, b)) continue;
        const top = b[3];
        const bottom = b[1];
        if ((s.gs === 1 || ship) && s.vy <= 0 && y0 >= top - C.SNAP) {
          s.y = top;
          s.vy = 0;
          if (s.gs === 1) s.onGround = true;
        } else if ((s.gs === -1 || ship) && s.vy >= 0 && y0 + z <= bottom + C.SNAP) {
          s.y = bottom - z;
          s.vy = 0;
          if (s.gs === -1) s.onGround = true;
        } else if (overlap(s.x + C.INNER * z, s.y + C.INNER * z, s.x + z - C.INNER * z, s.y + z - C.INNER * z, b)) {
          s.dead = true;
          s.events.push('die');
          return s;
        }
      }
    }

    // Boden und Decke
    if (s.y < 0) {
      s.y = 0;
      if (s.vy < 0) s.vy = 0;
      if (s.gs === 1) s.onGround = true;
    }
    if (s.y > C.ROOF - z) {
      s.y = C.ROOF - z;
      if (s.vy > 0) s.vy = 0;
      if (s.gs === -1) s.onGround = true;
    }

    // Alles andere
    const hx0 = s.x + C.HAZ * z, hy0 = s.y + C.HAZ * z, hx1 = s.x + z - C.HAZ * z, hy1 = s.y + z - C.HAZ * z;
    for (let c = c0; c <= c1; c++) {
      const col = level.cols[c];
      for (let k = 0; k < col.length; k++) {
        const o = col[k];
        const t = o.type;
        if (t === 'block') continue;
        if (HAZARDS[t]) {
          if (overlap(hx0, hy0, hx1, hy1, o.hb)) {
            s.dead = true;
            s.events.push('die');
            return s;
          }
          continue;
        }
        if (!overlap(s.x, s.y, s.x + z, s.y + z, o.hb)) continue;
        if (t === 'coin') {
          if (!s.coins.has(o.id)) { s.coins.add(o.id); s.events.push('coin'); }
        } else if (t === 'pad' || t === 'padPink') {
          if (!s.used.has(o.id)) {
            s.used.add(o.id);
            s.vy = s.gs * C.PAD_V * (ship ? 0.5 : 1) * (t === 'padPink' ? C.PINK : 1);
            s.onGround = false;
            s.events.push('pad');
          }
        } else if (t === 'orb' || t === 'orbPink' || t === 'gorb') {
          if (!s.used.has(o.id) && s.buffer > 0) {
            s.used.add(o.id);
            s.buffer = 0;
            s.onGround = false;
            if (t === 'orb' || t === 'orbPink') {
              s.vy = s.gs * C.ORB_V * (ship ? 0.6 : 1) * (t === 'orbPink' ? C.PINK : 1);
            } else {
              s.gs = -s.gs;
              s.vy = -s.gs * C.BLUE_ORB_V;
            }
            s.events.push('orb');
          }
        } else if (PORTALS[t]) {
          if (t === 'ship' && s.mode !== 'ship') {
            s.mode = 'ship'; s.vy *= 0.4; s.events.push('portal');
          } else if (t === 'cube' && s.mode !== 'cube') {
            s.mode = 'cube'; s.events.push('portal');
          } else if (t === 'gravUp' && s.gs === 1) {
            s.gs = -1; s.vy *= 0.5; s.onGround = false; s.events.push('portal');
          } else if (t === 'gravDown' && s.gs === -1) {
            s.gs = 1; s.vy *= 0.5; s.onGround = false; s.events.push('portal');
          } else if (SPEEDS[t] && s.speed !== SPEEDS[t]) {
            s.speed = SPEEDS[t]; s.events.push('portal');
          } else if (t === 'miniPortal' && s.size === 1) {
            s.size = C.MINI_SIZE;
            if (s.gs === -1) s.y += 1 - C.MINI_SIZE;   // an der Decke: oben bündig bleiben
            s.events.push('portal');
          } else if (t === 'bigPortal' && s.size !== 1) {
            if (s.gs === -1) s.y -= 1 - s.size;
            s.size = 1;
            s.events.push('portal');
          }
        }
      }
    }

    if (s.x >= level.length) {
      s.won = true;
      s.events.push('win');
    }
    return s;
  }

  /**
   * Einen aufgezeichneten Lauf nachspielen (Beweis, dass ein Level geschafft wurde).
   * replay = { h0: Taste am Anfang gedrückt?, t: [Schritte, vor denen die Taste wechselt] }
   * Weil die Physik ohne Zufall mit festem Zeitschritt rechnet, ergibt dieselbe
   * Eingabe überall exakt denselben Lauf.
   */
  function runReplay(def, replay, maxSteps) {
    const level = parseLevel(def);
    const s = createState();
    const t = (replay && Array.isArray(replay.t)) ? replay.t : [];
    let held = !!(replay && replay.h0);
    s.prevHeld = held;
    let ti = 0;
    const limit = maxSteps || Math.ceil((level.length / (C.SPEED * SPEEDS.speed1) + 5) / C.DT);
    for (let i = 0; i < limit; i++) {
      while (ti < t.length && t[ti] === i) { held = !held; ti++; }
      step(s, level, held, C.DT);
      s.events.length = 0;
      if (s.won) return { won: true, steps: i + 1, coins: s.coins.size };
      if (s.dead) return { won: false, dead: true, steps: i + 1, x: s.x };
    }
    return { won: false, steps: limit, x: s.x };
  }

  /**
   * Effekt-Trigger (nur Optik, keine Physik). Werden beim Laden und auf dem Server
   * mit denselben Regeln geprüft: unbekannte Arten fliegen raus, Werte werden begrenzt.
   *   color: Farben eines eingebauten Levels (theme) mit Übergang (fade, s)
   *   shake: Wackeln (power 1–3, dur s)   flash: Blitz (color 0–5, dur s)
   *   pulse: Puls im Takt (power 1–3, dur s)   zoom: Heranzoomen (zoom 1–1.3, dur s)
   */
  const FX = {
    color: { theme: [0, 14, 0, true], fade: [0, 3, 1] },
    shake: { power: [1, 3, 2, true], dur: [0.1, 2, 0.6] },
    flash: { color: [0, 5, 0, true], dur: [0.1, 1.5, 0.5] },
    pulse: { power: [1, 3, 2, true], dur: [0.5, 10, 4] },
    zoom: { zoom: [1, 1.3, 1.15], dur: [0.1, 3, 1] },
  };
  const MAX_EXTRAS = 200;
  function fxDefaults(t) {
    const out = {};
    Object.keys(FX[t]).forEach((k) => { out[k] = FX[t][k][2]; });
    return out;
  }
  function cleanExtras(list, maxX) {
    if (!Array.isArray(list)) return [];
    const out = [];
    const seen = new Set();
    for (const e of list.slice(0, MAX_EXTRAS)) {
      if (!e || typeof e !== 'object' || !FX[e.t]) continue;
      const x = Math.floor(Number(e.x)), y = Math.floor(Number(e.y));
      if (!isFinite(x) || !isFinite(y) || x < 0 || x > (maxX || 1012) || y < 0 || y > 9) continue;
      if (seen.has(x + ',' + y)) continue;
      seen.add(x + ',' + y);
      const p = {};
      const src = e.p && typeof e.p === 'object' ? e.p : {};
      Object.keys(FX[e.t]).forEach((k) => {
        const [lo, hi, def, int] = FX[e.t][k];
        let v = Number(src[k]);
        if (!isFinite(v)) v = def;
        v = Math.max(lo, Math.min(hi, v));
        p[k] = int ? Math.round(v) : Math.round(v * 100) / 100;
      });
      out.push({ x, y, t: e.t, p });
    }
    return out.sort((a, b) => a.x - b.x || a.y - b.y);
  }

  const Engine = { C, parseLevel, createState, cloneState, step, runReplay, CHAR_TYPES, SPEEDS, FX, fxDefaults, cleanExtras, MAX_EXTRAS };
  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
  else root.Engine = Engine;
})(this);
