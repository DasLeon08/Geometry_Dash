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
  const FONT = '"Segoe UI", "SF Pro Rounded", "Nunito", "Trebuchet MS", system-ui, sans-serif';

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
    const data = { levels: {}, color: 0, muted: false };
    if (!raw || typeof raw !== 'object') return data;
    data.color = clampInt(raw.color, PLAYER_COLORS.length - 1);
    data.muted = raw.muted === true;
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
    } else if (game.scene === 'win' && (e.code === 'Space' || e.code === 'Enter')) {
      e.preventDefault();
      document.getElementById('againBtn').click();
    }
  });
  window.addEventListener('keyup', (e) => { keysDown.delete(e.code); setHeld(); });
  window.addEventListener('blur', () => { keysDown.clear(); pointers = 0; setHeld(); if (game.scene === 'play' && !game.paused) togglePause(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.scene === 'play' && !game.paused) togglePause();
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

  const DIFF_NAMES = ['', 'Leicht', 'Mittel', 'Schwer'];
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

  function buildMenu() {
    const wrap = $('levels');
    wrap.innerHTML = '';
    const arts = [];
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
    requestAnimationFrame(() => arts.forEach((a) => drawCardArt(a[0], a[1], a[2])));

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
    game.scene = 'menu';
    game.paused = false;
    A.stopMusic(true);
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
      A.stopMusic(true);
    } else {
      blurActive();
      if (!game.practice) restartAttempt(); else A.playMusic(game.level.def.music);
    }
  }

  $('pauseBtn').onclick = () => { blurActive(); togglePause(); };
  $('resumeBtn').onclick = () => togglePause();
  $('restartBtn').onclick = () => { game.paused = false; show('pause', false); blurActive(); restartLevel(); };
  $('togglePracticeBtn').onclick = () => { show('pause', false); blurActive(); startLevel(game.levelIndex, !game.practice); };
  $('menuBtn').onclick = goMenu;
  $('winMenuBtn').onclick = goMenu;
  $('againBtn').onclick = () => { blurActive(); startLevel(game.levelIndex, game.practice); };
  $('nextBtn').onclick = () => { blurActive(); startLevel((game.levelIndex + 1) % window.LEVELS.length, false); };
  $('cpAdd').addEventListener('pointerdown', (e) => { e.stopPropagation(); placeCheckpoint(true); });
  $('cpDel').addEventListener('pointerdown', (e) => { e.stopPropagation(); removeCheckpoint(); });

  // ---------------------------------------------------------------------
  // Spielablauf
  // ---------------------------------------------------------------------
  function startLevel(index, practice) {
    A.unlock();
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
    A.playMusic(game.level.def.music);
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

  function onDeath() {
    const s = game.state;
    A.sfx('die');
    A.stopMusic(false);
    game.deathTimer = 1.0;
    game.shake = 0.35;
    burst(s.x + 0.5, s.y + 0.5, PLAYER_COLORS[save.color], 36, 9);
    const pct = progress();
    const sv = levelSave(game.level.def.id);
    if (game.practice) sv.practice = Math.max(sv.practice, pct);
    else sv.best = Math.max(sv.best, pct);
    writeSave();
  }

  function onWin() {
    const s = game.state;
    A.stopMusic(true);
    A.sfx('win');
    game.scene = 'win';
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
      else if (ev === 'win') onWin();
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
    ctx.fillStyle = st[0];
    ctx.font = '800 13px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText(st[1], cx, cy - TS * 1.75);
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
    const cols = PLAYER_COLORS[save.color];
    const cx = wx(s.x + 0.5), cy = wy(s.y + 0.5);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.shadowColor = cols[0]; ctx.shadowBlur = 16;
    if (s.mode === 'cube') {
      ctx.rotate(game.rot);
      drawCubeShape(TS - 2, cols);
    } else {
      ctx.rotate(game.rot);
      if (s.gs === -1) ctx.scale(1, -1);
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

  let hudPct = 0;
  function drawHud() {
    const pct = progress();
    hudPct += (pct - hudPct) * 0.25;
    if (pct < hudPct) hudPct = pct;
    const accent = game.practice ? '#8fd3ff' : game.level.def.colors.accent;
    const w = Math.min(420, viewW * 0.42), h = 8, x = (viewW - w) / 2, y = 24;
    // Schiene
    ctx.fillStyle = 'rgba(5,7,24,0.55)';
    roundRect(x - 4, y - 4, w + 8, h + 8, (h + 8) / 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1; ctx.stroke();
    // Füllung
    const fw = Math.max(h, w * hudPct / 100);
    const g = ctx.createLinearGradient(x, 0, x + fw, 0);
    g.addColorStop(0, accent); g.addColorStop(1, '#ffffff');
    ctx.save();
    ctx.shadowColor = accent; ctx.shadowBlur = 12;
    ctx.fillStyle = g;
    roundRect(x, y, fw, h, h / 2); ctx.fill();
    ctx.restore();
    // Bestwert-Markierung
    const sv = levelSave(game.level.def.id);
    const best = game.practice ? sv.practice : sv.best;
    if (best > 0 && best < 100) {
      const bx = x + w * best / 100;
      ctx.fillStyle = '#ffd84a';
      ctx.fillRect(bx - 1, y - 5, 2, h + 10);
    }
    // Prozent
    ctx.font = '900 15px ' + FONT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(pct + '%', x + w + 14, y + h / 2 + 1);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '800 13px ' + FONT;
    ctx.fillText(game.practice ? 'Übung' : 'Versuch ' + game.attempts, x - 16, y + h / 2 + 1);
    ctx.textBaseline = 'alphabetic';
  }

  function drawAttemptText() {
    if (game.practice) return;
    const x = wx(game.attemptStartX + 4);
    if (x < -400) return;
    ctx.font = '900 44px ' + FONT;
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillText('Versuch ' + game.attempts, x, wy(5));
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
    drawPlayer();
    ctx.restore();

    if (game.flash > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + (game.flash * 0.5) + ')';
      ctx.fillRect(0, 0, viewW, viewH);
    }
    drawHud();
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
    if (game.scene === 'play' && !game.paused) {
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
      if (game.winTimer <= 0 && $('win').classList.contains('hidden')) show('win', true);
    }
    if (!game.paused) updateParticles(dt);
    game.shake = Math.max(0, game.shake - dt);
    game.flash = Math.max(0, game.flash - dt * 2);
    render();
    requestAnimationFrame(frame);
  }

  buildMenu();
  requestAnimationFrame(frame);

  // für Tests / Einbettung
  window.NeonHop = { game, startLevel, goMenu };
})();
