# Agent Town: build prompt (from Brainstorm Bot for Alex, 2026-11-01)

Build a standalone web page called "Agent Town" in this folder (/workspace/agent-town). It's a live visual dashboard where each of Alex's AI bots is a pixel-art NPC in a Final Fantasy-style top-down town.

## Must have
1. Plain HTML + CSS + vanilla JavaScript (HTML5 Canvas 2D). No frameworks or build step. It must run in any modern browser, including iPad Safari and phone browsers. Use touch-friendly controls, responsive scaling, integer pixel zoom, and imageSmoothingEnabled=false.
2. Town map: a tile-based FF-style town drawn procedurally in code (no external asset files and no copyrighted sprites). Locations include a Town Hall (MasterBot), Workshop (builders), Art Studio (art/cutscene bots), Bank (money bots), Library (memory/notes bots), Tavern (idle area), Post (handoffs), and Alex's House. Bots walk between locations with simple pathfinding (BFS/A* on the tile grid).
3. One character per bot, each with a distinct procedural palette, name label and walk/idle/typing animations.
4. States: idle, walking, working (typing), waiting, blocked, done. Each one needs a visible animation or pose.
5. Bubbles over heads: "!" for urgent or needs Alex, "?" for a question for Alex, "..." (animated) for working, "zzz" for idle, a check mark for done, and red for blocked. Tapping a character opens a panel with name, role, state, current task text and last update time.
6. Handoffs: when an event says bot A handed something to bot B, A walks to B (or both meet at the Workshop), a small item (scroll/box) passes between them, and a short bubble shows what was passed.
7. Data: the page reads a simple JSON feed:
   - `data/bots.json`: the roster (id, name, role, home location, color).
   - `data/events.json` (or a live stream): events like {ts, botId, state, task, needsAlex: "urgent"|"question"|null, handoffTo?}.
   - Live mode: if served by the included tiny server, the page subscribes to Server-Sent Events (/events). If not, it polls `data/status.json` every 10 s. If neither is available, it runs a clearly labeled DEMO mode with fake activity.
8. Watcher: a small zero-dependency Node.js script `server.js` that serves the page, watches a `feed/` folder (any bot or routine can drop or append JSON lines there), merges them into the current state, and pushes updates to every connected browser over SSE. Multiple devices (iPad, phone, computer) can view the same town at once. Also include `export-static.js`, which writes `data/status.json` so the page can be hosted on a static host (GitHub Pages / Netlify) with polling.
9. HUD: counts of working, waiting, blocked and needs-Alex; a "Needs Alex" list at the top (tap to jump to that character); a live/demo indicator; a day/night tint from the Hawaii time clock (Pacific/Honolulu).
10. Prefill `bots.json` with Alex's current bots: MasterBot, Brainstorm Bot, Game Design Document Bot, Grok Build Worker, Website Builder Bot, Cutscene Bot, Concept Art Bot, AI Prompt Bot, Google Drive Manager, Hustle Bot, Budget Bot, Accounting Bot, Playtest and QA Bot, Release and Marketing Bot, Alika TreeD Business Bot, Larry H Robot, RoboTemplate, Robo Maintenance Bot, Robo Library, Robo Helper Bot, Context Bot, Bot Scout, Chief of Staff, Help Bot, Feedback Bot, Language Bot, Mochizuki Bot, Job Lander Resume Bot, Garage Sale Bot, Malu bot, Game Build Bible, Game Revision Logger, Game Additions Bot, Trivia Bot, Proportion Bot, Video Backup Helper v2. Put each one in a sensible home location.

## Rules
- No secrets, account numbers or personal data in any file. Status text should be short task summaries only.
- No watermarks, logos or tool marks anywhere (Alex's permanent rule).
- Don't publish or host anywhere. Build locally only. Hosting needs Alex's yes.
- Style reference only (don't copy code or art): Agent Town (github.com/rafapetter/agent-town), Pixel Agents (github.com/pixel-agents-hq/pixel-agents), vibeoffice (github.com/acost1a/vibeoffice), ClaudeVille (github.com/honorstudio/claude-ville), Agent Mission Control (github.com/glglak/agent-mission-control).
- Include README.md: how to run (`node server.js`, open http://localhost:PORT), the event format for bots to write, and how to host statically.

## Done when
index.html opens in a browser and DEMO mode shows bots walking, working, handing off and raising ! and ? bubbles; server.js pushes a feed/ event live to two open tabs; README is written. Report back the file list and anything unfinished.
