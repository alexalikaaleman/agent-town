/** Agent Town entry. Canvas loop, HUD, and tap panel. */
(function () {
const MAP_H = window.AgentTown.MAP_H;
const MAP_W = window.AgentTown.MAP_W;
const TILE = window.AgentTown.TILE;
const createWorld = window.AgentTown.createWorld;
const createTown = window.AgentTown.createTown;
const drawMap = window.AgentTown.drawMap;
const drawScene = window.AgentTown.drawScene;
const connectFeed = window.AgentTown.connectFeed;
const loadHistory = window.AgentTown.loadHistory;
const formatStamp = window.AgentTown.formatStamp;
const honoluluParts = window.AgentTown.honoluluParts;
const phaseLabel = window.AgentTown.phaseLabel;
const shortName = window.AgentTown.shortName;

const canvas = document.getElementById("town");
const stage = document.getElementById("stage");
const needsEl = document.getElementById("needs");
const panel = document.getElementById("panel");
const ctx = canvas.getContext("2d");

let world = createWorld([]);
// Which map is shown: "castle" or "vault" (the vault is its own map, see js/castle-vault.js).
let scene = "castle";
let vworld = null;
function cur() {
  return scene === "vault" && vworld ? vworld : world;
}
let roster = [];
let town = null;
let mode = "loading";
let dpr = 1;
let mapCanvas = null;
let mapKey = "";
let lastHud = "";
let lastClock = "";

// ---------- camera ----------
// The canvas always fills the stage. The view is a camera over the town:
// zoom (screen px per world px) and cam (world px at the stage's top left).
// Min zoom is the framed view (whole town fits); max zoom is a close-up of one bot.
let zoom = 1;
let camX = 0;
let camY = 0;
let viewW = 1;
let viewH = 1;
const LABEL_SIZES = [1, 1.35, 1.75];
let labelSize = Number(localStorage.getItem("agentTownLabelSize") || 1) || 1;
if (!LABEL_SIZES.includes(labelSize)) labelSize = 1;

function worldW() {
  return cur().w * TILE;
}
function worldH() {
  return cur().h * TILE;
}
// Frame padding (screen px) so labels at the map edge and the overlaid buttons never
// cover the town. On phones the buttons sit in a bar under the map (style.css).
function framePad() {
  const ctl = document.getElementById("zoom-controls");
  // The buttons overlay the map unless they sit in the bar below it (phones).
  const overlay = !!ctl && ctl.getBoundingClientRect().top < stage.getBoundingClientRect().bottom - 1;
  // Phones (buttons in the bar below): the castle fills the screen width; labels are kept in frame anyway.
  const side = overlay ? Math.round(30 * labelSize) : 2;
  return {
    l: overlay ? Math.max(side, 64) : side,
    r: overlay ? Math.max(side, ctl.offsetWidth + 24) : side,
    t: Math.round(16 * labelSize),
    b: 6,
  };
}
function fitZoom() {
  const p = framePad();
  return Math.max(0.05, Math.min((viewW - p.l - p.r) / worldW(), (viewH - p.t - p.b) / worldH()));
}
function maxZoom() {
  // About four tiles across the shorter side: one bot fills the view.
  return Math.max(fitZoom(), Math.min(viewW, viewH) / (TILE * 4));
}
function clampZoom(z) {
  return Math.min(maxZoom(), Math.max(fitZoom(), z));
}
function clampCam() {
  const p = framePad();
  const fitAxis = (cam, view, size, lo, hi) => {
    const min = -lo / zoom;
    const max = size - (view - hi) / zoom;
    if (max <= min) return -(lo + (view - lo - hi - size * zoom) / 2) / zoom;
    return Math.min(max, Math.max(min, cam));
  };
  camX = fitAxis(camX, viewW, worldW(), p.l, p.r);
  camY = fitAxis(camY, viewH, worldH(), p.t, p.b);
}
function pixelRatio() {
  dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  return dpr;
}

let framed = true; // true while showing the default framed view
function resize() {
  viewW = Math.max(1, stage.clientWidth);
  viewH = Math.max(1, stage.clientHeight);
  pixelRatio();
  canvas.width = Math.round(viewW * dpr);
  canvas.height = Math.round(viewH * dpr);
  canvas.style.width = viewW + "px";
  canvas.style.height = viewH + "px";
  zoom = framed ? fitZoom() : clampZoom(zoom);
  clampCam();
}

/** Zoom to z, keeping the world point under stage point (sx, sy) in place. */
function zoomAt(z, sx, sy) {
  const next = clampZoom(z);
  if (sx == null) sx = viewW / 2;
  if (sy == null) sy = viewH / 2;
  const wx = camX + sx / zoom;
  const wy = camY + sy / zoom;
  zoom = next;
  camX = wx - sx / zoom;
  camY = wy - sy / zoom;
  framed = Math.abs(zoom - fitZoom()) < 1e-6;
  clampCam();
}
function stepZoom(factor, cx, cy) {
  const r = stage.getBoundingClientRect();
  zoomAt(zoom * factor, cx == null ? null : cx - r.left, cy == null ? null : cy - r.top);
}

/** Stage-relative point -> world px. */
function toWorld(clientX, clientY) {
  const r = stage.getBoundingClientRect();
  return { x: camX + (clientX - r.left) / zoom, y: camY + (clientY - r.top) / zoom };
}

// ---------- follow a bot ----------
let following = null;

function startFollow(id) {
  if (!town || !town.agents.get(id)) return;
  following = id;
  town.follow = id;
  // Zoom in a little so the followed bot is easy to see.
  if (zoom < fitZoom() * 2) zoomAt(Math.min(maxZoom(), fitZoom() * 2.5));
  const note = document.getElementById("mode-note");
  note.textContent = "Following " + town.agents.get(id).name + ". Tap empty space to stop.";
}

function stopFollow() {
  following = null;
  if (town) town.follow = null;
  document.getElementById("mode-note").textContent = "";
}

function centerOn(agent, ease) {
  const tx = agent.x * TILE + TILE / 2 - viewW / zoom / 2;
  const ty = agent.y * TILE + 4 - viewH / zoom / 2;
  camX += (tx - camX) * ease;
  camY += (ty - camY) * ease;
  clampCam();
}

function trackFollow() {
  if (!following || !town || (pointer && pointer.drag) || pinch) return;
  const agent = town.agents.get(following);
  if (!agent) return stopFollow();
  centerOn(agent, 0.15);
}

function ensureMap() {
  // Cache the static map at a whole-number scale near the current zoom (max 4096 px).
  const want = Math.max(1, Math.ceil(zoom * dpr));
  const cap = Math.max(1, Math.floor(4096 / Math.max(worldW(), worldH())));
  const s = Math.min(want, cap);
  const key = scene + ":" + s + ":" + cur().w + "x" + cur().h + ":" + cur().buildings.length;
  if (mapCanvas && mapKey === key) return;
  const off = document.createElement("canvas");
  off.width = worldW() * s;
  off.height = worldH() * s;
  const octx = off.getContext("2d");
  octx.imageSmoothingEnabled = false;
  octx.setTransform(s, 0, 0, s, 0, 0);
  drawMap(octx, cur());
  mapCanvas = off;
  mapKey = key;
}

new ResizeObserver(resize).observe(stage);
window.addEventListener("resize", resize);
resize();


let needsOpen = false; // the Needs Alex list drops down from the top bar
let needItems = null; // unhandled items from needs.json, null when unreadable
let feedOk = null;
let feedUpdatedAt = null;
let lastModeText = "";

function ago(iso) {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return "never";
  const min = Math.max(0, Math.floor((Date.now() - t) / 60000));
  if (min < 1) return "just now";
  if (min < 60) return min + " min ago";
  const h = Math.floor(min / 60);
  if (h < 48) return h + " h ago";
  return Math.floor(h / 24) + " days ago";
}

/** "Updated N min ago" badge. Grey while loading, amber when the last read failed. */
function renderMode() {
  const el = document.getElementById("mode");
  let text = "Loading…";
  let cls = "mode loading";
  if (feedOk !== null) {
    text = feedUpdatedAt ? "Updated " + ago(feedUpdatedAt) : "No updates yet";
    if (!feedOk) text = "Offline · " + text;
    cls = "mode " + (feedOk ? "live" : "stale");
  }
  if (text === lastModeText && el.className === cls) return;
  lastModeText = text;
  el.className = cls;
  el.textContent = text;
}

function renderHud() {
  if (!town) return;
  renderMode();
  const counts = town.counts();
  const parts = [
    ["c-work", "Working " + counts.working],
    ["c-wait", "Waiting " + counts.waiting],
    ["c-block", "Blocked " + counts.blocked],
    ["c-alex", "Needs Alex " + counts.needs],
  ];
  for (const [id, text] of parts) {
    const el = document.getElementById(id);
    if (el.textContent !== text) el.textContent = text;
  }
  const summary = counts.working + " working, " + counts.waiting + " waiting, " + counts.blocked + " blocked, " + counts.needs + " need Alex.";
  const summaryEl = document.getElementById("summary");
  if (summaryEl.textContent !== summary) summaryEl.textContent = summary;

  const clock = honoluluParts();
  const clockText = clock.label + " · " + phaseLabel(clock.phase);
  const clockEl = document.getElementById("clock");
  if (clockText !== lastClock) {
    clockEl.textContent = clockText;
    lastClock = clockText;
  }

  // Needs-Alex strip: unhandled items from needs.json, plus any bot asking without an item.
  const items = [];
  const seen = new Set();
  for (const it of needItems || []) {
    if (it.handled || !town.agents.get(it.bot)) continue;
    items.push({ bot: it.bot, kind: it.kind === "urgent" ? "urgent" : "question", text: it.text || "", ts: it.ts });
    seen.add(it.bot);
  }
  for (const agent of town.needsList()) {
    if (!seen.has(agent.id)) items.push({ bot: agent.id, kind: agent.needsAlex, text: agent.text || "", ts: agent.ts });
  }
  items.sort((a, b) => (a.kind === b.kind ? String(a.ts).localeCompare(String(b.ts)) : a.kind === "urgent" ? -1 : 1));
  const key = items.map((i) => i.bot + ":" + i.kind + ":" + i.text).join("|") + "#" + needsOpen;
  if (key === lastHud) return;
  lastHud = key;
  const countEl = document.getElementById("needs-count");
  countEl.textContent = String(items.length);
  const needsBtn = document.getElementById("needs-btn");
  needsBtn.classList.toggle("has", items.length > 0);
  needsBtn.classList.toggle("urgent", items.some((i) => i.kind === "urgent"));
  needsBtn.setAttribute("aria-expanded", needsOpen ? "true" : "false");
  needsEl.replaceChildren();
  needsEl.hidden = !needsOpen;
  if (!needsOpen) return;
  if (!items.length) {
    const none = document.createElement("p");
    none.className = "needs-none";
    none.textContent = "Nothing needs Alex right now.";
    needsEl.appendChild(none);
    return;
  }
  for (const it of items) {
    const agent = town.agents.get(it.bot);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "need " + it.kind;
    btn.textContent = (it.kind === "urgent" ? "! " : "? ") + agent.name + (it.text ? ": " + it.text : "");
    btn.title = ago(it.ts);
    btn.addEventListener("click", () => {
      needsOpen = false;
      lastHud = "";
      focusBot(it.bot, true);
    });
    needsEl.appendChild(btn);
  }
}

/** Usage bar: overall weekly %, cap lines at 58 and 65, per-bot slices when present. */
const USAGE_SOFT = 58;
const USAGE_HARD = 65;
let usageKey = "";
function renderUsage(usage) {
  const el = document.getElementById("usage");
  const pct = usage && Number.isFinite(usage.weeklyPct) ? Math.max(0, Math.min(100, usage.weeklyPct)) : null;
  const key = JSON.stringify(usage || null);
  if (key === usageKey) return;
  usageKey = key;
  const fill = document.getElementById("usage-fill");
  const text = document.getElementById("usage-text");
  fill.replaceChildren();
  if (pct == null) {
    text.textContent = "Usage —";
    fill.style.width = "0";
    el.className = "";
    return;
  }
  el.className = pct >= USAGE_HARD ? "hard" : pct >= USAGE_SOFT ? "soft" : "";
  text.textContent = "Usage " + Math.round(pct) + "%" + (pct >= USAGE_HARD ? " · stop" : pct >= USAGE_SOFT ? " · no new steps" : "");
  fill.style.width = pct + "%";
  const slices = usage.bots && typeof usage.bots === "object" ? Object.entries(usage.bots) : [];
  let used = 0;
  for (const [id, v] of slices) {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0 || used + n > pct + 0.01) continue;
    const bot = roster.find((b) => b.id === id || (b.aliases || []).includes(id));
    const seg = document.createElement("span");
    seg.className = "usage-slice";
    seg.style.width = (n / pct) * 100 + "%";
    seg.style.background = (bot && bot.color) || "#9aa7b8";
    seg.title = (bot ? bot.name : id) + " " + n + "%";
    fill.appendChild(seg);
    used += n;
  }
}

/** Small history list from this month's file, newest first. */
let historyRun = 0;
async function openHistory() {
  const box = document.getElementById("history");
  const list = document.getElementById("history-list");
  const run = ++historyRun;
  needsOpen = false;
  lastHud = "";
  box.hidden = false;
  list.replaceChildren();
  const add = (txt, cls) => {
    const li = document.createElement("li");
    li.textContent = txt;
    if (cls) li.className = cls;
    list.appendChild(li);
  };
  add("Loading…", "muted");
  try {
    const lines = (await loadHistory(new Date())).slice(0, 60);
    if (run !== historyRun) return;
    list.replaceChildren();
    if (!lines.length) add("Nothing yet this month.", "muted");
    for (const h of lines) {
      const bot = roster.find((b) => b.id === h.bot || (b.aliases || []).includes(h.bot));
      const name = bot ? bot.name : h.bot;
      let what = h.state ? h.state + (h.text ? ": " + h.text : "") : "";
      if (h.handled) what = "need handled";
      if (h.usage != null && !h.state) what = "usage " + h.usage + "%";
      add(formatStamp(h.ts) + " · " + name + " · " + what);
    }
  } catch (_) {
    if (run !== historyRun) return;
    list.replaceChildren();
    add("Could not load history. Tap History to try again.", "muted");
  }
}

/** Top-bar search: type a bot name (or id), pick it, and the map pans to it and opens its panel. */
function buildSearch(list) {
  const dl = document.getElementById("bot-names");
  dl.replaceChildren();
  for (const bot of list) {
    const opt = document.createElement("option");
    opt.value = bot.name;
    dl.appendChild(opt);
  }
}

function findBot(query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q || !town) return null;
  const all = Array.from(town.agents.values());
  return (
    all.find((a) => a.name.toLowerCase() === q || a.id.toLowerCase() === q) ||
    all.find((a) => a.name.toLowerCase().startsWith(q)) ||
    all.find((a) => a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q)) ||
    null
  );
}

function runSearch(ev) {
  if (ev) ev.preventDefault();
  const input = document.getElementById("search");
  const agent = findBot(input.value);
  input.classList.toggle("miss", !agent && !!input.value.trim());
  if (!agent) return;
  stopFollow();
  focusBot(agent.id, true);
  input.blur();
}

function homeName(id) {
  const b = world.byId.get(id);
  return b ? b.name : id;
}

function openPanel(agent) {
  town.selected = agent.id;
  panel.hidden = false;
  document.getElementById("p-name").textContent = agent.name;
  document.getElementById("p-role").textContent = agent.role;
  const state = agent.busy ? agent.state + " · handoff" : agent.state;
  const stateEl = document.getElementById("p-state");
  stateEl.textContent = state;
  stateEl.className = "tag s-" + agent.state;
  const needEl = document.getElementById("p-need");
  // The full question from needs.json (bots in the carpet line show it on tap).
  const item = (needItems || []).find((it) => it.bot === agent.id && !it.handled);
  const full = item && item.text ? ": " + item.text : "";
  if (agent.needsAlex === "urgent") needEl.textContent = "Needs Alex (urgent)" + full;
  else if (agent.needsAlex === "question") needEl.textContent = "Needs Alex (question)" + full;
  else needEl.textContent = "";
  document.getElementById("p-task").textContent = agent.task || agent.text || "No current task.";
  const driveEl = document.getElementById("p-drive");
  const driveUrl = agent.driveFolderUrl || "";
  if (driveEl.dataset.url !== driveUrl) {
    driveEl.dataset.url = driveUrl;
    driveEl.replaceChildren();
    if (driveUrl) {
      const link = document.createElement("a");
      link.href = driveUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.className = "drive-btn";
      link.textContent = "Drive folder";
      driveEl.appendChild(link);
    }
  }
  let timeText = agent.ts ? "Updated " + formatStamp(agent.ts) : "No status line yet";
  if (agent.stalled) timeText += " · stalled (no new line for " + ago(agent.ts).replace(" ago", "") + ")";
  document.getElementById("p-time").textContent = timeText;
  document.getElementById("p-home").textContent = "Home: " + homeName(agent.home) + (agent.project ? " · Project: " + agent.project : "");
}

function closePanel() {
  panel.hidden = true;
  if (town) town.selected = null;
}

function focusBot(id, open) {
  const agent = town.agents.get(id);
  if (!agent) return;
  if (open) openPanel(agent);
  else town.selected = id;
  if (zoom < fitZoom() * 2) zoomAt(Math.min(maxZoom(), fitZoom() * 2.5));
  centerOn(agent, 1);
}

document.getElementById("panel-close").addEventListener("click", closePanel);
document.getElementById("zoom-in").addEventListener("click", () => stepZoom(1.25));
document.getElementById("zoom-out").addEventListener("click", () => stepZoom(0.8));
document.getElementById("label-size").addEventListener("click", () => {
  labelSize = LABEL_SIZES[(LABEL_SIZES.indexOf(labelSize) + 1) % LABEL_SIZES.length];
  localStorage.setItem("agentTownLabelSize", String(labelSize));
  resize();
});
document.getElementById("search-form").addEventListener("submit", runSearch);
document.getElementById("search").addEventListener("change", runSearch);
document.getElementById("needs-btn").addEventListener("click", () => {
  needsOpen = !needsOpen;
  lastHud = "";
  if (needsOpen) document.getElementById("history").hidden = true;
});
document.getElementById("history-btn").addEventListener("click", openHistory);
document.getElementById("history-close").addEventListener("click", () => {
  document.getElementById("history").hidden = true;
});
stage.addEventListener(
  "wheel",
  (ev) => {
    ev.preventDefault();
    const k = ev.ctrlKey ? 0.01 : 0.0015;
    stepZoom(Math.exp(-ev.deltaY * k), ev.clientX, ev.clientY);
  },
  { passive: false }
);
window.addEventListener("keydown", (ev) => {
  if (ev.target && ev.target.closest && ev.target.closest("input, textarea")) return;
  if (ev.key === "Escape") closePanel();
  const step = 64 / zoom;
  if (ev.key === "ArrowLeft") camX -= step;
  if (ev.key === "ArrowRight") camX += step;
  if (ev.key === "ArrowUp") camY -= step;
  if (ev.key === "ArrowDown") camY += step;
  if (ev.key === "+" || ev.key === "=") stepZoom(1.25);
  if (ev.key === "-" || ev.key === "_") stepZoom(0.8);
  clampCam();
});

let pointer = null;
let pinch = null;
const touches = new Map();
let lastTap = null;
const DOUBLE_MS = 450;
const DOUBLE_PX = 32;

/** Nearest bot to a client point. The hit radius is at least 22 screen px at any zoom. */
function botAt(clientX, clientY) {
  if (!town) return null;
  const pt = toWorld(clientX, clientY);
  return town.hitTest(pt.x, pt.y, Math.max(14, 22 / zoom));
}

function pinchState() {
  const [a, b] = Array.from(touches.values());
  const r = stage.getBoundingClientRect();
  return { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2 - r.left, my: (a.y + b.y) / 2 - r.top };
}

stage.addEventListener("pointerdown", (ev) => {
  if (ev.target.closest && ev.target.closest("button, a, input, textarea")) return;
  touches.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (touches.size === 2) {
    const p = pinchState();
    pinch = { dist: p.dist, zoom, wx: camX + p.mx / zoom, wy: camY + p.my / zoom };
    pointer = null;
    lastTap = null;
    return;
  }
  if (touches.size > 2) return;
  pointer = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, cx: camX, cy: camY, drag: false };
  try {
    stage.setPointerCapture(ev.pointerId);
  } catch (_) {}
});
stage.addEventListener("pointermove", (ev) => {
  if (touches.has(ev.pointerId)) touches.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (pinch && touches.size >= 2) {
    // Continuous pinch: zoom with the finger spread, and pan with the midpoint.
    const p = pinchState();
    zoom = clampZoom(pinch.zoom * (p.dist / pinch.dist));
    framed = Math.abs(zoom - fitZoom()) < 1e-6;
    camX = pinch.wx - p.mx / zoom;
    camY = pinch.wy - p.my / zoom;
    clampCam();
    return;
  }
  if (!pointer || ev.pointerId !== pointer.id) return;
  const dx = ev.clientX - pointer.x;
  const dy = ev.clientY - pointer.y;
  if (Math.hypot(dx, dy) > 8) pointer.drag = true;
  if (pointer.drag) {
    camX = pointer.cx - dx / zoom;
    camY = pointer.cy - dy / zoom;
    clampCam();
    if (town) town.hoverChest = null;
    return;
  }
  trackChestHover(ev);
});
stage.addEventListener("pointerleave", () => {
  if (town) town.hoverChest = null;
});

function trackChestHover(ev) {
  if (!town) return;
  const pt = toWorld(ev.clientX, ev.clientY);
  const chest = town.hitChest(pt.x, pt.y);
  town.hoverChest = chest ? chest.id : null;
}

/**
 * Double tap / double click starts follow mode. The old code missed it because
 * (1) the bot hit radius was 14 world px, only ~7 screen px at the phone's zoom, and
 * (2) the first tap opened the bottom panel, whose full-width wrapper caught the
 * second tap. Now the radius is in screen px, the panel wrapper lets taps through,
 * and the second tap is matched by time and distance to the first tap's bot.
 */
function isDouble(ev) {
  return lastTap && performance.now() - lastTap.t < DOUBLE_MS && Math.hypot(ev.clientX - lastTap.x, ev.clientY - lastTap.y) < DOUBLE_PX;
}

function endPointer(ev) {
  touches.delete(ev.pointerId);
  if (pinch) {
    if (touches.size === 0) pinch = null;
    pointer = null;
    return;
  }
  if (!pointer || ev.pointerId !== pointer.id) return;
  const dragged = pointer.drag;
  pointer = null;
  if (ev.type === "pointercancel" || dragged || !town) return;
  if (scene === "vault") {
    const vp = toWorld(ev.clientX, ev.clientY);
    for (const p of vworld.parts) if (p.hit && p.hit(town, vp.x, vp.y, sceneUi)) return;
    return;
  }
  if (isDouble(ev)) {
    const id = lastTap.id || (botAt(ev.clientX, ev.clientY) || {}).id;
    lastTap = null;
    if (id) {
      startFollow(id);
      openPanel(town.agents.get(id));
      return;
    }
  }
  const pt = toWorld(ev.clientX, ev.clientY);
  const hit = botAt(ev.clientX, ev.clientY);
  lastTap = { t: performance.now(), x: ev.clientX, y: ev.clientY, id: hit ? hit.id : null };
  if (hit) {
    openPanel(hit);
    return;
  }
  for (const p of world.parts) {
    if (p.hit && p.hit(town, pt.x, pt.y, Object.assign({ zoom, showTip, now: performance.now(), radius: Math.max(10, 18 / zoom) }, sceneUi))) return;
  }
  const chest = town.hitChest(pt.x, pt.y);
  if (chest) {
    town.pokeChest(chest.id, performance.now());
    if (chest.url) window.open(chest.url, "_blank", "noopener");
    return;
  }
  hideTip();
  closePanel();
  stopFollow();
}
stage.addEventListener("pointerup", endPointer);
stage.addEventListener("pointercancel", endPointer);
// Backup for desktop browsers: a native dblclick on a bot also follows it.
stage.addEventListener("dblclick", (ev) => {
  const hit = botAt(ev.clientX, ev.clientY);
  if (hit && following !== hit.id) startFollow(hit.id);
});
// A second tap that lands on the info panel, right where the first tap was, still counts.
panel.addEventListener("pointerup", (ev) => {
  if (!town || !isDouble(ev) || !lastTap.id) return;
  if (ev.target.closest && ev.target.closest("button, a")) return;
  startFollow(lastTap.id);
  lastTap = null;
});

/** Small popup with the full text of a table task, monster name or question. */
function showTip(title, text) {
  let tip = document.getElementById("tip");
  if (!tip) {
    tip = document.createElement("div");
    tip.id = "tip";
    tip.setAttribute("role", "dialog");
    tip.innerHTML = '<button type="button" class="tip-close" aria-label="Close">×</button><b class="tip-title"></b><p class="tip-text"></p>';
    document.body.appendChild(tip);
    tip.querySelector(".tip-close").addEventListener("click", hideTip);
  }
  tip.querySelector(".tip-title").textContent = title || "";
  tip.querySelector(".tip-text").textContent = text || "";
  tip.hidden = false;
  return true;
}
function hideTip() {
  const tip = document.getElementById("tip");
  if (tip) tip.hidden = true;
}

// ---------- screen-space labels (room names and bot names) ----------
const debugInfo = { labelOverlaps: 0, labels: 0 };

function labelBox(c, text, px, x, y) {
  c.font = px + "px ui-monospace, monospace";
  const w = Math.ceil(c.measureText(text).width) + 6;
  const h = px + 4;
  return { left: Math.round(x - w / 2), top: Math.round(y - h), w, h };
}
function overlapArea(a, list) {
  let area = 0;
  for (const b of list) {
    const ox = Math.min(a.left + a.w, b.left + b.w) - Math.max(a.left, b.left);
    const oy = Math.min(a.top + a.h, b.top + b.h) - Math.max(a.top, b.top);
    if (ox > 0 && oy > 0) area += ox * oy;
  }
  return area;
}
function paintLabel(c, box, text, px, accent, bg) {
  c.fillStyle = bg || "rgba(20,18,15,0.9)";
  c.fillRect(box.left, box.top, box.w, box.h);
  c.fillStyle = accent || "#ffe14a";
  c.fillRect(box.left, box.top, 2, box.h);
  c.fillStyle = "#fff8e6";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.font = px + "px ui-monospace, monospace";
  c.fillText(text, box.left + box.w / 2 + 1, box.top + box.h / 2 + 0.5);
}

function drawScreenLabels(c) {
  const placed = [];
  const sx = (wx) => (wx - camX) * zoom;
  const sy = (wy) => (wy - camY) * zoom;
  // Labels stay inside the visible part of the map.
  const fx0 = Math.max(0, sx(0)) + 1;
  const fy0 = Math.max(0, sy(0)) + 1;
  const fx1 = Math.min(viewW, sx(worldW())) - 1;
  const fy1 = Math.min(viewH, sy(worldH())) - 1;
  const keepInFrame = (box) => {
    box.left = Math.round(Math.max(fx0, Math.min(fx1 - box.w, box.left)));
    box.top = Math.round(Math.max(fy0, Math.min(fy1 - box.h, box.top)));
  };
  debugInfo.frame = [fx0, fy0, fx1, fy1];
  // Room names: bigger, on each building's top wall.
  const roomPx = Math.round(Math.min(22, Math.max(11, 9 * zoom)) * labelSize);
  for (const b of cur().buildings) {
    const box = labelBox(c, b.name, roomPx, sx((b.labelX != null ? b.labelX : b.x + b.w / 2) * TILE), sy(b.y * TILE) + roomPx + 6);
    if (box.left + box.w < 0 || box.left > viewW || box.top > viewH || box.top + box.h < 0) continue;
    keepInFrame(box);
    paintLabel(c, box, b.name, roomPx, b.trim, "rgba(20,18,15,0.82)");
    placed.push(box);
  }
  if (!town) return;
  // Part labels (table tasks, monster nameplates, cabinet titles): placed before bot names.
  const partPx = Math.round(Math.min(12, Math.max(8, 5.5 * zoom)) * labelSize);
  const partLabels = [];
  for (const p of cur().parts) {
    if (!p.labels) continue;
    for (const l of p.labels(town, cur()) || []) {
      if (l.reserve) {
        // a keep-out area (e.g. Bus Ninja's sprite): names are not placed over it
        const [x0, y0, x1, y1] = l.reserve;
        placed.push({ left: sx(x0), top: sy(y0), w: (x1 - x0) * zoom, h: (y1 - y0) * zoom, reserve: true });
        continue;
      }
      if (l.minZoom && zoom < fitZoom() * l.minZoom) continue;
      // minAbs: hide on small screens (phones) until zoomed in, so the framed view is not a wall of labels.
      if (l.minAbs && zoom < l.minAbs) continue;
      const box = labelBox(c, l.text, partPx, sx(l.x), sy(l.y) + partPx + 4);
      if (box.left + box.w < 0 || box.left > viewW || box.top > viewH || box.top + box.h < 0) continue;
      keepInFrame(box);
      // "avoid" labels (dense rows such as cabinet titles) are skipped when they would overlap.
      if (l.avoid && overlapArea(box, placed) > 0) continue;
      paintLabel(c, box, l.text, partPx, l.accent || "#c9a23a", l.bg || "rgba(38,24,12,0.88)");
      placed.push(box);
      partLabels.push({ kind: l.kind || p.id, text: l.text, box: [box.left, box.top, box.left + box.w, box.top + box.h] });
    }
  }
  debugInfo.partLabels = partLabels;
  if (scene === "vault") {
    debugInfo.labels = 0;
    debugInfo.labelOverlaps = 0;
    debugInfo.boxes = placed.filter((b) => !b.reserve).map((b) => [b.left, b.top, b.left + b.w, b.top + b.h]);
    return;
  }
  // Bot names: always on. Each name tries above the head, then higher, below the feet,
  // and to the sides; it takes the free spot, or the one with the least overlap.
  const namePx = Math.round(Math.min(14, Math.max(9, 6.5 * zoom)) * labelSize);
  const list = Array.from(town.agents.values()).filter((a) => !(town.isDimmed && town.isDimmed(a)));
  const rank = (a) => (a.id === following || a.id === town.selected ? 0 : 1);
  list.sort((a, b) => rank(a) - rank(b) || a.y - b.y || a.x - b.x);
  let overlaps = 0;
  for (const agent of list) {
    const text = shortName(agent);
    const ax = sx(agent.x * TILE + TILE / 2);
    const head = sy(agent.y * TILE - 6);
    const feet = sy(agent.y * TILE + 16);
    const base = labelBox(c, text, namePx, ax, head);
    if (base.left + base.w < -40 || base.left > viewW + 40 || base.top > viewH + 40 || feet < -40) continue;
    const h = base.h + 1;
    const cands = [
      [0, 0], [0, -h], [0, feet - head + h], [-base.w * 0.55, 0], [base.w * 0.55, 0],
      [0, -2 * h], [-base.w * 0.55, -h], [base.w * 0.55, -h], [0, feet - head + 2 * h], [0, -3 * h],
    ];
    let best = null;
    let bestA = Infinity;
    for (const [dx, dy] of cands) {
      const box = { left: Math.round(base.left + dx), top: Math.round(base.top + dy), w: base.w, h: base.h };
      keepInFrame(box);
      const a = overlapArea(box, placed);
      if (a < bestA) {
        bestA = a;
        best = box;
      }
      if (a === 0) break;
    }
    keepInFrame(best);
    if (bestA > base.w * base.h * 0.25) overlaps++;
    placed.push(best);
    paintLabel(c, best, text, namePx, agent.color);
  }
  debugInfo.labelOverlaps = overlaps;
  debugInfo.boxes = placed.filter((b) => !b.reserve).map((b) => [b.left, b.top, b.left + b.w, b.top + b.h]);
  debugInfo.labels = list.length;
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (town) {
    town.update(dt, now);
    trackFollow();
    renderHud();
    if (town.selected && !panel.hidden) {
      const agent = town.agents.get(town.selected);
      if (agent) openPanel(agent);
    }
  }
  ensureMap();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#10151f";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const s = zoom * dpr;
  ctx.setTransform(s, 0, 0, s, Math.round(-camX * s), Math.round(-camY * s));
  ctx.imageSmoothingEnabled = false;
  if (mapCanvas) ctx.drawImage(mapCanvas, 0, 0, worldW(), worldH());
  if (town) {
    town.screenNames = true;
    if (scene === "vault") for (const p of vworld.parts) p.drawUnder(ctx, town, vworld, now, window.AgentTown.PIX);
    else drawScene(ctx, town, world, now, honoluluParts().phase);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawScreenLabels(ctx);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/** Switch maps with a short fade. */
const fade = document.getElementById("fade");
const sceneBar = document.getElementById("scene-bar");
function setScene(name, after) {
  if (fade) fade.classList.add("on");
  setTimeout(() => {
    scene = name;
    if (name === "vault" && !vworld) vworld = window.AgentTown.vault.createWorld();
    document.body.classList.toggle("in-vault", name === "vault");
    if (sceneBar) sceneBar.hidden = name !== "vault";
    hideTip();
    closePanel();
    stopFollow();
    mapCanvas = null;
    framed = true;
    resize();
    if (fade) fade.classList.remove("on");
    if (after) after();
  }, fade ? 320 : 0);
}
const sceneUi = {
  enterVault: (after) => setScene("vault", after),
  leaveVault: (after) => setScene("castle", after),
};
const backBtn = document.getElementById("vault-back");
if (backBtn) backBtn.addEventListener("click", () => sceneUi.leaveVault());
window.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape" && scene === "vault") sceneUi.leaveVault();
});

function bootTown(list) {
  roster = list;
  world = createWorld(roster);
  mapCanvas = null;
  town = createTown(roster, world);
  lastHud = "";
  resize();
}

// Test hook (read-only view state, no data).
window.AgentTown.debug = {
  get town() {
    return town;
  },
  get view() {
    return { zoom, camX, camY, viewW, viewH, fit: fitZoom(), max: maxZoom(), following, framed, world: [worldW(), worldH()] };
  },
  get labels() {
    return Object.assign({}, debugInfo);
  },
  get world() {
    return world;
  },
  get scene() {
    return scene;
  },
  get vaultWorld() {
    return vworld;
  },
  enterVault: () => sceneUi.enterVault(),
  leaveVault: () => sceneUi.leaveVault(),
  /** Stage-relative screen point of a world tile point. */
  screenOfWorld(wx, wy) {
    const r = stage.getBoundingClientRect();
    return { x: r.left + (wx - camX) * zoom, y: r.top + (wy - camY) * zoom };
  },
  screenOf(id) {
    const a = town && town.agents.get(id);
    const r = stage.getBoundingClientRect();
    return a ? { x: r.left + (a.x * TILE + TILE / 2 - camX) * zoom, y: r.top + (a.y * TILE + 6 - camY) * zoom } : null;
  },
};

async function boot() {
  try {
    await connectFeed({
      onSnapshot(bots, status) {
        if (!town) bootTown(roster);
        town.applySnapshot(bots);
        renderUsage(status && status.usage);
      },
      onNeeds(items) {
        needItems = items;
        lastHud = null;
      },
      onStatus(info) {
        feedOk = info.ok;
        feedUpdatedAt = info.updatedAt;
        renderMode();
      },
      onRoster(list) {
        roster = list;
        buildSearch(list);
      },
    });
  } catch (err) {
    const fatal = document.getElementById("fatal");
    fatal.hidden = false;
    fatal.textContent = "Could not load the town. Check the connection and reload.";
    feedOk = false;
    renderMode();
  }
}

if (new URLSearchParams(location.search).get("view") === "list") {
  document.body.classList.add("list-view");
  if (window.AgentTown.bootList) window.AgentTown.bootList();
} else {
  boot();
}
})();
