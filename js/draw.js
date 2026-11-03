/** Pixel drawing for the map, bots, bubbles, and handoff items. */
(function () {
const TILE = window.AgentTown.TILE;
const bubbleFor = window.AgentTown.bubbleFor;
const poseFor = window.AgentTown.poseFor;
const tintFor = window.AgentTown.tintFor;

const SHORT = {
  masterbot: "Master",
  "brainstorm-bot": "Brainstorm",
  "game-design-document-bot": "Design Doc",
  "gitwriter-3d-bot": "GitWriter",
  "website-builder-bot": "Web Build",
  "cutscene-bot": "Cutscene",
  "concept-art-bot": "Concept",
  "ai-prompt-bot": "Prompts",
  "google-drive-manager": "Drive",
  "hustle-bot": "Hustle",
  "budget-bot": "Budget",
  "accounting-bot": "Accounts",
  "playtest-qa-bot": "Playtest",
  "release-marketing-bot": "Marketing",
  "alika-treed-business-bot": "TreeD",
  "larry-h-robot": "Larry H",
  robotemplate: "Template",
  "robo-maintenance-bot": "Maintain",
  "robo-library": "R.Library",
  "robo-helper-bot": "Helper",
  "context-bot": "Context",
  "bot-scout": "Scout",
  "chief-of-staff": "Chief",
  "help-bot": "Help",
  "feedback-bot": "Feedback",
  "language-bot": "Language",
  "mochizuki-bot": "Mochizuki",
  "job-lander-resume-bot": "Resumes",
  "garage-sale-bot": "Garage",
  "malu-bot": "Malu",
  "game-build-bible": "Bible",
  "game-revision-logger": "Revisions",
  "game-additions-bot": "Additions",
  "trivia-bot": "Trivia",
  "proportion-bot": "Proportion",
  "video-backup-helper-v2": "Backup",
};

const SKINS = ["#f3d0b0", "#e0ac7a", "#c68642", "#8d5524", "#ffdcb8", "#a56b3c"];
const HAIRS = ["#241c16", "#5a3825", "#1c1c1c", "#6b3a2a", "#3a291c", "#d8a24a", "#6e2142", "#2e3a4a"];

function hashId(id) {
  let h = 2166136261;
  for (let i = 0; i < String(id).length; i++) {
    h ^= String(id).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function shade(hex, mul) {
  const raw = String(hex || "").replace("#", "");
  const n = parseInt(raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw, 16);
  if (!Number.isFinite(n)) return "#888888";
  const ch = (shift) => Math.max(0, Math.min(255, Math.round((((n >> shift) & 255) * mul))));
  return "#" + [ch(16), ch(8), ch(0)].map((v) => v.toString(16).padStart(2, "0")).join("");
}

function styleFor(agent) {
  const name = agent.name.toLowerCase();
  const robo = name.includes("robo") || name.includes("robot") || name.includes("larry");
  const h = hashId(agent.id);
  return {
    robo,
    shirt: agent.color,
    skin: SKINS[h % SKINS.length],
    hair: HAIRS[h % HAIRS.length],
    pants: shade(agent.color, 0.45),
    led: agent.color,
    hat: name.includes("master") ? "#e2b15a" : name.includes("chief") ? "#243e73" : null,
  };
}

function fill(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}


function blob(ctx, x, y, w, h, color) {
  fill(ctx, x - 1, y, w + 2, h, "#1a1a1a");
  fill(ctx, x, y - 1, w, h + 2, "#1a1a1a");
  fill(ctx, x, y, w, h, color);
}

function drawPerson(ctx, ox, oy, style, pose, frame, facing) {
  const shirt = style.shirt;
  const skin = style.skin;
  const pants = style.pants;
  const shoe = "#241c16";
  let hx = 0;
  if (facing === "w") hx = -1;
  else if (facing === "e") hx = 1;
  if (pose.look) hx += pose.frame % 2 === 0 ? -1 : 1;

  if (pose.pose === "sit" || pose.pose === "type") {
    blob(ctx, ox + 3, oy + 14, 3, 3, pants);
    blob(ctx, ox + 7, oy + 14, 3, 3, pants);
  } else if (pose.pose === "walk") {
    const swing = pose.frame % 2 === 0;
    blob(ctx, ox + (swing ? 2 : 4), oy + 13, 3, 4, pants);
    blob(ctx, ox + (swing ? 8 : 6), oy + 13, 3, 4, pants);
    fill(ctx, ox + (swing ? 2 : 4), oy + 17, 3, 2, shoe);
    fill(ctx, ox + (swing ? 8 : 6), oy + 17, 3, 2, shoe);
  } else {
    blob(ctx, ox + 3, oy + 13, 3, 4, pants);
    blob(ctx, ox + 7, oy + 13, 3, 4, pants);
    fill(ctx, ox + 3, oy + 17, 3, 2, shoe);
    fill(ctx, ox + 7, oy + 17, 3, 2, shoe);
  }

  const torsoY = pose.pose === "type" ? 10 : 8;
  blob(ctx, ox + 3, oy + torsoY, 6, 6, shirt);
  if (pose.pose === "type") {
    const arm = pose.frame % 2 === 0;
    blob(ctx, ox + 1, oy + torsoY + 3, 2, 2, skin);
    blob(ctx, ox + 9, oy + torsoY + 3, 2, 2, skin);
    fill(ctx, ox + (arm ? 3 : 4), oy + torsoY + 5, 2, 2, skin);
    fill(ctx, ox + (arm ? 7 : 6), oy + torsoY + 5, 2, 2, skin);
  } else if (pose.pose === "crossed") {
    blob(ctx, ox + 2, oy + torsoY + 3, 8, 2, shirt);
    fill(ctx, ox + 2, oy + torsoY + 3, 2, 2, skin);
    fill(ctx, ox + 8, oy + torsoY + 3, 2, 2, skin);
  } else if (pose.pose === "up") {
    blob(ctx, ox + 1, oy + torsoY - 4, 2, 4, shirt);
    blob(ctx, ox + 9, oy + torsoY - 4, 2, 4, shirt);
    fill(ctx, ox + 1, oy + torsoY - 5, 2, 2, skin);
    fill(ctx, ox + 9, oy + torsoY - 5, 2, 2, skin);
  } else if (pose.pose === "hips") {
    blob(ctx, ox + 0, oy + torsoY + 2, 3, 2, shirt);
    blob(ctx, ox + 9, oy + torsoY + 2, 3, 2, shirt);
    fill(ctx, ox + 0, oy + torsoY + 2, 2, 2, skin);
    fill(ctx, ox + 10, oy + torsoY + 2, 2, 2, skin);
  } else {
    const swing = pose.pose === "walk" && pose.frame % 2 === 0 ? 1 : 0;
    blob(ctx, ox + 0, oy + torsoY + 2 + swing, 2, 3, shirt);
    blob(ctx, ox + 10, oy + torsoY + 2, 2, 3, shirt);
    fill(ctx, ox + 0, oy + torsoY + 5 + swing, 2, 2, style.robo ? "#d5dde3" : skin);
    fill(ctx, ox + 10, oy + torsoY + 5, 2, 2, style.robo ? "#d5dde3" : skin);
  }

  if (style.robo) {
    fill(ctx, ox + 5 + hx, oy - 1, 2, 2, style.led);
    fill(ctx, ox + 6 + hx, oy + 1, 1, 2, "#222");
    blob(ctx, ox + 3 + hx, oy + 2, 6, 6, "#d5dde3");
    fill(ctx, ox + 3 + hx, oy + 2, 6, 1, "#8b98a3");
    if (facing !== "n") {
      fill(ctx, ox + 4 + hx, oy + 4, 2, 2, "#161616");
      fill(ctx, ox + 7 + hx, oy + 4, 2, 2, "#161616");
      fill(ctx, ox + 5 + hx, oy + 5, 1, 1, style.led);
      fill(ctx, ox + 8 + hx, oy + 5, 1, 1, style.led);
    }
  } else {
    blob(ctx, ox + 3 + hx, oy + 2, 6, 6, style.hair);
    if (facing !== "n") {
      fill(ctx, ox + 4 + hx, oy + 4, 4, 3, skin);
      fill(ctx, ox + 4 + hx, oy + 5, 1, 1, "#1b1b1b");
      fill(ctx, ox + 7 + hx, oy + 5, 1, 1, "#1b1b1b");
    }
    if (style.hat) {
      fill(ctx, ox + 3 + hx, oy + 0, 6, 2, style.hat);
      fill(ctx, ox + 2 + hx, oy + 2, 8, 1, style.hat);
    }
  }
}

const GLYPH = {
  "!": ["010", "010", "010", "000", "010"],
  "?": ["110", "001", "010", "000", "010"],
  z: ["111", "001", "010", "100", "111"],
  x: ["101", "010", "000", "010", "101"],
  "+": ["010", "010", "111", "010", "010"],
};

function glyph(ctx, ch, x, y, color, scale) {
  const rows = GLYPH[ch];
  if (!rows) return;
  ctx.fillStyle = color;
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      if (rows[r][c] === "1") ctx.fillRect(x + c * scale, y + r * scale, scale, scale);
    }
  }
}

function bubbleBack(ctx, x, y, w, h, fillColor) {
  const outlineW = w + 2;
  const outlineH = h + 2 + 3;
  const placed = clampRect(Math.round(x - w / 2) - 1, Math.round(y) - 1, outlineW, outlineH);
  const left = placed.left + 1;
  const top = placed.top + 1;
  const tailX = Math.max(left + 1, Math.min(left + w - 4, Math.round(x) - 1));
  fill(ctx, left - 1, top - 1, w + 2, h + 2, "#1a1a1a");
  fill(ctx, left, top, w, h, fillColor);
  fill(ctx, tailX, top + h, 3, 3, "#1a1a1a");
  fill(ctx, tailX + 1, top + h, 1, 2, fillColor);
  return { left, top, w, h };
}

function fitTaskLine(ctx, text) {
  let s = String(text || "").replace(/\s+/g, " ").trim();
  if (s.length > 40) s = s.slice(0, 39) + "…";
  ctx.font = "6px ui-monospace, monospace";
  const maxW = 88;
  while (s.length > 1 && ctx.measureText(s).width > maxW) {
    const base = s.endsWith("…") ? s.slice(0, -1) : s;
    s = base.slice(0, -1) + "…";
  }
  return s;
}

function drawBubble(ctx, x, y, kind, time, text) {
  if (kind === "task") {
    const line = fitTaskLine(ctx, text);
    ctx.font = "6px ui-monospace, monospace";
    const tw = Math.ceil(ctx.measureText(line).width);
    const w = Math.max(16, tw + 6);
    const box = bubbleBack(ctx, x, y, w, 10, "#fffef8");
    ctx.font = "6px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#1a1a1a";
    ctx.fillText(line, box.left + w / 2, box.top + 5);
    return;
  }
  if (kind === "working") {
    const box = bubbleBack(ctx, x, y, 16, 10, "#fffef8");
    const n = Math.floor(time / 220) % 4;
    for (let i = 0; i < 3; i++) {
      fill(ctx, box.left + 3 + i * 4, box.top + 4, 2, 2, i <= n ? "#1a1a1a" : "#c8c2b4");
    }
    return;
  }
  if (kind === "zzz") {
    // big "z z Z" beside the bunk (to the right), so the name label above the head never hides it
    const bx = x + 9;
    const by = y + 12;
    fill(ctx, bx - 1, by - 1, 22, 14, "#243e73");
    fill(ctx, bx, by, 20, 12, "#e7e9ff");
    for (let i = 0; i < 3; i++) {
      const dy = (Math.floor(time / 280) + i) % 3;
      glyph(ctx, "z", bx + 2 + i * 6, by + 2 - (dy === 0 ? 1 : 0), "#243e73", i === 2 ? 2 : 1);
    }
    return;
  }
  if (kind === "done") {
    const box = bubbleBack(ctx, x, y, 12, 10, "#c8f5c4");
    ctx.fillStyle = "#1f7a3a";
    ctx.fillRect(box.left + 2, box.top + 5, 2, 2);
    ctx.fillRect(box.left + 4, box.top + 7, 2, 2);
    ctx.fillRect(box.left + 6, box.top + 5, 2, 2);
    ctx.fillRect(box.left + 8, box.top + 3, 2, 2);
    ctx.fillRect(box.left + 8, box.top + 1, 2, 2);
    return;
  }
  const red = kind.startsWith("blocked");
  const bg = red ? "#e23b3b" : kind === "question" ? "#d7ecff" : "#ffe14a";
  const ink = red ? "#fff8e6" : "#1a1a1a";
  const box = bubbleBack(ctx, x, y, 12, 12, bg);
  const ch = kind === "question" || kind === "blocked-question" ? "?" : kind === "blocked" ? "x" : "!";
  glyph(ctx, ch, box.left + 3, box.top + 2, ink, 2);
}


/** Chest sprite (art/chest.png: 4x art, 64x64 frames, 3 cols x 2 rows; row 0 wood/gold, row 1 locked grey;
 *  columns closed, half, open). Falls back to the code-drawn chest until the sheet decodes. */
function drawChestSprite(ctx, chest) {
  const a = window.AgentTown.art ? window.AgentTown.art.get("chest") : null;
  if (!a || !a.ok) return false;
  const lid = Math.max(0, Math.min(1, chest.lid || 0));
  const col = lid > 0.7 ? 2 : lid > 0.2 ? 1 : 0;
  const row = chest.url ? 0 : 1;
  const sm = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(a.bitmap, col * 64, row * 64, 64, 64, chest.x * TILE, chest.y * TILE, TILE, TILE);
  ctx.imageSmoothingEnabled = sm;
  return true;
}

function drawChest(ctx, chest) {
  if (drawChestSprite(ctx, chest)) return;
  const px = chest.x * TILE + 1;
  const py = chest.y * TILE + 2;
  const locked = !chest.url;
  const wood = locked ? "#6e6862" : "#8d4e28";
  const woodDk = locked ? "#4a4642" : "#5c3018";
  const trim = locked ? "#8a8680" : "#e2b15a";
  const lid = Math.max(0, Math.min(1, chest.lid || 0));
  const lift = Math.round(lid * 5);
  fill(ctx, px + 1, py + 8, 12, 6, woodDk);
  fill(ctx, px + 2, py + 9, 10, 4, wood);
  fill(ctx, px + 2, py + 9, 10, 1, trim);
  fill(ctx, px + 1, py + 6 - lift, 12, 4, wood);
  fill(ctx, px + 1, py + 5 - lift, 12, 2, trim);
  fill(ctx, px + 2, py + 6 - lift, 10, 1, locked ? "#7a756e" : "#c47a3a");
  if (lid > 0.35) {
    fill(ctx, px + 3, py + 8, 8, 2, "#1a120c");
    fill(ctx, px + 4, py + 8, 2, 1, "#e2b15a");
  }
  if (locked) {
    fill(ctx, px + 6, py + 10, 3, 3, "#d9dde2");
    fill(ctx, px + 6, py + 8, 3, 2, "#c5ccd4");
    fill(ctx, px + 7, py + 7, 1, 2, "#9aa3ad");
  } else {
    fill(ctx, px + 6, py + 10, 3, 2, trim);
  }
}


const placedLabels = [];
let sceneW = 0;
let sceneH = 0;

function clampRect(left, top, w, h) {
  const width = Math.max(0, w);
  const height = Math.max(0, h);
  let x = left;
  let y = top;
  if (x < 0) x = 0;
  if (y < 0) y = 0;
  if (x + width > sceneW) x = Math.max(0, sceneW - width);
  if (y + height > sceneH) y = Math.max(0, sceneH - height);
  return { left: Math.round(x), top: Math.round(y) };
}


// ---------- castle tiles (original pixel art, FF6-like palette) ----------
// fix moat: Concept Art Bot's moat-ripple v1 (4 frames of 64x128 = 1x2 tiles), drawn per frame over the cached map
const RIPPLE = { img: null, ok: false, FRAME_MS: 150, W: 64, H: 128, N: 4 };
// moat review: the reduced-motion query is made once at load, read per frame
const RM_MQ = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)");
const dbgRipple = { draws: 0, frame: 0, lastFrameDraws: 0, get ok() { return RIPPLE.ok; } };
// W1: loaded through AgentTown.art (castle-art.js, data/art.json checks 256x128); same behaviour as before
function rippleArt() {
  const a = window.AgentTown.art ? window.AgentTown.art.get("moat-ripple") : null;
  RIPPLE.ok = !!(a && a.ok);
  RIPPLE.img = RIPPLE.ok ? a.bitmap : null;
  RIPPLE.scale = RIPPLE.ok ? a.scale : 1;
  return RIPPLE.ok;
}

const PAL = {
  grass: ["#4f8a3c", "#5d9a45", "#3f7431"],
  dirt: ["#9c7a4a", "#8a6a3e", "#b08a56"],
  stone: ["#8d8a9c", "#9a97aa", "#7a7789"],
  castlewall: ["#5b5770", "#46425a", "#77738c"],
  water: ["#2b4f9e", "#3561b5", "#1f3c7c"],
  bridge: ["#8a5a2e", "#6e4422", "#a8723e"],
};

function drawTile(ctx, world, x, y) {
  const g = world.ground[y][x];
  const px = x * TILE;
  const py = y * TILE;
  const hv = world.hash(x, y);
  const b = world.bid[y][x] ? world.byId.get(world.bid[y][x]) : null;
  if (g === "floor" || g === "door") {
    const c = b ? ((x + y) % 2 ? b.floor : b.floor2 || b.floor) : PAL.stone[0];
    fill(ctx, px, py, TILE, TILE, c);
    fill(ctx, px, py + 15, TILE, 1, shade(c, 0.85));
    fill(ctx, px + 15, py, 1, TILE, shade(c, 0.9));
    if (g === "door") {
      fill(ctx, px, py, TILE, 3, "rgba(0,0,0,0.25)");
    }
    return;
  }
  if (g === "wall") {
    const wall = b ? b.wall : PAL.castlewall[0];
    const dk = b ? b.wallDk : PAL.castlewall[1];
    fill(ctx, px, py, TILE, TILE, wall);
    for (let r = 0; r < 4; r++) {
      fill(ctx, px, py + r * 4 + 3, TILE, 1, dk);
      const off = r % 2 ? 4 : 0;
      fill(ctx, px + off + 3, py + r * 4, 1, 3, dk);
      fill(ctx, px + off + 11, py + r * 4, 1, 3, dk);
    }
    fill(ctx, px, py, TILE, 1, shade(wall, 1.25));
    return;
  }
  if (g === "battlement" || g === "castlewall") {
    const [c0, c1, c2] = PAL.castlewall;
    fill(ctx, px, py, TILE, TILE, c0);
    for (let r = 0; r < 4; r++) {
      fill(ctx, px, py + r * 4 + 3, TILE, 1, c1);
      const off = r % 2 ? 4 : 0;
      fill(ctx, px + off + 3, py + r * 4, 1, 3, c1);
      fill(ctx, px + off + 11, py + r * 4, 1, 3, c1);
    }
    if (g === "battlement") {
      fill(ctx, px, py, TILE, 5, "#2a2838");
      fill(ctx, px + 1, py, 6, 4, c2);
      fill(ctx, px + 9, py, 6, 4, c2);
      fill(ctx, px + 1, py, 6, 1, "#a6a2bb");
      fill(ctx, px + 9, py, 6, 1, "#a6a2bb");
    } else fill(ctx, px, py, TILE, 1, c2);
    return;
  }
  if (g === "gate") {
    fill(ctx, px, py, TILE, TILE, "#3b2a1c");
    fill(ctx, px, py, TILE, 2, "#241810");
    for (let i = 0; i < 4; i++) fill(ctx, px + i * 4 + 1, py, 1, TILE, "#2a1d12");
    return;
  }
  if (g === "water") {
    const [c0, c1, c2] = PAL.water;
    fill(ctx, px, py, TILE, TILE, c0);
    fill(ctx, px + ((x * 5) % 9), py + 4 + ((x + y) % 3) * 3, 5, 1, c1);
    fill(ctx, px + ((x * 3 + 6) % 10), py + 11, 4, 1, c2);
    return;
  }
  if (g === "bridge") {
    const [c0, c1, c2] = PAL.bridge;
    fill(ctx, px, py, TILE, TILE, c0);
    for (let r = 0; r < 4; r++) fill(ctx, px, py + r * 4 + 3, TILE, 1, c1);
    fill(ctx, px, py, TILE, 1, c2);
    const bx = world.castle.bridgeX;
    if (x === bx[0]) fill(ctx, px, py, 2, TILE, "#3a2412");
    if (x === bx[1]) fill(ctx, px + 14, py, 2, TILE, "#3a2412");
    return;
  }
  const pal = PAL[g] || PAL.grass;
  fill(ctx, px, py, TILE, TILE, pal[0]);
  if (g === "stone") {
    fill(ctx, px, py + 7, TILE, 1, pal[2]);
    fill(ctx, px, py + 15, TILE, 1, pal[2]);
    fill(ctx, px + (y % 2 ? 4 : 11), py, 1, 7, pal[2]);
    fill(ctx, px + (y % 2 ? 11 : 4), py + 8, 1, 7, pal[2]);
    fill(ctx, px + 1, py + 1, 2, 1, pal[1]);
    return;
  }
  if (hv < 0.5) fill(ctx, px + Math.floor(hv * 24), py + 4 + Math.floor(hv * 13) % 8, 1, 2, pal[2]);
  if (hv > 0.3) fill(ctx, px + 3 + Math.floor(hv * 9), py + 9, 2, 1, pal[1]);
  if (g === "grass" && hv > 0.93) {
    fill(ctx, px + 6, py + 6, 3, 3, "#f2d25a");
    fill(ctx, px + 7, py + 7, 1, 1, "#c4452f");
  }
}

function drawMap(ctx, world) {
  // room art: a painted plate (art/<room>-plate.png) replaces the tile floor once it decodes; else the tiles
  const AT = window.AgentTown;
  const plate = world.plate && AT.art ? AT.art.get(world.plate) : null;
  if (plate && plate.ok) {
    const sm = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(plate.bitmap, 0, 0, world.w * TILE, world.h * TILE);
    ctx.imageSmoothingEnabled = sm;
    const d = (AT.debug = AT.debug || {});
    (d.platesDrawn = d.platesDrawn || {})[world.plate] = true;
  } else for (let y = 0; y < world.h; y++) for (let x = 0; x < world.w; x++) drawTile(ctx, world, x, y);
  // the castle plate paints the lab tables, workshop props, beds, carpet, rock, moat and medic tent itself
  const castlePlate = !!(plate && plate.ok && world.castle);
  // on the castle plate only plate-aware parts draw, and only what the plate lacks (vault door, throne, dais, ...)
  for (const p of world.parts) {
    if (!p.drawStatic || (plate && plate.ok && p.plateSkip)) continue;
    if (castlePlate && !p.plateAware) continue;
    p.drawStatic(ctx, world, PIX, castlePlate);
  }
  if (!castlePlate) for (const b of world.buildings) {
    const by = b.y + b.h;
    if (by < world.h) fill(ctx, b.x * TILE, by * TILE, b.w * TILE, 3, "rgba(0,0,0,0.2)");
  }
}

/** Lying in a bunk: head on the pillow, a full-width blanket in the bot's color with a dark
 *  outline, so a sleeper reads clearly against the white mattress at the framed zoom. */
function drawLying(ctx, ox, oy, style, color) {
  const c = color || "#b6403a";
  fill(ctx, ox - 2, oy + 4, 16, 18, "#1b1b2a");
  blob(ctx, ox + 2, oy + 5, 8, 7, style.robo ? "#d5dde3" : style.hair);
  if (!style.robo) fill(ctx, ox + 3, oy + 8, 6, 4, style.skin);
  fill(ctx, ox + 4, oy + 9, 1, 1, "#1b1b1b");
  fill(ctx, ox + 7, oy + 9, 1, 1, "#1b1b1b");
  fill(ctx, ox - 1, oy + 12, 14, 9, shade(c, 0.9));
  fill(ctx, ox - 1, oy + 12, 14, 2, "#f4f1ea");
  fill(ctx, ox + 1, oy + 16, 10, 1, shade(c, 0.65));
}

/** Working-bot activity: an icon beside the head (hammer sparks in the Workshop, magic sparkles in
 *  the Wizard Lab, sword swings on the battlefield), little paper bits while typing at a stop. */
function drawBusy(ctx, agent, pose, ox, oy, now) {
  const s = agent.spot || {};
  const t = now + (hashId(agent.id) % 1000);
  const ix = ox + 13;
  const iy = oy - 3;
  if (s.zone === "battle") {
    const k = Math.floor(t / 120) % 4;
    const arc = [[0, 0], [3, -1], [5, 1], [6, 4]][k];
    fill(ctx, ix + arc[0], iy + arc[1], 2, 2, "#ffffff");
    fill(ctx, ix + arc[0] - 2, iy + arc[1] + 2, 2, 1, "rgba(255,255,255,0.6)");
  } else if (s.room === "workshop" || agent.room === "workshop") {
    // hammer
    fill(ctx, ix + 1, iy + 2, 1, 6, "#8a5a2a");
    fill(ctx, ix - 1, iy + 1, 5, 3, "#b8c0c8");
    if (Math.floor(t / 150) % 2 === 0) {
      fill(ctx, ix + 5, iy - 1, 1, 1, "#ffcc33");
      fill(ctx, ix + 6, iy + 3, 1, 1, "#ff9a2a");
      fill(ctx, ix - 3, iy, 1, 1, "#ffe680");
    }
  } else {
    // magic sparkles
    const k = Math.floor(t / 180) % 3;
    const pts = [[0, 0], [5, 3], [2, 6]];
    for (let i = 0; i < 3; i++) {
      const [px, py] = pts[(i + k) % 3];
      fill(ctx, ix + px, iy + py, 1, 3, "#d6b8ff");
      fill(ctx, ix + px - 1, iy + py + 1, 3, 1, i === 0 ? "#ffffff" : "#b48cff");
    }
  }
  if (pose.pose === "type" && !agent.moving && s.zone !== "battle") {
    // paper bits flying up from the work spot
    for (let i = 0; i < 3; i++) {
      const k = ((t / 900 + i / 3) % 1);
      fill(ctx, ox + 1 + i * 4 + Math.round(Math.sin(k * 6 + i) * 2), oy + 12 - Math.round(k * 14), 2, 2, "rgba(244,240,226," + (1 - k).toFixed(2) + ")");
    }
  }
}

function drawAgent(ctx, town, agent, now) {
  const pose = poseFor(agent, now);
  const ox = Math.round(agent.x * TILE) + 2 + (pose.shake || 0);
  const oy = Math.round(agent.y * TILE) - 6 + (pose.bob || 0);
  const dim = town.isDimmed ? town.isDimmed(agent) : false;
  if (dim) ctx.globalAlpha = 0.28;
  const style = styleFor(agent);
  const busy = (agent.state === "working" || agent.state === "talking") && pose.pose !== "lie";
  if (busy) {
    // Soft glow under working bots, so they read as busy next to idle ones.
    const g = 0.22 + 0.08 * Math.sin(now / 300 + (hashId(agent.id) % 7));
    ctx.fillStyle = "rgba(255,226,120," + g.toFixed(3) + ")";
    ctx.beginPath();
    ctx.ellipse(ox + 6, oy + 19, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (pose.pose === "lie") drawLying(ctx, ox, oy, style, agent.color);
  else {
    fill(ctx, ox + 2, oy + 18, 8, 3, "rgba(0,0,0,0.28)");
    drawPerson(ctx, ox, oy, style, pose, pose.frame, agent.facing);
    if (pose.attack) {
      // A small sword in the raised hand.
      const up = pose.pose === "up";
      fill(ctx, ox + 10, oy + (up ? -2 : 8), 2, up ? 7 : 2, "#dfe6ee");
      fill(ctx, ox + (up ? 9 : 10), oy + (up ? 4 : 10), up ? 4 : 2, 1, "#c9a23a");
      if (!up) fill(ctx, ox + 12, oy + 9, 5, 2, "#dfe6ee");
    }
  }
  if (busy) drawBusy(ctx, agent, pose, ox, oy, now);
  ctx.globalAlpha = 1;
  if (town.selected === agent.id) {
    const sx = Math.round(agent.x * TILE);
    const sy = Math.round(agent.y * TILE);
    fill(ctx, sx + 1, sy + 1, 4, 1, "#ffe14a");
    fill(ctx, sx + 1, sy + 1, 1, 4, "#ffe14a");
    fill(ctx, sx + TILE - 5, sy + 1, 4, 1, "#ffe14a");
    fill(ctx, sx + TILE - 2, sy + 1, 1, 4, "#ffe14a");
  }
  const s = agent.spot || {};
  // A working bot quiet 2h+ keeps working but gets a "stalled?" tag.
  const tag = s.tag ? s.tag : agent.state === "working" && agent.stalled ? "stalled?" : "";
  if (tag) {
    // Small text tag (e.g. "sleepy" for overflow sleepers). Never "zzz" outside the bedrooms.
    // Drawn under the feet so the name label above the head never hides it.
    ctx.font = "bold 6px ui-monospace, monospace";
    const tw = Math.ceil(ctx.measureText(tag).width) + 4;
    const tx = Math.round(agent.x * TILE + TILE / 2 - tw / 2);
    const ty = oy + 21;
    fill(ctx, tx, ty, tw, 8, "#2c2b4d");
    ctx.fillStyle = "#cfc8ff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(tag, tx + tw / 2, ty + 4);
  }
  const bubble = bubbleFor(agent, now);
  if (bubble) drawBubble(ctx, agent.x * TILE + TILE / 2, oy - 14, bubble.kind, now, bubble.text);
}

const PIX = { fill, blob, shade, glyph, drawPerson, styleFor, drawBubble, bubbleBack, TILE };

function drawScene(ctx, town, world, now, phase) {
  sceneW = world.w * TILE;
  sceneH = world.h * TILE;
  const rm = !!(RM_MQ && RM_MQ.matches);
  const cp = world.plate && window.AgentTown.art ? window.AgentTown.art.get(world.plate) : null;
  if (rippleArt() && !(cp && cp.ok && world.castle)) { // the ripple is off on the painted castle plate (not lined up)
    const f = rm ? 0 : Math.floor(now / RIPPLE.FRAME_MS) % RIPPLE.N;
    const y0 = world.castle.moatY[0];
    const smooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    let draws = 0;
    for (let x = 0; x < world.w; x++) {
      if (world.ground[y0][x] !== "water" || world.ground[y0 + 1][x] !== "water") continue;
      ctx.drawImage(RIPPLE.img, f * RIPPLE.W * RIPPLE.scale, 0, RIPPLE.W * RIPPLE.scale, RIPPLE.H * RIPPLE.scale, x * TILE, y0 * TILE, TILE, TILE * 2);
      draws++;
    }
    ctx.imageSmoothingEnabled = smooth;
    dbgRipple.draws += draws;
    dbgRipple.lastFrameDraws = draws;
    dbgRipple.frame = f;
  } else {
    // the old glint loop (load-failure safety net); under reduced motion the phase is fixed so nothing moves
    const ph = rm ? 0 : Math.floor(now / 200);
    for (let x = 0; x < world.w; x++) {
      for (const my of world.castle.moatY) {
        if (world.ground[my][x] !== "water") continue;
        const gx = x * TILE + 2 + ((ph + x * 3) % 11);
        fill(ctx, gx, my * TILE + 6 + ((x + my) % 2) * 5, 3, 1, "rgba(255,255,255,0.7)");
      }
    }
  }
  for (const p of world.parts) if (p.drawUnder) p.drawUnder(ctx, town, world, now, PIX);
  for (const chest of world.chests) drawChest(ctx, chest);
  const list = Array.from(town.agents.values()).sort((a, b) => a.y - b.y || a.x - b.x);
  for (const agent of list) drawAgent(ctx, town, agent, now);
  for (const p of world.parts) if (p.drawOver) p.drawOver(ctx, town, world, now, PIX);
  const tint = tintFor(phase);
  if (tint) {
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, world.w * TILE, world.h * TILE);
  }
}

window.AgentTown = window.AgentTown || {};
Object.assign(window.AgentTown, {
  drawMap,
  drawScene,
  PIX,
  rippleDebug: dbgRipple,
  shortName: (agent) => SHORT[agent.id] || String(agent.name || agent.id).slice(0, 12),
});
})();
