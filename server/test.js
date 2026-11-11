/*
 * Tests für den Mehrspieler-Server:  npm test
 * Startet den Server zweimal als eigenen Prozess (einmal mit Herkunfts-Sperre)
 * und spielt das Protokoll mit echten WebSocket-Verbindungen durch.
 */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const WebSocket = require('ws');

let failed = 0;
function ok(cond, text) {
  console.log((cond ? 'OK     ' : 'FEHLER ') + text);
  if (!cond) failed++;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function startServer(port, env) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
      env: Object.assign({}, process.env, { PORT: String(port), HOST: '127.0.0.1' }, env || {}),
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    p.stdout.on('data', (d) => { if (String(d).includes('läuft')) resolve(p); });
    p.on('exit', (code) => reject(new Error('Server beendet: ' + code)));
  });
}

/** Verbindung mit Postfach: next(op) wartet auf die nächste Nachricht dieses Typs. */
function connect(port, origin) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://127.0.0.1:' + port, { origin: origin || 'http://localhost' });
    const inbox = [];
    const waiters = [];
    ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      const i = waiters.findIndex((w) => w.op === m.op);
      if (i !== -1) waiters.splice(i, 1)[0].resolve(m); else inbox.push(m);
    });
    ws.next = (op, ms) => new Promise((res, rej) => {
      const i = inbox.findIndex((m) => m.op === op);
      if (i !== -1) { res(inbox.splice(i, 1)[0]); return; }
      const w = { op, resolve: res };
      waiters.push(w);
      setTimeout(() => { const k = waiters.indexOf(w); if (k !== -1) { waiters.splice(k, 1); rej(new Error('keine Nachricht ' + op)); } }, ms || 1500);
    });
    ws.none = async (op, ms) => { try { await ws.next(op, ms || 400); return false; } catch (e) { return true; } };
    ws.sendJson = (o) => ws.send(JSON.stringify(o));
    ws.closed = new Promise((r) => ws.on('close', (code) => r(code)));
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

(async () => {
  const port = 18787;
  const srv = await startServer(port);
  try {
    // Raum erstellen
    const host = await connect(port);
    host.sendJson({ op: 'host' });
    const hosted = await host.next('hosted');
    ok(/^[A-HJ-NP-Z2-9]{5}$/.test(hosted.code), 'Raum erstellt, Code ' + hosted.code);

    // Falscher Code
    const lost = await connect(port);
    lost.sendJson({ op: 'join', code: 'ZZZZZ' });
    ok((await lost.next('error')).reason === 'not-found', 'falscher Code -> not-found');

    // Drei Gäste treten bei (Code klein geschrieben geht auch)
    const g = [];
    for (let i = 0; i < 3; i++) {
      const c = await connect(port);
      c.sendJson({ op: 'join', code: hosted.code.toLowerCase() });
      const j = await c.next('joined');
      c.id = j.id;
      g.push(c);
      ok((await host.next('guest-joined')).id === j.id, 'Gast ' + (i + 1) + ' beigetreten, Host benachrichtigt');
    }
    // Vierter Gast: voll
    const extra = await connect(port);
    extra.sendJson({ op: 'join', code: hosted.code });
    ok((await extra.next('error')).reason === 'full', 'fünfter Spieler -> full');

    // Host an alle ausser Gast 1
    host.sendJson({ op: 'send', data: { t: 'hallo' }, except: g[0].id });
    ok((await g[1].next('msg')).data.t === 'hallo' && (await g[2].next('msg')).from === hosted.id, 'Host-Nachricht an alle angekommen');
    ok(await g[0].none('msg'), 'ausgenommener Gast bekommt nichts');
    // Host an einen
    host.sendJson({ op: 'send', to: g[2].id, data: { t: 'nur-du' } });
    ok((await g[2].next('msg')).data.t === 'nur-du' && await g[1].none('msg'), 'Nachricht an einen einzelnen Gast');
    // Gast an Host (nur Host bekommt sie)
    g[1].sendJson({ op: 'send', data: { t: 's', x: 1 } });
    const fromGuest = await host.next('msg');
    ok(fromGuest.from === g[1].id && fromGuest.data.x === 1, 'Gast-Nachricht beim Host mit richtigem Absender');
    ok(await g[0].none('msg'), 'andere Gäste bekommen Gast-Nachrichten nicht direkt');
    // Gast darf nicht rauswerfen
    g[0].sendJson({ op: 'kick', id: g[1].id });
    ok(await g[1].none('kicked'), 'Gast kann niemanden rauswerfen');

    // Kaputte Nachricht wird ignoriert, Verbindung bleibt
    g[0].send('kein json {');
    g[0].sendJson({ op: 'ping' });
    ok((await g[0].next('pong')).op === 'pong', 'kaputte Nachricht ignoriert, Verbindung lebt');
    // Zu grosse Nachricht trennt die Verbindung
    const big = await connect(port);
    big.send('x'.repeat(10000));
    ok((await big.closed) === 1009, 'zu grosse Nachricht -> Verbindung getrennt');

    // Rauswerfen
    host.sendJson({ op: 'kick', id: g[2].id });
    ok((await g[2].next('kicked')).op === 'kicked', 'Host wirft Gast raus');
    ok((await host.next('guest-left')).id === g[2].id, 'Host erfährt, dass der Gast weg ist');
    // Gast geht
    g[1].close();
    ok((await host.next('guest-left')).id === g[1].id, 'Gast verlässt Raum -> guest-left');
    // Host geht -> verbleibende Gäste werden informiert, Raum verschwindet
    host.close();
    ok((await g[0].next('host-left')).op === 'host-left', 'Host weg -> host-left beim Gast');
    await wait(100);
    const late = await connect(port);
    late.sendJson({ op: 'join', code: hosted.code });
    ok((await late.next('error')).reason === 'not-found', 'Raum ist danach geschlossen');
    [lost, extra, late, g[0]].forEach((c) => c.close());
  } finally {
    srv.kill();
  }

  // Herkunfts-Sperre
  const port2 = 18788;
  const srv2 = await startServer(port2, { ALLOWED_ORIGINS: 'https://toki.example,https://*.playtoki.app' });
  try {
    let blocked = false;
    try { await connect(port2, 'https://boese.example'); } catch (e) { blocked = true; }
    ok(blocked, 'fremde Seite wird abgewiesen');
    const allowed = await connect(port2, 'https://toki.example');
    ok(allowed.readyState === 1, 'erlaubte Seite kommt rein');
    allowed.close();
    const sub = await connect(port2, 'https://neon-hop.playtoki.app');
    ok(sub.readyState === 1, 'Platzhalter: https://neon-hop.playtoki.app erlaubt');
    sub.close();
    let fake = false;
    try { await connect(port2, 'https://neon-hop.playtoki.app.boese.example'); } catch (e) { fake = true; }
    ok(fake, 'Platzhalter lässt keine nachgemachte Domain durch');
    let bare = false;
    try { await connect(port2, 'https://playtoki.app'); } catch (e) { bare = true; }
    ok(bare, 'nicht eingetragene Hauptdomain bleibt gesperrt');
  } finally {
    srv2.kill();
  }

  console.log(failed ? failed + ' Test(s) fehlgeschlagen' : 'Alle Tests bestanden');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
