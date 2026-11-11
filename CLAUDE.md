# Projekt-Kontext

- Der Besitzer betreibt **Toki**, eine eigene Browser-Spieleseite (ähnlich wie Poki):
  https://toki-ashy.vercel.app (gehostet auf Vercel). Es gibt dort einen Dev-Account
  für das Hochladen/Verwalten von Spielen. Zugangsdaten nie im Chat oder im Repo ablegen.
- Dieses Repo enthält **Neon Hop**, einen eigenen Rhythmus-Runner (Genre wie
  „Geometry Dash“), der auf Toki veröffentlicht werden soll. Name, Grafik, Musik und
  Level sind eigenständig – keine Inhalte, Namen oder Grafiken aus Geometry Dash
  übernehmen.
- Sprache: Der Besitzer schreibt Deutsch (Schweiz); UI-Texte und Kommentare auf Deutsch.

# Technik

- Reines HTML/CSS/JS ohne Abhängigkeiten oder Build-Schritt; `index.html` lädt `js/*.js`.
- `js/engine.js` ist reine Logik (auch in Node nutzbar); Einheiten in Kacheln, fester
  Zeitschritt `C.DT = 1/240`.
- Nach jeder Änderung an Physik oder Leveln: `node tools/verify-levels.js`
  (muss für alle Level „OK“ und alle Münzen erreichbar melden).
- Mehrspieler: eigener WebSocket-Server in `server/` (Node.js + `ws`, Räume, Weiterleitung,
  Tests mit `npm test`), Verbindung im Spiel in `js/multiplayer.js`, Lobby und Rennen in
  `js/game.js` (Abschnitt „Mehrspieler“). Server-Adresse in `js/config.js`. Hosting über
  Render (`render.yaml`) oder `server/Dockerfile`; Vercel kann keine WebSockets.
  Nachrichten von Mitspielern sind nicht vertrauenswürdig: immer prüfen und nur per
  `textContent` anzeigen. Raumcode an Toki über `window.toki.room(code)`.
- Toki: Spiel wird über `toki.json` (Repo-Wurzel) beschrieben; Toki-Skript v6 im `<head>`
  (`toki.score`, `toki.room`, `toki.onHost`, `toki.onName`). Gleicher Aufbau wie im Repo
  `DasLeon08/Scam_with_your_bros`, das ebenfalls einen eigenen Render-Server nutzt.
