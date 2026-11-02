# Agent Town

A top-down pixel town where each bot is a character. Open the page on a computer, phone, iPad or car browser and everyone sees the same town.

## How live status works

- The site is GitHub Pages from `main` `/docs`. It never needs a rebuild to show new status.
- Bots write their status to a separate branch called `status` with `report.js`. That branch holds only `data/status.json`, `data/needs.json` and `data/history-YYYY-MM.jsonl` (one file per month, Hawaii time).
- The page reads `https://raw.githubusercontent.com/alexalikaaleman/agent-town/status/data/status.json` every 2 minutes and when the tab comes back into view. The raw server caches branch files for up to 5 minutes and ignores `?t=` cache-busters, so each read first asks the GitHub API for the latest `status` commit (one small call, revalidated with its ETag) and reads the files at that commit. If the API is rate limited or down, it falls back to the branch URL with a `?t=` query, which can be up to 5 minutes old. The badge shows "Updated N min ago", or "Offline" in amber when a read fails.
- A bot that has been `working` for 30 minutes or more with no new line gets a red "stalled" tag.

## report.js

```bash
node report.js --bot budget-bot --state working --text "Monthly sheet" --project "Budget"
node report.js --bot budget-bot --state done --text "Sheet updated"
node report.js --bot help-bot --state needs-alex --needs question --text "Pick a menu?"
node report.js --bot help-bot --handled <needId>
node report.js --bot masterbot --usage 61.5
node report.js --list
```

| Flag | Meaning |
| --- | --- |
| `--bot` | `id` (or an alias) from `data/bots.json`. |
| `--state` | `working`, `done`, `blocked`, `needs-alex` or `idle`. |
| `--text` | Bubble text, 40 characters max after the privacy filter. Emails, links, Drive links, paths, money and long ids are removed. Plain file names like `report.js` stay. |
| `--project` | Optional. Bots on the same project gather in a project room with a billboard. |
| `--with` | Optional comma list of bot ids working together (they meet at the Workshop). |
| `--needs` | `urgent` or `question`, with `--state needs-alex`. Adds an item to `needs.json`. |
| `--handled` | Marks a need handled (see below). |
| `--usage` | Sets the overall weekly usage % shown in the usage bar. |
| `--list` | Prints the current status and open needs. Writes nothing. |
| `--dry-run` | Shows what would be written. Writes nothing. |

Each write is one commit on `status`: it updates this bot's entry in `status.json`, appends one line to this month's history file and, when needed, updates `needs.json`. It uses the GitHub Git Data API through `gh` (tree + commit + fast-forward ref update), so the status line and its history line land together. If another bot moved the branch first, it waits 0.4 to 2 seconds and retries, up to 3 times. There is no queue, lock, timer or polling loop. Before writing, it refuses anything that looks private (emails, Drive links, tokens, keys).

Override the target with `AGENT_TOWN_REPO` and `AGENT_TOWN_BRANCH` for testing.

### The 6-minute rule

Mid-task lines (`working` after `working`, or `blocked` after `working`) must be at least 6 minutes apart. A line sent sooner is refused with exit code 2 and nothing is written. Exempt, always written at once:

- the start line (the first `working` line of a task),
- `done` and `idle` lines (finishing),
- `needs-alex` lines.

### Needs Alex

A `needs-alex` line adds an item to `needs.json` with an id such as `n202611011930-ab12`. `report.js` prints the id. The item shows in the Needs Alex strip on the page until it is handled. When Alex has answered, the same bot marks it handled:

```bash
node report.js --bot help-bot --handled n202611011930-ab12
```

Only the bot that raised a need can mark it handled. Handled items drop off the page and are removed from `needs.json` after 30 days. `--list` shows the open ones.

## The roster

`data/bots.json` is the roster Alex edits: `id`, `name`, `role`, `home`, `color`, `driveFolderUrl`, and optional `aliases` (old ids that still map to this bot). Homes are `townhall`, `workshop`, `studio`, `bank`, `library`, `tavern`, `post` (the Post Office), and `house`. `driveFolderUrl` is a `https://drive.google.com/` folder link, or `""` when Alex has not set one yet. Each bot has a treasure chest beside its home spot. An unlocked chest opens that folder in a new tab. A locked chest stays grey, shows a padlock, and the label "no Drive folder yet". Locked chests are listed in `CHESTS_TO_DISCUSS.md`.

## What you can do on the page

- Pinch, or use + and −, to zoom. ⌂ at the top left goes back to the home view.
- Drag or use the arrow keys to pan.
- Tap a character for name, role, state, task, project, last update (Hawaii time), and an Open Drive folder link when that bot has one.
- Double-click or double-tap a character to follow it. The other bots fade. Tap empty space or ⌂ to stop following.
- Use the filter buttons under the header to show only some bots. "All" clears the filter.
- Tap a treasure chest to open that bot's Drive folder. A locked chest only shows "no Drive folder yet".
- Tap an item in the Needs Alex strip to jump to that character.
- The usage bar shows the weekly %. The yellow line at 58% means no new steps; the red line at 65% means hard stop. Per-bot slices show only when `status.json` has `usage.bots`.
- History lists this month's lines, newest first.

The HUD clock and the day, dawn, dusk and night tint use `Pacific/Honolulu`.

## Build the public site

```bash
node export-static.js
```

This copies `index.html`, `style.css`, `js/` and `data/bots.json` into `dist/` and `docs/` (plus `docs/.nojekyll`). No status data is baked in. It then runs a leak check: the build may contain no Drive links or ids except the chest links in `data/bots.json`, and no emails or tokens. If the check fails, `docs/` is not written.

The page is plain HTML, CSS and classic JavaScript with no install step. Scripts share one `window.AgentTown` namespace and load from `index.html` in order. To try it locally, serve the folder (for example `python3 -m http.server`) and open `index.html`. It still reads the live `status` branch.

`server.js`, `sync-data.js`, `feed/` and `data/events.json` are from the older local version and are not used by the live page.
