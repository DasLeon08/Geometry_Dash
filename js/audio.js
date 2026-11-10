/*
 * Neon Hop – Musik und Soundeffekte.
 * Alles wird live mit der Web-Audio-API erzeugt (keine Audiodateien nötig).
 */
(function (root) {
  'use strict';

  let ctx = null;
  let master = null;
  let musicBus = null;
  let muted = false;
  let song = null;          // { def, startTime, nextStep, stepDur }
  let timer = null;
  let noiseBuf = null;

  function midiToHz(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  function ensure() {
    if (ctx) return true;
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.6;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp);
    comp.connect(ctx.destination);
    musicBus = ctx.createGain();
    musicBus.gain.value = 0.55;
    musicBus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }

  function unlock() {
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume();
  }

  function env(gainNode, t, attack, peak, decay) {
    gainNode.gain.setValueAtTime(0.0001, t);
    gainNode.gain.exponentialRampToValueAtTime(peak, t + attack);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  function tone(dest, type, freq, t, dur, peak, opts) {
    opts = opts || {};
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (opts.slideTo) o.frequency.exponentialRampToValueAtTime(opts.slideTo, t + dur);
    let node = o;
    if (opts.filter) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(opts.filter, t);
      f.Q.value = opts.q || 4;
      if (opts.filterTo) f.frequency.exponentialRampToValueAtTime(opts.filterTo, t + dur);
      o.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(dest);
    env(g, t, opts.attack || 0.005, peak, dur);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  function noise(dest, t, dur, peak, hp) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = hp;
    const g = ctx.createGain();
    s.connect(f); f.connect(g); g.connect(dest);
    env(g, t, 0.002, peak, dur);
    s.start(t);
    s.stop(t + dur + 0.05);
  }

  // ---- Musik ----------------------------------------------------------
  function degree(def, deg, octave) {
    const sc = def.scale;
    const n = sc.length;
    const o = Math.floor(deg / n);
    const i = ((deg % n) + n) % n;
    return def.root + sc[i] + 12 * (o + (octave || 0));
  }

  function scheduleStep(def, step, t) {
    const s16 = step % 16;
    const bar = Math.floor(step / 16);
    const chord = def.prog[bar % def.prog.length];
    const section = Math.floor(bar / 4) % 4;     // Abwechslung alle 4 Takte

    // Bassdrum
    if (s16 % 4 === 0) tone(musicBus, 'sine', 150, t, 0.18, 0.9, { slideTo: 40 });
    // Snare / Clap
    if (s16 === 4 || s16 === 12) noise(musicBus, t, 0.12, 0.35, 1500);
    // Hi-Hat
    if (s16 % 2 === 1) noise(musicBus, t, 0.03, section === 0 ? 0.08 : 0.14, 7000);
    // Bass (Achtel, Oktavsprung)
    if (s16 % 2 === 0) {
      const m = degree(def, chord, 0) + (s16 % 4 === 2 ? 12 : 0);
      tone(musicBus, 'sawtooth', midiToHz(m), t, 0.16, 0.22, { filter: 900, filterTo: 200 });
    }
    // Arpeggio-Melodie
    if (section > 0 && s16 % 2 === 0) {
      const li = (s16 / 2 + bar * 3) % def.lead.length;
      const m = degree(def, chord + def.lead[li], 2);
      tone(musicBus, 'square', midiToHz(m), t, 0.12, 0.07, { filter: 3200, filterTo: 900 });
    }
    // Flächen-Akkord am Taktanfang
    if (s16 === 0) {
      [0, 2, 4].forEach((d) => {
        tone(musicBus, 'triangle', midiToHz(degree(def, chord + d, 1)), t, 1.6, 0.05, { attack: 0.08 });
      });
    }
  }

  function tick() {
    if (!song || !ctx) return;
    const ahead = ctx.currentTime + 0.12;
    while (song.nextTime < ahead) {
      scheduleStep(song.def, song.step, song.nextTime);
      song.step++;
      song.nextTime += song.stepDur;
    }
  }

  function playMusic(def) {
    stopMusic();
    if (!ensure()) return;
    unlock();
    const stepDur = 60 / def.bpm / 4;
    song = { def, step: 0, stepDur, nextTime: ctx.currentTime + 0.05, startTime: ctx.currentTime + 0.05 };
    musicBus.gain.cancelScheduledValues(ctx.currentTime);
    musicBus.gain.setValueAtTime(0.55, ctx.currentTime);
    tick();
    timer = setInterval(tick, 25);
  }

  function stopMusic(fade) {
    if (timer) clearInterval(timer);
    timer = null;
    if (ctx && musicBus && fade) {
      musicBus.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.15);
    }
    song = null;
  }

  /** 0..1 – wie weit wir im aktuellen Schlag sind (für pulsierende Grafik). */
  function beat() {
    if (!song || !ctx) return (performance.now() / 1000 * 2) % 1;
    const beatDur = song.stepDur * 4;
    const t = ctx.currentTime - song.startTime;
    return t < 0 ? 0 : (t % beatDur) / beatDur;
  }

  // ---- Effekte ---------------------------------------------------------
  function sfx(name) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    switch (name) {
      case 'die':
        noise(master, t, 0.45, 0.6, 200);
        tone(master, 'sawtooth', 220, t, 0.4, 0.25, { slideTo: 40, filter: 1200 });
        break;
      case 'orb':
        tone(master, 'sine', 660, t, 0.15, 0.25, { slideTo: 1320 });
        break;
      case 'pad':
        tone(master, 'triangle', 300, t, 0.2, 0.3, { slideTo: 900 });
        break;
      case 'portal':
        tone(master, 'sine', 400, t, 0.35, 0.2, { slideTo: 1600 });
        tone(master, 'sine', 600, t + 0.05, 0.3, 0.12, { slideTo: 2000 });
        break;
      case 'coin':
        tone(master, 'square', 988, t, 0.08, 0.12, { filter: 4000 });
        tone(master, 'square', 1319, t + 0.08, 0.25, 0.12, { filter: 4000 });
        break;
      case 'checkpoint':
        tone(master, 'sine', 880, t, 0.12, 0.15);
        break;
      case 'win':
        [0, 4, 7, 12, 16].forEach((n, i) => {
          tone(master, 'square', midiToHz(72 + n), t + i * 0.09, 0.4, 0.1, { filter: 3500 });
        });
        break;
      case 'click':
        tone(master, 'sine', 520, t, 0.05, 0.12);
        break;
      default:
    }
  }

  function setMuted(m) {
    muted = !!m;
    if (master) master.gain.setTargetAtTime(muted ? 0 : 0.6, ctx.currentTime, 0.02);
  }

  root.GameAudio = { unlock, playMusic, stopMusic, beat, sfx, setMuted, isMuted: () => muted };
})(this);
