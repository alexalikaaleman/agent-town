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
const rworlds = {}; // W4 core travel: the Art Gallery and the Music room, created on first visit
function cur() {
  if (scene === "castle") return world;
  if (scene === "vault") return vworld || world;
  return rworlds[scene] || world;
}
/** W2: the Wonkavator holds the camera from the walk (S1) until it is parked again. */
function camLocked() {
  const w = window.AgentTown.wonka;
  return scene !== "castle" && !!(w && w.locked());
}
let roster = [];
let town = null;
let mode = "loading";
let dpr = 1;
let mapCanvas = null;
let mapBuilds = 0;
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
/** World-px rect to fit when framed. On narrow screens the vault zooms to the
 *  cabinet block (tiles x 2-27, y 1-26) so each title sits under its cabinet and the Exit door shows. */
function fitBounds() {
  // 2026-11-03: the vault fits the WHOLE room again on every screen (the Wonkavator at x37-41 must show);
  // the phone cabinet-block crop (gap E2 / check3 3 / check4 1) is retired. Galleries unchanged (whole room).
  const w = worldW(), h = worldH();
  if (!(w > 0 && h > 0)) return { x: 0, y: 0, w: Math.max(1, w || 1), h: Math.max(1, h || 1) };
  return { x: 0, y: 0, w, h };
}
function fitZoom() {
  const p = framePad();
  const b = fitBounds();
  return Math.max(0.05, Math.min((viewW - p.l - p.r) / b.w, (viewH - p.t - p.b) / b.h));
}
function maxZoom() {
  // About four tiles across the shorter side: one bot fills the view.
  return Math.max(fitZoom(), Math.min(viewW, viewH) / (TILE * 4));
}
function clampZoom(z) {
  return Math.min(maxZoom(), Math.max(fitZoom(), z));
}
/** While following, the part of the stage the info panel covers (right column on desktop, bottom sheet on phones). */
function panelCover() {
  const none = { r: 0, b: 0 };
  if (!following || panel.hidden) return none;
  const card = panel.querySelector(".panel-card") || panel;
  const c = card.getBoundingClientRect();
  const r = stage.getBoundingClientRect();
  if (!c.width || !c.height) return none;
  if (c.left > r.left + r.width / 2) return { r: Math.max(0, Math.min(r.width * 0.6, r.right - c.left + 8)), b: 0 };
  return { r: 0, b: Math.max(0, Math.min(r.height * 0.6, r.bottom - c.top + 8)) };
}
function clampCam() {
  const p = Object.assign({}, framePad());
  const cover = panelCover();
  p.r += cover.r;
  p.b += cover.b;
  // W2: the whole room while locked or zoomed in (the phone vault can then reach the car at x38+);
  // the framed phone view keeps the cabinet block
  const b = camLocked() || zoom > fitZoom() + 1e-6 ? { x: 0, y: 0, w: worldW(), h: worldH() } : fitBounds();
  const fitAxis = (cam, view, size, origin, lo, hi) => {
    const min = origin - lo / zoom;
    const max = origin + size - (view - hi) / zoom;
    if (max <= min) return origin - (lo + (view - lo - hi - size * zoom) / 2) / zoom;
    return Math.min(max, Math.max(min, cam));
  };
  camX = fitAxis(camX, viewW, b.w, b.x, p.l, p.r);
  camY = fitAxis(camY, viewH, b.h, b.y, p.t, p.b);
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
  // Zoom straight in so the followed bot is easy to see.
  if (!camLocked() && zoom < fitZoom() * 3) zoomAt(Math.min(maxZoom(), fitZoom() * 3.5));
  const note = document.getElementById("mode-note");
  note.textContent = "Following " + town.agents.get(id).name + ". Tap empty space or press Escape to stop.";
}

function stopFollow() {
  following = null;
  if (town) town.follow = null;
  document.getElementById("mode-note").textContent = "";
}

function centerOn(agent, ease) {
  const cover = panelCover();
  const tx = agent.x * TILE + TILE / 2 - (viewW - cover.r) / zoom / 2;
  const ty = agent.y * TILE + 4 - (viewH - cover.b) / zoom / 2;
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

// ---------- idle auto-tour (fix autotour) ----------
// After 30 s with no player input in the castle (and no status view open) the camera follows a random
// working bot with the fix-17 follow state (zoomed in, others see-through, no panel) for 5 s each.
const TOUR = { IDLE_MS: 30000, STEP_MS: 5000, ZOOM_EASE: 0.12, ZOOM_K: 3.5 };
const tour = { active: false, id: null, idleMs: 0, stepMs: 0, lastId: null, saved: null, starts: 0, switches: 0, stops: {}, lastT: 0, back: null };
const tourRM = () => !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
const tourZoom = () => Math.min(maxZoom(), fitZoom() * TOUR.ZOOM_K);
function tourBlocked() {
  if (!town || scene !== "castle" || document.body.classList.contains("list-view") || document.hidden) return true;
  if (!panel.hidden || town.selected) return true;
  if (following && !tour.active) return true;
  const hist = document.getElementById("history");
  if (hist && !hist.hidden) return true;
  const tip = document.getElementById("tip");
  if (tip && !tip.hidden) return true;
  const AT = window.AgentTown || {};
  if (AT.confirmBox && AT.confirmBox.isOpen()) return true;
  if (AT.wonka && AT.wonka.busy && AT.wonka.busy()) return true;
  const fd = document.getElementById("fade");
  if (fd && fd.classList.contains("on")) return true;
  return false;
}
function tourWorking() {
  return Array.from(town.agents.values()).filter((a) => a.state === "working" && !(town.filter.size && !town.filter.has(a.id)));
}
function tourPick() {
  let list = tourWorking();
  if (list.length >= 2) list = list.filter((a) => a.id !== tour.id);
  if (!list.length) return null;
  return list[Math.floor(Math.random() * list.length)].id;
}
function tourFollow(id) {
  following = id;
  town.follow = id;
  tour.lastId = tour.id;
  tour.id = id;
  tour.stepMs = 0;
  if (tourRM()) {
    zoomAt(tourZoom());
    framed = false;
    const a = town.agents.get(id);
    if (a) centerOn(a, 1);
  }
}
function tourStart() {
  tour.back = null;
  tour.saved = { zoom, camX, camY, framed };
  tour.active = true;
  tour.starts++;
  tourFollow(tourPick());
}
tour.stop = function (reason) {
  if (tour.active) {
    following = null;
    if (town) town.follow = null;
    tour.active = false;
    tour.id = null;
  }
  tour.back = null;
  tour.idleMs = 0;
  tour.stops[reason] = (tour.stops[reason] || 0) + 1;
};
function tourEnd() {
  // D3: no working bots left -> ease back to the view saved at tour start (a cut under reduced motion)
  const saved = tour.saved;
  tour.stop("none-working");
  if (!saved) return;
  if (tourRM()) tourBackDone(saved);
  else tour.back = { from: { zoom, camX, camY }, to: saved, t0: performance.now(), ms: 400 };
}
function tourBackDone(saved) {
  zoom = clampZoom(saved.zoom);
  camX = saved.camX;
  camY = saved.camY;
  framed = !!saved.framed;
  tour.back = null;
  if (framed) resize();
  else clampCam();
}
function tourTick(now) {
  const dt = Math.min(100, now - (tour.lastT || now));
  tour.lastT = now;
  if (tour.back) {
    const k = Math.min(1, (now - tour.back.t0) / tour.back.ms);
    const f = tour.back.from, t = tour.back.to;
    if (k >= 1) tourBackDone(t);
    else {
      zoom = clampZoom(f.zoom + (t.zoom - f.zoom) * k);
      camX = f.camX + (t.camX - f.camX) * k;
      camY = f.camY + (t.camY - f.camY) * k;
      framed = false;
      clampCam();
    }
  }
  if (tourBlocked()) {
    if (tour.active) tour.stop("blocked");
    tour.idleMs = 0;
    return;
  }
  if (!tour.active) {
    tour.idleMs += dt;
    if (tour.idleMs >= TOUR.IDLE_MS && tourPick()) tourStart();
    return;
  }
  const a = town.agents.get(tour.id);
  if (!a || a.state !== "working") {
    const n = tourPick();
    if (n) {
      tour.switches++;
      tourFollow(n);
    } else tourEnd();
    return;
  }
  if (!tourRM() && zoom < tourZoom() - 1e-3) {
    zoom = clampZoom(zoom + (tourZoom() - zoom) * TOUR.ZOOM_EASE);
    framed = false;
    clampCam();
  }
  tour.stepMs += dt;
  if (tour.stepMs >= TOUR.STEP_MS) {
    const n = tourPick();
    if (n && n !== tour.id) {
      tour.switches++;
      tourFollow(n);
    } else tour.stepMs = 0;
  }
}
function tourInput(type) {
  if (tour.active) tour.stop(type);
  tour.back = null;
  tour.idleMs = 0;
}
// capture phase on window, passive: the tour stops before the normal handlers run, and they still run (D4)
for (const type of ["wheel", "pointerdown", "pointerup", "click", "touchstart", "touchmove", "keydown", "gesturestart"]) {
  window.addEventListener(type, () => tourInput(type), { capture: true, passive: true });
}
window.addEventListener("pointermove", (ev) => {
  if (ev.buttons !== 0 || ev.pointerType === "touch") tourInput("pointermove"); // D5: plain hover is not activity
}, { capture: true, passive: true });
document.addEventListener("visibilitychange", () => tourInput("visibility"));

function ensureMap() {
  // Cache the static map at a whole-number scale near the current zoom (max 4096 px).
  const want = Math.max(1, Math.ceil(zoom * dpr));
  const cap = Math.max(1, Math.floor(4096 / Math.max(worldW(), worldH())));
  const s = Math.min(want, cap);
  const pl = cur().plate && window.AgentTown.art ? window.AgentTown.art.get(cur().plate) : null;
  const key = scene + ":" + s + ":" + cur().w + "x" + cur().h + ":" + cur().buildings.length + (pl && pl.ok ? ":plate" : "");
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
  mapBuilds++; // fix moat: the ripple never rebuilds the map
}

new ResizeObserver(resize).observe(stage);
window.addEventListener("resize", resize);
resize();


// Needs Alex strip (old behaviour): shown under the top bar whenever something needs Alex, each item
// with the bot name and its full line, urgent first, then oldest. The Needs Alex button hides/shows it.
let needsOpen = window.innerWidth > 640 && window.innerHeight >= 500;
let needsSavedForVault = null; // Needs open-state restored when leaving the vault
let needsAsked = false; // the button was pressed: show "Nothing needs Alex" when the list is empty
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

  if (lastUsage !== undefined) renderUsage(lastUsage);
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
  needsEl.hidden = !needsOpen || (!items.length && !needsAsked);
  if (needsEl.hidden) return;
  if (!items.length) {
    const none = document.createElement("p");
    none.className = "needs-none";
    needsAsked = false;
    none.textContent = "Nothing needs Alex right now.";
    needsEl.appendChild(none);
    return;
  }
  const label = document.createElement("span");
  label.className = "needs-label";
  label.textContent = "Needs Alex (urgent first, then oldest)";
  needsEl.appendChild(label);
  for (const it of items) {
    const agent = town.agents.get(it.bot);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "need " + it.kind;
    btn.textContent = (it.kind === "urgent" ? "! " : "? ") + agent.name + (it.text ? ": " + it.text : "");
    btn.title = ago(it.ts);
    btn.addEventListener("click", () => focusBot(it.bot, true));
    needsEl.appendChild(btn);
  }
}

/** Usage bar: overall weekly %, cap lines at 58 and 65, per-bot slices when present. */
const USAGE_SOFT = 58;
const USAGE_HARD = 65;
let usageKey = "";
let lastUsage = null;
function renderUsage(usage) {
  lastUsage = usage || null;
  const el = document.getElementById("usage");
  const pct = usage && Number.isFinite(usage.weeklyPct) ? Math.max(0, Math.min(100, usage.weeklyPct)) : null;
  const age = usage && usage.ts ? ago(usage.ts) : null;
  const key = JSON.stringify(usage || null) + "|" + (usage && usage.ts ? ago(usage.ts) : "");
  if (key === usageKey) return;
  usageKey = key;
  const fill = document.getElementById("usage-fill");
  const text = document.getElementById("usage-text");
  fill.replaceChildren();
  if (pct == null) {
    text.textContent = "Usage: not posted yet";
    fill.style.width = "0";
    el.className = "";
    return;
  }
  // Stale when usage.ts is more than 60 min old (feed "Updated" badge must not stand in).
  const ageMs = usage && usage.ts ? Date.now() - Date.parse(usage.ts) : NaN;
  const stale = Number.isFinite(ageMs) && ageMs > 60 * 60 * 1000;
  el.className = (pct >= USAGE_HARD ? "hard" : pct >= USAGE_SOFT ? "soft" : "") + (stale ? " stale" : "");
  text.textContent = "Usage " + Math.round(pct) + "%" + (age ? " · as of " + age : " · time unknown") + (pct >= USAGE_HARD ? " · stop" : pct >= USAGE_SOFT ? " · no new steps" : "");
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
const HISTORY_DEADLINE_MS = 10000;
async function openHistory() {
  const box = document.getElementById("history");
  const list = document.getElementById("history-list");
  const run = ++historyRun;
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
    // One overall deadline: even if the pinned read and its fallback both hang, the list never sits on "Loading…".
    const deadline = new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), HISTORY_DEADLINE_MS));
    const lines = (await Promise.race([loadHistory(new Date()), deadline])).slice(0, 60);
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

/** Chip row: "All" first (highlighted when no filter), then one chip per bot with its coloured dot.
 *  Tap chips to show only those bots. "All" clears the filter and opens the full bot list (one
 *  button per bot); tapping "All" again hides it. Scrolls sideways. */
function buildFilters(list) {
  const bar = document.getElementById("filters");
  bar.replaceChildren();
  const all = document.createElement("button");
  all.type = "button";
  all.className = "chip all on";
  all.dataset.id = "";
  all.textContent = "All";
  all.setAttribute("aria-controls", "all-bots");
  all.setAttribute("aria-expanded", "false");
  bar.appendChild(all);
  buildAllBots(list);
  for (const bot of list) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.dataset.id = bot.id;
    chip.style.setProperty("--dot", bot.color || "#888");
    chip.textContent = bot.name;
    bar.appendChild(chip);
  }
  if (!bar.dataset.wired) {
    bar.dataset.wired = "1";
    bar.addEventListener("click", (ev) => {
      const chip = ev.target.closest(".chip");
      if (!chip || !town) return;
      const id = chip.dataset.id;
      if (!id) {
        town.filter.clear();
        toggleAllBots();
      } else {
        if (town.filter.has(id)) town.filter.delete(id);
        else town.filter.add(id);
      }
      syncFilters();
      if (id) {
        // Chip click = the same as a single tap on the bot: panel, camera follow, others fade.
        const a = town.agents.get(id);
        if (a) { openPanel(a); startFollow(id); centerOn(a, 1); }
      }
    });
  }
  syncFilters();
}

/** The full bot list under the chip row (opened by the "All" chip): one button per bot. A tap zooms
 *  in on that bot, opens its panel and follows it (same as tapping the bot on the map). */
function buildAllBots(list) {
  const box = document.getElementById("all-bots");
  box.replaceChildren();
  for (const bot of list) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "bot-btn";
    btn.dataset.id = bot.id;
    btn.style.setProperty("--dot", bot.color || "#888");
    btn.textContent = bot.name;
    box.appendChild(btn);
  }
  if (!box.dataset.wired) {
    box.dataset.wired = "1";
    box.addEventListener("click", (ev) => {
      const btn = ev.target.closest(".bot-btn");
      if (!btn || !town) return;
      const agent = town.agents.get(btn.dataset.id);
      if (!agent) return;
      openPanel(agent);
      startFollow(agent.id);
      if (!camLocked()) centerOn(agent, 1);
    });
  }
}

function toggleAllBots(open) {
  const box = document.getElementById("all-bots");
  const show = open === undefined ? box.hidden : !!open;
  if (show) box.style.top = Math.round(document.getElementById("chiprow").getBoundingClientRect().bottom + 4) + "px";
  box.hidden = !show;
  const all = document.querySelector("#filters .chip.all");
  if (all) all.setAttribute("aria-expanded", show ? "true" : "false");
}

function syncFilters() {
  if (!town) return;
  for (const chip of document.querySelectorAll("#filters .chip")) {
    const id = chip.dataset.id;
    const on = id ? town.filter.has(id) : town.filter.size === 0;
    chip.classList.toggle("on", on);
    chip.setAttribute("aria-pressed", on ? "true" : "false");
  }
}

/** Fix 24: the panel never slides under the top bar / Needs strip, so Back stays reachable. */
function placePanel() {
  if (panel.hidden) return;
  const vp = document.getElementById("viewport").getBoundingClientRect();
  if (window.innerWidth >= 900) {
    panel.style.top = Math.max(0, Math.round(vp.top)) + "px";
    panel.style.bottom = "";
    panel.style.maxHeight = "";
  } else {
    // Phone: sit between the top UI and the bottom strip (fix 27 keeps the strip visible).
    const strip = document.getElementById("strip").getBoundingClientRect();
    const bottom = strip.height ? Math.max(0, Math.round(window.innerHeight - strip.top)) : 0;
    panel.style.top = "";
    panel.style.bottom = bottom + "px";
    panel.style.maxHeight = Math.max(160, Math.round(window.innerHeight - bottom - vp.top)) + "px";
  }
}
window.addEventListener("resize", placePanel);

function openPanel(agent) {
  town.selected = agent.id;
  panel.hidden = false;
  placePanel();
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
  const folders = agent.folders || [];
  const main = folders.find((f) => f.link) || null;
  // Fix 25: a Drive folder button at the bottom of every panel. Fix 20: it shows the folder by name.
  // Only the approved chest link is clickable; other folders are names only.
  // Rebuild only when the bot changes: openPanel runs every frame, and a button that is
  // replaced between press and release never gets its click.
  const key = agent.id + "|" + driveUrl + "|" + folders.map((f) => f.name).join("/");
  const fresh = driveEl.dataset.key !== key;
  if (fresh) driveEl.dataset.key = key;
  if (fresh) driveEl.replaceChildren();
  if (!fresh) {
    // nothing to rebuild
  } else if (driveUrl) {
    const link = document.createElement("a");
    link.href = driveUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "drive-btn";
    link.textContent = "Drive folder: " + (main ? main.name : agent.name);
    driveEl.appendChild(link);
  } else {
    const off = document.createElement("span");
    off.className = "drive-btn off";
    off.textContent = "Drive folder: no approved link";
    driveEl.appendChild(off);
  }
  // Fix 21: every folder and file location we know for this bot (names only).
  const list = document.getElementById("p-folder-list");
  if (fresh) list.replaceChildren();
  for (const f of fresh ? folders : []) {
    const li = document.createElement("li");
    const nm = document.createElement("b");
    nm.textContent = f.name;
    li.append(nm, document.createTextNode(" · " + f.where + (f.link ? " (link below)" : "")));
    list.appendChild(li);
  }
  if (fresh && !folders.length) {
    const li = document.createElement("li");
    li.textContent = "No folder data yet.";
    list.appendChild(li);
  }
  let timeText = agent.ts ? "Updated " + formatStamp(agent.ts) : "No status line yet";
  if (agent.ping) timeText += " · last ping " + ago(agent.ping);
  if (agent.stalled) timeText += " · stalled (no new line for " + ago(agent.ts).replace(" ago", "") + ")";
  document.getElementById("p-time").textContent = timeText;
  document.getElementById("p-project").textContent = agent.project ? "Project: " + agent.project : "";
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
  if (camLocked()) return; // W2: the panel still opens, the camera stays on the Wonkavator
  if (zoom < fitZoom() * 2) zoomAt(Math.min(maxZoom(), fitZoom() * 2.5));
  centerOn(agent, 1);
}

document.getElementById("panel-close").addEventListener("click", closePanel);
document.getElementById("zoom-in").addEventListener("click", () => camLocked() || stepZoom(1.25));
document.getElementById("zoom-out").addEventListener("click", () => camLocked() || stepZoom(0.8));
document.getElementById("label-size").addEventListener("click", () => {
  labelSize = LABEL_SIZES[(LABEL_SIZES.indexOf(labelSize) + 1) % LABEL_SIZES.length];
  localStorage.setItem("agentTownLabelSize", String(labelSize));
  resize();
});
document.getElementById("needs-btn").addEventListener("click", () => {
  needsOpen = !needsOpen;
  needsAsked = needsOpen;
  lastHud = "";
  if (needsOpen) document.getElementById("history").hidden = true;
});
document.getElementById("history-btn").addEventListener("click", () => {
  needsOpen = false;
  needsAsked = false;
  lastHud = "";
  renderHud();
  openHistory();
});
document.getElementById("history-close").addEventListener("click", () => {
  document.getElementById("history").hidden = true;
});
stage.addEventListener(
  "wheel",
  (ev) => {
    ev.preventDefault();
    if (camLocked()) return;
    const k = ev.ctrlKey ? 0.01 : 0.0015;
    stepZoom(Math.exp(-ev.deltaY * k), ev.clientX, ev.clientY);
  },
  { passive: false }
);
window.addEventListener("keydown", (ev) => {
  if (ev.target && ev.target.closest && ev.target.closest("input, textarea")) return;
  if (confirmOpen()) return; // fix 40: the Play box owns the keyboard while open
  if (ev.key === "Escape") {
    closePanel();
    stopFollow();
  }
  if (camLocked()) return;
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
let vaultHoverTip = null; // full name shown while hovering a truncated vault title
stage.addEventListener("pointermove", (ev) => {
  if (touches.has(ev.pointerId)) touches.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (pinch && touches.size >= 2) {
    // Continuous pinch: zoom with the finger spread, and pan with the midpoint.
    if (camLocked()) return;
    const p = pinchState();
    zoom = clampZoom(pinch.zoom * (p.dist / pinch.dist));
    framed = Math.abs(zoom - fitZoom()) < 1e-6;
    camX = pinch.wx - p.mx / zoom;
    camY = pinch.wy - p.my / zoom;
    clampCam();
    return;
  }
  if (scene === "vault" && (!pointer || !pointer.drag)) trackVaultTitleHover(ev);
  if (!pointer || ev.pointerId !== pointer.id) return;
  const dx = ev.clientX - pointer.x;
  const dy = ev.clientY - pointer.y;
  if (Math.hypot(dx, dy) > 8) pointer.drag = true;
  if (pointer.drag) {
    if (camLocked()) return;
    camX = pointer.cx - dx / zoom;
    camY = pointer.cy - dy / zoom;
    clampCam();
    if (town) town.hoverChest = null;
    clearVaultHoverTip();
    return;
  }
  trackChestHover(ev);
});
stage.addEventListener("pointerleave", () => {
  if (town) town.hoverChest = null;
  clearVaultHoverTip();
});
function vaultTitleAt(clientX, clientY) {
  const r = stage.getBoundingClientRect();
  const lx = clientX - r.left, ly = clientY - r.top;
  return (debugInfo.partLabels || []).slice().reverse().find((l) => (l.kind === "cabinet" || l.kind === "wonka") && l.at && lx >= l.box[0] && lx <= l.box[2] && ly >= l.box[1] && ly <= l.box[3]) || null;
}
function trackVaultTitleHover(ev) {
  // Desktop only: fine pointer. Touch devices get the full name on tap instead.
  if (ev.pointerType === "touch") return;
  const tl = vaultTitleAt(ev.clientX, ev.clientY);
  if (tl && tl.truncated && tl.full) {
    if (vaultHoverTip !== tl.full) {
      vaultHoverTip = tl.full;
      showTip(tl.full, "");
    }
  } else {
    clearVaultHoverTip();
  }
}
function clearVaultHoverTip() {
  if (vaultHoverTip == null) return;
  vaultHoverTip = null;
  hideTip();
}

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
  if (scene !== "castle") {
    if (confirmOpen()) return; // fix 40: nothing behind the open Play box reacts
    let vp = toWorld(ev.clientX, ev.clientY);
    // Titles draw on top: the title the viewer taps is the game they mean.
    // Coming-soon cabinets (fix 39) show a gray title + 'coming soon' and stay inert via hit().
    const tl = vaultTitleAt(ev.clientX, ev.clientY);
    if (tl) vp = { x: tl.at[0], y: tl.at[1] };
    for (const p of vworld.parts) if (p.hit && p.hit(town, vp.x, vp.y, sceneUi)) {
      // Truncated title: show the full name on the cabinet tap (reachable without zooming).
      const named = tl || (debugInfo.partLabels || []).find((l) => l.kind === "cabinet" && l.truncated && l.at && Math.hypot(l.at[0] - vp.x, l.at[1] - vp.y) < 24);
      if (named && named.truncated && named.full) {
        vaultHoverTip = null;
        showTip(named.full, "");
      }
      return;
    }
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
    // Single tap: zoom straight in on the bot, open its panel, follow it and fade the others.
    openPanel(hit);
    startFollow(hit.id);
    centerOn(hit, 1);
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

/** Truncate each line of text so the painted box stays ≤ maxW (canvas px). */
function fitLinesToWidth(c, text, px, maxW) {
  c.font = px + "px ui-monospace, monospace";
  return String(text || "").split("\n").map((ln) => {
    if (c.measureText(ln).width + 6 <= maxW) return ln;
    let out = ln;
    while (out.length > 1 && c.measureText(out + "…").width + 6 > maxW) out = out.slice(0, -1);
    return (out.length ? out : "") + "…";
  }).join("\n");
}
/** Re-wrap words to fit maxW before cutting with an ellipsis. */
function rewrapToWidth(c, text, px, maxW) {
  c.font = px + "px ui-monospace, monospace";
  const lines = [];
  for (const w of String(text || "").replace(/\n/g, " ").split(/\s+/).filter(Boolean)) {
    const i = lines.length - 1;
    if (i >= 0 && c.measureText(lines[i] + " " + w).width + 6 <= maxW) lines[i] += " " + w;
    else lines.push(w);
  }
  return lines.join("\n");
}
/** Fix 37: the title as drawn at px: as written, else re-wrapped, so it fits maxW×maxH; null if neither fits. */
function vaultFitText(c, text, px, maxW, maxH) {
  const a = labelBox(c, text, px, 0, 0);
  if (a.w <= maxW && a.h <= maxH) return text;
  const re = rewrapToWidth(c, text, px, maxW);
  const b = labelBox(c, re, px, 0, 0);
  if (b.w <= maxW && b.h <= maxH) return re;
  return null;
}
/** Fix 39: a label with a sub line ("coming soon") keeps that line under the fitted title. */
function vaultCompose(c, l, px, maxW, maxH, noWrap) {
  if (!l.sub) return vaultFitText(c, l.text, px, maxW, maxH);
  c.font = px + "px ui-monospace, monospace";
  // the sub line stays whole; if it is too wide on one line it wraps by word ("coming" / "soon")
  let sub = l.sub;
  if (Math.ceil(c.measureText(sub).width) + 6 > maxW) {
    const words = sub.split(" ");
    if (noWrap || words.some((w) => Math.ceil(c.measureText(w).width) + 6 > maxW)) return null;
    sub = words.join("\n");
  }
  const subLines = sub.split("\n").length;
  const t = vaultFitText(c, l.text, px, maxW, maxH - subLines * (px + 2));
  return t == null ? null : t + "\n" + sub;
}
/** Largest font (from startPx down to 6) at which the title fits its box, as written or re-wrapped. */
function vaultTitlePx(c, l, startPx, maxW, maxH) {
  // a one-line "coming soon" at a smaller size beats a wrapped one at a bigger size
  if (l.sub) for (let px = startPx; px > 6; px--) if (vaultCompose(c, l, px, maxW, maxH, true) != null) return px;
  for (let px = startPx; px > 6; px--) if (vaultCompose(c, l, px, maxW, maxH) != null) return px;
  return 6;
}
function labelBox(c, text, px, x, y) {
  c.font = px + "px ui-monospace, monospace";
  const lines = String(text || "").split("\n");
  let tw = 0;
  for (const ln of lines) tw = Math.max(tw, Math.ceil(c.measureText(ln).width));
  const w = tw + 6;
  const h = lines.length * px + 4 + Math.max(0, lines.length - 1) * 2;
  return { left: Math.round(x - w / 2), top: Math.round(y - h), w, h, lines };
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
function paintLabel(c, box, text, px, accent, bg, textColor) {
  c.fillStyle = bg || "rgba(20,18,15,0.9)";
  c.fillRect(box.left, box.top, box.w, box.h);
  c.fillStyle = accent || "#ffe14a";
  c.fillRect(box.left, box.top, 2, box.h);
  c.fillStyle = textColor || "#fff8e6";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.font = px + "px ui-monospace, monospace";
  const lines = (box.lines && box.lines.length) ? box.lines : String(text || "").split("\n");
  const lineH = px + 2;
  const startY = box.top + box.h / 2 - ((lines.length - 1) * lineH) / 2;
  for (let i = 0; i < lines.length; i++) {
    c.fillText(lines[i], box.left + box.w / 2 + 1, startY + i * lineH + 0.5);
  }
}

function drawScreenLabels(c) {
  if (debugInfo.hideLabels) return; // tests only (moat review shot): screen labels off
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
  const cabPlaced = [];
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
  // Vault: one font size per cabinet row (the tightest title in that row wins).
  const vaultRowPx = new Map();
  const vaultMaxW = 5 * TILE * zoom - 6;
  const vaultMaxH = 4 * TILE * zoom - 4;
  // Fix 37: arcade titles start ~10% bigger than other part labels, then shrink/re-wrap to fit their box.
  const cabPx = Math.round(Math.min(13.2, Math.max(8.8, 6.05 * zoom)) * labelSize);
  debugInfo.vaultText = { partPx: partPx, cabPx: cabPx, maxW: vaultMaxW, maxH: vaultMaxH };
  if (scene === "vault") {
    for (const p of cur().parts) {
      if (!p.labels) continue;
      for (const l of p.labels(town, cur()) || []) {
        if (l.kind !== "cabinet" || !l.at) continue;
        const row = l.at[1];
        const px = vaultTitlePx(c, l, cabPx, vaultMaxW, vaultMaxH);
        const prev = vaultRowPx.get(row);
        vaultRowPx.set(row, prev == null ? px : Math.min(prev, px));
      }
    }
  }
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
      // Vault cabinet titles: keep width under the 5-tile cabinet pitch so neighbours never overlap.
      let drawText = l.text;
      let drawPx = partPx;
      if (scene === "vault" && l.kind === "cabinet") {
        drawPx = (l.at && vaultRowPx.get(l.at[1])) || cabPx;
        let fitT = vaultCompose(c, l, drawPx, vaultMaxW, vaultMaxH, true);
        if (fitT == null) fitT = vaultCompose(c, l, drawPx, vaultMaxW, vaultMaxH);
        // never overflow: a title that still won't fit at the smallest size is re-wrapped, then cut with "…"
        if (fitT != null) drawText = fitT;
        else {
          const all = rewrapToWidth(c, l.text, drawPx, vaultMaxW).split("\n");
          let subL = [];
          if (l.sub) {
            c.font = drawPx + "px ui-monospace, monospace";
            const words = l.sub.split(" ");
            const fitsWord = (w) => Math.ceil(c.measureText(w).width) + 6 <= vaultMaxW;
            subL = fitsWord(l.sub) ? [l.sub] : words.every(fitsWord) ? words : [l.sub];
          }
          const lines = Math.floor((vaultMaxH - 2) / (drawPx + 2));
          if (subL.length > 1 && lines - subL.length < 1) subL = [l.sub];
          const room = Math.max(1, lines - subL.length);
          const keep = all.slice(0, room);
          if (keep.length < all.length) keep[keep.length - 1] = keep[keep.length - 1].replace(/…$/, "") + "…";
          for (const sl of subL) keep.push(sl);
          drawText = fitLinesToWidth(c, keep.join("\n"), drawPx, vaultMaxW);
        }
      }
      let box = labelBox(c, drawText, drawPx, sx(l.x), l.above ? sy(l.y) - 3 : sy(l.y) + drawPx + 4);
      if (l.above && box.top < 0) box.top = 0; // "above" labels sit on the sprite top edge, kept on screen
      if (box.left + box.w < 0 || box.left > viewW || box.top > viewH || box.top + box.h < 0) continue;
      const natTop = box.top;
      keepInFrame(box);
      // fix 39: a vault title pushed up by the frame edge must not land on the row above (zoomed views):
      // then it stays under its own cabinet and the edge clips it, like the cabinet itself
      if (scene === "vault" && l.kind === "cabinet") {
        if (box.top !== natTop && overlapArea(box, cabPlaced) > 0) box.top = natTop;
        cabPlaced.push(box);
      }
      // Vault cabinet titles stay under their own cabinet (no collision nudge).
      if (!l.avoid && !(scene === "vault" && l.kind === "cabinet") && overlapArea(box, placed) > 0) {
        // nudge down, then up, until it is clear of room names and other part labels
        for (const dy of [box.h + 1, -(box.h + 1), 2 * (box.h + 1)]) {
          const alt = { left: box.left, top: box.top + dy, w: box.w, h: box.h };
          keepInFrame(alt);
          if (overlapArea(alt, placed) === 0) {
            box = alt;
            break;
          }
        }
      }
      // "avoid" labels (dense rows such as cabinet titles) are skipped when they would overlap.
      if (l.avoid && overlapArea(box, placed) > 0) continue;
      paintLabel(c, box, drawText, drawPx, l.accent || "#c9a23a", l.bg || "rgba(38,24,12,0.88)", l.textColor);
      placed.push(box);
      const full = l.full || String(l.text || "").replace(/\n/g, " ");
      const truncated = drawText.indexOf("…") >= 0;
      partLabels.push({ kind: l.kind || p.id, soon: !!l.soon, textColor: l.textColor || null, text: drawText, full: full, truncated: truncated, px: drawPx, at: l.at, box: [box.left, box.top, box.left + box.w, box.top + box.h] });
    }
  }
  debugInfo.partLabels = partLabels;
  if (scene !== "castle") {
    debugInfo.labels = 0;
    debugInfo.labelOverlaps = 0;
    debugInfo.boxes = placed.filter((b) => !b.reserve).map((b) => [b.left, b.top, b.left + b.w, b.top + b.h]);
    return;
  }
  // Bot names: always on. Each name tries above the head, then higher, below the feet,
  // and to the sides; it takes the free spot, or the one with the least overlap.
  const namePx = Math.round(Math.min(14, Math.max(9, 6.5 * zoom)) * labelSize);
  // Chip filter: names of filtered-out bots are hidden. Focus: names of the other bots are drawn
  // see-through (like their sprites), and the focused bot's name is placed first.
  const focusId = town.follow;
  debugInfo.focus = focusId; // fix autotour: tests read labels.focus
  const list = Array.from(town.agents.values()).filter((a) => a.id === focusId || !(town.filter.size && !town.filter.has(a.id)));
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
    // Candidates nearest first: above the head (stacking up), below the feet (stacking down), and
    // shifted sideways; the first free one wins, else the one with the least overlap.
    const below = feet - head + h;
    const cands = [];
    for (const [dy, dyCost] of [[0, 0], [-h, 1], [below, 1.2], [-2 * h, 2], [below + h, 2.2], [-3 * h, 3], [below + 2 * h, 3.2], [-4 * h, 4], [below + 3 * h, 4.2], [-5 * h, 5]]) {
      for (const [dx, dxCost] of [[0, 0], [-base.w * 0.55, 0.9], [base.w * 0.55, 0.9], [-base.w * 1.1, 1.8], [base.w * 1.1, 1.8]]) {
        cands.push([dx, dy, dyCost + dxCost]);
      }
    }
    cands.sort((p, q) => p[2] - q[2]);
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
    const faded = focusId && agent.id !== focusId;
    if (faded) c.globalAlpha = 0.28;
    paintLabel(c, best, text, namePx, agent.color);
    if (faded) c.globalAlpha = 1;
  }
  debugInfo.labelOverlaps = overlaps;
  debugInfo.boxes = placed.filter((b) => !b.reserve).map((b) => [b.left, b.top, b.left + b.w, b.top + b.h]);
  debugInfo.labels = list.length;
  debugInfo.focus = focusId || null;
  debugInfo.fadedLabels = focusId ? list.length - 1 : 0;
}

let last = performance.now();
// ---------- W2: Wonkavator camera lock ----------
// Locked from S1 until parked: target = the ninja in S1, then the cabin centre (632,176), zoom fit x 2.2,
// ease 0.15 (instant under reduced motion). On release it eases back to the framed view in 400 ms.
let camWasLocked = false;
let camEase = null;
const wonkaBtn = document.getElementById("wonka-go");
function wonkaCam(now) {
  const w = window.AgentTown.wonka;
  if (!w || scene === "castle") {
    camWasLocked = false;
    camEase = null;
    if (wonkaBtn && !wonkaBtn.hidden) wonkaBtn.hidden = true;
    return;
  }
  const t = w.camTarget();
  const rmNow = tourRM();
  if (t) {
    camWasLocked = true;
    camEase = null;
    const k = rmNow ? 1 : 0.15;
    zoom += (clampZoom(fitZoom() * 2.2) - zoom) * k;
    framed = false;
    camX += (t.x - viewW / 2 / zoom - camX) * k;
    camY += (t.y - viewH / 2 / zoom - camY) * k;
    clampCam();
  } else if (camWasLocked) {
    camWasLocked = false;
    const from = { z: zoom, x: camX, y: camY };
    framed = true;
    resize();
    if (!rmNow) {
      camEase = { t0: now, from, to: { z: zoom, x: camX, y: camY } };
      zoom = from.z;
      camX = from.x;
      camY = from.y;
      framed = false;
    }
  }
  if (camEase) {
    const p = Math.min(1, (now - camEase.t0) / 400);
    const e = p * p * (3 - 2 * p);
    const a = camEase.from, b = camEase.to;
    zoom = a.z + (b.z - a.z) * e;
    camX = a.x + (b.x - a.x) * e;
    camY = a.y + (b.y - a.y) * e;
    if (p >= 1) {
      camEase = null;
      framed = true;
      resize();
    }
  }
  const vb = document.getElementById("vault-back");
  if (vb) {
    const dis = !["S0", "S1"].includes(w.state());
    if ((vb.getAttribute("aria-disabled") === "true") !== dis) vb.setAttribute("aria-disabled", dis ? "true" : "false");
  }
  // phone: while the car is off-screen in the framed vault, the scene bar offers "Wonkavator ->"
  if (wonkaBtn) {
    const sx0 = (608 - camX) * zoom, sx1 = (656 - camX) * zoom, sy0 = (144 - camY) * zoom, sy1 = (208 - camY) * zoom;
    const off = sx1 <= 0 || sx0 >= viewW || sy1 <= 0 || sy0 >= viewH;
    const show = scene === "vault" && framed && !camEase && off && w.state() === "S0";
    if (wonkaBtn.hidden === show) wonkaBtn.hidden = !show;
  }
}
if (wonkaBtn) wonkaBtn.addEventListener("click", () => {
  const w = window.AgentTown.wonka;
  if (w && town && scene !== "castle") w.tap(town, sceneUi);
});

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (town) {
    town.update(dt, now);
    trackFollow();
    wonkaCam(now);
    tourTick(now);
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
    if (scene !== "castle") for (const p of cur().parts) {
      p.drawUnder(ctx, town, cur(), now, window.AgentTown.PIX);
      if (p.drawOver) p.drawOver(ctx, town, cur(), now, window.AgentTown.PIX); // W2 hook (car layer, W4)
    }
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
function confirmOpen() {
  const box = window.AgentTown.confirmBox;
  return !!(box && box.isOpen());
}
function setScene(name, after) {
  if (confirmOpen()) window.AgentTown.confirmBox.close("no");
  if (fade) fade.classList.add("on");
  setTimeout(() => {
    if (window.AgentTown.wonka) window.AgentTown.wonka.reset(); // W2: leaving mid-boarding drops it (S0)
    camWasLocked = false;
    camEase = null;
    scene = name;
    if (name === "vault" && !vworld) vworld = window.AgentTown.vault.createWorld();
    if (name !== "castle" && name !== "vault" && !rworlds[name]) rworlds[name] = window.AgentTown.vault.createRoom(name);
    document.body.classList.toggle("in-vault", name !== "castle");
    document.body.classList.toggle("not-castle", name !== "castle"); // W4: hides #play-hint whenever scene !== 'castle'
    if (sceneBar) {
      sceneBar.hidden = name === "castle";
      const rn = name === "vault" ? "Treasure Vault" : (window.AgentTown.vault.ROOMS[name] || {}).name;
      const sp = sceneBar.querySelector("span");
      if (sp && rn) sp.textContent = rn;
      const bb = document.getElementById("vault-back");
      if (bb) bb.textContent = name === "vault" ? "\u2190 Back to castle" : "\u2190 Back to vault";
    }
    // Auto-collapse Needs in the vault so short laptop windows keep full cabinet titles;
    // restore the previous open/closed state when going Back to castle.
    if (name !== "castle") {
      if (needsSavedForVault == null) needsSavedForVault = needsOpen;
      needsOpen = false;
      lastHud = "";
      renderHud();
    } else if (name === "castle" && needsSavedForVault != null) {
      needsOpen = needsSavedForVault;
      needsSavedForVault = null;
      lastHud = "";
      renderHud();
    }
    hideTip();
    clearVaultHoverTip();
    closePanel();
    stopFollow();
    tour.stop("scene");
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
  stopFollow: () => stopFollow(),
  tourStop: () => tour.stop("wonka"),
  switchTo: (name, after) => setScene(name, after),
};
const backBtn = document.getElementById("vault-back");
// W3: Exit/Back and Esc leave the vault only while the Wonkavator is parked or walking (S0/S1).
// In S2+ the button is aria-disabled; Esc during the doors cancels the boarding instead (cancelPending / reverse).
const wonkaState = () => (window.AgentTown.wonka ? window.AgentTown.wonka.state() : "S0");
// In the rooms the button reads "Back to vault" and boards the Wonkavator (S1), the only way out.
if (backBtn) backBtn.addEventListener("click", () => {
  const s = wonkaState();
  if (scene !== "vault" && scene !== "castle") {
    if (s === "S0" && window.AgentTown.wonka && town) window.AgentTown.wonka.tap(town, sceneUi);
    return;
  }
  if (s === "S0" || s === "S1") sceneUi.leaveVault();
});
window.addEventListener("keydown", (ev) => {
  if (ev.key !== "Escape" || scene === "castle" || confirmOpen()) return;
  const s = wonkaState();
  if (s === "S0" || s === "S1") {
    if (scene === "vault") sceneUi.leaveVault();
  } else if (window.AgentTown.wonka) window.AgentTown.wonka.cancel();
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
window.AgentTown.tour = { stop: (reason) => tour.stop(reason || "api") };
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
  /** Tests only: pan to a bot and open its panel (what the removed search box did). */
  focusBot(id) {
    focusBot(id, true);
  },
  /** Tests only: hide the screen labels (room and bot names) for a clean art shot. */
  set hideLabels(v) {
    debugInfo.hideLabels = !!v;
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
  get tour() {
    return { active: tour.active, id: tour.id, idleMs: tour.idleMs, stepMs: tour.stepMs, starts: tour.starts, switches: tour.switches, stops: Object.assign({}, tour.stops), blocked: tourBlocked(), following };
  },
  /** Tests only: shorten the tour clocks; no arguments resets them to 30000/5000. */
  tourTimes(idle, step) {
    TOUR.IDLE_MS = idle == null ? 30000 : idle;
    TOUR.STEP_MS = step == null ? 5000 : step;
    tour.idleMs = 0;
  },
  get ripple() {
    const r = window.AgentTown.rippleDebug || {};
    return { draws: r.draws || 0, frame: r.frame || 0, lastFrameDraws: r.lastFrameDraws || 0, ok: !!r.ok };
  },
  get mapBuilds() {
    return mapBuilds;
  },
  /** W2: the Wonkavator camera lock and release ease. */
  get wonkaCam() {
    return { locked: camLocked(), easing: !!camEase, zoom, fit: fitZoom(), camX, camY, viewW, viewH, framed };
  },
  /** W1: names the art loader treats as failed (tests); code safety-net draws so far. */
  artBlock: [],
  get artFallbackDraws() {
    return window.AgentTown.art ? window.AgentTown.art.fallbackDraws : 0;
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
        buildFilters(list);
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
