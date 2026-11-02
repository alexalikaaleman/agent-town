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
const formatStamp = window.AgentTown.formatStamp;
const honoluluParts = window.AgentTown.honoluluParts;
const phaseLabel = window.AgentTown.phaseLabel;

const canvas = document.getElementById("town");
const stage = document.getElementById("stage");
const needsEl = document.getElementById("needs");
const panel = document.getElementById("panel");
const ctx = canvas.getContext("2d");

const world = createWorld();
const mapWrap = document.getElementById("map-wrap");
let roster = [];
let town = null;
let mode = "loading";
let zoom = 2;
let userZoom = null;
let dpr = 1;
let mapCanvas = null;
let mapKey = "";
let lastHud = "";
let lastClock = "";

function pixelRatio() {
  dpr = Math.max(1, Math.round(window.devicePixelRatio || 1));
  if (dpr > 2) dpr = 2;
  return dpr;
}

function capZoom(z) {
  const worldW = MAP_W * TILE;
  const worldH = MAP_H * TILE;
  const ratio = pixelRatio();
  let next = Math.round(z);
  if (!Number.isFinite(next) || next < 1) next = 1;
  if (next > 8) next = 8;
  while (next > 1 && (worldW * next * ratio > 4096 || worldH * next * ratio > 4096)) next -= 1;
  return next;
}

function autoZoom() {
  const availW = Math.max(1, stage.clientWidth);
  const worldW = MAP_W * TILE;
  let z = Math.floor(availW / worldW);
  if (!Number.isFinite(z) || z < 1) z = 1;
  if (window.innerWidth > 900) z = Math.max(2, z);
  return capZoom(z);
}

function resize() {
  const availW = Math.max(1, stage.clientWidth);
  const availH = Math.max(1, stage.clientHeight);
  const worldW = MAP_W * TILE;
  const worldH = MAP_H * TILE;
  zoom = capZoom(userZoom == null ? autoZoom() : userZoom);
  const ratio = pixelRatio();
  canvas.width = worldW * zoom * ratio;
  canvas.height = worldH * zoom * ratio;
  canvas.style.width = worldW * zoom + "px";
  canvas.style.height = worldH * zoom + "px";
  const fits = worldW * zoom <= availW + 1 && worldH * zoom <= availH + 1;
  if (mapWrap) mapWrap.classList.toggle("centered", fits);
  mapCanvas = null;
  mapKey = "";
}

/** Change zoom by whole steps, keeping the map point under (cx, cy) in place. */
function stepZoom(delta, cx, cy) {
  const before = zoom;
  const next = capZoom((userZoom == null ? zoom : userZoom) + delta);
  if (next === before) return;
  const srect = stage.getBoundingClientRect();
  const px = cx == null ? srect.width / 2 : cx - srect.left;
  const py = cy == null ? srect.height / 2 : cy - srect.top;
  const rect = canvas.getBoundingClientRect();
  const wx = (srect.left + px - rect.left) / before;
  const wy = (srect.top + py - rect.top) / before;
  userZoom = next;
  resize();
  stage.scrollLeft = wx * zoom - px;
  stage.scrollTop = wy * zoom - py;
}

/** Home: leave follow mode, close the panel, back to the fitted zoom at the top left. */
function goHome() {
  stopFollow();
  closePanel();
  if (town) {
    town.filter.clear();
    syncFilters();
  }
  userZoom = null;
  resize();
  stage.scrollTo({ left: 0, top: 0 });
}

// ---------- follow a bot ----------
let following = null;

function startFollow(id) {
  if (!town || !town.agents.get(id)) return;
  following = id;
  town.follow = id;
  const note = document.getElementById("mode-note");
  note.textContent = "Following " + town.agents.get(id).name + ". Tap empty space or ⌂ to stop.";
}

function stopFollow() {
  following = null;
  if (town) town.follow = null;
  document.getElementById("mode-note").textContent = "";
}

function trackFollow() {
  if (!following || !town || pointer || pinch) return;
  const agent = town.agents.get(following);
  if (!agent) return stopFollow();
  const rect = canvas.getBoundingClientRect();
  const srect = stage.getBoundingClientRect();
  if (!rect.width) return;
  const px = rect.left + ((agent.x * TILE + TILE / 2) / (MAP_W * TILE)) * rect.width;
  const py = rect.top + ((agent.y * TILE + 4) / (MAP_H * TILE)) * rect.height;
  const dx = px - srect.left - srect.width / 2;
  const dy = py - srect.top - srect.height / 2;
  if (Math.abs(dx) > 1) stage.scrollLeft += dx * 0.15;
  if (Math.abs(dy) > 1) stage.scrollTop += dy * 0.15;
}

function ensureMap() {
  const key = zoom + ":" + dpr;
  if (mapCanvas && mapKey === key) return;
  const s = zoom * dpr;
  const off = document.createElement("canvas");
  off.width = MAP_W * TILE * s;
  off.height = MAP_H * TILE * s;
  const octx = off.getContext("2d");
  octx.imageSmoothingEnabled = false;
  octx.setTransform(s, 0, 0, s, 0, 0);
  drawMap(octx, world);
  mapCanvas = off;
  mapKey = key;
}

function resizeAndDraw() {
  resize();
}

new ResizeObserver(resizeAndDraw).observe(stage);
window.addEventListener("resize", resizeAndDraw);
resize();

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

  const needs = town.needsList();
  const key = needs.map((a) => a.id + ":" + a.needsAlex).join("|");
  if (key === lastHud) return;
  lastHud = key;
  needsEl.replaceChildren();
  if (!needs.length) {
    needsEl.hidden = true;
    return;
  }
  needsEl.hidden = false;
  const label = document.createElement("span");
  label.className = "needs-label";
  label.textContent = "Needs Alex";
  needsEl.appendChild(label);
  for (const agent of needs) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "need " + agent.needsAlex;
    btn.textContent = (agent.needsAlex === "urgent" ? "! " : "? ") + agent.name;
    btn.addEventListener("click", () => focusBot(agent.id, true));
    needsEl.appendChild(btn);
  }
}

/** Per-bot filter chips. Tap chips to show only those bots; "All" clears. */
function buildFilters(list) {
  const bar = document.getElementById("filters");
  bar.replaceChildren();
  const all = document.createElement("button");
  all.type = "button";
  all.className = "chip on";
  all.dataset.id = "";
  all.textContent = "All";
  bar.appendChild(all);
  for (const bot of list) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.dataset.id = bot.id;
    chip.style.setProperty("--dot", bot.color || "#888");
    chip.textContent = bot.name;
    bar.appendChild(chip);
  }
  bar.addEventListener("click", (ev) => {
    const chip = ev.target.closest(".chip");
    if (!chip || !town) return;
    const id = chip.dataset.id;
    if (!id) town.filter.clear();
    else if (town.filter.has(id)) town.filter.delete(id);
    else town.filter.add(id);
    syncFilters();
  });
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
  if (agent.needsAlex === "urgent") needEl.textContent = "Needs Alex: urgent";
  else if (agent.needsAlex === "question") needEl.textContent = "Needs Alex: question";
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
      link.textContent = "Open Drive folder";
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
  const rect = canvas.getBoundingClientRect();
  const srect = stage.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const px = rect.left + ((agent.x * TILE + TILE / 2) / (MAP_W * TILE)) * rect.width;
  const py = rect.top + ((agent.y * TILE + 4) / (MAP_H * TILE)) * rect.height;
  stage.scrollTo({
    left: stage.scrollLeft + (px - srect.left) - srect.width / 2,
    top: stage.scrollTop + (py - srect.top) - srect.height / 2,
    behavior: "smooth",
  });
}

document.getElementById("panel-close").addEventListener("click", closePanel);
document.getElementById("zoom-in").addEventListener("click", () => stepZoom(1));
document.getElementById("zoom-out").addEventListener("click", () => stepZoom(-1));
document.getElementById("home-btn").addEventListener("click", goHome);
stage.addEventListener(
  "wheel",
  (ev) => {
    if (!ev.ctrlKey) return;
    ev.preventDefault();
    stepZoom(ev.deltaY < 0 ? 1 : -1, ev.clientX, ev.clientY);
  },
  { passive: false }
);
window.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape") closePanel();
  const step = 64;
  if (ev.key === "ArrowLeft") stage.scrollLeft -= step;
  if (ev.key === "ArrowRight") stage.scrollLeft += step;
  if (ev.key === "ArrowUp") stage.scrollTop -= step;
  if (ev.key === "ArrowDown") stage.scrollTop += step;
});

let pointer = null;
let pinch = null;
const touches = new Map();
let lastTap = null;

stage.addEventListener("pointerdown", (ev) => {
  if (ev.target.closest && ev.target.closest("button, a, input, textarea")) return;
  touches.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (touches.size === 2) {
    const [a, b] = Array.from(touches.values());
    pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
    pointer = null;
    return;
  }
  if (touches.size > 2) return;
  pointer = {
    id: ev.pointerId,
    x: ev.clientX,
    y: ev.clientY,
    sx: stage.scrollLeft,
    sy: stage.scrollTop,
    drag: false,
  };
});
stage.addEventListener("pointermove", (ev) => {
  if (touches.has(ev.pointerId)) touches.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (pinch && touches.size >= 2) {
    const [a, b] = Array.from(touches.values());
    const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    const ratio = dist / pinch.dist;
    if (ratio > 1.25 || ratio < 0.8) {
      stepZoom(ratio > 1 ? 1 : -1, (a.x + b.x) / 2, (a.y + b.y) / 2);
      pinch.dist = dist;
    }
    return;
  }
  if (!pointer || ev.pointerId !== pointer.id) return;
  const dx = ev.clientX - pointer.x;
  const dy = ev.clientY - pointer.y;
  if (Math.hypot(dx, dy) > 8) pointer.drag = true;
  if (pointer.drag) {
    stage.scrollLeft = pointer.sx - dx;
    stage.scrollTop = pointer.sy - dy;
    if (town) town.hoverChest = null;
    return;
  }
  trackChestHover(ev);
});
stage.addEventListener("pointerleave", () => {
  if (town) town.hoverChest = null;
});
function canvasPoint(ev) {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  if (ev.clientX < rect.left || ev.clientX > rect.right || ev.clientY < rect.top || ev.clientY > rect.bottom) return null;
  return {
    x: ((ev.clientX - rect.left) / rect.width) * MAP_W * TILE,
    y: ((ev.clientY - rect.top) / rect.height) * MAP_H * TILE,
  };
}

function trackChestHover(ev) {
  if (!town) return;
  const pt = canvasPoint(ev);
  if (!pt) {
    town.hoverChest = null;
    return;
  }
  const chest = town.hitChest(pt.x, pt.y);
  town.hoverChest = chest ? chest.id : null;
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
  if (dragged || !town) return;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || ev.clientX < rect.left || ev.clientX > rect.right || ev.clientY < rect.top || ev.clientY > rect.bottom) {
    return;
  }
  const wx = ((ev.clientX - rect.left) / rect.width) * MAP_W * TILE;
  const wy = ((ev.clientY - rect.top) / rect.height) * MAP_H * TILE;
  const chest = town.hitChest(wx, wy);
  if (chest) {
    town.pokeChest(chest.id, performance.now());
    if (chest.url) window.open(chest.url, "_blank", "noopener");
    return;
  }
  const hit = town.hitTest(wx, wy);
  const t = performance.now();
  const double = hit && lastTap && lastTap.id === hit.id && t - lastTap.t < 400;
  lastTap = hit ? { id: hit.id, t } : null;
  if (double) {
    startFollow(hit.id);
    lastTap = null;
    return;
  }
  if (hit) openPanel(hit);
  else {
    closePanel();
    stopFollow();
  }
}
stage.addEventListener("pointerup", endPointer);
stage.addEventListener("pointercancel", endPointer);

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
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (mapCanvas) ctx.drawImage(mapCanvas, 0, 0);
  const scale = zoom * dpr;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = false;
  if (town) {
    const phase = honoluluParts().phase;
    drawScene(ctx, town, world, now, phase);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function bootTown(list) {
  roster = list;
  town = createTown(roster, world);
  lastHud = "";
}

async function boot() {
  try {
    await connectFeed({
      onSnapshot(bots) {
        if (!town) bootTown(roster);
        town.applySnapshot(bots);
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

boot();
})();
