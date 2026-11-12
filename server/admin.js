// Neon Hop – Verwaltungsseite (zeigt Daten nur per textContent an)
'use strict';
(function () {
  const $ = (id) => document.getElementById(id);
  let filter = 'gemeldet';
  try { $('token').value = sessionStorage.getItem('nh-admin') || ''; } catch (e) { /* egal */ }

  function token() {
    const t = $('token').value.trim();
    try { sessionStorage.setItem('nh-admin', t); } catch (e) { /* egal */ }
    return t;
  }
  async function api(path, method) {
    const r = await fetch(path, { method: method || 'GET', headers: { 'x-admin-token': token(), 'content-type': 'application/json' }, body: method === 'POST' ? '{}' : undefined });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.message || ('Fehler ' + r.status));
    return data;
  }
  async function load() {
    $('status').textContent = 'Lade …';
    try {
      const data = await api('/api/admin/levels?filter=' + filter);
      const tb = $('list');
      tb.textContent = '';
      data.items.forEach((l) => {
        const tr = document.createElement('tr');
        if (l.hidden) tr.className = 'hidden';
        [l.name, l.author, l.plays, l.likes, l.reports, l.hidden ? 'versteckt' : 'sichtbar'].forEach((v, i) => {
          const td = document.createElement('td');
          td.textContent = String(v);
          if (i >= 2 && i <= 4) td.className = 'n';
          tr.appendChild(td);
        });
        const td = document.createElement('td');
        const toggle = document.createElement('button');
        toggle.textContent = l.hidden ? 'Zeigen' : 'Verstecken';
        toggle.className = 'ghost';
        toggle.onclick = () => act(l.id, l.hidden ? 'show' : 'hide');
        const del = document.createElement('button');
        del.textContent = 'Löschen';
        del.className = 'danger';
        del.onclick = () => { if (del.dataset.armed) act(l.id, 'delete'); else { del.dataset.armed = '1'; del.textContent = 'Sicher?'; } };
        td.append(toggle, ' ', del);
        tr.appendChild(td);
        tb.appendChild(tr);
      });
      $('status').textContent = data.items.length ? data.items.length + ' Level' : 'Keine Level in dieser Ansicht.';
    } catch (e) {
      $('status').textContent = e.message;
    }
  }
  async function act(id, what) {
    try { await api('/api/admin/levels/' + encodeURIComponent(id) + '/' + what, 'POST'); load(); } catch (e) { $('status').textContent = e.message; }
  }
  $('reported').onclick = () => { filter = 'gemeldet'; $('reported').className = ''; $('newest').className = 'ghost'; load(); };
  $('newest').onclick = () => { filter = 'neu'; $('newest').className = ''; $('reported').className = 'ghost'; load(); };
  if ($('token').value) load();
})();
