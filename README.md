# Neon Hop

Ein rhythmischer Hüpf-Runner für **Toki** (unsere eigene Browser-Spieleseite).
Der Würfel läuft automatisch – du springst im richtigen Moment, fliegst mit der
Rakete durch Tunnel und drehst die Schwerkraft um.

![Vorschau](assets/thumbnail.png)

## Features

- 15 Level in vier Stufen:
  - Leicht: *Erster Sprung*, *Sonnenpfad*, *Kristallhöhle*, *Erster Flug*
  - Mittel: *Neon-Himmel*, *Tiefsee*, *Vulkan*, *Polarlicht*, *Turbo-Tunnel*
  - Schwer: *Umkehr*, *Schattenwerk*, *Sternenstaub*, *Glitch*
  - Extrem: *Nachtschicht*, *Neon-Kern*
- Würfel- und Raketen-Modus, Sprungfelder, gelbe/blaue Ringe, Schwerkraft-Portale
- 3 Münzen pro Level, Bestwerte in % (Normal und Übung)
- Übungsmodus mit automatischen und manuellen Checkpoints
- Selbst erzeugte Musik und Sounds (Web Audio, keine Audiodateien): jeder Song mit
  Intro, Drop, Break und zweitem Drop, Stereo-Echo, Hall und „pumpendem“ Bass;
  schwerere Level klingen energiegeladener, dazu eine ruhige Menü-Musik
- Scroll-Menü: Level per Wischen, Mausrad, Ziehen oder Pfeiltasten durchblättern
- Mehrspieler-Rennen für bis zu 4 Spieler mit Raumcode (siehe unten)
- 6 Farben für den Würfel
- Läuft auf PC (Tastatur/Maus) und Handy/Tablet (Touch, Querformat)
- Fortschritt wird lokal im Browser gespeichert (`localStorage`)
- Keine Abhängigkeiten, kein Build-Schritt – reines HTML/CSS/JavaScript
- Arcade-Look mit der Schrift *Fredoka* (liegt in `assets/fonts/`, SIL Open Font License)

## Steuerung

| Aktion | Taste |
| --- | --- |
| Springen / Rakete hoch | Leertaste, ↑, W, Klick oder Tippen |
| Pause | Esc oder P |
| Neu starten | R |
| Checkpoint setzen / löschen (Übung) | Z / X |

Gedrückt halten = automatisch wieder springen, sobald der Würfel landet.

## Lokal starten

Einfach `index.html` im Browser öffnen, oder einen kleinen Server starten:

```bash
python3 -m http.server 8000
```

Dann <http://localhost:8000> öffnen.

## Auf Toki hochladen

Am einfachsten auf Toki **Spiel hinzufügen → Von GitHub** wählen, dieses Repository
und den Branch angeben. Alle Angaben für den Eintrag stehen in [`toki.json`](toki.json):
Titel, Beschreibung DE/EN, Steuerung, Cover, Screenshots, Mehrspieler (max. 4,
Einladungscode über `?room=`), Highscore und Version. Für ein Update `version`
erhöhen, `notes` schreiben und pushen.

Von Hand hochladen geht auch. Das Spiel ist ein statischer Ordner, hochzuladen sind:

```
index.html
js/
assets/
```

`tools/`, `server/`, `assets/promo/` und die `.md`-Dateien werden im Spiel nicht gebraucht.

Bilder für die Toki-Spielseite liegen in `assets/promo/`:

| Datei | Verwendung |
| --- | --- |
| `Neon-Hop-Titelbild.png` | Titelbild (Pixel-Art, 4:3, 1280×960) |
| `Neon-Hop-Banner.png` | Banner für die Startseite (2:1, 1600×800) |
| `Screenshot-1…4-*.png` | Screenshots unter dem Spiel (1280×720) |

Titelbild und Banner werden mit `python3 tools/promo/titelbild.py <ordner>` bzw.
`python3 tools/promo/banner.py <ordner>` erzeugt (benötigt Pillow). Als
Vorschaubild kann `assets/thumbnail.png` (1280×720) verwendet werden, als
Icon `assets/icon.svg`.

Das Spiel funktioniert auch in einem `<iframe>`:

```html
<iframe src="/games/neon-hop/index.html" allow="autoplay; fullscreen" style="border:0;width:100%;aspect-ratio:16/9"></iframe>
```

## Toki-Bestenliste

Nach jedem Tod und jedem Zieleinlauf im normalen Modus meldet das Spiel
`toki.score(punkte)`. Die Punkte sind die **Summe der Bestwerte aller Level**
(0–100 % pro Level, also bis zu 1500 Punkte für alle 15 Level). Übungsmodus zählt nicht.

## Mehrspieler

Im Menü auf **Mehrspieler** tippen, Namen eingeben und einen Raum erstellen. Der
5-stellige Code wird an Toki gemeldet (`toki.room(code)`, beim Verlassen
`toki.room(null)`), damit man Freunde über Toki einladen kann. Mitspieler treten
mit dem Code bei, oder über einen Link mit `?room=CODE` (bzw. `#room=CODE`).
Von aussen geht auch `NeonHop.joinRoom('CODE')`.

Toki-Anbindung (Toki-Skript v6 im `<head>`):

- `toki.room(code)` im Raum, `toki.room(null)` beim Verlassen: Toki zeigt „Freunde einladen“.
- `toki.onHost`: Wer auf Toki „Freunde einladen“ drückt, bevor ein Raum offen ist, bekommt sofort einen Raum.
- `toki.onName`: Der Toki-Name steht automatisch im Namensfeld, bis man selbst etwas eintippt.
- Beim Start und beim Öffnen des Mehrspieler-Fensters wird der Server schon geweckt
  (der Gratis-Plan von Render schläft sonst).

- Bis zu 4 Spieler. Der Host wählt das Level und startet. Es gibt einen Countdown 3-2-1-LOS.
- Alle spielen dasselbe Level gleichzeitig. Die anderen sieht man als halb
  durchsichtige Geister mit Namen, man kann sich also nicht stören. Auf dem
  Fortschrittsbalken sind sie als farbige Punkte zu sehen.
- Wer stirbt, startet das Level neu. Die Zeit läuft ab „LOS“.
- Einstellung „Wenn jemand im Ziel ist“:
  - **Alle spielen weiter** (Standard): Wer im Ziel ist, bekommt seinen Platz und kann
    weiterspielen oder in die Lobby gehen. Für die anderen läuft das Rennen weiter.
  - **Rennen endet**: Beim ersten Zieleinlauf geht es für alle mit der Rangliste in die Lobby.

### Mehrspieler-Server

Alle Spieler verbinden sich per WebSocket mit einem eigenen kleinen Server
(Ordner `server/`), der die Räume verwaltet und die Nachrichten weiterleitet.
Es gibt keine direkten Verbindungen zwischen den Geräten, darum funktioniert es
in jedem Netz, auch im Handy-Netz. Auf Vercel selbst geht das nicht, weil dort
keine dauerhaften WebSocket-Verbindungen möglich sind. Der Server braucht
deshalb einen eigenen Hoster.

**Einrichten auf Render.com (kostenlos):**

1. Auf [render.com](https://render.com) mit GitHub anmelden.
2. **New + → Blueprint** wählen und dieses Repository auswählen. Render liest
   `render.yaml` und legt den Dienst `neonhop-server` an.
3. `ALLOWED_ORIGINS` ist in `render.yaml` schon gesetzt: Toki-Seiten
   (`https://*.playtoki.app`, `https://playtoki.app`, `https://toki-ashy.vercel.app`).
   `*` steht für einen Namensteil. Weitere Seiten mit Komma anhängen.
4. Nach dem Deploy steht oben die Adresse, z.B. `https://neonhop-server.onrender.com`.
   Unter `/health` muss „Neon Hop Mehrspieler-Server läuft“ stehen.
5. In [`js/config.js`](js/config.js) ist `wss://neonhop-server.onrender.com` schon
   eingetragen. Falls Render eine andere Adresse vergibt, dort ändern (mit `wss://`
   statt `https://`) und pushen.

Hinweis zum Gratis-Plan von Render: Der Server schläft nach ca. 15 Minuten ohne
Spieler ein. Der erste Raum danach braucht bis zu einer Minute, das Spiel zeigt
solange „Der Mehrspieler-Server startet gerade …“. Mit einem bezahlten Plan oder
einem anderen Hoster fällt das weg. Für andere Hoster (Fly.io, Railway, eigener
Server) gibt es `server/Dockerfile`.

**Lokal testen:**

```bash
cd server && npm install && npm start
```

Dann in `js/config.js` vorübergehend `server: 'ws://localhost:8787'` eintragen.
`npm test` im Ordner `server/` prüft das Protokoll (Räume, Weiterleitung, voller
Raum, Rauswerfen, Herkunfts-Sperre).

## Level bearbeiten

Die Level stehen in [`js/levels.js`](js/levels.js), entweder als Text-Karten
(`#` Block, `^` Stachel, `o` Ring, `S` Raketen-Portal …, die Legende steht oben
in der Datei) oder zusammengesetzt aus Bausteinen wie `pillars`, `stairs`,
`padTower`, `orbChain`, `ship`, `grav` und `blue`. Die Reihenfolge im Menü
legt die Liste `ORDER` am Ende der Datei fest. Nach jeder Änderung prüfen, ob das Level noch schaffbar ist:

```bash
node tools/verify-levels.js
```

Das Skript probiert per Breitensuche alle Eingabefolgen durch (mit höchstens
30 Eingaben pro Sekunde, also menschlich machbar) und zeigt bei einem Fehler die
Stelle, an der kein Weg mehr weiterführt. Es prüft auch, ob alle Münzen
erreichbar sind.

## Aufbau

| Datei | Inhalt |
| --- | --- |
| `js/engine.js` | Physik und Kollisionen (läuft auch in Node) |
| `js/levels.js` | Level-Daten |
| `js/audio.js` | Musik-Sequenzer und Soundeffekte |
| `js/game.js` | Grafik, Eingabe, Menüs, Speicherstand, Mehrspieler-Lobby und Rennen |
| `js/multiplayer.js` | Verbindung zum Mehrspieler-Server |
| `js/config.js` | Einstellungen (Adresse des Mehrspieler-Servers) |
| `server/` | Mehrspieler-Server (Node.js, WebSocket) |
| `tools/verify-levels.js` | Prüft, ob alle Level schaffbar sind |

## Hinweis

Neon Hop ist ein eigenständiges Spiel im Genre der Rhythmus-Runner. Name,
Grafik, Musik und Level sind selbst gemacht; es verwendet keine Inhalte aus
anderen Spielen.
