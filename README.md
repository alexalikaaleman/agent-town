# Agent Town

A top-down pixel castle where each bot is a character. Open the page on a computer, phone, iPad or car browser and everyone sees the same town.

## How live status works

- The site is GitHub Pages from `main` `/docs`. It never needs a rebuild to show new status.
- Bots write their status to a separate branch called `status` with `report.js`. That branch holds only `data/status.json`, `data/needs.json` and `data/history-YYYY-MM.jsonl` (one file per month, Hawaii time).
- The page reads `https://raw.githubusercontent.com/alexalikaaleman/agent-town/status/data/status.json` every 2 minutes and when the tab comes back into view. The raw server caches branch files for up to 5 minutes and ignores `?t=` cache-busters, so each read first asks the GitHub API for the latest `status` commit (one small call, revalidated with its ETag) and reads the files at that commit. If the API is rate limited or down, it falls back to the branch URL with a `?t=` query, which can be up to 5 minutes old. The badge shows "Updated N min ago", or "Offline" in amber when a read fails.
- A `working` bot whose newest line or ping is 2 hours old or more gets a "stalled?" tag but stays working.

## report.js

```bash
node report.js --bot budget-bot --state working --text "Monthly sheet" --project "Budget"
node report.js --bot budget-bot --state done --text "Sheet updated"
node report.js --bot help-bot --state needs-alex --needs question --text "Pick a menu?"
node report.js --bot help-bot --handled <needId>
node report.js --bot masterbot --usage 61.5
node report.js --bot budget-bot --ping
node report.js --list
```

| Flag | Meaning |
| --- | --- |
| `--bot` | `id` (or an alias) from `data/bots.json`. |
| `--state` | `working`, `done`, `blocked`, `needs-alex`, `idle`, `sleeping` or `talking`. |
| `--text` | Bubble text, 40 characters max after the privacy filter. Emails, links, Drive links, paths, money and long ids are removed. Plain file names like `report.js` stay. |
| `--project` | Optional. Bots on the same project fight one monster together on the battlefield. |
| `--with` | Optional comma list of bot ids working together (they also fight one monster together). |
| `--needs` | `urgent` or `question`, with `--state needs-alex`. Adds an item to `needs.json`. |
| `--handled` | Marks a need handled (see below). |
| `--usage` | Sets the overall weekly usage % shown in the usage bar. The bar only changes when a bot sends this flag. |
| `--ping` | Heartbeat, every 30 minutes while a bot is busy. Keeps the bot's state, text and time exactly as they are and only sets `ping` to now, so the town knows the bot is alive (no "stalled?" tag) without waking a done or idle bot or resetting its 10-minute sleep clock. Not added to History. Needs an earlier status line. |
| `--list` | Prints the current status and open needs. Writes nothing. |
| `--dry-run` | Shows what would be written. Writes nothing. |

Each write is one commit on `status`: it updates this bot's entry in `status.json`, appends one line to this month's history file and, when needed, updates `needs.json`. It uses the GitHub Git Data API through `gh` (tree + commit + fast-forward ref update), so the status line and its history line land together. If another bot moved the branch first, it waits 0.4 to 2 seconds and retries, up to 3 times. There is no queue, lock, timer or polling loop. Before writing, it refuses anything that looks private (emails, Drive links, tokens, keys).

Override the target with `AGENT_TOWN_REPO` and `AGENT_TOWN_BRANCH` for testing.

### The 6-minute rule

Mid-task lines (`working` after `working`, or `blocked` after `working`) must be at least 6 minutes apart. A line sent sooner is refused with exit code 2 and nothing is written. Exempt, always written at once:

- the start line (the first `working` line of a task),
- `done`, `idle` and `sleeping` lines (finishing),
- `needs-alex` lines,
- `talking` lines (voice call by the throne).

### The castle

The map is a castle (original pixel art, FF6-like style). Where a bot stands depends on its state:

- **Bedrooms** (top left and top right): 2 bedrooms with 12 bunks each. A bot sleeps when its last line is `sleeping`, or when it is `done` or `idle` and its last line is 10 minutes old or more. A `working` bot never sleeps. Sleepers lie in a bunk under a blanket with a zzz beside it. If more than 24 bots sleep, the rest patrol the throne room with a "sleepy" tag, each on its own spot (no zzz outside the bedrooms).
- **Throne room** (centre): Bus Ninja sits on the throne (rock-punch idle, never smokes). Bots with an open Needs Alex item line up on the red carpet facing the throne, urgent first, then oldest. Tap one to read the full question. A bot on a voice call posts `--state talking` and stands beside the throne with a "..." bubble (Bus Ninja shows one too); talking counts as working and expires after 15 minutes or any other state. The big vault door is in the back wall above the throne.
- **Wizard Lab** (left) and **Workshop** (right): only working bots go here. A solo worker sits at a table in its home room (`HOME_ROOMS` in `js/world.js`, per-bot overrides in `BOT_ROOMS`), at most 4 per room, and walks a short busy loop (table, chest, station) with a small task label.
- **Moat line-up**: idle and done bots (under 10 minutes) and bots that have never sent a line stand along the moat on both sides of the drawbridge.
- **Battlefield** (below the moat): bots on the same `--project` or `--with` group surround one monster named after the task (2 = a pair, 3 to 8 = a ring, 9 or more = an octagon with inner rings). Solo workers that do not fit at a table each fight their own monster. Tap a monster for its full name. `blocked` bots rest in the medic tent.
- **Treasure vault**: its own map behind the vault door. Tap the door and Bus Ninja walks to it, a smoke puff plays and the vault fades in; the exit door or **Back to castle** returns. 25 arcade cabinets from `data/cabinets.json` stand in the left half (the right half is roped off). The 12 published games show the game's own marquee (`js/marquees.js`) and link to `https://<name>.grok.me`: tap one or its title and Bus Ninja walks to it, a smoke puff plays, and the game opens in a new tab. The 13 "coming soon" cabinets are blank and do nothing. To publish one, give it a `name` and `"status": "published"` in `data/cabinets.json`.

`blocked` and `needs-alex` bots never sleep. Each part of the castle is its own file (`js/castle-*.js`) and can be removed on its own by deleting its script tag in `index.html`.

### Needs Alex

A `needs-alex` line adds an item to `needs.json` with an id such as `n202611011930-ab12`. `report.js` prints the id. The item shows in the Needs Alex strip on the page until it is handled. When Alex has answered, the same bot marks it handled:

```bash
node report.js --bot help-bot --handled n202611011930-ab12
```

Only the bot that raised a need can mark it handled. Handled items drop off the page and are removed from `needs.json` after 30 days. `--list` shows the open ones.

Right after the "Needs Alex (urgent first, then oldest)" label are **Hide all** and **Show all**. They only hide or show the cards in this browser. They do not mark a need handled, do not delete it, and do not take a bot off the carpet. Show all puts the cards back in the same order: urgent first, then oldest.

## The roster

`data/bots.json` is the roster Alex edits: `id`, `name`, `role`, `home`, `color`, `driveFolderUrl`, and optional `aliases` (old ids that still map to this bot). Homes are `townhall`, `workshop`, `studio`, `bank`, `library`, `tavern`, `post`, and `house`; `HOME_ROOMS` in `js/world.js` maps each to the Workshop or the Wizard Lab. The other rooms are not homes; bots go there by state. `driveFolderUrl` is a `https://drive.google.com/` folder link, or `""` when Alex has not set one yet. Each bot that has a folder gets a treasure chest in its home room; tapping it opens that folder in a new tab. Bots without a folder get no chest (they are listed in `CHESTS_TO_DISCUSS.md`). Optional `folders` lists folder and file location names only (no links); the panel shows them.

## What you can do on the page

- The page frames the whole castle on load at any screen size (desktop, phone, car browser).
- Top bar: **History** (this month's lines, newest first; if it cannot load within 10 seconds it says so and you can tap History again), **Needs Alex** (shows or hides the Needs Alex strip: bot name and full line, urgent first, then oldest; tap one to jump to that bot; Hide all and Show all, right after that label, only hide or show the cards in this browser), a scrolling row of bot chips (All first) and **Find a bot** (type a name and press Enter to pan to it).
- Bottom strip: Working, Waiting, Blocked and Needs Alex counts, the Hawaii time, the "Updated" badge and the usage bar. It sits under the map and never covers it. The yellow line at 58% means no new steps; the red line at 65% means hard stop. Per-bot slices show only when `status.json` has `usage.bots`.
- Pinch, the mouse wheel, or + and − zoom smoothly. Zoom stops at the framed view (the whole castle) and at a close-up of one bot.
- Bot names are always shown. Names that would overlap are moved aside. Table labels and monster nameplates appear once you zoom in on a phone. **Aa** cycles the size of names (small, medium, large); the choice is remembered.
- Open `index.html?view=list` for a plain list of bots (state, task, project), with no map. Good on a phone.
- Drag or use the arrow keys to pan.
- Tap a character to zoom in and follow it (the other bots fade) and open its panel: name, status, task, project, last update and last ping (Hawaii time), its folders, and a **Drive folder: <name>** button (greyed "no approved link" when it has none). The panel scrolls; **← Back** closes it. Tap empty space or press Escape to stop following.
- Tap a treasure chest to open that bot's Drive folder, or a published arcade cabinet to play that game.

The clock and the day, dawn, dusk and night tint use `Pacific/Honolulu`.

## Build the public site

```bash
node export-static.js
```

This copies `index.html`, `style.css`, `js/`, `data/bots.json` and `data/cabinets.json` into `dist/` and `docs/` (plus `docs/.nojekyll`), and stamps `?v=<build hash>` on the JS and CSS links so browsers load the new build. No status data is baked in. It then runs a leak check: the build may contain no Drive links or ids except the chest links in `data/bots.json`, and no emails or tokens. If the check fails, `docs/` is not written.

The page is plain HTML, CSS and classic JavaScript with no install step. Scripts share one `window.AgentTown` namespace and load from `index.html` in order. To try it locally, serve the folder (for example `python3 -m http.server`) and open `index.html`. It still reads the live `status` branch.

`server.js`, `sync-data.js`, `feed/` and `data/events.json` are from the older local version and are not used by the live page.
