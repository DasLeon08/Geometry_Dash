/*
 * Neon Hop – Online-Level: Entdecken, Spielen, Liken, Melden, Veröffentlichen.
 *
 * Spricht mit der Level-API des eigenen Servers (gleiche Adresse wie der
 * Mehrspieler-Server aus js/config.js, nur mit https:// statt wss://).
 * Alle Texte von anderen Spielern werden nur per textContent angezeigt.
 */
(function () {
  'use strict';

  const NH = window.NeonHop;
  const E = window.Engine;
  const A = window.GameAudio;
  const ED = window.NeonEditor;
  const LEVELS = window.LEVELS;
  const $ = (id) => document.getElementById(id);
  const DIFF = ['', 'Leicht', 'Mittel', 'Schwer', 'Extrem'];
  const KEYS = 'neonhop.keys.v1';
  const LIKES = 'neonhop.likes.v1';

  // ---------------------------------------------------------------------
  // Server-Adresse und eigene (geheime) Schlüssel
  // ---------------------------------------------------------------------
  function apiBase() {
    const cfg = window.NEONHOP_CONFIG || {};
    const url = String(window.NEONHOP_SERVER || cfg.server || '').trim();
    if (!url) return '';
    return url.replace(/^ws(s?):\/\//, 'http$1://').replace(/\/+$/, '');
  }
  function randomKey() {
    const b = new Uint8Array(24);
    (window.crypto || window.msCrypto).getRandomValues(b);
    return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  }
  /** Autor-Schlüssel (zum Löschen eigener Level) und Wähler-Schlüssel (Likes/Meldungen). */
  function keys() {
    let k = null;
    try { k = JSON.parse(localStorage.getItem(KEYS)); } catch (e) { k = null; }
    const valid = (x) => typeof x === 'string' && /^[a-f0-9]{48}$/.test(x);
    if (!k || !valid(k.author) || !valid(k.voter)) {
      k = { author: randomKey(), voter: randomKey() };
      try { localStorage.setItem(KEYS, JSON.stringify(k)); } catch (e) { /* egal */ }
    }
    return k;
  }
  function likedSet() {
    try { const a = JSON.parse(localStorage.getItem(LIKES)); return new Set(Array.isArray(a) ? a.filter((x) => typeof x === 'string').slice(0, 500) : []); } catch (e) { return new Set(); }
  }
  function saveLiked(set) { try { localStorage.setItem(LIKES, JSON.stringify([...set].slice(-500))); } catch (e) { /* egal */ } }

  async function api(path, method, body) {
    const base = apiBase();
    if (!base) throw new Error('Der Server für Online-Level ist noch nicht eingerichtet.');
    let res;
    try {
      res = await fetch(base + path, {
        method: method || 'GET',
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        cache: 'no-store',
      });
    } catch (e) {
      throw new Error('Keine Verbindung zum Server. Bitte Internet prüfen.');
    }
    let data = {};
    try { data = await res.json(); } catch (e) { data = {}; }
    if (!res.ok) throw new Error(data.message || 'Der Server hat einen Fehler gemeldet (' + res.status + ').');
    return data;
  }

  /** Online-Level (vom Server, also nicht vertrauenswürdig) in ein spielbares Level umwandeln. */
  function toDef(l) {
    const theme = Math.max(0, Math.min(LEVELS.length - 1, Number(l.theme) | 0));
    const music = Math.max(0, Math.min(LEVELS.length - 1, Number(l.music) | 0));
    return {
      id: 'online:' + String(l.id).replace(/[^a-z0-9]/g, '').slice(0, 12),
      name: String(l.name || 'Level').slice(0, 24),
      difficulty: Math.max(1, Math.min(4, Number(l.difficulty) | 0)),
      colors: LEVELS[theme].colors, music: LEVELS[music].music,
      map: [l.rows],
      extras: E.cleanExtras(l.extras || [], l.rows[0].length),
    };
  }
  function validRows(rows) {
    return Array.isArray(rows) && rows.length === 10 && rows.every((r) => typeof r === 'string' && r.length === rows[0].length && r.length <= 1012) &&
      rows.every((r) => [...r].every((ch) => ch === '.' || E.CHAR_TYPES[ch]));
  }

  // ---------------------------------------------------------------------
  // Entdecken
  // ---------------------------------------------------------------------
  const view = { sort: 'neu', q: '', page: 1, pages: 1, loading: false };
  let searchTimer = null;

  function status(text, error) {
    const s = $('cmStatus');
    s.textContent = text || '';
    s.classList.toggle('error', !!error);
  }
  function empty(text) {
    const list = $('cmFindList');
    list.textContent = '';
    const d = document.createElement('div');
    d.className = 'cm-empty';
    d.textContent = text;
    list.appendChild(d);
  }
  function chip(text, cls) {
    const c = document.createElement('span');
    c.className = 'chip' + (cls ? ' ' + cls : '');
    c.textContent = text;
    return c;
  }
  function iconBtn(name, title, onClick, cls) {
    const b = document.createElement('button');
    b.className = 'icon-btn' + (cls ? ' ' + cls : '');
    b.title = title;
    b.setAttribute('aria-label', title);
    b.innerHTML = '<svg class="i"><use href="#i-' + name + '"/></svg>';
    b.onclick = onClick;
    return b;
  }

  async function load() {
    if (view.loading) return;
    view.loading = true;
    status('');
    empty('Lade Level …');
    const slow = setTimeout(() => empty('Der Server startet gerade, einen Moment …'), 3500);
    try {
      const data = await api('/api/levels?sort=' + view.sort + '&q=' + encodeURIComponent(view.q) + '&seite=' + view.page);
      view.pages = Math.max(1, Number(data.pages) || 1);
      render(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      empty(e.message);
    } finally {
      clearTimeout(slow);
      view.loading = false;
      $('cmPage').textContent = 'Seite ' + view.page + ' von ' + view.pages;
      $('cmPrev').disabled = view.page <= 1;
      $('cmNext').disabled = view.page >= view.pages;
    }
  }

  function render(items) {
    const list = $('cmFindList');
    list.textContent = '';
    const good = items.filter((l) => l && typeof l.id === 'string' && validRows(l.rows));
    if (!good.length) { empty(view.q ? 'Nichts gefunden.' : 'Noch keine Level online. Bau das erste!'); return; }
    const liked = likedSet();
    const arts = [];
    good.forEach((l) => {
      const def = toDef(l);
      const item = document.createElement('div');
      item.className = 'cm-item';
      const cv = document.createElement('canvas');
      const info = document.createElement('div');
      info.className = 'cm-info';
      const name = document.createElement('b');
      name.textContent = def.name;
      const meta = document.createElement('div');
      meta.className = 'cm-meta';
      const by = document.createElement('span');
      by.textContent = 'von ' + String(l.author || 'Spieler').slice(0, 16);
      meta.append(chip(DIFF[def.difficulty]), by);
      const stats = document.createElement('span');
      const best = NH.save.levels[def.id] ? NH.save.levels[def.id].best : 0;
      stats.textContent = '♥ ' + (Number(l.likes) || 0) + ' · ▶ ' + (Number(l.plays) || 0) + (best ? ' · dein Bestwert ' + best + '%' : '');
      meta.appendChild(stats);
      if (best >= 100) meta.appendChild(chip('✔ Geschafft', 'ok'));
      info.append(name, meta);
      const actions = document.createElement('div');
      actions.className = 'cm-actions';
      actions.appendChild(iconBtn('play', 'Spielen', () => play(l), 'go'));
      const heart = iconBtn('heart', liked.has(l.id) ? 'Gefällt dir (nochmal tippen zum Entfernen)' : 'Gefällt mir', () => like(l, heart, stats));
      if (liked.has(l.id)) heart.style.color = '#ff6fa8';
      actions.appendChild(heart);
      let armed = false;
      const flag = iconBtn('flagx', 'Melden (unpassend oder kaputt)', async () => {
        if (!armed) {
          armed = true;
          flag.style.background = '#ff8aa8';
          status('Nochmal tippen, um „' + def.name + '“ zu melden.');
          setTimeout(() => { armed = false; flag.style.background = ''; }, 3000);
          return;
        }
        try {
          await api('/api/levels/' + encodeURIComponent(l.id) + '/report', 'POST', { voterKey: keys().voter });
          status('Danke! Das Level wurde gemeldet.');
          flag.disabled = true;
        } catch (e) { status(e.message, true); }
      });
      actions.appendChild(flag);
      item.append(cv, info, actions);
      list.appendChild(item);
      arts.push([cv, def]);
    });
    requestAnimationFrame(() => arts.forEach(([cv, def]) => NH.drawCardArt(cv, def, E.parseLevel(def))));
  }

  async function like(l, btn, stats) {
    try {
      const r = await api('/api/levels/' + encodeURIComponent(l.id) + '/like', 'POST', { voterKey: keys().voter });
      const set = likedSet();
      if (r.liked) set.add(l.id); else set.delete(l.id);
      saveLiked(set);
      btn.style.color = r.liked ? '#ff6fa8' : '';
      l.likes = r.likes;
      stats.textContent = stats.textContent.replace(/^♥ \d+/, '♥ ' + r.likes);
      A.sfx(r.liked ? 'coin' : 'click');
    } catch (e) { status(e.message, true); }
  }

  function play(l) {
    const def = toDef(l);
    A.sfx('click');
    api('/api/levels/' + encodeURIComponent(l.id) + '/play', 'POST', {}).catch(() => {});
    $('community').classList.add('hidden');
    NH.startCustom(def, {
      label: 'Community',
      onExit: (r) => {
        NH.goMenu();
        ED.openCommunity('find');
        if (r && r.won) NH.toast('Geschafft! „' + def.name + '“ von ' + String(l.author || 'Spieler').slice(0, 16));
      },
    });
  }

  function showFind() { load(); }

  $('cmSort').querySelectorAll('button').forEach((b) => {
    b.onclick = () => {
      view.sort = b.dataset.sort;
      view.page = 1;
      $('cmSort').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      load();
    };
  });
  $('cmSearch').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { view.q = $('cmSearch').value.trim().slice(0, 30); view.page = 1; load(); }, 350);
  });
  $('cmPrev').onclick = () => { if (view.page > 1) { view.page--; load(); } };
  $('cmNext').onclick = () => { if (view.page < view.pages) { view.page++; load(); } };

  // ---------------------------------------------------------------------
  // Veröffentlichen (aus dem Editor) und eigenes Online-Level entfernen
  // ---------------------------------------------------------------------
  let publishing = false;
  async function publish(draft) {
    if (publishing) return;
    publishing = true;
    $('edPublish').disabled = true;
    NH.toast('Wird veröffentlicht …');
    try {
      const rows = ED.canonicalRows(draft.rows);
      const r = await api('/api/levels', 'POST', {
        name: draft.name, author: NH.save.name || 'Spieler', theme: draft.theme, music: draft.music,
        difficulty: draft.difficulty, rows, replay: draft.verified.replay, authorKey: keys().author,
        extras: E.cleanExtras(draft.extras || [], rows[0].length),
      });
      draft.published = { id: String(r.id).slice(0, 40), hash: ED.contentHash(draft) };
      ED.saveNow();
      NH.toast(r.duplicate ? 'Dieses Level ist schon online.' : 'Veröffentlicht! Jetzt können alle „' + draft.name + '“ spielen.');
      A.sfx('win');
    } catch (e) {
      NH.toast(e.message);
    } finally {
      publishing = false;
      ED.refresh();
    }
  }
  async function unpublish(draft) {
    if (!draft.published) return;
    try {
      await api('/api/levels/' + encodeURIComponent(draft.published.id) + '/delete', 'POST', { authorKey: keys().author });
    } catch (e) {
      if (!/gibt es nicht/.test(e.message)) throw e;   // schon weg: auch gut
    }
    draft.published = null;
    ED.saveNow();
  }

  // Server früh wecken, wenn das Community-Fenster aufgeht
  $('cmBtn').addEventListener('click', () => {
    const base = apiBase();
    if (base) fetch(base + '/health', { mode: 'no-cors', cache: 'no-store' }).catch(() => {});
  });

  window.NeonCommunity = { showFind, publish, unpublish, apiBase };
})();
