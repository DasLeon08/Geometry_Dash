/*
 * Neon Hop – Musik und Soundeffekte.
 * Alles wird live mit der Web-Audio-API erzeugt (keine Audiodateien nötig).
 *
 * Jeder Song folgt einem festen Aufbau (Intro → Drop → Break → Drop 2 → …).
 * Die Level-Daten bestimmen Tempo, Tonart, Akkordfolge und Melodie-Kontur,
 * die Schwierigkeit des Levels die Energie (Dichte von Hi-Hats und Bass).
 */
(function (root) {
  'use strict';

  let ctx = null;
  let master = null;     // Gesamtlautstärke (stumm schalten)
  let musicBus = null;   // alle Musik
  let duck = null;       // Bass, Flächen, Melodie – "pumpt" mit der Bassdrum
  let reverb = null;     // Hall
  let echo = null;       // Echo-Eingang (links punktierte Achtel, rechts Viertel)
  let echoL = null, echoR = null;
  let sfxBus = null;
  let noiseBuf = null;
  let muted = false;
  let song = null;
  let timer = null;

  const MUSIC_LEVEL = 0.5;
  const MENU_SONG = {
    bpm: 104, root: 48, scale: [0, 2, 4, 7, 9], prog: [0, 5, 3, 4], lead: [4, 2, 0, 2, 5, 4, 2, 1], menu: true,
  };
  const RHYTHMS = [
    [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0],
    [1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0],
    [1, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0],
    [1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
  ];

  function midiToHz(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  function makeImpulse(seconds, decay) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  function ensure() {
    if (ctx) return true;
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.85;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12; comp.knee.value = 10; comp.ratio.value = 4;
    comp.attack.value = 0.003; comp.release.value = 0.2;
    master.connect(comp);
    comp.connect(ctx.destination);

    musicBus = ctx.createGain();
    musicBus.gain.value = MUSIC_LEVEL;
    musicBus.connect(master);
    duck = ctx.createGain();
    duck.connect(musicBus);

    reverb = ctx.createConvolver();
    reverb.buffer = makeImpulse(2.4, 3);
    const rv = ctx.createGain();
    rv.gain.value = 0.32;
    reverb.connect(rv); rv.connect(musicBus);

    // Stereo-Echo: zwei Verzögerungen, eine links, eine rechts
    echo = ctx.createGain();
    [[-0.7, 'L'], [0.7, 'R']].forEach(([pan, side]) => {
      const d = ctx.createDelay(2);
      d.delayTime.value = 0.3;
      const fb = ctx.createGain(); fb.gain.value = 0.3;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
      const out = ctx.createGain(); out.gain.value = 0.4;
      echo.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d);
      lp.connect(out);
      route(panned(out, pan), [duck]);
      if (side === 'L') echoL = d; else echoR = d;
    });

    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.9;
    sfxBus.connect(master);

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }

  function unlock() {
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume();
  }

  // ---- Bausteine für Klänge --------------------------------------------
  /** Hüllkurve: Anstieg a, Halten h, Ausklingen r. */
  function env(t, a, peak, h, r) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.setValueAtTime(Math.max(0.0002, peak), t + a + h);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + h + r);
    return g;
  }
  /** Ausgang verbinden: outs = [Knoten | [Knoten, Anteil], …] */
  function route(node, outs) {
    outs.forEach((o) => {
      if (Array.isArray(o)) {
        const s = ctx.createGain(); s.gain.value = o[1];
        node.connect(s); s.connect(o[0]);
      } else node.connect(o);
    });
  }
  function panned(node, pan) {
    if (!pan || !ctx.createStereoPanner) return node;
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    node.connect(p);
    return p;
  }
  function osc(type, freq, t, detune) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (detune) o.detune.setValueAtTime(detune, t);
    return o;
  }
  function noise(t, dur, peak, type, freq, outs, q) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq;
    if (q) f.Q.value = q;
    const g = env(t, 0.002, peak, 0, dur);
    s.connect(f); f.connect(g);
    route(g, outs);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
    return g;
  }

  // ---- Instrumente ------------------------------------------------------
  function kick(t, vol) {
    const o = osc('sine', 165, t);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.11);
    const g = env(t, 0.002, vol, 0.03, 0.34);
    o.connect(g); g.connect(musicBus);
    o.start(t); o.stop(t + 0.5);
    noise(t, 0.012, vol * 0.25, 'highpass', 2500, [musicBus]);
    // Pump-Effekt: Bass/Flächen kurz leiser
    duck.gain.setValueAtTime(0.3, t);
    duck.gain.linearRampToValueAtTime(1, t + song.stepDur * 2.4);
  }
  function snare(t, vol) {
    noise(t, 0.17, vol, 'bandpass', 1900, [musicBus, [reverb, 0.3]], 0.8);
    const o = osc('triangle', 200, t);
    o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
    const g = env(t, 0.002, vol * 0.6, 0, 0.09);
    o.connect(g); g.connect(musicBus);
    o.start(t); o.stop(t + 0.2);
  }
  function hat(t, vol, open, pan) {
    const g = noise(t, open ? 0.22 : 0.035, vol, 'highpass', open ? 7000 : 8500, []);
    route(panned(g, pan), [musicBus]);
  }
  function crash(t, vol) { noise(t, 1.5, vol, 'highpass', 4200, [musicBus, [reverb, 0.6]]); }
  function riser(t, dur, vol) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.Q.value = 2;
    f.frequency.setValueAtTime(350, t);
    f.frequency.exponentialRampToValueAtTime(7000, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.02);
    s.connect(f); f.connect(g); route(g, [musicBus, [reverb, 0.4]]);
    s.start(t); s.stop(t + dur + 0.05);
  }
  function tom(t, vol, f0) {
    const o = osc('sine', f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.5, t + 0.2);
    const g = env(t, 0.002, vol, 0, 0.22);
    o.connect(g); route(g, [musicBus, [reverb, 0.2]]);
    o.start(t); o.stop(t + 0.3);
  }
  function bass(t, midi, dur, vol, bright) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.Q.value = 5;
    f.frequency.setValueAtTime(bright * 3, t);
    f.frequency.exponentialRampToValueAtTime(bright, t + Math.min(dur, 0.25));
    const g = env(t, 0.004, vol * 0.88, dur * 0.6, 0.08);
    [-8, 8].forEach((dt) => { const o = osc('sawtooth', midiToHz(midi), t, dt); o.connect(f); o.start(t); o.stop(t + dur + 0.15); });
    f.connect(g);
    const sub = osc('sine', midiToHz(midi - 12), t);
    const sg = env(t, 0.004, vol * 0.75, dur * 0.6, 0.08);
    sub.connect(sg); sg.connect(duck);
    sub.start(t); sub.stop(t + dur + 0.15);
    g.connect(duck);
  }
  function pad(t, midis, dur, vol) {
    midis.forEach((m, i) => {
      [-11, 11].forEach((dt) => {
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = 1100 + i * 150; f.Q.value = 0.7;
        const g = env(t, 0.35, vol, Math.max(0.05, dur - 0.5), 0.7);
        const o = osc('sawtooth', midiToHz(m), t, dt);
        o.connect(f); f.connect(g);
        o.start(t); o.stop(t + dur + 0.9);
        route(panned(g, dt < 0 ? -0.75 : 0.75), [duck, [reverb, 0.6]]);
      });
    });
  }
  function lead(t, midi, dur, vol) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.Q.value = 3;
    f.frequency.setValueAtTime(4200, t);
    f.frequency.exponentialRampToValueAtTime(1500, t + dur + 0.1);
    const g = env(t, 0.006, vol, dur * 0.7, 0.14);
    const a = osc('square', midiToHz(midi), t);
    const b = osc('sawtooth', midiToHz(midi), t, 7);
    // leichtes Vibrato
    const lfo = osc('sine', 5.5, t);
    const lg = ctx.createGain(); lg.gain.value = 6;
    lfo.connect(lg); lg.connect(a.detune); lg.connect(b.detune);
    [a, b, lfo].forEach((o) => { o.start(t); o.stop(t + dur + 0.3); });
    a.connect(f); b.connect(f); f.connect(g);
    route(g, [duck, [echo, 0.35], [reverb, 0.25]]);
  }
  function pluck(t, midi, vol, pan) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.setValueAtTime(5000, t); f.frequency.exponentialRampToValueAtTime(900, t + 0.15);
    const g = env(t, 0.002, vol, 0, 0.16);
    const o = osc('square', midiToHz(midi), t);
    o.connect(f); f.connect(g);
    o.start(t); o.stop(t + 0.25);
    route(panned(g, pan), [duck, [echo, 0.3]]);
  }

  // ---- Harmonie ---------------------------------------------------------
  /** Passende 7-Ton-Leiter zur Leiter des Levels (für saubere Akkorde). */
  function heptatonic(scale) {
    if (scale.length >= 7) return scale.slice(0, 7);
    if (scale.indexOf(4) !== -1) return [0, 2, 4, 5, 7, 9, 11];        // Dur
    if (scale.indexOf(1) !== -1) return [0, 1, 3, 5, 7, 8, 10];        // Phrygisch
    if (scale.indexOf(3) !== -1 && scale.indexOf(9) !== -1) return [0, 2, 3, 5, 7, 9, 10]; // Dorisch
    return [0, 2, 3, 5, 7, 8, 10];                                     // Moll
  }
  function semis(hept, deg) {
    const o = Math.floor(deg / 7);
    return hept[((deg % 7) + 7) % 7] + 12 * o;
  }
  /** Nächster Akkordton (Grundton, Terz, Quinte, Oktave) zu einer Stufe. */
  function snapToChord(chord, deg) {
    let best = chord, bd = 99;
    [0, 2, 4, 7].forEach((k) => { const d = Math.abs(chord + k - deg); if (d < bd) { bd = d; best = chord + k; } });
    return best;
  }

  function sectionAt(bar, menu) {
    if (menu) return { name: 'menu', i: bar % 8, len: 8 };
    if (bar < 4) return { name: 'intro', i: bar, len: 4 };
    const b = (bar - 4) % 20;
    if (b < 8) return { name: 'drop', i: b, len: 8 };
    if (b < 12) return { name: 'break', i: b - 8, len: 4 };
    return { name: 'drop2', i: b - 12, len: 8 };
  }

  // ---- Sequenzer ---------------------------------------------------------
  function scheduleStep(sg, step, t) {
    const def = sg.def, E = sg.energy, H = sg.hept;
    const s = step % 16;
    const bar = Math.floor(step / 16);
    const sec = sectionAt(bar, def.menu);
    const chord = def.prog[bar % def.prog.length];
    const rootMidi = def.root + semis(H, chord);
    const lastBar = sec.i === sec.len - 1;
    const isDrop = sec.name === 'drop' || sec.name === 'drop2';

    // --- Schlagzeug
    if (isDrop) {
      if (s % 4 === 0) kick(t, 0.95);
      if (s === 4 || s === 12) snare(t, 0.42);
      if (E >= 2 || sec.name === 'drop2') { if (s % 2 === 1 || E >= 3) hat(t, s % 2 ? 0.1 : 0.05, false, s % 4 === 1 ? 0.45 : -0.45); }
      else if (s % 2 === 0) hat(t, 0.08, false, s % 4 === 0 ? -0.35 : 0.35);
      if (s % 4 === 2) hat(t, 0.08, true, 0.3);
      if (sec.i === 0 && s === 0) crash(t, 0.22);
      if (lastBar && s >= 14) snare(t, 0.3);
      if (E >= 3 && lastBar && s >= 8 && s % 2 === 0) tom(t, 0.4, 220 - (s - 8) * 15);
    } else if (sec.name === 'intro') {
      if (s === 0 || (bar >= 2 && s % 4 === 0)) kick(t, 0.75);
      if (s % 2 === 0) hat(t, 0.05, false, s % 4 === 0 ? -0.35 : 0.35);
      if (bar >= 2 && s === 12) snare(t, 0.3);
      if (lastBar && s === 0) riser(t, sg.stepDur * 16, 0.18);
      if (lastBar && s >= 12) snare(t, 0.18 + (s - 12) * 0.06);
    } else if (sec.name === 'break') {
      if (sec.i >= 2 && s % 4 === 0) kick(t, 0.4);
      if (s % 4 === 2) hat(t, 0.04, false, 0.2);
      if (sec.i === sec.len - 2 && s === 0) riser(t, sg.stepDur * 32, 0.2);
      if (lastBar && s >= 8 && (s % 2 === 0 || s >= 12)) snare(t, 0.12 + (s - 8) * 0.04);
    } else { // Menü: ruhig
      if (s === 0 || s === 10) kick(t, 0.45);
      if (s === 8 && sec.i % 2 === 1) snare(t, 0.12);
      if (s % 4 === 2) hat(t, 0.035, s === 14, 0.2);
    }

    // --- Bass
    if (isDrop) {
      if (E <= 1) { if (s % 4 === 2) bass(t, rootMidi, sg.stepDur * 1.8, 0.26, 600); }
      else if (E === 2) { if ([0, 3, 6, 8, 11, 14].indexOf(s) !== -1) bass(t, rootMidi + (s === 6 || s === 14 ? 12 : 0), sg.stepDur * 1.8, 0.26, 700); }
      else if (s % 4 !== 0) bass(t, rootMidi + (s % 8 === 6 ? 12 : 0), sg.stepDur * 0.9, 0.24, 800);
    } else if (s === 0) {
      bass(t, rootMidi, sg.stepDur * (sec.name === 'menu' ? 7 : 15), sec.name === 'menu' ? 0.16 : 0.2, 260);
    } else if (sec.name === 'menu' && s === 8) {
      bass(t, rootMidi + 7, sg.stepDur * 6, 0.14, 260);
    }

    // --- Flächen (Akkord pro Takt)
    if (s === 0) {
      const tones = (sec.name === 'menu' || sec.name === 'break') ? [0, 2, 4, 6] : [0, 2, 4];
      const midis = tones.map((k) => def.root + 12 + semis(H, chord + k));
      const vol = sec.name === 'drop' ? 0.022 : 0.035;
      pad(t, midis, sg.stepDur * 16, vol);
    }

    // --- Melodie
    const leadOn = isDrop || (sec.name === 'menu' && sec.i >= 4);
    if (leadOn) {
      const pattern = RHYTHMS[sg.rhythm];
      if (pattern[s]) {
        let len = 1;
        while (s + len < 16 && !pattern[s + len] && len < 4) len++;
        if (lastBar && s >= 12) len = 16 - s;
        sg.noteCount++;
        const half = bar % 2;
        const v = def.lead[(sg.noteCount + half * 3) % def.lead.length];
        let deg = chord + v;
        if (s % 8 === 0) deg = snapToChord(chord, deg);
        const oct = sec.name === 'drop2' ? 36 : 24;
        const vol = sec.name === 'menu' ? 0.05 : 0.075;
        lead(t, def.root + oct + semis(H, deg), sg.stepDur * len * 0.9, vol);
      }
    } else if (s === 0) {
      sg.noteCount = 0;
    }

    // --- Arpeggio
    const arpOn = sec.name === 'drop2' || sec.name === 'break' || (sec.name === 'menu' && sec.i >= 2) ||
      (sec.name === 'drop' && E >= 3);
    const arpEvery = sec.name === 'menu' ? 2 : 1;
    if (arpOn && s % arpEvery === 0) {
      const seq = [0, 2, 4, 7, 9, 7, 4, 2];
      const k = seq[(s / arpEvery) % seq.length];
      const m = def.root + 24 + semis(H, chord + k);
      pluck(t, m, sec.name === 'menu' ? 0.035 : 0.04, (s / arpEvery) % 2 ? 0.7 : -0.7);
    }
  }

  function tick() {
    if (!song || !ctx) return;
    const now = ctx.currentTime;
    // Nach einer Pause im Hintergrund nicht alle verpassten Töne auf einmal spielen
    while (song.nextTime < now - 0.05) { song.step++; song.nextTime += song.stepDur; }
    const ahead = now + 0.15;
    while (song.nextTime < ahead) {
      scheduleStep(song, song.step, song.nextTime);
      song.step++;
      song.nextTime += song.stepDur;
    }
  }

  /** Song starten. def = Musik-Daten des Levels, energy = Schwierigkeit 1–4. */
  function playMusic(def, energy) {
    stopMusic();
    if (!ensure()) return;
    unlock();
    const stepDur = 60 / def.bpm / 4;
    const start = ctx.currentTime + 0.06;
    song = {
      def, energy: energy || 1, step: 0, stepDur, nextTime: start, startTime: start,
      hept: heptatonic(def.scale), rhythm: (def.root + def.bpm) % RHYTHMS.length, noteCount: 0,
    };
    echoL.delayTime.setValueAtTime(stepDur * 3, ctx.currentTime);   // punktierte Achtel
    echoR.delayTime.setValueAtTime(stepDur * 4, ctx.currentTime);   // Viertel
    musicBus.gain.cancelScheduledValues(ctx.currentTime);
    musicBus.gain.setValueAtTime(MUSIC_LEVEL * (def.menu ? 1.5 : 1), ctx.currentTime);
    duck.gain.cancelScheduledValues(ctx.currentTime);
    duck.gain.setValueAtTime(1, ctx.currentTime);
    tick();
    timer = setInterval(tick, 25);
  }

  function playMenuMusic() {
    if (song && song.def === MENU_SONG) return;
    playMusic(MENU_SONG, 0);
  }

  function stopMusic(fade) {
    if (timer) clearInterval(timer);
    timer = null;
    if (ctx && musicBus) {
      const now = ctx.currentTime;
      musicBus.gain.cancelScheduledValues(now);
      musicBus.gain.setValueAtTime(musicBus.gain.value, now);
      musicBus.gain.setTargetAtTime(0.0001, now, fade ? 0.15 : 0.02);
    }
    song = null;
  }

  /** Alles anhalten (Pause) und später genau an derselben Stelle weiterspielen. */
  function pauseAll() { if (ctx && ctx.state === 'running') ctx.suspend(); }
  function resumeAll() { if (ctx && ctx.state === 'suspended') ctx.resume(); }

  /** 0..1 – wie weit wir im aktuellen Schlag sind (für pulsierende Grafik). */
  function beat() {
    if (!song || !ctx) return (performance.now() / 1000 * 2) % 1;
    const beatDur = song.stepDur * 4;
    const t = ctx.currentTime - song.startTime;
    return t < 0 ? 0 : (t % beatDur) / beatDur;
  }

  // ---- Effekte ---------------------------------------------------------
  function blip(type, f0, f1, t, dur, vol) {
    const o = osc(type, f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = env(t, 0.004, vol, 0, dur);
    o.connect(g); g.connect(sfxBus);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function sfx(name) {
    if (!ctx || muted || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    switch (name) {
      case 'die':
        noise(t, 0.5, 0.55, 'lowpass', 1800, [sfxBus]);
        blip('sawtooth', 260, 40, t, 0.45, 0.22);
        break;
      case 'orb':
        blip('sine', 700, 1400, t, 0.14, 0.22);
        blip('triangle', 1050, 2100, t + 0.02, 0.12, 0.08);
        break;
      case 'pad':
        blip('triangle', 280, 1000, t, 0.22, 0.3);
        break;
      case 'portal':
        blip('sine', 420, 1700, t, 0.35, 0.18);
        blip('sine', 630, 2400, t + 0.05, 0.3, 0.1);
        break;
      case 'coin':
        blip('square', 988, 0, t, 0.08, 0.1);
        blip('square', 1319, 0, t + 0.08, 0.3, 0.1);
        break;
      case 'checkpoint':
        blip('sine', 880, 0, t, 0.1, 0.14);
        blip('sine', 1320, 0, t + 0.07, 0.14, 0.1);
        break;
      case 'win':
        [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => blip('square', midiToHz(72 + n), 0, t + i * 0.08, 0.35, 0.07));
        noise(t + 0.56, 1.2, 0.18, 'highpass', 5000, [sfxBus]);
        break;
      case 'click':
        blip('sine', 560, 0, t, 0.05, 0.12);
        break;
      default:
    }
  }

  function setMuted(m) {
    muted = !!m;
    if (master) master.gain.setTargetAtTime(muted ? 0 : 0.85, ctx.currentTime, 0.02);
  }

  root.GameAudio = {
    unlock, playMusic, playMenuMusic, stopMusic, pauseAll, resumeAll, beat, sfx, setMuted,
    isMuted: () => muted,
    isPlaying: () => !!song,
  };
})(this);
