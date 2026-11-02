# Agent Town

A top-down pixel town where each bot is a character. Open the page on a computer, phone, or iPad and everyone sees the same town.

## Run locally

```bash
node server.js
```

Then open the URL it prints (by default <http://localhost:8080>). If that port is taken, the server tries the next one and prints the real URL. Override it with `PORT=9000 node server.js`.

The server listens on `127.0.0.1` only, so other devices cannot connect. For a phone or iPad on the same home network, run `HOST=0.0.0.0 node server.js` (or `HOST=0.0.0.0 PORT=9000 node server.js`) and open `http://<computer-LAN-IP>:PORT` — the printed lines include that address.

The page is plain HTML, CSS, and classic JavaScript (no `type="module"`). Scripts share one `window.AgentTown` namespace and load from `index.html` in order. There is no install step and no build. `js/model.js` is the shared event merge: the browser attaches it to `window.AgentTown`, and Node loads it with `require("./js/model.js")`.

`server.js` serves the town, watches `feed/`, and pushes updates to every open browser on `GET /events` (server-sent events).

## Event format

Bots write status into `feed/` as `.json` or `.jsonl`. A `.json` file can be one event, an array of events, or `{"events":[...]}`. A `.jsonl` file is one event per line. Appending a line updates the town.

```json
{
  "ts": "2026-11-01T20:15:00.000Z",
  "botId": "budget-bot",
  "state": "working",
  "task": "Updating the monthly sheet",
  "text": "Reconciling October budget",
  "needsAlex": null
}
```

| Field | Meaning |
| --- | --- |
| `ts` | ISO timestamp. Newest event per bot wins. |
| `botId` | `id` from `data/bots.json`. |
| `state` | `idle`, `walking`, `working`, `waiting`, `blocked`, or `done`. |
| `task` | Full task line shown in the tap panel. No secrets or personal data. |
| `text` | Short task description for the working bubble, about 40 characters. `summary` is an alias. If both are missing, `task` is used and cut to 40 characters. |
| `needsAlex` | `urgent`, `question`, or `null`. Omit it and the flag clears. |
| `handoffTo` | Optional bot id that receives an item. |
| `item` | Optional short label for the thing being passed. |
| `with` | Optional list of other bot ids working together. |
| `collabId` | Optional shared id. Bots with the same `collabId`, or the same task, meet at the Workshop. |
| `collabEnd` | `true` sends that bot home. `idle`, `done`, or an event with no `with` also ends the collaboration. |

`urgent` shows an ! bubble (red if the bot is also blocked). `question` shows a ? bubble. `working` shows the short description (`text`, `summary`, or a trimmed `task`) and falls back to animated dots when that line is empty. `idle` shows zzz, `done` shows a check, and `blocked` shows a red bubble.

```json
{"ts":"2026-11-01T20:15:30.000Z","botId":"budget-bot","state":"working","task":"Updating the monthly sheet","text":"Reconciling October budget","needsAlex":null}
```

Handoff example:

```json
{"ts":"2026-11-01T20:16:00.000Z","botId":"concept-art-bot","state":"done","task":"Passed the color script","text":"Passed the color script","needsAlex":null,"handoffTo":"cutscene-bot","item":"color script"}
```

The sender and receiver walk to the Workshop, stand side by side, and a scroll or box passes between them. A bubble shows the item name. When the handoff finishes, each bot walks home.

Workshop collaboration example:

```json
{"ts":"2026-11-01T20:17:00.000Z","botId":"game-design-document-bot","state":"working","task":"Drafting the level 3 cutscene with the crew","text":"Drafting level 3 cutscene","needsAlex":null,"with":["cutscene-bot","concept-art-bot"],"collabId":"level-3-cutscene"}
```

Bots named in `with`, bots that share a `collabId`, and bots that share the same task walk to the Workshop, stand in a row, and use the working animation plus the short description bubble. `collabEnd: true`, a later event without `with`, or state `done` / `idle` sends each one home.

```bash
echo '{"ts":"2026-11-01T20:16:00.000Z","botId":"help-bot","state":"waiting","task":"Need a decision on the menu","needsAlex":"question"}' >> feed/help.jsonl
```

`data/bots.json` is the roster Alex edits: `id`, `name`, `role`, `home`, `color`, and `driveFolderUrl`. Homes are `townhall`, `workshop`, `studio`, `bank`, `library`, `tavern`, `post` (the Post Office), and `house`. `driveFolderUrl` is a `https://drive.google.com/` folder link, or `""` when Alex has not set one yet. Each bot has a treasure chest beside its home spot. An unlocked chest opens that folder in a new tab. A locked chest stays grey, shows a padlock, and the label "no Drive folder yet". Locked chests are listed in `CHESTS_TO_DISCUSS.md`. `data/events.json` is the sample snapshot loaded at startup.

Opening `index.html` as a `file://` URL cannot `fetch` those JSON files (Chrome blocks it). `data/fallback-data.js` is a generated classic script, `window.AgentTownFallback = { bots, events }`, with the same content. `index.html` loads it before the app. If `data/bots.json` or `data/events.json` fails to load, DEMO mode uses that fallback. Regenerate it after editing the JSON:

```bash
node sync-data.js
```

`node server.js` and `node export-static.js` rewrite `data/fallback-data.js` when they start, so the script stays in step with the two JSON files. Edit `data/bots.json` and `data/events.json`, not the generated script.

## If the live server is not available

1. The page connects to `/events` when this server is running (**LIVE**).
2. Otherwise it polls `data/status.json` every 10 seconds (**POLLING**).
3. If that file is missing too, it runs **DEMO MODE**: sample bots walk, work, hand off, raise ! and ? bubbles, and gather at the Workshop (Game Design Document Bot, Cutscene Bot, and Concept Art Bot). A yellow badge and a note say it is sample activity.

Add `?demo=1` to force that labeled DEMO mode even when `/events` or `data/status.json` is available (for example <http://localhost:8080/?demo=1>, or `index.html?demo=1` opened as a file). Opening `index.html` directly from disk (`file:///.../index.html`) also runs DEMO mode. The sample roster and events come from `data/fallback-data.js`, because the browser will not `fetch` JSON from `file://`. `export-static.js` does not write `data/status.json` next to the project `index.html`.

Build a self-contained static site with:

```bash
node export-static.js
```

That copies `index.html`, `style.css`, `js/`, `data/bots.json`, `data/events.json`, and `data/fallback-data.js` into `dist/`, and writes `dist/data/status.json` from the roster, `data/events.json`, and anything in `feed/`. It regenerates `data/fallback-data.js` first, and removes a root `data/status.json` if one is present. Upload **`dist/` only** to a static host (GitHub Pages, Netlify, or any file host) after Alex says yes. This repo does not publish or deploy itself. Opening `dist/index.html` from disk uses the copied fallback and shows DEMO mode.

On a static host, serve `dist/` as the site root. The browser loads `index.html` and polls `data/status.json`. Re-run `node export-static.js` when the feed changes, then upload the new `dist/`.

## Hawaii clock

The HUD clock and the day, dawn, dusk, and night tint use `Pacific/Honolulu`.

## What you can do on the page

- The map uses the largest integer zoom that fits the window width, and at least 2× when the window is wider than 900px. If the map is taller than the screen, drag or use the arrow keys to pan vertically. The + and − buttons step the zoom by whole numbers.
- Tap a character for name, role, state, full task text, last update (Hawaii time), and an Open Drive folder link when that bot has a `driveFolderUrl`.
- Tap a treasure chest to open that bot's Drive folder. A locked chest only shows "no Drive folder yet".
- Tap a name in the Needs Alex list to jump to that character.
