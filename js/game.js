/*
 * Neon Hop – Darstellung, Eingabe, Menüs und Spielablauf.
 */
(function () {
  'use strict';

  const E = window.Engine;
  const A = window.GameAudio;
  const C = E.C;
  const TS = 40;                 // Pixel pro Kachel (logisch)
  const PLAYER_SCREEN_X = 7;     // Spieler steht so viele Kacheln vom linken Rand
  const SAVE_KEY = 'neonhop.save.v1';
  const FONT = 'Fredoka, "Trebuchet MS", system-ui, sans-serif';
  const INK = '#1d1442';
  // Schrift für das Canvas vorladen (CSS lädt sie sonst erst bei Bedarf)
  if (document.fonts && document.fonts.load) {
    ['600 16px Fredoka', '700 16px Fredoka'].forEach((f) => document.fonts.load(f).catch(() => {}));
  }

  const PLAYER_COLORS = [
    ['#5ee6ff', '#ffef5e'], ['#7dff9a', '#2a7cff'], ['#ff5ec8', '#ffffff'],
    ['#ffb03b', '#ff3b6b'], ['#c58cff', '#5effd8'], ['#ffffff', '#ff5e5e'],
  ];

  // ---------------------------------------------------------------------
  // Speicherstand (nur im Browser des Spielers)
  // ---------------------------------------------------------------------
  const save = loadSave();
  // Ganzzahl zwischen 0 und max, alles andere wird 0.
  function clampInt(v, max) {
    v = Number(v);
    return isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : 0;
  }
  // Der Spielstand kann von aussen kommen (z.B. von Toki zurückgespielt),
  // darum nur bekannte Felder mit geprüften Werten übernehmen.
  function loadSave() {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { raw = null; }
    const data = { levels: {}, color: 0, muted: false, name: '' };
    if (!raw || typeof raw !== 'object') return data;
    data.color = clampInt(raw.color, PLAYER_COLORS.length - 1);
    data.muted = raw.muted === true;
    data.name = typeof raw.name === 'string' ? raw.name.replace(/[\u0000-\u001f<>]/g, '').slice(0, 16) : '';
    data.nameTyped = raw.nameTyped === true;
    const levels = raw.levels && typeof raw.levels === 'object' ? raw.levels : {};
    window.LEVELS.forEach((def) => {
      const l = levels[def.id];
      if (!l || typeof l !== 'object') return;
      const coins = Array.isArray(l.coins) ? l.coins.map((c) => clampInt(c, 99)) : [];
      data.levels[def.id] = {
        best: clampInt(l.best, 100),
        practice: clampInt(l.practice, 100),
        attempts: clampInt(l.attempts, 1e9),
        coins: coins.filter((c, i) => coins.indexOf(c) === i),
        done: l.done === true,
      };
    });
    return data;
  }
  function writeSave() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* privat / blockiert */ }
  }
  function levelSave(id) {
    if (!save.levels[id]) save.levels[id] = { best: 0, practice: 0, attempts: 0, coins: [], done: false };
    return save.levels[id];
  }

  // ---------------------------------------------------------------------
  // Canvas & Grösse
  // ---------------------------------------------------------------------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let viewW = 960, viewH = 540, scale = 1, groundY = 470;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth, h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    scale = Math.min(w / 960, h / 540) * dpr;
    viewW = canvas.width / scale;
    viewH = canvas.height / scale;
    groundY = Math.round(viewH / 2 + 200);
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------------------------------------------------------------------
  // Spielzustand
  // ---------------------------------------------------------------------
  const game = {
    scene: 'menu',        // 'menu' | 'play' | 'win'
    paused: false,
    levelIndex: 0,
    level: null,
    state: null,
    practice: false,
    checkpoints: [],
    attempts: 0,
    jumps: 0,
    deathTimer: 0,
    winTimer: 0,
    lastAutoCp: 0,
    rot: 0,
    roofAlpha: 0,
    shake: 0,
    flash: 0,
    attemptStartX: 0,
  };
  const particles = [];
  let held = false;
  let pointers = 0;
  let keysDown = new Set();
  let time = 0;

  // Hintergrund-Formen (zufällig, aber fest)
  const bgShapes = [];
  (function () {
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 40; i++) {
      bgShapes.push({ x: rnd() * 2400, y: rnd() * 420, s: 30 + rnd() * 110, r: rnd() * Math.PI, d: 0.1 + rnd() * 0.25 });
    }
  })();

  // ---------------------------------------------------------------------
  // Eingabe
  // ---------------------------------------------------------------------
  function setHeld() {
    const next = pointers > 0 || keysDown.size > 0;
    held = next;
  }
  const JUMP_KEYS = new Set(['Space', 'ArrowUp', 'KeyW', 'Enter', 'NumpadEnter']);

  window.addEventListener('keydown', (e) => {
    A.unlock();
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
      if (e.code === 'Enter' && e.target.id === 'mpCode') $('mpJoin').click();
      return;
    }
    if (game.scene === 'play') {
      if (JUMP_KEYS.has(e.code)) {
        e.preventDefault();
        if (!game.paused && !e.repeat) { keysDown.add(e.code); setHeld(); }
        return;
      }
      if (e.code === 'Escape' || e.code === 'KeyP') { e.preventDefault(); togglePause(); return; }
      if (e.code === 'KeyR' && !game.paused) { restartLevel(); return; }
      if (game.practice && !game.paused) {
        if (e.code === 'KeyZ') placeCheckpoint(true);
        if (e.code === 'KeyX') removeCheckpoint();
      }
    } else if (game.scene === 'menu' && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) {
      e.preventDefault();   // sonst scrollt der Browser zusätzlich selbst und bremst die Animation
      scrollCards(e.code === 'ArrowLeft' ? -1 : 1, false);
    } else if (game.scene === 'win' && (e.code === 'Space' || e.code === 'Enter')) {
      e.preventDefault();
      document.getElementById('againBtn').click();
    }
  });
  window.addEventListener('keyup', (e) => { keysDown.delete(e.code); setHeld(); });
  window.addEventListener('blur', () => { keysDown.clear(); pointers = 0; setHeld(); if (game.scene === 'play' && !game.paused) togglePause(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.scene === 'play' && !game.paused) togglePause();
    else if (document.hidden) A.pauseAll();
    else if (game.scene !== 'play') A.resumeAll();
  });

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    A.unlock();
    if (game.scene !== 'play' || game.paused) return;
    pointers++;
    setHeld();
  });
  const pointerUp = () => { pointers = Math.max(0, pointers - 1); setHeld(); };
  window.addEventListener('pointerup', pointerUp);
  window.addEventListener('pointercancel', pointerUp);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---------------------------------------------------------------------
  // Menüs
  // ---------------------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  function show(id, on) { $(id).classList.toggle('hidden', !on); }

  const DIFF_NAMES = ['', 'Leicht', 'Mittel', 'Schwer', 'Extrem'];
  let focusLevel = null;   // dieses Level beim Öffnen des Menüs zeigen
  let menuBuilt = false;
  const icon = (name) => '<svg class="i"><use href="#i-' + name + '"/></svg>';

  /** Farben des Levels für Menüs und Anzeige übernehmen. */
  function setTheme(def) {
    const root = document.documentElement.style;
    root.setProperty('--lvl', def.colors.accent);
    root.setProperty('--lvl-bg', def.colors.bgBottom);
  }

  /** Kleine Vorschau des Levelanfangs für die Menükarte zeichnen. */
  function drawCardArt(cv, def, lvl) {
    const w = cv.clientWidth || 300, h = cv.clientHeight || 118;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const c = cv.getContext('2d');
    c.scale(dpr, dpr);
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, def.colors.bgTop);
    g.addColorStop(1, def.colors.bgBottom);
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    const ts = Math.max(10, Math.round(h / 7));
    const gy = h - ts * 1.1;
    // Abwechslungsreichsten Ausschnitt wählen (Blöcke, ein paar Stacheln, Extras)
    const cols = Math.ceil(w / ts);
    const maxY = h < 90 ? 2 : 4;
    let bestX = 14, bestN = -1;
    for (let x = 14; x < Math.min(lvl.length - cols, 160); x += 2) {
      let blocks = 0, spikes = 0, extras = 0;
      lvl.objects.forEach((o) => {
        if (o.x < x || o.x >= x + cols || o.y > maxY) return;
        if (o.type === 'block') blocks++;
        else if (o.type === 'spike' || o.type === 'mini') spikes++;
        else if (o.type === 'orb' || o.type === 'pad' || o.type === 'coin') extras++;
      });
      const n = Math.min(blocks, 14) + Math.min(spikes, 5) + extras * 3;
      if (n > bestN) { bestN = n; bestX = x; }
    }
    c.fillStyle = def.colors.ground; c.fillRect(0, gy, w, h - gy);
    c.fillStyle = def.colors.accent; c.fillRect(0, gy - 1, w, 2);
    lvl.objects.forEach((o) => {
      if (o.x < bestX - 1 || o.x > bestX + cols || o.y > maxY) return;
      const x = (o.x - bestX) * ts, y = gy - (o.y + 1) * ts;
      if (o.type === 'block') {
        c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillRect(x, y, ts, ts);
        c.strokeStyle = def.colors.accent; c.lineWidth = 1.5; c.strokeRect(x + 0.75, y + 0.75, ts - 1.5, ts - 1.5);
      } else if (o.type === 'spike' || o.type === 'mini') {
        const sh = o.type === 'mini' ? ts * 0.45 : ts * 0.95;
        c.beginPath(); c.moveTo(x + 1, y + ts); c.lineTo(x + ts / 2, y + ts - sh); c.lineTo(x + ts - 1, y + ts); c.closePath();
        c.fillStyle = '#05060f'; c.fill(); c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 1; c.stroke();
      } else if (o.type === 'orb' || o.type === 'pad' || o.type === 'coin') {
        c.fillStyle = o.type === 'coin' ? '#ffd84a' : '#ffe14a';
        c.beginPath();
        if (o.type === 'pad') c.ellipse(x + ts / 2, y + ts, ts * 0.4, ts * 0.2, 0, Math.PI, 0);
        else c.arc(x + ts / 2, y + ts / 2, ts * 0.3, 0, Math.PI * 2);
        c.fill();
      }
    });
    // Spielfigur
    const cols2 = PLAYER_COLORS[save.color];
    const px = ts * 2, py = gy - ts;
    c.fillStyle = cols2[0]; c.fillRect(px, py, ts, ts);
    c.fillStyle = cols2[1]; c.fillRect(px + ts * 0.22, py + ts * 0.22, ts * 0.56, ts * 0.56);
    c.strokeStyle = '#000'; c.lineWidth = 1.5; c.strokeRect(px, py, ts, ts);
    // Abdunkeln nach unten, damit Text lesbar bleibt
    const shade = c.createLinearGradient(0, h * 0.4, 0, h);
    shade.addColorStop(0, 'rgba(14,18,48,0)');
    shade.addColorStop(1, 'rgba(14,18,48,0.75)');
    c.fillStyle = shade; c.fillRect(0, 0, w, h);
  }

  // ---------------------------------------------------------------------
  // Scroll-Menü: Karten seitwärts scrollen (Wischen, Mausrad, Ziehen, Pfeile)
  // ---------------------------------------------------------------------
  function cardStep() {
    const wrap = $('levels');
    const c = wrap.querySelector('.card');
    if (!c) return 1;
    const gap = parseFloat(getComputedStyle(wrap).columnGap) || 16;
    return c.getBoundingClientRect().width + gap;
  }
  function visibleCards() { return Math.max(1, Math.floor(($('levels').clientWidth + 8) / cardStep())); }
  function updatePager() {
    const wrap = $('levels');
    const n = window.LEVELS.length;
    const first = Math.round(wrap.scrollLeft / cardStep());
    const a = Math.min(n, first + 1), b = Math.min(n, first + visibleCards());
    $('pgLabel').innerHTML = '<b>' + a + '–' + b + '</b>von ' + n;
    $('pgPrev').disabled = wrap.scrollLeft <= 2;
    $('pgNext').disabled = wrap.scrollLeft >= wrap.scrollWidth - wrap.clientWidth - 2;
  }
  let lastTarget = { i: 0, t: 0 };
  function scrollCards(dir, page) {
    const wrap = $('levels');
    const step = cardStep();
    const now = performance.now();
    // Läuft noch eine Animation, vom Ziel aus weiterrechnen (schnelles Drücken)
    const cur = now - lastTarget.t < 450 ? lastTarget.i : Math.round(wrap.scrollLeft / step);
    const max = Math.ceil((wrap.scrollWidth - wrap.clientWidth) / step - 0.05);
    const next = Math.max(0, Math.min(max, cur + dir * (page ? visibleCards() : 1)));
    lastTarget = { i: next, t: now };
    wrap.scrollTo({ left: next * step, behavior: 'smooth' });
  }
  function scrollToLevel(i) {
    const wrap = $('levels');
    wrap.scrollLeft = Math.max(0, i - 1) * cardStep();   // Level an zweiter Stelle zeigen
    updatePager();
  }
  $('pgPrev').onclick = () => { A.sfx('click'); scrollCards(-1, true); };
  $('pgNext').onclick = () => { A.sfx('click'); scrollCards(1, true); };

  (function setupScroller() {
    const wrap = $('levels');
    wrap.addEventListener('scroll', () => requestAnimationFrame(updatePager), { passive: true });
    window.addEventListener('resize', () => requestAnimationFrame(updatePager));
    // Mausrad: eine Karte pro Raste seitwärts
    let wheelAcc = 0, wheelLock = 0;
    wrap.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;   // Trackpad seitwärts macht der Browser
      e.preventDefault();
      const now = performance.now();
      wheelAcc += e.deltaY;
      if (now < wheelLock || Math.abs(wheelAcc) < 30) return;
      scrollCards(wheelAcc > 0 ? 1 : -1, false);
      wheelAcc = 0;
      wheelLock = now + 160;
    }, { passive: false });
    // Ziehen mit gedrückter Maustaste
    let drag = null;
    wrap.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      drag = { x: e.clientX, left: wrap.scrollLeft, moved: false, id: e.pointerId };
    });
    window.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      if (!drag.moved && Math.abs(dx) > 6) { drag.moved = true; wrap.classList.add('dragging'); }
      if (drag.moved) wrap.scrollLeft = drag.left - dx;
    });
    window.addEventListener('pointerup', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const moved = drag.moved;
      drag = null;
      if (!moved) return;
      // Der Klick nach dem Ziehen soll kein Level starten
      const stop = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
      window.addEventListener('click', stop, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 60);
      const step = cardStep();
      const target = Math.round(wrap.scrollLeft / step) * step;
      wrap.classList.remove('dragging');
      wrap.scrollTo({ left: target, behavior: 'smooth' });
    });
  })();

  function buildMenu() {
    const wrap = $('levels');
    const keepScroll = wrap.scrollLeft;
    wrap.innerHTML = '';
    const arts = [];
    if (!menuBuilt) {
      // beim ersten Öffnen: erstes noch nicht geschafftes Level zeigen
      const first = window.LEVELS.findIndex((d) => !levelSave(d.id).done);
      focusLevel = first < 0 ? 0 : first;
      menuBuilt = true;
    }
    window.LEVELS.forEach((def, i) => {
      const lvl = E.parseLevel(def);
      const sv = levelSave(def.id);
      const card = document.createElement('div');
      card.className = 'card';
      card.style.setProperty('--c', def.colors.accent);
      let coins = '';
      for (let k = 0; k < lvl.coinCount; k++) coins += '<i class="' + (sv.coins.indexOf(k) !== -1 ? 'got' : '') + '"></i>';
      card.innerHTML =
        '<div class="card-art"><canvas></canvas><span class="card-num">Level ' + (i + 1) + '</span>' +
          (sv.done ? '<span class="card-done" title="Geschafft">' + icon('check') + '</span>' : '') + '</div>' +
        '<div class="card-body">' +
          '<div class="card-row"><h3>' + def.name + '</h3></div>' +
          '<div class="card-row"><span class="badge d' + def.difficulty + '">' + DIFF_NAMES[def.difficulty] + '</span>' +
            '<span class="mini-coins" title="Münzen">' + coins + '</span></div>' +
          '<div class="progress">' +
            '<div class="progress-label"><span>Bestwert</span><b>' + sv.best + '%</b></div>' +
            '<div class="track"><div style="width:' + sv.best + '%"></div></div>' +
            '<div class="progress-label"><span>Übung</span><span>' + sv.practice + '%</span></div>' +
            '<div class="track practice"><div style="width:' + sv.practice + '%"></div></div>' +
          '</div>' +
          '<div class="card-buttons"></div>' +
        '</div>';
      const play = document.createElement('button');
      play.className = 'btn-go';
      play.innerHTML = icon('play') + 'Spielen';
      play.onclick = () => startLevel(i, false);
      const prac = document.createElement('button');
      prac.className = 'btn-practice';
      prac.innerHTML = icon('flag');
      prac.title = 'Übungsmodus mit Checkpoints';
      prac.setAttribute('aria-label', 'Üben: ' + def.name);
      prac.onclick = () => startLevel(i, true);
      card.querySelector('.card-buttons').append(play, prac);
      wrap.appendChild(card);
      arts.push([card.querySelector('canvas'), def, lvl]);
    });
    wrap.scrollLeft = keepScroll;
    requestAnimationFrame(() => {
      if (focusLevel !== null) { scrollToLevel(focusLevel); focusLevel = null; }
      updatePager();
      arts.forEach((a) => drawCardArt(a[0], a[1], a[2]));
    });

    const sw = $('swatches');
    sw.querySelectorAll('button').forEach((b) => b.remove());
    PLAYER_COLORS.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'swatch' + (save.color === i ? ' active' : '');
      b.style.background = c[0];
      b.style.boxShadow = 'inset 0 0 0 7px ' + c[0] + ', inset 0 0 0 16px ' + c[1];
      b.setAttribute('aria-label', 'Farbe ' + (i + 1));
      b.onclick = () => { save.color = i; writeSave(); A.sfx('click'); buildMenu(); };
      sw.appendChild(b);
    });
    updateSoundBtn();
  }

  function updateSoundBtn() {
    $('soundBtn').innerHTML = icon(save.muted ? 'mute' : 'sound');
    $('soundBtn').title = save.muted ? 'Ton ist aus' : 'Ton ist an';
  }
  $('soundBtn').onclick = () => {
    save.muted = !save.muted;
    A.setMuted(save.muted);
    writeSave();
    updateSoundBtn();
  };
  A.setMuted(save.muted);

  function blurActive() { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); }

  function goMenu() {
    if (game.level) focusLevel = game.levelIndex;
    game.scene = 'menu';
    game.paused = false;
    A.resumeAll();
    A.playMenuMusic();
    show('menu', true); show('hud', false); show('practiceBar', false); show('pause', false); show('win', false);
    buildMenu();
  }

  function togglePause() {
    if (game.scene !== 'play') return;
    game.paused = !game.paused;
    keysDown.clear(); pointers = 0; setHeld();
    show('pause', game.paused);
    if (game.paused) {
      const pct = progress();
      const def = window.LEVELS[game.levelIndex];
      const sv = levelSave(def.id);
      $('pauseRing').style.setProperty('--p', pct);
      $('pausePct').textContent = pct + '%';
      $('pauseLevel').textContent = def.name;
      $('pauseAttempt').textContent = 'Versuch ' + game.attempts;
      $('pauseBest').textContent = 'Bestwert ' + (game.practice ? sv.practice : sv.best) + '%';
      show('pausePractice', game.practice);
      $('togglePracticeBtn').querySelector('span').textContent = game.practice ? 'Normal spielen' : 'Übungsmodus';
      $('togglePracticeBtn').classList.toggle('on', game.practice);
      show('togglePracticeBtn', !game.race);
      $('menuBtn').lastChild.textContent = game.race ? 'Lobby' : 'Menü';
      A.pauseAll();
    } else {
      // genau dort weitermachen, wo pausiert wurde (Spiel und Musik)
      blurActive();
      A.resumeAll();
    }
  }

  $('pauseBtn').onclick = () => { blurActive(); togglePause(); };
  $('resumeBtn').onclick = () => togglePause();
  $('restartBtn').onclick = () => { game.paused = false; show('pause', false); blurActive(); restartLevel(); };
  $('togglePracticeBtn').onclick = () => { show('pause', false); blurActive(); startLevel(game.levelIndex, !game.practice); };
  $('menuBtn').onclick = () => { if (game.race) toLobby(); else goMenu(); };
  $('winMenuBtn').onclick = goMenu;
  $('againBtn').onclick = () => { blurActive(); startLevel(game.levelIndex, game.practice); };
  $('nextBtn').onclick = () => { blurActive(); startLevel((game.levelIndex + 1) % window.LEVELS.length, false); };
  $('cpAdd').addEventListener('pointerdown', (e) => { e.stopPropagation(); placeCheckpoint(true); });
  $('cpDel').addEventListener('pointerdown', (e) => { e.stopPropagation(); removeCheckpoint(); });

  // ---------------------------------------------------------------------
  // Mehrspieler: Rennen im selben Level, die anderen sieht man als Geister.
  // Der Host verwaltet Spielerliste, Level und Ergebnisse; alle Nachrichten
  // von anderen werden geprüft, bevor sie benutzt werden.
  // ---------------------------------------------------------------------
  const N = window.Net;
  const COUNTDOWN = 3;
  const MAX_PLAYERS = 4;
  const mp = {
    inRoom: false, host: false, code: null, me: null,
    players: [],            // [{ id, name, color }], Host zuerst
    level: 0, mode: 'go',   // 'go' = alle spielen weiter, 'end' = Rennen endet beim Ersten
    racing: false, raceId: 0, raceStart: 0, finishedMs: null,
    results: [], remote: {}, lastSend: 0, busy: false,
  };

  function cleanName(n) {
    return String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16) || 'Spieler';
  }
  function num(v, lo, hi) {
    v = Number(v);
    return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : null;
  }
  function toast(text) {
    const t = $('toast');
    t.textContent = text;
    show('toast', true);
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => show('toast', false), 3200);
  }
  /** Raumcode an Toki melden, damit man Freunde einladen kann. */
  function tokiRoom(code) {
    try { if (window.toki && typeof window.toki.room === 'function') window.toki.room(code); } catch (e) { /* egal */ }
  }
  function mpStatus(text, error, el) {
    const box = $(el || 'mpStatus');
    box.textContent = text || '';
    box.classList.toggle('error', !!error);
  }
  function rememberName() {
    save.name = cleanName($('mpName').value);
    $('mpName').value = save.name;
    writeSave();
  }
  function setBusy(on) {
    mp.busy = on;
    ['mpCreate', 'mpJoin'].forEach((id) => { $(id).disabled = on; });
  }

  // ----- Fenster ---------------------------------------------------------
  function openMp() {
    A.unlock();
    N.wake();
    if (!$('mpName').value) $('mpName').value = save.name || ('Spieler ' + (10 + Math.floor(Math.random() * 90)));
    if (!mp.inRoom) mpStatus('');
    renderLobby();
    show('mp', true);
  }
  function renderLobby() {
    show('mpStart', !mp.inRoom);
    show('mpLobby', mp.inRoom);
    if (!mp.inRoom) return;
    $('mpRoomCode').textContent = mp.code;
    const wrap = $('mpPlayers');
    wrap.textContent = '';
    for (let i = 0; i < MAX_PLAYERS; i++) {
      const p = mp.players[i];
      const el = document.createElement('div');
      if (!p) {
        el.className = 'player empty';
        el.textContent = 'frei';
      } else {
        el.className = 'player';
        const sw = document.createElement('span');
        sw.className = 'sw';
        sw.style.background = PLAYER_COLORS[p.color][1];
        sw.style.boxShadow = 'inset 0 0 0 4px ' + PLAYER_COLORS[p.color][0];
        const nm = document.createElement('span');
        nm.className = 'nm';
        nm.textContent = p.name + (p.id === mp.me ? ' (du)' : '');
        el.append(sw, nm);
        if (i === 0) {
          const tag = document.createElement('span');
          tag.className = 'tag';
          tag.textContent = 'Host';
          el.appendChild(tag);
        }
      }
      wrap.appendChild(el);
    }
    const def = window.LEVELS[mp.level];
    $('mpLevel').textContent = (mp.level + 1) + '. ' + def.name;
    ['mpLvlPrev', 'mpLvlNext', 'mpModeGo', 'mpModeEnd'].forEach((id) => { $(id).disabled = !mp.host; });
    $('mpModeGo').classList.toggle('on', mp.mode === 'go');
    $('mpModeEnd').classList.toggle('on', mp.mode === 'end');
    show('mpStart2', mp.host);
    if (!mp.host) mpStatus('Warte, bis der Host das Rennen startet …', false, 'mpLobbyStatus');
    else mpStatus(mp.players.length < 2 ? 'Warte auf Freunde – oder starte schon allein.' : '', false, 'mpLobbyStatus');
    renderResults();
  }
  function renderResults() {
    const box = $('mpResults');
    box.textContent = '';
    show('mpResults', mp.results.length > 0);
    mp.results.forEach((r, i) => {
      const row = document.createElement('div');
      row.className = 'result';
      const pl = document.createElement('span'); pl.className = 'place'; pl.textContent = i + 1;
      const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = r.name + (r.id === mp.me ? ' (du)' : '');
      const tm = document.createElement('span'); tm.className = 'tm'; tm.textContent = (r.ms / 1000).toFixed(1) + ' s';
      row.append(pl, nm, tm);
      box.appendChild(row);
    });
  }

  // ----- Raum erstellen / beitreten / verlassen ---------------------------
  async function mpCreate() {
    if (mp.busy) return;
    rememberName();
    setBusy(true);
    mpStatus('Raum wird erstellt …');
    try {
      const code = await N.host();
      Object.assign(mp, {
        inRoom: true, host: true, code, me: N.id, results: [], remote: {}, racing: false,
        players: [{ id: N.id, name: save.name, color: save.color }],
        level: game.level ? game.levelIndex : (focusLevel || 0),
      });
      tokiRoom(code);
      mpStatus('');
      renderLobby();
    } catch (e) {
      mpStatus(e.message, true);
    }
    setBusy(false);
  }
  async function mpJoinCode(raw) {
    if (mp.busy) return;
    openMp();
    rememberName();
    const code = N.cleanCode(raw);
    $('mpCode').value = code;
    if (code.length !== N.CODE_LEN) { mpStatus('Der Raumcode hat ' + N.CODE_LEN + ' Zeichen.', true); return; }
    setBusy(true);
    mpStatus('Verbinde mit Raum ' + code + ' …');
    try {
      await N.join(code);
      Object.assign(mp, { inRoom: true, host: false, code, me: N.id, players: [], results: [], remote: {}, racing: false });
      N.send({ t: 'hello', name: save.name, color: save.color });
      tokiRoom(code);
      mpStatus('');
      renderLobby();
    } catch (e) {
      mpStatus(e.message, true);
    }
    setBusy(false);
  }
  function leaveRoom() {
    const wasRacing = game.race;
    N.leave();
    tokiRoom(null);
    Object.assign(mp, { inRoom: false, host: false, code: null, players: [], results: [], remote: {}, racing: false });
    show('finishBar', false);
    if (wasRacing || game.scene !== 'menu') goMenu();
    renderLobby();
  }

  // ----- Nachrichten -------------------------------------------------------
  function broadcastRoom() {
    N.send({ t: 'room', players: mp.players, level: mp.level, mode: mp.mode });
  }
  /** Spielstand eines Mitspielers prüfen (kommt von aussen!). */
  function readState(m) {
    const x = num(m.x, 0, 100000), y = num(m.y, -2, 12), r = num(m.r, -1000, 1000);
    if (x === null || y === null || r === null) return null;
    return { x, y, r, m: m.m === 1 ? 1 : 0, g: m.g === -1 ? -1 : 1, d: m.d === 1 ? 1 : 0, w: m.w === 1 ? 1 : 0, race: num(m.race, 0, 1e9) };
  }
  function storeRemote(id, st) {
    const old = mp.remote[id];
    st.t = performance.now();
    if (old) { st.sx = old.sx; st.sy = old.sy; }
    mp.remote[id] = st;
  }

  N.on('guestLeft', (id) => {
    const p = mp.players.find((q) => q.id === id);
    mp.players = mp.players.filter((q) => q.id !== id);
    delete mp.remote[id];
    if (p) toast(p.name + ' hat den Raum verlassen.');
    broadcastRoom();
    renderLobby();
  });
  // Langsamer Server (kostenlose Hoster schlafen und brauchen beim ersten Mal etwas länger)
  N.on('slow', () => { if (mp.busy) mpStatus('Der Mehrspieler-Server startet gerade, einen Moment …'); });
  // Host hat die Verbindung zum Server verloren
  N.on('disconnected', () => {
    if (!mp.inRoom) return;
    leaveRoom();
    openMp();
    mpStatus('Verbindung zum Mehrspieler-Server verloren.', true);
  });
  N.on('hostLeft', (info) => {
    if (!mp.inRoom) return;
    // Nie eine Spielerliste bekommen: wir wurden gar nicht aufgenommen (z.B. Raum voll)
    const neverJoined = mp.players.length === 0;
    leaveRoom();
    openMp();
    if (info && info.lost) mpStatus('Verbindung zum Mehrspieler-Server verloren.', true);
    else mpStatus(neverJoined ? 'Der Raum ist voll oder nicht mehr offen.' : 'Der Host hat den Raum verlassen.', true);
  });
  N.on('message', ({ from, msg }) => {
    if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return;
    if (mp.host) hostMessage(from, msg); else guestMessage(msg);
  });

  function hostMessage(from, m) {
    if (m.t === 'hello') {
      if (mp.players.some((p) => p.id === from)) return;
      if (mp.players.length >= MAX_PLAYERS) { N.sendTo(from, { t: 'full' }); N.kick(from); return; }
      const p = { id: from, name: cleanName(m.name), color: clampInt(m.color, PLAYER_COLORS.length - 1) };
      mp.players.push(p);
      toast(p.name + ' ist beigetreten!');
      A.sfx('coin');
      broadcastRoom();
      N.sendTo(from, { t: 'results', race: mp.raceId, list: mp.results, end: false });
      renderLobby();
    } else if (m.t === 's') {
      if (!mp.players.some((p) => p.id === from)) return;
      const st = readState(m);
      if (!st || st.race !== mp.raceId) return;
      // an die anderen weitergeben (nur die geprüften Felder)
      N.send({ t: 's', id: from, race: st.race, x: st.x, y: st.y, r: st.r, m: st.m, g: st.g, d: st.d, w: st.w }, from);
      storeRemote(from, st);
    } else if (m.t === 'fin') {
      recordFinish(from, num(m.ms, 0, 36e5), num(m.race, 0, 1e9));
    }
  }

  function guestMessage(m) {
    if (m.t === 'full') {
      leaveRoom();
      openMp();
      mpStatus('Der Raum ist voll (max. ' + MAX_PLAYERS + ' Spieler).', true);
    } else if (m.t === 'room') {
      if (!Array.isArray(m.players)) return;
      mp.players = m.players.slice(0, MAX_PLAYERS)
        .filter((p) => p && typeof p.id === 'string')
        .map((p) => ({ id: p.id.slice(0, 80), name: cleanName(p.name), color: clampInt(p.color, PLAYER_COLORS.length - 1) }));
      mp.level = clampInt(m.level, window.LEVELS.length - 1);
      mp.mode = m.mode === 'end' ? 'end' : 'go';
      renderLobby();
    } else if (m.t === 'start') {
      beginRace(clampInt(m.level, window.LEVELS.length - 1), m.mode, clampInt(m.race, 1e9));
    } else if (m.t === 's') {
      if (typeof m.id !== 'string' || m.id === mp.me) return;
      const st = readState(m);
      if (st && st.race === mp.raceId) storeRemote(m.id, st);
    } else if (m.t === 'results') {
      if (!Array.isArray(m.list)) return;
      const list = m.list.slice(0, MAX_PLAYERS).filter((r) => r && typeof r.id === 'string')
        .map((r) => ({ id: r.id.slice(0, 80), name: cleanName(r.name), ms: num(r.ms, 0, 36e5) || 0 }));
      handleResults(list, m.end === true, clampInt(m.race, 1e9));
    }
  }

  // ----- Rennen ------------------------------------------------------------
  function hostStartRace() {
    if (!mp.host) return;
    mp.raceId++;
    mp.results = [];
    N.send({ t: 'start', level: mp.level, mode: mp.mode, race: mp.raceId });
    beginRace(mp.level, mp.mode, mp.raceId);
  }
  function beginRace(level, mode, raceId) {
    Object.assign(mp, { racing: true, raceId, level, mode: mode === 'end' ? 'end' : 'go', finishedMs: null, results: [], remote: {} });
    show('mp', false); show('finishBar', false);
    startLevel(level, false, true);
  }
  function mpSendState(now) {
    if (!mp.racing || !game.state || now - mp.lastSend < 66) return;
    mp.lastSend = now;
    const s = game.state;
    const msg = {
      t: 's', race: mp.raceId, x: Math.round(s.x * 100) / 100, y: Math.round(s.y * 100) / 100,
      r: Math.round(game.rot * 100) / 100, m: s.mode === 'ship' ? 1 : 0, g: s.gs, d: s.dead ? 1 : 0, w: s.won ? 1 : 0,
    };
    if (mp.host) msg.id = mp.me;
    N.send(msg);
  }
  /** Eigener Zieleinlauf. */
  function mpFinished() {
    if (mp.finishedMs !== null || !mp.racing) return;
    mp.finishedMs = Math.round(performance.now() - mp.raceStart);
    if (mp.host) recordFinish(mp.me, mp.finishedMs, mp.raceId);
    else N.send({ t: 'fin', ms: mp.finishedMs, race: mp.raceId });
  }
  /** Host: Zeit eintragen und an alle schicken. */
  function recordFinish(id, ms, raceId) {
    if (!mp.host || raceId !== mp.raceId || ms === null) return;
    if (mp.results.some((r) => r.id === id)) return;
    const p = mp.players.find((q) => q.id === id);
    if (!p) return;
    mp.results.push({ id, name: p.name, ms });
    mp.results.sort((a, b) => a.ms - b.ms);
    const end = mp.mode === 'end';
    N.send({ t: 'results', race: mp.raceId, list: mp.results, end });
    handleResults(mp.results, end, mp.raceId);
  }
  function handleResults(list, end, raceId) {
    const newFinisher = list.length > mp.results.length ? list[list.length - 1] : null;
    mp.results = list;
    renderResults();
    if (!mp.racing || raceId !== mp.raceId) return;
    if (newFinisher && newFinisher.id !== mp.me) toast(newFinisher.name + ' ist im Ziel! (Platz ' + list.length + ')');
    if (end && list.length) {
      toast(list[0].name + (list[0].id === mp.me ? ' – du hast gewonnen!' : ' hat gewonnen!'));
      setTimeout(() => { if (mp.racing && mp.raceId === raceId) toLobby(); }, 1600);
    }
  }
  /** Nach dem eigenen Zieleinlauf (Modus "Alle spielen weiter"). */
  function mpAfterFinish() {
    if (!mp.racing) return;
    if (mp.mode === 'end') { toLobby(); return; }
    const place = mp.results.findIndex((r) => r.id === mp.me) + 1;
    toast(place ? 'Platz ' + place + '! (' + (mp.finishedMs / 1000).toFixed(1) + ' s)' : 'Im Ziel!');
    show('finishBar', true);
  }
  function toLobby() {
    mp.racing = false;
    game.race = false;
    show('finishBar', false);
    goMenu();
    openMp();
  }

  // ----- Knöpfe ------------------------------------------------------------
  $('mpBtn').onclick = () => { A.sfx('click'); openMp(); };
  $('mpBack').onclick = () => show('mp', false);
  $('mpCreate').onclick = mpCreate;
  $('mpJoin').onclick = () => mpJoinCode($('mpCode').value);
  $('mpCode').addEventListener('input', () => { $('mpCode').value = N.cleanCode($('mpCode').value); });
  // Wer seinen Namen selbst eintippt, behält ihn (sonst kommt er von Toki)
  $('mpName').addEventListener('input', () => { save.nameTyped = true; writeSave(); });

  // ----- Toki-Anbindung -----------------------------------------------------
  (function tokiHooks() {
    const t = window.toki;
    if (!t) return;
    // Toki-Name automatisch übernehmen, solange man keinen eigenen eingetippt hat
    try {
      if (typeof t.onName === 'function') {
        t.onName((name) => {
          if (save.nameTyped) return;
          const n = cleanName(name);
          save.name = n;
          writeSave();
          $('mpName').value = n;
        });
      }
    } catch (e) { /* egal */ }
    // "Freunde einladen" in Toki, bevor ein Raum offen ist: gleich einen Raum öffnen
    try {
      if (typeof t.onHost === 'function') {
        t.onHost(() => {
          if (mp.inRoom) { if (game.scene !== 'play') openMp(); return; }
          if (game.scene !== 'menu') goMenu();
          openMp();
          mpCreate();
        });
      }
    } catch (e) { /* egal */ }
  })();
  $('mpLeave').onclick = () => { leaveRoom(); show('mp', true); };
  $('mpStart2').onclick = hostStartRace;
  $('mpCopy').onclick = () => {
    const text = mp.code || '';
    const done = () => toast('Code ' + text + ' kopiert');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => toast('Code: ' + text));
    else toast('Code: ' + text);
  };
  $('mpLvlPrev').onclick = () => { if (!mp.host) return; mp.level = (mp.level + window.LEVELS.length - 1) % window.LEVELS.length; broadcastRoom(); renderLobby(); };
  $('mpLvlNext').onclick = () => { if (!mp.host) return; mp.level = (mp.level + 1) % window.LEVELS.length; broadcastRoom(); renderLobby(); };
  $('mpModeGo').onclick = () => { if (!mp.host) return; mp.mode = 'go'; broadcastRoom(); renderLobby(); };
  $('mpModeEnd').onclick = () => { if (!mp.host) return; mp.mode = 'end'; broadcastRoom(); renderLobby(); };
  $('mpAgain').addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    show('finishBar', false);
    startLevel(mp.level, false, true, true);   // gleiches Rennen, ohne Countdown weiterspielen
  });
  $('mpToLobby').addEventListener('pointerdown', (e) => { e.stopPropagation(); toLobby(); });

  // Einladungslink: ?room=CODE oder #room=CODE öffnet direkt den Raum
  (function autoJoin() {
    let code = null;
    try {
      code = new URLSearchParams(location.search).get('room') ||
        new URLSearchParams(location.hash.replace(/^#/, '')).get('room');
    } catch (e) { code = null; }
    if (code) setTimeout(() => { openMp(); mpJoinCode(code); }, 300);
  })();

  // ----- Zeichnen ----------------------------------------------------------
  function drawGhosts() {
    if (!game.race) return;
    const now = performance.now();
    mp.players.forEach((p) => {
      if (p.id === mp.me) return;
      const r = mp.remote[p.id];
      if (!r || now - r.t > 3000) return;
      const age = Math.min(0.25, (now - r.t) / 1000);
      const tx = r.x + (r.d || r.w ? 0 : C.SPEED * age);   // kurz vorausrechnen, damit es flüssig aussieht
      if (r.sx === undefined || Math.abs(tx - r.sx) > 3) { r.sx = tx; r.sy = r.y; }   // Neustart: springen statt gleiten
      r.sx += (tx - r.sx) * 0.35;
      r.sy += (r.y - r.sy) * 0.35;
      if (r.d) return;
      const cols = PLAYER_COLORS[p.color];
      ctx.save();
      ctx.globalAlpha = 0.5;
      drawAvatar(r.sx, r.sy, r.r, r.m ? 'ship' : 'cube', r.g, cols, false);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = 0.95;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      outlinedText(p.name, wx(r.sx + 0.5), wy(r.sy + (r.g === -1 ? -0.5 : 1.55)), 15, cols[0], 4);
      ctx.restore();
    });
  }
  function drawCountdown() {
    if (!game.race) return;
    let text = null, k = 0;
    if (game.countdown > 0) { text = String(Math.ceil(game.countdown)); k = game.countdown % 1; }
    else if (game.goFlash > 0) { text = 'LOS!'; k = game.goFlash / 0.8; }
    if (!text) return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = Math.min(1, 0.4 + k);
    const size = 110 + (1 - k) * 0 + k * 30;
    outlinedText(text, viewW / 2, viewH / 2 - 30, size, '#ffe066', 12);
    ctx.restore();
  }

  // ---------------------------------------------------------------------
  // Spielablauf
  // ---------------------------------------------------------------------
  function startLevel(index, practice, race, noCountdown) {
    A.unlock();
    A.stopMusic();
    game.race = !!race;
    game.countdown = race && !noCountdown ? COUNTDOWN : 0;
    game.levelIndex = index;
    game.level = E.parseLevel(window.LEVELS[index]);
    setTheme(game.level.def);
    game.practice = practice;
    game.checkpoints = [];
    game.attempts = 0;
    game.jumps = 0;
    game.scene = 'play';
    game.paused = false;
    keysDown.clear(); pointers = 0; setHeld();
    show('menu', false); show('win', false); show('pause', false);
    show('hud', true); show('practiceBar', practice);
    particles.length = 0;
    restartAttempt();
  }

  function restartLevel() {
    game.checkpoints = [];
    restartAttempt();
  }

  function restartAttempt() {
    game.attempts++;
    if (!game.practice) {
      const sv = levelSave(game.level.def.id);
      sv.attempts = (sv.attempts || 0) + 1;
      writeSave();
    }
    const cp = game.practice && game.checkpoints.length ? game.checkpoints[game.checkpoints.length - 1] : null;
    if (cp) {
      game.state = E.cloneState(cp.state);
      game.rot = cp.rot;
    } else {
      game.state = E.createState();
      game.rot = 0;
      game.jumps = game.practice ? game.jumps : 0;
      game.attemptStartX = 0;
      game.state.coins = new Set();
    }
    game.state.prevHeld = held;      // gehaltene Taste nicht als neuen Klick zählen
    game.deathTimer = 0;
    game.lastAutoCp = game.state.time;
    // Im Übungsmodus läuft die Musik beim Sterben einfach weiter; beim Countdown startet sie erst bei "LOS"
    if (game.countdown <= 0 && (!game.practice || !A.isPlaying())) A.playMusic(game.level.def.music, game.level.def.difficulty);
  }

  function progress() {
    if (!game.state) return 0;
    return Math.max(0, Math.min(100, Math.floor(game.state.x / game.level.length * 100)));
  }

  function placeCheckpoint(manual) {
    if (!game.practice || game.scene !== 'play' || !game.state || game.state.dead) return;
    game.checkpoints.push({ state: E.cloneState(game.state), rot: game.rot });
    game.lastAutoCp = game.state.time;
    if (manual) A.sfx('checkpoint');
  }
  function removeCheckpoint() {
    if (!game.practice) return;
    game.checkpoints.pop();
    A.sfx('click');
  }

  /**
   * Punkte für die Toki-Bestenliste: Summe der Bestwerte (normaler Modus)
   * über alle Level, also 0–100 pro Level und 1500 für alle 15 geschafft.
   * Der Wert kann nur steigen, egal welches Level gerade gespielt wird.
   */
  function totalScore() {
    return window.LEVELS.reduce((sum, def) => sum + levelSave(def.id).best, 0);
  }
  function reportScore() {
    try { if (window.toki && typeof window.toki.score === 'function') window.toki.score(totalScore()); } catch (e) { /* egal */ }
  }

  function onDeath() {
    const s = game.state;
    A.sfx('die');
    if (!game.practice) A.stopMusic(false);
    game.deathTimer = 1.0;
    game.shake = 0.35;
    burst(s.x + 0.5, s.y + 0.5, PLAYER_COLORS[save.color], 36, 9);
    const pct = progress();
    const sv = levelSave(game.level.def.id);
    if (game.practice) sv.practice = Math.max(sv.practice, pct);
    else sv.best = Math.max(sv.best, pct);
    writeSave();
    if (!game.practice) reportScore();
  }

  function onWin() {
    const s = game.state;
    A.stopMusic(true);
    A.sfx('win');
    game.scene = 'win';
    game.winShown = false;
    game.winTimer = 1.3;
    game.flash = 1;
    const sv = levelSave(game.level.def.id);
    if (game.practice) sv.practice = 100;
    else {
      sv.best = 100;
      sv.done = true;
      // Münzen-Index innerhalb des Levels speichern
      const coinIds = game.level.objects.filter((o) => o.type === 'coin').map((o) => o.id);
      s.coins.forEach((id) => {
        const idx = coinIds.indexOf(id);
        if (idx !== -1 && sv.coins.indexOf(idx) === -1) sv.coins.push(idx);
      });
    }
    writeSave();
    if (!game.practice) reportScore();
    for (let i = 0; i < 6; i++) {
      setTimeout(() => burst(s.x - 2 + Math.random() * 4, 3 + Math.random() * 5,
        ['#ffd84a', '#5ee6ff', '#ff5ec8'], 24, 7), i * 160);
    }
    show('hud', false); show('practiceBar', false);
    const coinIds = game.level.objects.filter((o) => o.type === 'coin').map((o) => o.id);
    $('winLevel').textContent = 'Level ' + (game.levelIndex + 1) + ' · ' + game.level.def.name;
    $('winTitle').textContent = game.practice ? 'Übung geschafft!' : 'Geschafft!';
    $('winCoins').innerHTML = coinIds.map((id) => '<span class="coin' + (s.coins.has(id) ? ' got' : '') + '"></span>').join('');
    $('winAttempts').textContent = game.attempts;
    $('winJumps').textContent = game.jumps;
    $('winTime').textContent = s.time.toFixed(1) + 's';
    $('nextLabel').textContent = game.levelIndex + 1 < window.LEVELS.length ? 'Nächstes Level' : 'Zurück zu Level 1';
  }

  function simulate(dt) {
    const s = game.state;
    if (s.dead) {
      game.deathTimer -= dt;
      if (game.deathTimer <= 0) restartAttempt();
      return;
    }
    E.step(s, game.level, held, dt);
    for (let i = 0; i < s.events.length; i++) {
      const ev = s.events[i];
      if (ev === 'jump') game.jumps++;
      else if (ev === 'die') onDeath();
      else if (ev === 'win') { onWin(); if (game.race) mpFinished(); }
      else if (ev === 'orb' || ev === 'pad') { game.jumps++; A.sfx(ev); ring(s.x + 0.5, s.y + 0.5, ev === 'pad' ? '#ffd84a' : '#ffffff'); }
      else if (ev === 'portal') { A.sfx('portal'); game.flash = 0.35; }
      else if (ev === 'coin') { A.sfx('coin'); burst(s.x + 0.5, s.y + 0.5, ['#ffd84a', '#fff3b0'], 16, 5); }
    }
    s.events.length = 0;
    if (s.dead || s.won) return;

    // Drehung des Würfels
    if (s.mode === 'cube') {
      if (s.onGround) {
        const target = Math.round(game.rot / (Math.PI / 2)) * (Math.PI / 2);
        game.rot += (target - game.rot) * Math.min(1, dt * 30);
      } else {
        game.rot += s.gs * 7.0 * dt;
      }
    } else {
      const target = -Math.atan2(s.vy, C.SPEED) * 0.9;
      game.rot += (target - game.rot) * Math.min(1, dt * 20);
    }

    // automatische Checkpoints im Übungsmodus (nur am Boden = sicher)
    if (game.practice && s.mode === 'cube' && s.onGround && s.time - game.lastAutoCp > 2.0) {
      placeCheckpoint(false);
    }

    // Spur-Partikel
    if (Math.random() < dt * 40) {
      const cols = PLAYER_COLORS[save.color];
      if (s.mode === 'ship') {
        particles.push({ x: s.x + 0.1, y: s.y + 0.5 + (Math.random() - 0.5) * 0.3, vx: -4 - Math.random() * 3, vy: (Math.random() - 0.5) * 2,
          life: 0.4, max: 0.4, size: 0.18, color: Math.random() < 0.5 ? '#ffb03b' : cols[1], square: false });
      } else if (s.onGround) {
        const gy = s.gs === 1 ? s.y : s.y + 1;
        particles.push({ x: s.x + 0.1, y: gy, vx: -3 - Math.random() * 2, vy: s.gs * (1 + Math.random() * 2),
          life: 0.35, max: 0.35, size: 0.12, color: cols[0], square: true });
      }
    }
  }

  // ---------------------------------------------------------------------
  // Partikel
  // ---------------------------------------------------------------------
  function burst(x, y, colors, n, speed) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.3 + Math.random());
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.7 + Math.random() * 0.5, max: 1.2,
        size: 0.12 + Math.random() * 0.22, color: colors[i % colors.length], square: true, spin: Math.random() * 10 });
    }
    particles.push({ ring: true, x, y, life: 0.5, max: 0.5, color: colors[0] });
  }
  function ring(x, y, color) { particles.push({ ring: true, x, y, life: 0.35, max: 0.35, color }); }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      if (!p.ring) {
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vx *= 1 - dt * 1.5; p.vy -= 6 * dt;
      }
    }
  }

  // ---------------------------------------------------------------------
  // Zeichnen
  // ---------------------------------------------------------------------
  let camX = 0;
  const wx = (x) => (x - camX) * TS;
  const wy = (y) => groundY - y * TS;

  function mix(hex, amt) {
    // hellt (amt > 0) oder dunkelt (amt < 0) eine Hex-Farbe auf
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const t = amt < 0 ? 0 : 255, p = Math.abs(amt);
    r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function drawBackground(colors, pulse) {
    const g = ctx.createLinearGradient(0, 0, 0, viewH);
    g.addColorStop(0, colors.bgTop);
    g.addColorStop(1, colors.bgBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, viewW, viewH);

    ctx.save();
    ctx.globalAlpha = 0.08 + pulse * 0.05;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    for (const b of bgShapes) {
      const span = 2400;
      let x = ((b.x - camX * TS * b.d) % span + span) % span - 200;
      ctx.save();
      ctx.translate(x, b.y + viewH / 2 - 270);
      ctx.rotate(b.r + time * 0.05);
      ctx.strokeRect(-b.s / 2, -b.s / 2, b.s, b.s);
      ctx.restore();
    }
    ctx.restore();
  }

  function drawGround(colors) {
    ctx.fillStyle = colors.ground;
    ctx.fillRect(0, groundY, viewW, viewH - groundY);
    const g = ctx.createLinearGradient(0, groundY, 0, groundY + 80);
    g.addColorStop(0, 'rgba(255,255,255,0.18)');
    g.addColorStop(1, 'rgba(0,0,0,0.2)');
    ctx.fillStyle = g;
    ctx.fillRect(0, groundY, viewW, viewH - groundY);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 2;
    const off = ((-camX * TS) % (TS * 4) + TS * 4) % (TS * 4);
    for (let x = off - TS * 4; x < viewW; x += TS * 4) {
      ctx.beginPath(); ctx.moveTo(x, groundY); ctx.lineTo(x, viewH); ctx.stroke();
    }
    ctx.fillStyle = colors.accent;
    ctx.shadowColor = colors.accent; ctx.shadowBlur = 14;
    ctx.fillRect(0, groundY - 1, viewW, 3);
    ctx.shadowBlur = 0;

    // Decke (nur sichtbar in Rakete / umgekehrter Schwerkraft)
    if (game.roofAlpha > 0.01) {
      const ry = wy(C.ROOF);
      ctx.globalAlpha = game.roofAlpha;
      ctx.fillStyle = colors.ground;
      ctx.fillRect(0, 0, viewW, ry);
      ctx.fillStyle = colors.accent;
      ctx.shadowColor = colors.accent; ctx.shadowBlur = 14;
      ctx.fillRect(0, ry - 2, viewW, 3);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }
  }

  function drawBlock(o, colors) {
    const x = wx(o.x), y = wy(o.y + 1);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x, y, TS, TS);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(x + 6, y + 6, TS - 12, TS - 12);
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (!o.n.up) { ctx.moveTo(x, y + 1.5); ctx.lineTo(x + TS, y + 1.5); }
    if (!o.n.down) { ctx.moveTo(x, y + TS - 1.5); ctx.lineTo(x + TS, y + TS - 1.5); }
    if (!o.n.left) { ctx.moveTo(x + 1.5, y); ctx.lineTo(x + 1.5, y + TS); }
    if (!o.n.right) { ctx.moveTo(x + TS - 1.5, y); ctx.lineTo(x + TS - 1.5, y + TS); }
    ctx.stroke();
  }

  function drawSpike(o, colors) {
    const x = wx(o.x);
    const down = o.type === 'spikeDown';
    const h = o.type === 'mini' ? TS * 0.45 : TS * 0.95;
    const base = down ? wy(o.y + 1) : wy(o.y);
    const tip = down ? base + h : base - h;
    const inset = o.type === 'mini' ? 8 : 2;
    ctx.beginPath();
    ctx.moveTo(x + inset, base);
    ctx.lineTo(x + TS / 2, tip);
    ctx.lineTo(x + TS - inset, base);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, tip, 0, base);
    g.addColorStop(0, '#000000');
    g.addColorStop(1, '#1d1d2b');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = mix(colors.accent, 0.5);
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function drawOrb(o, pulse) {
    const cx = wx(o.x + 0.5), cy = wy(o.y + 0.5);
    const used = game.state && game.state.used.has(o.id);
    const col = o.type === 'orb' ? '#ffe14a' : '#4aa8ff';
    ctx.save();
    ctx.globalAlpha = used ? 0.35 : 1;
    ctx.shadowColor = col; ctx.shadowBlur = 20;
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(cx, cy, TS * 0.32, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath(); ctx.arc(cx - 4, cy - 4, TS * 0.1, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, TS * (0.5 + pulse * 0.12), 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  function drawPad(o) {
    const cx = wx(o.x + 0.5), by = wy(o.y);
    ctx.save();
    ctx.shadowColor = '#ffe14a'; ctx.shadowBlur = 16;
    ctx.fillStyle = '#ffe14a';
    ctx.beginPath();
    ctx.ellipse(cx, by, TS * 0.42, TS * 0.2, 0, Math.PI, 0);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(255,225,74,0.25)';
    const h = (time * 2 % 1) * TS * 0.8;
    ctx.fillRect(cx - TS * 0.3, by - h, TS * 0.6, 3);
  }

  const PORTAL_STYLE = {
    ship: ['#ff5ec8', 'Rakete'], cube: ['#7dff9a', 'Würfel'],
    gravUp: ['#ffd84a', '↑'], gravDown: ['#4aa8ff', '↓'],
  };
  function drawPortal(o) {
    const cx = wx(o.x + 0.5), cy = wy(o.y + 0.5);
    const st = PORTAL_STYLE[o.type];
    ctx.save();
    ctx.shadowColor = st[0]; ctx.shadowBlur = 24;
    ctx.strokeStyle = st[0];
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.ellipse(cx, cy, TS * 0.42, TS * 1.5, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.6;
    const k = (time * 1.5) % 1;
    ctx.beginPath(); ctx.ellipse(cx, cy, TS * 0.42 * k, TS * 1.5 * k, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    ctx.textAlign = 'center';
    outlinedText(st[1], cx, cy - TS * 1.75, 14, st[0], 4);
  }

  function drawCoin(o) {
    if (game.state && game.state.coins.has(o.id)) return;
    const cx = wx(o.x + 0.5), cy = wy(o.y + 0.5) + Math.sin(time * 3 + o.x) * 3;
    const sx = Math.abs(Math.cos(time * 2.5));
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(Math.max(0.15, sx), 1);
    ctx.shadowColor = '#ffd84a'; ctx.shadowBlur = 18;
    ctx.fillStyle = '#ffd84a';
    ctx.beginPath(); ctx.arc(0, 0, TS * 0.34, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#b88a00'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, TS * 0.22, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  function drawEnd(colors) {
    const x = wx(game.level.length);
    if (x > viewW + 50) return;
    const g = ctx.createLinearGradient(x, 0, x + 160, 0);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, 160, groundY);
    ctx.fillStyle = colors.accent;
    ctx.fillRect(x - 3, 0, 4, groundY);
  }

  function drawCubeShape(size, cols) {
    const h = size / 2;
    ctx.fillStyle = cols[0];
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.rect(-h, -h, size, size); ctx.fill(); ctx.stroke();
    ctx.fillStyle = cols[1];
    const i = size * 0.2;
    ctx.fillRect(-h + i, -h + i, size - 2 * i, size - 2 * i);
    ctx.strokeRect(-h + i, -h + i, size - 2 * i, size - 2 * i);
    // Gesicht
    ctx.fillStyle = '#000';
    const e = size * 0.12;
    ctx.fillRect(-size * 0.2 - e / 2, -size * 0.12, e, e * 1.6);
    ctx.fillRect(size * 0.2 - e / 2, -size * 0.12, e, e * 1.6);
    ctx.fillRect(-size * 0.16, size * 0.14, size * 0.32, e * 0.7);
  }

  function drawPlayer() {
    const s = game.state;
    if (s.dead) return;
    drawAvatar(s.x, s.y, game.rot, s.mode, s.gs, PLAYER_COLORS[save.color], true);
  }

  function drawAvatar(x, y, rot, mode, gs, cols, glow) {
    const cx = wx(x + 0.5), cy = wy(y + 0.5);
    ctx.save();
    ctx.translate(cx, cy);
    if (glow) { ctx.shadowColor = cols[0]; ctx.shadowBlur = 16; }
    if (mode === 'cube') {
      ctx.rotate(rot);
      drawCubeShape(TS - 2, cols);
    } else {
      ctx.rotate(rot);
      if (gs === -1) ctx.scale(1, -1);
      // kleiner Würfel als Pilot
      ctx.save(); ctx.translate(-2, -8); drawCubeShape(TS * 0.5, cols); ctx.restore();
      // Raketenkörper
      ctx.fillStyle = cols[1];
      ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-TS * 0.55, -2);
      ctx.lineTo(TS * 0.55, 2);
      ctx.lineTo(TS * 0.35, TS * 0.38);
      ctx.lineTo(-TS * 0.5, TS * 0.38);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = cols[0];
      ctx.fillRect(-TS * 0.35, TS * 0.12, TS * 0.5, TS * 0.1);
    }
    ctx.restore();
  }

  function drawParticles() {
    for (const p of particles) {
      const a = Math.max(0, p.life / p.max);
      ctx.globalAlpha = a;
      if (p.ring) {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(wx(p.x), wy(p.y), TS * (0.4 + (1 - a) * 1.8), 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        const sz = p.size * TS;
        if (p.square) ctx.fillRect(wx(p.x) - sz / 2, wy(p.y) - sz / 2, sz, sz);
        else { ctx.beginPath(); ctx.arc(wx(p.x), wy(p.y), sz, 0, Math.PI * 2); ctx.fill(); }
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawCheckpoints() {
    if (!game.practice) return;
    for (const cp of game.checkpoints) {
      const cx = wx(cp.state.x + 0.5), cy = wy(cp.state.y + 0.5);
      if (cx < -20 || cx > viewW + 20) continue;
      ctx.fillStyle = '#7dff9a';
      ctx.beginPath();
      ctx.moveTo(cx, cy - 12); ctx.lineTo(cx + 9, cy); ctx.lineTo(cx, cy + 12); ctx.lineTo(cx - 9, cy);
      ctx.closePath(); ctx.fill();
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /** Text mit dicker dunkler Kontur (Arcade-Stil). */
  function outlinedText(text, x, y, size, fill, stroke) {
    ctx.font = '700 ' + size + 'px ' + FONT;
    ctx.lineJoin = 'round';
    ctx.lineWidth = stroke;
    ctx.strokeStyle = INK;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
  }

  let hudPct = 0;
  function drawHud() {
    const pct = progress();
    hudPct += (pct - hudPct) * 0.25;
    if (pct < hudPct) hudPct = pct;
    const accent = game.practice ? '#4cc9f0' : game.level.def.colors.accent;
    const w = Math.min(400, viewW * 0.4), h = 14, x = (viewW - w) / 2, y = 20;
    // Schatten + Schiene
    ctx.fillStyle = INK;
    roundRect(x - 3, y - 3 + 4, w + 6, h + 6, (h + 6) / 2); ctx.fill();
    ctx.fillStyle = '#fff8ec';
    roundRect(x - 3, y - 3, w + 6, h + 6, (h + 6) / 2); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
    // Füllung
    if (hudPct > 0.5) {
      const fw = Math.max(h, w * hudPct / 100);
      ctx.save();
      roundRect(x, y, w, h, h / 2); ctx.clip();
      ctx.fillStyle = accent;
      roundRect(x, y, fw, h, h / 2); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fillRect(x, y + h - 4, fw, 4);
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillRect(x + 4, y + 3, Math.max(0, fw - 8), 3);
      ctx.restore();
    }
    // Bestwert-Markierung
    const sv = levelSave(game.level.def.id);
    const best = game.practice ? sv.practice : sv.best;
    if (best > 0 && best < 100) {
      const bx = x + w * best / 100;
      ctx.fillStyle = '#ffe066'; ctx.strokeStyle = INK; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(bx - 6, y - 9); ctx.lineTo(bx + 6, y - 9); ctx.lineTo(bx, y - 1); ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
    // Mitspieler als farbige Punkte unter dem Balken
    if (game.race) {
      mp.players.forEach((p) => {
        const r = mp.remote[p.id];
        if (p.id === mp.me || !r) return;
        const mx = x + w * Math.min(1, Math.max(0, (r.sx !== undefined ? r.sx : r.x) / game.level.length));
        ctx.fillStyle = PLAYER_COLORS[p.color][0]; ctx.strokeStyle = INK; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(mx, y + h + 9, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      });
    }
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    outlinedText(pct + '%', x + w + 14, y + h / 2 + 1, 20, '#fff', 5);
    ctx.textAlign = 'right';
    outlinedText(game.practice ? 'Übung' : 'Versuch ' + game.attempts, x - 14, y + h / 2 + 1, 16,
      game.practice ? '#4cc9f0' : '#ffe066', 4);
    ctx.textBaseline = 'alphabetic';
  }

  function drawAttemptText() {
    if (game.practice) return;
    const x = wx(game.attemptStartX + 4);
    if (x < -400) return;
    ctx.textAlign = 'left';
    outlinedText('Versuch ' + game.attempts, x, wy(5), 46, '#fff', 8);
  }

  function render() {
    const colors = game.level ? game.level.def.colors : window.LEVELS[0].colors;
    const pulse = 1 - A.beat();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);

    if (game.scene === 'menu' || !game.state) {
      camX = time * 4;
      drawBackground(colors, pulse * pulse);
      game.roofAlpha = 0;
      drawGround(colors);
      return;
    }

    const s = game.state;
    camX = s.x - PLAYER_SCREEN_X;
    const roofTarget = (s.mode === 'ship' || s.gs === -1) ? 1 : 0;
    game.roofAlpha += (roofTarget - game.roofAlpha) * 0.08;

    ctx.save();
    if (game.shake > 0) {
      const m = game.shake * 14;
      ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
    }
    drawBackground(colors, pulse * pulse);
    drawAttemptText();
    drawGround(colors);

    // sichtbare Objekte
    const objs = game.level.objects;
    const left = camX - 3, right = camX + viewW / TS + 3;
    let lo = 0, hi = objs.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (objs[mid].x < left) lo = mid + 1; else hi = mid; }
    for (let i = lo; i < objs.length && objs[i].x <= right; i++) {
      const o = objs[i];
      switch (o.type) {
        case 'block': drawBlock(o, colors); break;
        case 'spike': case 'spikeDown': case 'mini': drawSpike(o, colors); break;
        case 'orb': case 'gorb': drawOrb(o, pulse); break;
        case 'pad': drawPad(o); break;
        case 'coin': drawCoin(o); break;
        default: drawPortal(o);
      }
    }
    drawEnd(colors);
    drawCheckpoints();
    drawParticles();
    drawGhosts();
    drawPlayer();
    ctx.restore();

    if (game.flash > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + (game.flash * 0.5) + ')';
      ctx.fillRect(0, 0, viewW, viewH);
    }
    drawHud();
    drawCountdown();
  }

  // ---------------------------------------------------------------------
  // Hauptschleife
  // ---------------------------------------------------------------------
  let last = performance.now();
  let acc = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    if (game.scene === 'play' && !game.paused && game.countdown > 0) {
      const before = Math.ceil(game.countdown);
      game.countdown -= dt;
      if (game.countdown <= 0) {
        game.countdown = 0;
        game.goFlash = 0.8;
        mp.raceStart = performance.now();
        A.playMusic(game.level.def.music, game.level.def.difficulty);
        A.sfx('portal');
      } else if (Math.ceil(game.countdown) !== before) A.sfx('checkpoint');
      acc = 0;
    } else if (game.scene === 'play' && !game.paused) {
      acc += dt;
      while (acc >= C.DT) {
        simulate(C.DT);
        acc -= C.DT;
        if (game.scene !== 'play') break;
      }
    } else {
      acc = 0;
    }
    if (game.scene === 'win') {
      game.winTimer -= dt;
      if (game.winTimer <= 0 && $('win').classList.contains('hidden') && !game.winShown) {
        game.winShown = true;
        if (game.race) mpAfterFinish(); else show('win', true);
      }
    }
    if (!game.paused) updateParticles(dt);
    game.goFlash = Math.max(0, (game.goFlash || 0) - dt);
    if (game.race) mpSendState(now);
    game.shake = Math.max(0, game.shake - dt);
    game.flash = Math.max(0, game.flash - dt * 2);
    render();
    requestAnimationFrame(frame);
  }

  buildMenu();
  A.playMenuMusic();   // startet hörbar beim ersten Klick / Tastendruck
  N.wake();            // schlafenden Mehrspieler-Server schon mal wecken
  requestAnimationFrame(frame);

  // für Tests / Einbettung
  window.NeonHop = { game, startLevel, goMenu, mp, totalScore, joinRoom: (code) => mpJoinCode(code) };
})();
