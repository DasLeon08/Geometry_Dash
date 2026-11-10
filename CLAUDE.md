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
