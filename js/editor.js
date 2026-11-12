/*
 * Neon Hop – Level-Editor und "Meine Level".
 *
 * Eigene Level werden als Entwürfe im Browser gespeichert (Toki synchronisiert
 * localStorage auf andere Geräte). Ein Level gilt als "geschafft", wenn man es
 * im Test von Anfang an bis ins Ziel spielt; der aufgezeichnete Lauf (Replay)
 * dient später beim Veröffentlichen als Beweis und wird vom Server nachgespielt.
 */
(function () {
  'use strict';

  const NH = window.NeonHop;
  const E = window.Engine;
  const A = window.GameAudio;
  const G = NH.gfx;
  const game = NH.game;
  const $ = (id) => document.getElementById(id);
  const show = NH.show;
  const LEVELS = window.LEVELS;

  const STORE_KEY = 'neonhop.editor.v1';
  const ROWS = 10;
  const MAX_DRAFTS = 20;
  const MAX_COLS = 1000;
  const NEW_COLS = 60;
  const END_PAD = 12;
  const MIN_COLS = 30;
  const MIN_OBJECTS = 5;
  const ALLOWED = new Set(Object.keys(E.CHAR_TYPES).concat('.'));

  const TOOLS = [
    { ch: '#', name: 'Block' }, { ch: '^', name: 'Stachel' }, { ch: 'v', name: 'Hängend' },
    { ch: 'm', name: 'Kl. Stachel' }, { ch: '_', name: 'Sprungfeld' }, { ch: 'o', name: 'Ring' },
    { ch: 'b', name: 'Blauer Ring' }, { ch: 'c', name: 'Münze' }, { ch: 'S', name: 'Rakete' },
    { ch: 'C', name: 'Würfel' }, { ch: 'U', name: 'Schwerkr. ↑' }, { ch: 'D', name: 'Schwerkr. ↓' },
    { ch: 'p', name: 'Rosa Feld' }, { ch: 'r', name: 'Rosa Ring' },
    { ch: '1', name: 'Langsam' }, { ch: '2', name: 'Normal' }, { ch: '3', name: 'Schnell' }, { ch: '4', name: 'Sehr schnell' },
    { ch: 'K', name: 'Mini' }, { ch: 'N', name: 'Gross' },
    { ch: 'fx:color', name: 'Farbe', fx: 'color' }, { ch: 'fx:shake', name: 'Wackeln', fx: 'shake' },
    { ch: 'fx:flash', name: 'Blitz', fx: 'flash' }, { ch: 'fx:pulse', name: 'Puls', fx: 'pulse' },
    { ch: 'fx:zoom', name: 'Zoom', fx: 'zoom' },
    { ch: '.', name: 'Radierer', erase: true }, { ch: 'hand', name: 'Hand', hand: true },
  ];
  const FX_LOOK = {
    color: { col: '#b980ff', sym: '◐', title: 'Farbwechsel', hint: 'Wechselt ab hier zu den Farben eines anderen Levels.' },
    shake: { col: '#ff9b3b', sym: '≈', title: 'Wackeln', hint: 'Lässt den Bildschirm wackeln.' },
    flash: { col: '#ffe066', sym: '✶', title: 'Blitz', hint: 'Ein kurzer Lichtblitz in einer Farbe.' },
    pulse: { col: '#ff6fa8', sym: '◎', title: 'Puls', hint: 'Hintergrund und Objekte pulsieren stärker im Takt der Musik.' },
    zoom: { col: '#4cc9f0', sym: '⊕', title: 'Zoom', hint: 'Zoomt um die Spielfigur heran (1 = normal).' },
  };
  const FLASH_SWATCHES = ['#ffffff', '#ffe066', '#5ee6ff', '#ff5ec8', '#7dff9a', '#ff5a5a'];
  const FX_LABELS = { fade: 'Übergang (s)', power: 'Stärke', dur: 'Dauer (s)', zoom: 'Zoom' };

  // ---------------------------------------------------------------------
  // Entwürfe speichern und laden (alles wird geprüft, es kommt aus dem Speicher)
  // ---------------------------------------------------------------------
  function clampInt(v, lo, hi) {
    v = Number(v);
    return isFinite(v) ? Math.max(lo, Math.min(hi, Math.floor(v))) : lo;
  }
  function cleanText(t, max) {
    return String(t || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
  }
  function newId() {
    const b = new Uint32Array(2);
    (window.crypto || window.msCrypto).getRandomValues(b);
    return (b[0].toString(36) + b[1].toString(36)).slice(0, 12);
  }
  function emptyRows(cols) {
    const r = [];
    for (let i = 0; i < ROWS; i++) r.push('.'.repeat(cols));
    return r;
  }
  function cleanRows(rows) {
    if (!Array.isArray(rows) || rows.length !== ROWS) return null;
    let w = 0;
    rows.forEach((r) => { w = Math.max(w, String(r).length); });
    w = Math.min(MAX_COLS, Math.max(w, 1));
    return rows.map((r) => {
      const str = String(r);
      let out = '';
      for (let i = 0; i < w; i++) {
        const ch = str[i] || '.';
        out += ALLOWED.has(ch) ? ch : '.';
      }
      return out;
    });
  }
  function cleanReplay(r) {
    if (!r || typeof r !== 'object' || !Array.isArray(r.t)) return null;
    const t = r.t.filter((n) => Number.isInteger(n) && n >= 0).slice(0, 50000);
    return { h0: r.h0 === true, t };
  }
  function cleanDraft(d) {
    if (!d || typeof d !== 'object') return null;
    const rows = cleanRows(d.rows);
    if (!rows) return null;
    const verified = d.verified && typeof d.verified.hash === 'string' && cleanReplay(d.verified.replay)
      ? { hash: d.verified.hash.slice(0, 20), replay: cleanReplay(d.verified.replay) } : null;
    const published = d.published && typeof d.published.id === 'string'
      ? { id: d.published.id.slice(0, 40), hash: String(d.published.hash || '').slice(0, 20) } : null;
    return {
      id: typeof d.id === 'string' && /^[a-z0-9]{4,16}$/.test(d.id) ? d.id : newId(),
      name: cleanText(d.name, 24) || 'Mein Level',
      theme: clampInt(d.theme, 0, LEVELS.length - 1),
      music: clampInt(d.music, 0, LEVELS.length - 1),
      difficulty: clampInt(d.difficulty, 1, 4),
      rows, verified, published,
      extras: E.cleanExtras(d.extras, MAX_COLS),
      updated: clampInt(d.updated, 0, 1e14),
    };
  }
  function loadDrafts() {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { raw = null; }
    if (!raw || !Array.isArray(raw.drafts)) return [];
    return raw.drafts.slice(0, MAX_DRAFTS).map(cleanDraft).filter(Boolean);
  }
  let drafts = loadDrafts();
  let saveTimer = null;
  function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ drafts })); } catch (e) { NH.toast('Speichern nicht möglich – ist der Speicher voll?'); }
  }
  function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 400); }

  // ---------------------------------------------------------------------
  // Aus einem Entwurf das spielbare Level machen
  // ---------------------------------------------------------------------
  /** Zeilen ohne leeres Ende, dafür mit Auslauf; das ist die "offizielle" Form des Levels. */
  function canonicalRows(rows) {
    let last = -1;
    rows.forEach((r) => { for (let i = r.length - 1; i > last; i--) if (r[i] !== '.') { last = i; break; } });
    const w = Math.max(MIN_COLS, last + 1 + END_PAD);
    return rows.map((r) => (r + '.'.repeat(w)).slice(0, w));
  }
  function buildDef(d) {
    return {
      id: 'draft:' + d.id, name: d.name, difficulty: d.difficulty,
      colors: LEVELS[d.theme].colors, music: LEVELS[d.music].music,
      map: [canonicalRows(d.rows)],
      extras: E.cleanExtras(d.extras || []),
    };
  }
  /** Kurzer Fingerabdruck des Levels (ändert sich bei jeder Änderung). */
  function levelHash(d) {
    const str = canonicalRows(d.rows).join('/');
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(36);
  }
  function objectCount(d) {
    let n = 0;
    d.rows.forEach((r) => { for (let i = 0; i < r.length; i++) if (r[i] !== '.') n++; });
    return n;
  }
  /** Fingerabdruck inklusive Effekte (Effekte ändern die Physik nicht, die veröffentlichte Version aber schon). */
  function contentHash(d) {
    const str = levelHash(d) + '|' + JSON.stringify(E.cleanExtras(d.extras || []));
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(36);
  }
  function isVerified(d) { return !!(d.verified && d.verified.hash === levelHash(d)); }
  function isPublished(d) { return !!(d.published && d.published.hash === contentHash(d)); }
  /** Was noch fehlt, um zu veröffentlichen (leer = alles ok). */
  function publishProblem(d) {
    if (!cleanText(d.name, 24)) return 'Gib dem Level einen Namen.';
    if (objectCount(d) < MIN_OBJECTS) return 'Setze mindestens ' + MIN_OBJECTS + ' Objekte.';
    if (canonicalRows(d.rows)[0].length < MIN_COLS) return 'Das Level ist zu kurz.';
    if (!isVerified(d)) return 'Schaffe dein Level zuerst im Test von Anfang an bis ins Ziel.';
    return '';
  }

  // ---------------------------------------------------------------------
  // Editor-Zustand
  // ---------------------------------------------------------------------
  let cur = null;          // aktueller Entwurf
  let parsed = null;       // geparstes Level zum Zeichnen
  let tool = '#';
  let cam = -2;            // Kamera in Kacheln (linker Rand)
  let hover = null;        // Zelle unter dem Mauszeiger
  let stroke = null;       // laufender Pinselstrich (für Rückgängig)
  let pan = null;          // Verschieben mit Hand / zwei Fingern
  const undoStack = [];
  const redoStack = [];
  const touches = new Map();

  function width() { return cur.rows[0].length; }
  function maxCam() { return Math.max(0, width() + 10 - G.viewW / G.TS); }
  function setCam(x) {
    cam = Math.max(-3, Math.min(maxCam(), x));
    const range = $('edScroll');
    range.max = String(Math.ceil(maxCam() + 3));
    range.value = String(Math.round(cam + 3));
    $('edPos').textContent = 'Spalte ' + Math.max(0, Math.floor(cam + 3)) + ' von ' + width();
  }
  function reparse() {
    parsed = E.parseLevel(buildDef(cur));
    game.level = parsed;      // drawEnd() liest die Länge aus game.level
  }

  function cellOf(ev) {
    const c = document.getElementById('game');
    const r = c.getBoundingClientRect();
    const lx = (ev.clientX - r.left) * (c.width / r.width) / G.scale;
    const ly = (ev.clientY - r.top) * (c.height / r.height) / G.scale;
    return { x: Math.floor(cam + lx / G.TS), y: Math.floor((G.groundY - ly) / G.TS), lx };
  }
  function getCell(x, y) { return cur.rows[ROWS - 1 - y][x] || '.'; }
  function setCell(x, y, ch) {
    const i = ROWS - 1 - y;
    const r = cur.rows[i];
    cur.rows[i] = r.slice(0, x) + ch + r.slice(x + 1);
  }
  function ensureWidth(x) {
    if (x < width()) return true;
    if (x >= MAX_COLS) return false;
    const w = Math.min(MAX_COLS, x + 20);
    cur.rows = cur.rows.map((r) => (r + '.'.repeat(w)).slice(0, w));
    return true;
  }
  function fxAt(x, y) { return (cur.extras || []).find((e) => e.x === x && e.y === y) || null; }
  /** Trigger an einer Zelle setzen (now) oder entfernen (now = null); fürs Rückgängig merken. */
  function setFx(x, y, now, record) {
    const old = fxAt(x, y);
    cur.extras = (cur.extras || []).filter((e) => e !== old);
    if (now) cur.extras.push(now);
    cur.extras.sort((a, b) => a.x - b.x || a.y - b.y);
    if (record && stroke) stroke.push({ fx: true, x, y, old, now });
  }
  function placeFx(x, y, t) {
    if (y < 0 || y >= ROWS || x < 0 || x >= MAX_COLS) return null;
    const old = fxAt(x, y);
    if (old && old.t === t) return old;
    if ((cur.extras || []).length >= E.MAX_EXTRAS && !old) { NH.toast('Höchstens ' + E.MAX_EXTRAS + ' Effekte pro Level.'); return null; }
    const now = { x, y, t, p: E.fxDefaults(t) };
    setFx(x, y, now, true);
    return now;
  }

  /** Eine Zelle ändern und im aktuellen Strich merken. */
  function paint(x, y, ch) {
    if (y < 0 || y >= ROWS || x < 0 || !ensureWidth(x)) return;
    if (ch.indexOf('fx:') === 0) { placeFx(x, y, ch.slice(3)); return; }
    if (ch === '.' && fxAt(x, y)) { setFx(x, y, null, true); return; }   // Radierer entfernt zuerst Effekte
    const old = getCell(x, y);
    if (old === ch) return;
    setCell(x, y, ch);
    if (stroke) stroke.push({ x, y, old, ch });
    reparse();
  }
  function endStroke() {
    if (stroke && stroke.length) {
      undoStack.push(stroke);
      if (undoStack.length > 200) undoStack.shift();
      redoStack.length = 0;
      changed();
    }
    stroke = null;
  }
  function changed() {
    cur.updated = Date.now();
    reparse();
    saveSoon();
    updateUI();
  }
  function undo() {
    const st = undoStack.pop();
    if (!st) return;
    for (let i = st.length - 1; i >= 0; i--) {
      const c = st[i];
      if (c.fx) setFx(c.x, c.y, c.old, false);
      else { ensureWidth(c.x); setCell(c.x, c.y, c.old); }
    }
    redoStack.push(st);
    A.sfx('click');
    changed();
  }
  function redo() {
    const st = redoStack.pop();
    if (!st) return;
    st.forEach((c) => {
      if (c.fx) setFx(c.x, c.y, c.now, false);
      else { ensureWidth(c.x); setCell(c.x, c.y, c.ch); }
    });
    undoStack.push(st);
    A.sfx('click');
    changed();
  }

  // ---------------------------------------------------------------------
  // Oberfläche
  // ---------------------------------------------------------------------
  function updateUI() {
    if (!cur) return;
    $('edName').textContent = cur.name;
    const st = $('edState');
    st.classList.remove('ok', 'pub');
    if (isPublished(cur)) { st.textContent = 'Veröffentlicht'; st.classList.add('pub'); }
    else if (isVerified(cur)) { st.textContent = '✔ Geschafft'; st.classList.add('ok'); }
    else st.textContent = 'Noch nicht geschafft';
    $('edUndo').disabled = !undoStack.length;
    $('edRedo').disabled = !redoStack.length;
    const problem = publishProblem(cur);
    $('edPublish').disabled = !!problem || isPublished(cur);
    $('edPublish').title = isPublished(cur) ? 'Diese Version ist schon veröffentlicht' : (problem || 'Level veröffentlichen');
    document.querySelectorAll('.ed-tool').forEach((b) => b.classList.toggle('on', b.dataset.ch === tool));
    setCam(cam);
  }

  /** Kleines Symbol für die Werkzeug-Leiste. */
  function drawIcon(cv, t) {
    const s = 32, dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = s * dpr; cv.height = s * dpr;
    const c = cv.getContext('2d');
    c.scale(dpr, dpr);
    c.lineJoin = 'round';
    const ink = '#1d1442';
    const tri = (down, h) => {
      c.beginPath();
      if (down) { c.moveTo(5, 4); c.lineTo(16, 4 + h); c.lineTo(27, 4); } else { c.moveTo(5, 28); c.lineTo(16, 28 - h); c.lineTo(27, 28); }
      c.closePath(); c.fillStyle = ink; c.fill(); c.strokeStyle = '#7fd3ff'; c.lineWidth = 2; c.stroke();
    };
    const circle = (r, fill, stroke) => { c.beginPath(); c.arc(16, 16, r, 0, Math.PI * 2); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = 3; c.stroke(); } };
    const portal = (col) => { c.beginPath(); c.ellipse(16, 16, 7, 13, 0, 0, Math.PI * 2); c.strokeStyle = col; c.lineWidth = 4; c.stroke(); };
    switch (t.ch) {
      case '#': c.fillStyle = '#2a1d5c'; c.fillRect(5, 5, 22, 22); c.strokeStyle = '#7fd3ff'; c.lineWidth = 3; c.strokeRect(5, 5, 22, 22); break;
      case '^': tri(false, 22); break;
      case 'v': tri(true, 22); break;
      case 'm': tri(false, 11); break;
      case '_': c.beginPath(); c.ellipse(16, 26, 11, 6, 0, Math.PI, 0); c.fillStyle = '#ffe14a'; c.fill(); c.strokeStyle = ink; c.lineWidth = 2; c.stroke(); break;
      case 'o': circle(6, '#ffe14a'); circle(11, null, '#ffe14a'); break;
      case 'b': circle(6, '#4aa8ff'); circle(11, null, '#4aa8ff'); break;
      case 'c': circle(10, '#ffd84a', '#b88a00'); break;
      case 'S': portal('#ff5ec8'); break;
      case 'C': portal('#7dff9a'); break;
      case 'U': portal('#ffd84a'); c.fillStyle = ink; c.font = 'bold 14px sans-serif'; c.textAlign = 'center'; c.fillText('↑', 16, 21); break;
      case 'D': portal('#4aa8ff'); c.fillStyle = ink; c.font = 'bold 14px sans-serif'; c.textAlign = 'center'; c.fillText('↓', 16, 21); break;
      case 'p': c.beginPath(); c.ellipse(16, 26, 11, 5, 0, Math.PI, 0); c.fillStyle = '#ff6fd1'; c.fill(); c.strokeStyle = ink; c.lineWidth = 2; c.stroke(); break;
      case 'r': circle(6, '#ff6fd1'); circle(11, null, '#ff6fd1'); break;
      case '1': case '2': case '3': case '4': {
        const col = { 1: '#ffb03b', 2: '#5ee6ff', 3: '#7dff9a', 4: '#ff5ec8' }[t.ch];
        c.strokeStyle = col; c.lineWidth = 3; c.strokeRect(4, 3, 24, 26);
        c.lineWidth = 3; c.lineCap = 'round';
        const n = Number(t.ch), gap = 5, x0 = 16 - (n - 1) * gap / 2;
        for (let i = 0; i < n; i++) { const x = x0 + i * gap; c.beginPath(); c.moveTo(x - 3, 10); c.lineTo(x + 2, 16); c.lineTo(x - 3, 22); c.stroke(); }
        break;
      }
      case 'K': portal('#ff9b3b'); c.fillStyle = '#5ee6ff'; c.fillRect(13, 13, 6, 6); break;
      case 'N': portal('#5ee6ff'); c.fillStyle = '#5ee6ff'; c.fillRect(11, 11, 10, 10); break;
      case 'fx:color': case 'fx:shake': case 'fx:flash': case 'fx:pulse': case 'fx:zoom': {
        const look = FX_LOOK[t.fx];
        circle(12, look.col, ink);
        c.fillStyle = ink; c.font = 'bold 16px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(look.sym, 16, 17);
        break;
      }
      case '.': c.strokeStyle = '#e03a5f'; c.lineWidth = 4; c.beginPath(); c.moveTo(8, 8); c.lineTo(24, 24); c.moveTo(24, 8); c.lineTo(8, 24); c.stroke(); break;
      case 'hand': c.fillStyle = ink; c.font = '20px sans-serif'; c.textAlign = 'center'; c.fillText('✋', 16, 24); break;
      default:
    }
  }
  function buildPalette() {
    const wrap = $('edPalette');
    wrap.textContent = '';
    TOOLS.forEach((t, i) => {
      const b = document.createElement('button');
      b.className = 'ed-tool';
      b.dataset.ch = t.ch;
      b.title = t.name + (i < 10 ? ' (Taste ' + ((i + 1) % 10) + ')' : '');
      const cv = document.createElement('canvas');
      drawIcon(cv, t);
      const lb = document.createElement('span');
      lb.textContent = t.name;
      b.append(cv, lb);
      b.onclick = () => { tool = t.ch; A.sfx('click'); updateUI(); };
      wrap.appendChild(b);
    });
  }
  buildPalette();

  // ----- Einstellungen ---------------------------------------------------
  let previewing = false;
  function openSettings() {
    $('edNameInput').value = cur.name;
    renderSettings();
    show('edSettings', true);
  }
  function renderSettings() {
    const th = $('edThemes');
    th.textContent = '';
    LEVELS.forEach((l, i) => {
      const b = document.createElement('button');
      b.className = 'theme' + (cur.theme === i ? ' on' : '');
      b.style.background = 'linear-gradient(180deg,' + l.colors.bgTop + ',' + l.colors.bgBottom + ')';
      b.style.boxShadow = 'inset 0 -6px 0 ' + l.colors.accent;
      b.title = 'Farben wie „' + l.name + '“';
      b.onclick = () => { cur.theme = i; A.sfx('click'); changedSettings(); renderSettings(); };
      th.appendChild(b);
    });
    const sel = $('edMusic');
    sel.textContent = '';
    LEVELS.forEach((l, i) => {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = (i + 1) + '. ' + l.name + ' (' + l.music.bpm + ' BPM)';
      sel.appendChild(o);
    });
    sel.value = String(cur.music);
    document.querySelectorAll('#edDiff button').forEach((b) => b.classList.toggle('on', Number(b.dataset.d) === cur.difficulty));
  }
  function changedSettings() {
    cur.updated = Date.now();
    NH.setTheme({ colors: LEVELS[cur.theme].colors });
    saveSoon();
    updateUI();
  }
  function closeSettings() {
    const n = cleanText($('edNameInput').value, 24);
    if (n && n !== cur.name) { cur.name = n; changedSettings(); }
    if (previewing) { previewing = false; A.playMenuMusic(); }
    show('edSettings', false);
  }
  $('edSettingsBtn').onclick = openSettings;
  $('edSettingsDone').onclick = closeSettings;
  $('edMusic').onchange = () => { cur.music = clampInt($('edMusic').value, 0, LEVELS.length - 1); changedSettings(); if (previewing) preview(); };
  function preview() { const l = LEVELS[cur.music]; A.playMusic(l.music, l.difficulty); previewing = true; }
  $('edMusicPlay').onclick = () => { if (previewing) { previewing = false; A.playMenuMusic(); } else preview(); };
  document.querySelectorAll('#edDiff button').forEach((b) => {
    b.onclick = () => { cur.difficulty = clampInt(b.dataset.d, 1, 4); changedSettings(); renderSettings(); };
  });

  // ----- Effekt-Einstellungen -------------------------------------------
  let fxEditing = null;
  function openFx(e) {
    fxEditing = e;
    const look = FX_LOOK[e.t];
    $('edFxTitle').textContent = look.title;
    $('edFxHint').textContent = look.hint + ' (Spalte ' + e.x + ')';
    const body = $('edFxBody');
    body.textContent = '';
    Object.keys(E.FX[e.t]).forEach((k) => {
      const [lo, hi, , int] = E.FX[e.t][k];
      const row = document.createElement('div');
      row.className = 'fx-row';
      const label = document.createElement('span');
      if ((e.t === 'color' && k === 'theme') || (e.t === 'flash' && k === 'color')) {
        label.textContent = e.t === 'color' ? 'Farben wie' : 'Farbe';
        const sw = document.createElement('div');
        sw.className = 'fx-swatches';
        const n = e.t === 'color' ? LEVELS.length : FLASH_SWATCHES.length;
        for (let i = 0; i < n; i++) {
          const b = document.createElement('button');
          if (e.t === 'color') {
            b.style.background = 'linear-gradient(180deg,' + LEVELS[i].colors.bgTop + ',' + LEVELS[i].colors.bgBottom + ')';
            b.style.boxShadow = 'inset 0 -5px 0 ' + LEVELS[i].colors.accent;
            b.title = LEVELS[i].name;
          } else b.style.background = FLASH_SWATCHES[i];
          if (e.p[k] === i) b.className = 'on';
          b.onclick = () => { e.p[k] = i; fxChanged(); openFx(e); };
          sw.appendChild(b);
        }
        row.append(label, sw);
      } else {
        label.textContent = FX_LABELS[k] || k;
        const r = document.createElement('input');
        r.type = 'range'; r.min = String(lo); r.max = String(hi); r.step = int ? '1' : '0.05'; r.value = String(e.p[k]);
        const val = document.createElement('b');
        val.textContent = String(e.p[k]);
        r.oninput = () => { e.p[k] = int ? Math.round(Number(r.value)) : Math.round(Number(r.value) * 100) / 100; val.textContent = String(e.p[k]); fxChanged(); };
        row.append(label, r, val);
      }
      body.appendChild(row);
    });
    show('edFx', true);
  }
  function fxChanged() { cur.extras = E.cleanExtras(cur.extras, MAX_COLS); fxEditing = fxAt(fxEditing.x, fxEditing.y); changed(); }
  function closeFx() { fxEditing = null; show('edFx', false); }
  $('edFxDone').onclick = closeFx;
  $('edFxDel').onclick = () => {
    if (!fxEditing) return;
    stroke = [];
    setFx(fxEditing.x, fxEditing.y, null, true);
    endStroke();
    closeFx();
  };

  // ----- Editor öffnen / schliessen ------------------------------------
  function openEditor(d, keepCam) {
    cur = d;
    undoStack.length = 0;
    redoStack.length = 0;
    stroke = null; pan = null;
    if (!keepCam) cam = -2;
    reparse();
    game.scene = 'editor';
    game.state = null;
    game.roofAlpha = 0;
    requestAnimationFrame(fitGround);
    NH.setTheme({ colors: LEVELS[cur.theme].colors });
    ['menu', 'community', 'hud', 'practiceBar', 'pause', 'win'].forEach((id) => show(id, false));
    show('editor', true);
    updateUI();
  }
  function closeEditor() {
    saveNow();
    game.groundOverride = null;
    show('editor', false);
    show('edSettings', false);
    show('edFx', false);
    cur = null;
    NH.goMenu();
    openCommunity('mine');
  }
  $('edBack').onclick = closeEditor;
  $('edUndo').onclick = undo;
  $('edRedo').onclick = redo;
  $('edScroll').oninput = () => setCam(Number($('edScroll').value) - 3);
  window.addEventListener('resize', () => { if (game.scene === 'editor') requestAnimationFrame(fitGround); });

  // ----- Testen ---------------------------------------------------------
  function test(fromHere) {
    if (!cur) return;
    saveNow();
    const d = cur;
    const def = buildDef(d);
    const startX = fromHere ? Math.max(0, Math.floor(cam + 3)) : 0;
    const keep = cam;
    show('editor', false);
    game.groundOverride = null;
    NH.startCustom(def, {
      startX,
      label: 'Editor',
      onExit: (r) => {
        openEditor(d, true);
        setCam(keep);
        fitGround();
        A.playMenuMusic();
        if (r && r.won && r.fromStart && r.replay) {
          // Zur Sicherheit selbst nachspielen – genau so prüft es später der Server
          const check = E.runReplay(def, r.replay);
          if (check.won) {
            d.verified = { hash: levelHash(d), replay: { h0: r.replay.h0, t: r.replay.t } };
            saveNow();
            NH.toast('Geschafft! Jetzt kannst du dein Level veröffentlichen.');
            A.sfx('coin');
          } else {
            NH.toast('Der Lauf konnte nicht bestätigt werden. Bitte nochmal testen.');
          }
        } else if (r && r.won) {
          NH.toast('Im Ziel! Zum Veröffentlichen musst du von Anfang an spielen.');
        }
        updateUI();
      },
    });
  }
  $('edTest').onclick = () => test(false);
  $('edTestHere').onclick = () => test(true);
  $('edPublish').onclick = () => {
    if (!cur) return;
    const problem = publishProblem(cur);
    if (problem) { NH.toast(problem); return; }
    if (window.NeonCommunity && window.NeonCommunity.publish) window.NeonCommunity.publish(cur, api);
    else NH.toast('Veröffentlichen ist gerade nicht verfügbar.');
  };

  // ---------------------------------------------------------------------
  // Eingabe auf dem Spielfeld
  // ---------------------------------------------------------------------
  const canvas = document.getElementById('game');
  canvas.addEventListener('pointerdown', (ev) => {
    if (game.scene !== 'editor' || !cur) return;
    ev.preventDefault();
    try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* egal */ }
    touches.set(ev.pointerId, ev.clientX);
    const cell = cellOf(ev);
    // Verschieben: Hand-Werkzeug, mittlere Maustaste oder zwei Finger
    if (tool === 'hand' || ev.button === 1 || touches.size >= 2) {
      endStroke();
      pan = { x: ev.clientX, cam, id: ev.pointerId };
      return;
    }
    stroke = [];
    const ch = ev.button === 2 ? '.' : tool;
    stroke.ch = ch;
    stroke.start = { x: ev.clientX, y: ev.clientY };
    paint(cell.x, cell.y, ch);
  });
  canvas.addEventListener('pointermove', (ev) => {
    if (game.scene !== 'editor' || !cur) return;
    const cell = cellOf(ev);
    hover = cell;
    if (pan && ev.pointerId === pan.id) {
      const r = canvas.getBoundingClientRect();
      const dx = (ev.clientX - pan.x) * (canvas.width / r.width) / G.scale;
      setCam(pan.cam - dx / G.TS);
    } else if (stroke) {
      paint(cell.x, cell.y, stroke.ch);
    }
  });
  const pointerEnd = (ev) => {
    touches.delete(ev.pointerId);
    if (game.scene !== 'editor') return;
    if (pan && ev.pointerId === pan.id) pan = null;
    // ein einzelner Klick mit einem Effekt-Werkzeug: Einstellungen öffnen
    const single = stroke && stroke.ch && stroke.ch.indexOf('fx:') === 0 && stroke.start &&
      Math.abs(stroke.start.x - ev.clientX) < 6 && Math.abs(stroke.start.y - ev.clientY) < 6;
    const cell = single ? cellOf(ev) : null;
    endStroke();
    if (cell) { const e = fxAt(cell.x, cell.y); if (e) openFx(e); }
  };
  canvas.addEventListener('pointerup', pointerEnd);
  canvas.addEventListener('pointercancel', pointerEnd);
  canvas.addEventListener('pointerleave', () => { hover = null; });
  canvas.addEventListener('wheel', (ev) => {
    if (game.scene !== 'editor' || !cur) return;
    ev.preventDefault();
    setCam(cam + (ev.deltaY + ev.deltaX) / G.TS * 0.6);
  }, { passive: false });

  window.addEventListener('keydown', (ev) => {
    if (game.scene !== 'editor' || !cur) return;
    if (ev.target && (ev.target.tagName === 'INPUT' || ev.target.tagName === 'SELECT')) return;
    if (!$('edSettings').classList.contains('hidden')) { if (ev.code === 'Escape') closeSettings(); return; }
    if (!$('edFx').classList.contains('hidden')) { if (ev.code === 'Escape') closeFx(); return; }
    const ctrl = ev.ctrlKey || ev.metaKey;
    if (ctrl && ev.code === 'KeyZ') { ev.preventDefault(); if (ev.shiftKey) redo(); else undo(); return; }
    if (ctrl && ev.code === 'KeyY') { ev.preventDefault(); redo(); return; }
    if (ev.code === 'ArrowRight') { ev.preventDefault(); setCam(cam + 4); return; }
    if (ev.code === 'ArrowLeft') { ev.preventDefault(); setCam(cam - 4); return; }
    if (ev.code === 'KeyE') { tool = '.'; updateUI(); return; }
    if (ev.code === 'KeyH') { tool = 'hand'; updateUI(); return; }
    if (ev.code === 'Escape') { closeEditor(); return; }
    const m = /^Digit(\d)$/.exec(ev.code);
    if (m) { const i = (Number(m[1]) + 9) % 10; if (TOOLS[i]) { tool = TOOLS[i].ch; updateUI(); } }
  });
  canvas.addEventListener('contextmenu', (ev) => { if (game.scene === 'editor') ev.preventDefault(); });

  // ---------------------------------------------------------------------
  // Zeichnen (wird von game.js in der Hauptschleife aufgerufen)
  // ---------------------------------------------------------------------
  /** Boden so legen, dass alle Reihen zwischen der oberen und unteren Leiste sichtbar sind. */
  function fitGround() {
    const c = document.getElementById('game');
    const k = (G.scale / (c.width / c.getBoundingClientRect().width)) || 1;   // CSS-Pixel pro logischem Pixel
    // Boden direkt über die untere Leiste; passt nicht alles hin, wird oben etwas verdeckt
    const bottom = $('editor').querySelector('.ed-bottom').getBoundingClientRect().top / k;
    game.groundOverride = Math.round(bottom - 6);
  }

  function render() {
    if (!cur || !parsed) return;
    const ctx = G.ctx, TS = G.TS;
    G.begin();
    G.camX = cam;
    const colors = LEVELS[cur.theme].colors;
    G.drawBackground(colors, 0.3);
    game.roofAlpha = 0;
    G.drawGround(colors);
    const left = Math.floor(cam), right = Math.ceil(cam + G.viewW / TS);
    const top = G.wy(ROWS);
    // Raster
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = left; x <= right; x++) { const px = G.wx(x) + 0.5; ctx.moveTo(px, top); ctx.lineTo(px, G.groundY); }
    for (let y = 1; y <= ROWS; y++) { const py = G.wy(y) + 0.5; ctx.moveTo(G.wx(left), py); ctx.lineTo(G.wx(right), py); }
    ctx.stroke();
    // Decke der Welt
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = colors.accent;
    ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.moveTo(0, top); ctx.lineTo(G.viewW, top); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    // Bereich vor dem Start abdunkeln
    if (cam < 0) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(G.wx(-10), top, G.wx(0) - G.wx(-10), G.groundY - top); }
    ctx.restore();
    // Objekte und Ziel
    G.drawObjects(parsed, colors, 0.5);
    G.drawEnd(colors);
    // Effekt-Trigger: Abzeichen + gestrichelte Linie, ab der sie auslösen
    (cur.extras || []).forEach((e) => {
      if (e.x < left - 1 || e.x > right + 1) return;
      const look = FX_LOOK[e.t];
      const px = G.wx(e.x + 0.5), py = G.wy(e.y + 0.5);
      ctx.save();
      ctx.setLineDash([5, 6]);
      ctx.strokeStyle = look.col; ctx.globalAlpha = 0.45; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(px, top); ctx.lineTo(px, G.groundY); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.fillStyle = look.col; ctx.strokeStyle = G.INK; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(px, py, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = G.INK; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(look.sym, px, py + 1);
      ctx.restore();
    });
    // Spielfigur am Start
    ctx.save();
    ctx.globalAlpha = 0.85;
    G.drawAvatar(0, 0, 0, 'cube', 1, G.playerColors(), false);
    ctx.restore();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    G.outlinedText('Start', G.wx(0.5), G.wy(1.5), 14, '#7dff9a', 4);
    // Spaltennummern
    for (let x = Math.ceil(left / 10) * 10; x <= right; x += 10) {
      if (x < 0) continue;
      G.outlinedText(String(x), G.wx(x) + 2, G.groundY + 16, 12, '#fff', 3);
    }
    // Vorschau unter dem Mauszeiger
    if (hover && !pan && tool !== 'hand' && hover.y >= 0 && hover.y < ROWS && hover.x >= 0) {
      if (tool === '.') {
        ctx.strokeStyle = '#ff5e7e'; ctx.lineWidth = 3;
        ctx.strokeRect(G.wx(hover.x) + 2, G.wy(hover.y + 1) + 2, TS - 4, TS - 4);
      } else if (tool.indexOf('fx:') === 0) {
        const look = FX_LOOK[tool.slice(3)];
        ctx.save();
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = look.col;
        ctx.beginPath(); ctx.arc(G.wx(hover.x + 0.5), G.wy(hover.y + 0.5), 14, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      } else {
        const type = E.CHAR_TYPES[tool];
        ctx.save();
        ctx.globalAlpha = 0.55;
        G.drawObject({ type, x: hover.x, y: hover.y, n: { up: false, down: false, left: false, right: false } }, colors, 0.5);
        ctx.restore();
        ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2;
        ctx.strokeRect(G.wx(hover.x) + 1, G.wy(hover.y + 1) + 1, TS - 2, TS - 2);
      }
    }
    ctx.textBaseline = 'alphabetic';
  }

  // ---------------------------------------------------------------------
  // Community-Fenster mit "Meine Level"
  // ---------------------------------------------------------------------
  function openCommunity(tab) {
    show('community', true);
    selectTab(tab || 'find');
  }
  function selectTab(tab) {
    $('cmTabFind').classList.toggle('on', tab === 'find');
    $('cmTabMine').classList.toggle('on', tab === 'mine');
    show('cmFind', tab === 'find');
    show('cmMine', tab === 'mine');
    $('cmStatus').textContent = '';
    if (tab === 'mine') renderMine();
    else if (window.NeonCommunity && window.NeonCommunity.showFind) window.NeonCommunity.showFind();
    else $('cmFindList').innerHTML = '<div class="cm-empty">Online-Level kommen bald.</div>';
  }
  $('cmBtn').onclick = () => { A.sfx('click'); openCommunity('find'); };
  $('cmTabFind').onclick = () => selectTab('find');
  $('cmTabMine').onclick = () => selectTab('mine');
  $('cmBack').onclick = () => show('community', false);
  $('cmNew').onclick = () => {
    if (drafts.length >= MAX_DRAFTS) { $('cmStatus').textContent = 'Du hast schon ' + MAX_DRAFTS + ' Level. Lösche zuerst eins.'; return; }
    const d = {
      id: newId(), name: 'Mein Level ' + (drafts.length + 1), theme: 0, music: 0, difficulty: 1,
      rows: emptyRows(NEW_COLS), extras: [], verified: null, published: null, updated: Date.now(),
    };
    drafts.unshift(d);
    saveNow();
    A.sfx('click');
    openEditor(d);
  };

  function iconBtn(name, title, onClick, cls) {
    const b = document.createElement('button');
    b.className = 'icon-btn' + (cls ? ' ' + cls : '');
    b.title = title;
    b.setAttribute('aria-label', title);
    b.innerHTML = '<svg class="i"><use href="#i-' + name + '"/></svg>';
    b.onclick = onClick;
    return b;
  }
  function chip(text, cls) {
    const c = document.createElement('span');
    c.className = 'chip' + (cls ? ' ' + cls : '');
    c.textContent = text;
    return c;
  }
  function renderMine() {
    const list = $('cmMineList');
    list.textContent = '';
    if (!drafts.length) {
      list.innerHTML = '<div class="cm-empty">Noch keine eigenen Level. Bau dein erstes!</div>';
      return;
    }
    drafts.sort((a, b) => b.updated - a.updated);
    const arts = [];
    drafts.forEach((d) => {
      const item = document.createElement('div');
      item.className = 'cm-item';
      const cv = document.createElement('canvas');
      const info = document.createElement('div');
      info.className = 'cm-info';
      const name = document.createElement('b');
      name.textContent = d.name;
      const meta = document.createElement('div');
      meta.className = 'cm-meta';
      if (isPublished(d)) meta.appendChild(chip('Online', 'pub'));
      else if (d.published) meta.appendChild(chip('Online (ältere Version)', 'pub'));
      if (!isPublished(d)) meta.appendChild(isVerified(d) ? chip('✔ Geschafft', 'ok') : chip('Entwurf'));
      const facts = document.createElement('span');
      facts.textContent = objectCount(d) + ' Objekte · ' + canonicalRows(d.rows)[0].length + ' Spalten';
      meta.appendChild(facts);
      info.append(name, meta);
      const actions = document.createElement('div');
      actions.className = 'cm-actions';
      actions.appendChild(iconBtn('edit', 'Bearbeiten', () => openEditor(d), 'go'));
      if (d.published && window.NeonCommunity) {
        let armedOnline = false;
        const off = iconBtn('globe', 'Online entfernen', async () => {
          if (!armedOnline) {
            armedOnline = true;
            off.style.background = '#ff6b8b';
            $('cmStatus').textContent = 'Nochmal tippen, um „' + d.name + '“ aus der Online-Liste zu entfernen.';
            setTimeout(() => { armedOnline = false; off.style.background = ''; }, 3000);
            return;
          }
          try {
            await window.NeonCommunity.unpublish(d);
            $('cmStatus').textContent = '„' + d.name + '“ ist nicht mehr online.';
          } catch (e) { $('cmStatus').textContent = e.message; }
          renderMine();
        });
        actions.appendChild(off);
      }
      let armed = false;
      const del = iconBtn('trash', 'Löschen', () => {
        if (!armed) {
          armed = true;
          del.style.background = '#ff6b8b';
          $('cmStatus').textContent = 'Nochmal tippen zum Löschen von „' + d.name + '“.' +
            (d.published ? ' Die Online-Version bleibt bestehen (dafür „Online entfernen“).' : '');
          setTimeout(() => { armed = false; del.style.background = ''; }, 3000);
          return;
        }
        drafts = drafts.filter((x) => x !== d);
        saveNow();
        $('cmStatus').textContent = '„' + d.name + '“ gelöscht.';
        renderMine();
      });
      actions.appendChild(del);
      item.append(cv, info, actions);
      list.appendChild(item);
      arts.push([cv, d]);
    });
    requestAnimationFrame(() => arts.forEach(([cv, d]) => {
      const def = buildDef(d);
      NH.drawCardArt(cv, def, E.parseLevel(def));
    }));
  }

  const api = {
    render, openCommunity, openEditor, buildDef, levelHash, contentHash, canonicalRows, isVerified, saveNow,
    get drafts() { return drafts; },
    get current() { return cur; },
    refresh: updateUI,
  };
  window.NeonEditor = api;
})();
