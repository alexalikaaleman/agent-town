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

function drawMap(ctx, world) {
  for (let y = 0; y < world.h; y++) {
    for (let x = 0; x < world.w; x++) {
      drawTile(ctx, world, x, y);
    }
  }
  for (const d of world.decor) drawDecor(ctx, world, d);
  for (const b of world.buildings) {
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    const by = b.y + b.h;
    if (by < world.h) ctx.fillRect(b.x * TILE, by * TILE, b.w * TILE, 3);
  }
}

function drawTile(ctx, world, x, y) {
  const g = world.ground[y][x];
  const px = x * TILE;
  const py = y * TILE;
  const n = (x * 13 + y * 7) % 5;
  if (g === "grass" || g === "flower" || g === "tree") {
    fill(ctx, px, py, TILE, TILE, n % 2 === 0 ? "#4ea23a" : "#459434");
    fill(ctx, px + 3, py + 10, 2, 2, "#67bf45");
    fill(ctx, px + 11, py + 4, 2, 2, "#3d8c30");
    if (g === "flower") {
      const colors = ["#f2d24b", "#e25c8a", "#f7f3ea", "#7eb6ff"];
      fill(ctx, px + 7, py + 8, 2, 2, colors[(x + y) % colors.length]);
      fill(ctx, px + 8, py + 11, 1, 2, "#2f6b28");
    }
    if (g === "tree") {
      fill(ctx, px + 7, py + 8, 3, 6, "#6b4226");
      fill(ctx, px + 3, py + 2, 10, 8, n % 2 ? "#1f7a32" : "#18662a");
      fill(ctx, px + 5, py + 1, 6, 3, "#2e9444");
      fill(ctx, px + 5, py + 4, 2, 2, "#8fd48a");
    }
    return;
  }
  if (g === "path") {
    fill(ctx, px, py, TILE, TILE, "#c9ae84");
    fill(ctx, px + 2, py + 3, 4, 3, "#b69668");
    fill(ctx, px + 9, py + 9, 5, 3, "#d8c29a");
    fill(ctx, px, py, TILE, 1, "#b08958");
    return;
  }
  if (g === "plaza") {
    fill(ctx, px, py, TILE, TILE, (x + y) % 2 === 0 ? "#d9d0bf" : "#cec4b0");
    fill(ctx, px, py, TILE, 1, "#b7ad98");
    return;
  }
  if (g === "water") {
    fill(ctx, px, py, TILE, TILE, "#d5cbb8");
    fill(ctx, px + 1, py + 1, TILE - 2, TILE - 2, "#b7ad98");
    fill(ctx, px + 3, py + 3, TILE - 6, TILE - 6, "#3a78c2");
    fill(ctx, px + 4, py + 5, TILE - 8, 2, "#68a4e4");
    return;
  }
  const id = world.bid[y][x];
  const b = id ? world.byId.get(id) : null;
  if (g === "floor" && b) {
    const alt = (x + y) % 2 === 0;
    fill(ctx, px, py, TILE, TILE, alt ? b.floor : b.floor2);
    if (id === "townhall") {
      const lx = x - b.x;
      const ly = y - b.y;
      if (lx >= 4 && lx <= b.w - 5 && ly >= 3 && ly <= 7) {
        fill(ctx, px, py, TILE, TILE, "#8e2f2f");
        if (lx === 4 || ly === 3) fill(ctx, px, py, TILE, 1, "#e2b15a");
        if (lx === b.w - 5 || ly === 7) fill(ctx, px, py + TILE - 1, TILE, 1, "#6d2424");
      }
    }
    return;
  }
  if ((g === "wall" || g === "door") && b) {
    fill(ctx, px, py, TILE, TILE, b.wall);
    fill(ctx, px, py, TILE, 2, b.wallDk);
    if (y === b.y && g === "wall") {
      fill(ctx, px, py, TILE, 6, b.roof);
      fill(ctx, px, py + 6, TILE, 2, b.trim);
    }
    if (g === "door") {
      fill(ctx, px + 3, py + 3, 10, 13, "#6b4226");
      fill(ctx, px + 4, py + 4, 8, 10, "#8d5a34");
      fill(ctx, px + 10, py + 9, 2, 2, "#e2b15a");
      if (b.door === "n") fill(ctx, px, py, TILE, 4, b.roof);
    }
  }
}

function drawDecor(ctx, world, d) {
  const px = d.x * TILE;
  const py = d.y * TILE;
  const b = world.byId.get(d.bid);
  if (d.kind === "window") {
    fill(ctx, px + 4, py + 5, 8, 7, "#8ec7ea");
    fill(ctx, px + 7, py + 5, 1, 7, b ? b.wallDk : "#333");
    fill(ctx, px + 4, py + 8, 8, 1, b ? b.wallDk : "#333");
    return;
  }
  if (d.kind === "sign" && b) {
    fill(ctx, px + 1, py + 8, 14, 7, "#2b2118");
    fill(ctx, px + 2, py + 9, 12, 5, b.trim);
    ctx.font = "5px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff8e6";
    ctx.fillText(d.text, px + 8, py + 12);
    return;
  }
  if (d.kind === "desk" || d.kind === "bench" || d.kind === "table") {
    fill(ctx, px + 2, py + 4, 12, 8, "#6b4226");
    fill(ctx, px + 3, py + 5, 10, 3, "#a87848");
    fill(ctx, px + 3, py + 12, 2, 3, "#4a2e18");
    fill(ctx, px + 11, py + 12, 2, 3, "#4a2e18");
    return;
  }
  if (d.kind === "counter" || d.kind === "bar") {
    fill(ctx, px + 1, py + 3, 14, 10, "#5c3a24");
    fill(ctx, px + 2, py + 4, 12, 4, "#8d5a34");
    if (d.kind === "bar") fill(ctx, px + 4, py + 9, 3, 3, "#e8e8e8");
    return;
  }
  if (d.kind === "shelf") {
    fill(ctx, px + 2, py + 2, 12, 12, "#4a3424");
    const books = ["#c44949", "#3d6fd8", "#2f9e44", "#e2b15a", "#7a3e9d"];
    for (let i = 0; i < 5; i++) fill(ctx, px + 3 + i * 2, py + 4, 2, 8, books[i]);
    return;
  }
  if (d.kind === "easel") {
    fill(ctx, px + 7, py + 11, 2, 4, "#6b4226");
    fill(ctx, px + 4, py + 3, 8, 8, "#f7f3ea");
    fill(ctx, px + 5, py + 4, 6, 5, "#e25c8a");
    fill(ctx, px + 3, py + 2, 1, 10, "#6b4226");
    fill(ctx, px + 12, py + 2, 1, 10, "#6b4226");
    return;
  }
  if (d.kind === "bed") {
    fill(ctx, px + 2, py + 3, 12, 11, "#f4f1ea");
    fill(ctx, px + 3, py + 7, 10, 6, "#b6403a");
    fill(ctx, px + 3, py + 4, 6, 3, "#d9d3c5");
    return;
  }
  if (d.kind === "anvil") {
    fill(ctx, px + 6, py + 12, 4, 3, "#3a2a1c");
    fill(ctx, px + 4, py + 10, 8, 3, "#5c4632");
    fill(ctx, px + 2, py + 7, 12, 4, "#6e7782");
    fill(ctx, px + 1, py + 8, 3, 2, "#9aa3ad");
    fill(ctx, px + 5, py + 4, 6, 4, "#b7c0c8");
    fill(ctx, px + 6, py + 5, 2, 1, "#eef2f4");
    return;
  }
  if (d.kind === "workbench") {
    fill(ctx, px + 1, py + 6, 14, 6, "#6b4226");
    fill(ctx, px + 2, py + 5, 12, 3, "#c49a62");
    fill(ctx, px + 2, py + 12, 2, 3, "#3a2a1c");
    fill(ctx, px + 12, py + 12, 2, 3, "#3a2a1c");
    fill(ctx, px + 4, py + 7, 3, 2, "#8d8d8d");
    fill(ctx, px + 9, py + 6, 4, 1, "#d8d2c4");
    return;
  }
  if (d.kind === "tools") {
    fill(ctx, px + 3, py + 2, 10, 12, "#4a3424");
    fill(ctx, px + 4, py + 3, 8, 1, "#2b2118");
    fill(ctx, px + 5, py + 4, 1, 8, "#c0c6cc");
    fill(ctx, px + 7, py + 5, 1, 7, "#8d5a34");
    fill(ctx, px + 9, py + 4, 1, 8, "#d9dde2");
    fill(ctx, px + 6, py + 3, 3, 2, "#e2b15a");
    return;
  }
  if (d.kind === "forge") {
    fill(ctx, px + 1, py + 6, 14, 8, "#3a3a40");
    fill(ctx, px + 2, py + 5, 12, 3, "#5a5a62");
    fill(ctx, px + 3, py + 8, 10, 4, "#2a2a30");
    fill(ctx, px + 4, py + 9, 8, 2, "#1a1a1e");
    fill(ctx, px, py + 13, 16, 2, "#2c2420");
    return;
  }
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
    const box = bubbleBack(ctx, x, y, 18, 12, "#e7e9ff");
    for (let i = 0; i < 3; i++) {
      const dy = (Math.floor(time / 280) + i) % 3;
      glyph(ctx, "z", box.left + 2 + i * 5, box.top + 3 - (dy === 0 ? 1 : 0), "#243e73", 1);
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

function drawForgeGlow(ctx, d, now) {
  const px = d.x * TILE;
  const py = d.y * TILE;
  const flick = Math.floor(now / 90);
  const hot = flick % 2 === 0 ? "#ffb03a" : "#ff7a22";
  const core = flick % 3 === 0 ? "#ffe9a0" : "#ffd36a";
  fill(ctx, px + 5, py + 9, 6, 2, hot);
  fill(ctx, px + 6, py + 8, 4, 2, core);
  const h = 2 + (flick % 3);
  fill(ctx, px + 6, py + 8 - h, 2, h, flick % 2 ? "#ff5a2a" : "#ffd36a");
  fill(ctx, px + 8, py + 7 - (flick % 2), 2, 2, "#ffb03a");
  if (flick % 4 === 0) fill(ctx, px + 7, py + 4, 1, 1, "#fff4c2");
}

function drawChest(ctx, chest) {
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

function drawItem(ctx, x, y, item) {
  const scroll = hashId(item || "x") % 2 === 0;
  const px = Math.round(x);
  const py = Math.round(y);
  if (scroll) {
    fill(ctx, px - 5, py - 6, 10, 8, "#f3e2b0");
    fill(ctx, px - 6, py - 5, 1, 6, "#c44949");
    fill(ctx, px + 5, py - 5, 1, 6, "#c44949");
    fill(ctx, px - 3, py - 3, 6, 1, "#c9b48a");
  } else {
    fill(ctx, px - 5, py - 6, 10, 8, "#8d5a34");
    fill(ctx, px - 4, py - 7, 8, 3, "#c44949");
    fill(ctx, px - 1, py - 4, 2, 3, "#e2b15a");
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

function drawLabel(ctx, text, x, y, accent) {
  ctx.font = "8px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const w = Math.ceil(ctx.measureText(text).width);
  const boxW = w + 4;
  const boxH = 10;
  let left = Math.round(x - w / 2) - 2;
  let top = Math.round(y);
  for (let tries = 0; tries < 4; tries++) {
    const box = { left, top, right: left + boxW, bottom: top + boxH };
    const hit = placedLabels.some((p) => box.left < p.right && box.right > p.left && box.top < p.bottom && box.bottom > p.top);
    if (!hit) break;
    if (top - 11 < 0) break;
    top -= 11;
  }
  const placed = clampRect(left, top, boxW, boxH);
  left = placed.left;
  top = placed.top;
  placedLabels.push({ left, top, right: left + boxW, bottom: top + boxH });
  fill(ctx, left, top, boxW, boxH, "#14120f");
  fill(ctx, left, top, 2, boxH, accent || "#ffe14a");
  ctx.fillStyle = "#fff8e6";
  ctx.fillText(text, Math.round(left + boxW / 2), top + 1);
}

/** Project rooms on the plaza: a rope outline and an FF-style billboard with the project name. */
function drawRooms(ctx, town, world) {
  const rooms = town.activeRooms ? town.activeRooms() : [];
  for (const { room, name, count } of rooms) {
    const x = room.x * TILE;
    const y = room.y * TILE;
    const w = room.w * TILE;
    const h = room.h * TILE;
    ctx.globalAlpha = 0.18;
    fill(ctx, x, y, w, h, "#f2d58a");
    ctx.globalAlpha = 1;
    for (let i = 0; i < w; i += 4) {
      fill(ctx, x + i, y, 2, 1, "#8a5a2b");
      fill(ctx, x + i, y + h - 1, 2, 1, "#8a5a2b");
    }
    for (let i = 0; i < h; i += 4) {
      fill(ctx, x, y + i, 1, 2, "#8a5a2b");
      fill(ctx, x + w - 1, y + i, 1, 2, "#8a5a2b");
    }
    for (const px of [x + 2, x + w - 4]) {
      fill(ctx, px, y, 2, 4, "#6b4226");
      fill(ctx, px, y + h - 4, 2, 4, "#6b4226");
    }
  }
}

/** Billboard on the bottom edge of each room, drawn above bots; labels steer around it. */
function drawBillboards(ctx, town) {
  const rooms = town.activeRooms ? town.activeRooms() : [];
  for (const { room, name, count } of rooms) {
    const x = room.x * TILE;
    const y = room.y * TILE;
    const w = room.w * TILE;
    const h = room.h * TILE;
    // Two posts, dark frame, blue FF-style panel, cream text.
    ctx.font = "7px ui-monospace, monospace";
    const label = String(name).slice(0, 18) + (count > 1 ? " ·" + count : "");
    const tw = Math.ceil(ctx.measureText(label).width);
    const bw = Math.min(w - 4, Math.max(28, tw + 8));
    const bx = Math.round(x + (w - bw) / 2);
    const by = y + h - 16;
    fill(ctx, bx + 3, by + 10, 2, 7, "#4a2e18");
    fill(ctx, bx + bw - 5, by + 10, 2, 7, "#4a2e18");
    placedLabels.push({ left: bx, top: by, right: bx + bw, bottom: by + 17 });
    fill(ctx, bx, by, bw, 12, "#14120f");
    fill(ctx, bx + 1, by + 1, bw - 2, 10, "#e8e2d0");
    fill(ctx, bx + 2, by + 2, bw - 4, 8, "#24418f");
    fill(ctx, bx + 2, by + 2, bw - 4, 1, "#3f63c4");
    ctx.save();
    ctx.beginPath();
    ctx.rect(bx + 2, by + 2, bw - 4, 8);
    ctx.clip();
    ctx.fillStyle = "#fff8e6";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, bx + bw / 2, by + 6.5);
    ctx.restore();
  }
}

/** Red "stalled" tag under a bot that has been working 30+ min with no new line. */
function drawStalled(ctx, x, y) {
  ctx.font = "7px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const w = Math.ceil(ctx.measureText("stalled").width) + 4;
  const box = clampRect(Math.round(x - w / 2), Math.round(y), w, 9);
  fill(ctx, box.left - 1, box.top - 1, w + 2, 11, "#14120f");
  fill(ctx, box.left, box.top, w, 9, "#d42a2a");
  ctx.fillStyle = "#fff8e6";
  ctx.fillText("stalled", box.left + w / 2, box.top + 1);
}

function drawScene(ctx, town, world, now, phase) {
  placedLabels.length = 0;
  sceneW = world.w * TILE;
  sceneH = world.h * TILE;
  const tint = tintFor(phase);
  if (tint) {
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, world.w * TILE, world.h * TILE);
  }
  if (phase === "night" || phase === "dusk" || phase === "dawn") {
    ctx.fillStyle = phase === "night" ? "#ffcc66" : "#ffe0a8";
    for (const w of world.windows) ctx.fillRect(w.x * TILE + 5, w.y * TILE + 6, 6, 5);
  }
  for (const w of world.water) {
    const gx = w.x * TILE + 3 + (Math.floor(now / 180) + w.x * 3) % 9;
    const gy = w.y * TILE + 4 + (Math.floor(now / 260) + w.y) % 6;
    fill(ctx, gx, gy, 3, 1, "rgba(255,255,255,0.85)");
  }
  if (phase === "night") {
    for (let i = 0; i < 10; i++) {
      const fx = (hashId("f" + i) % (world.w * TILE) + Math.floor(now / 30) * ((i % 3) + 1)) % (world.w * TILE);
      const fy = hashId("g" + i) % (world.h * TILE);
      if ((Math.floor(now / 200) + i) % 4 === 0) fill(ctx, fx, fy, 1, 1, "#fff4c2");
    }
  }

  for (const d of world.decor) {
    if (d.kind === "forge") drawForgeGlow(ctx, d, now);
  }
  drawRooms(ctx, town, world);
  if (town.chests) {
    for (const chest of town.chests) drawChest(ctx, chest);
  }

  const jobs = town.handoffs();
  const quiet = new Set();
  for (const job of jobs) {
    if ((job.phase === "pass" || job.phase === "show") && job.from && job.to) {
      quiet.add(job.from.id);
      quiet.add(job.to.id);
    }
  }

  const list = Array.from(town.agents.values()).sort((a, b) => a.y - b.y || a.x - b.x);
  for (const agent of list) {
    const pose = poseFor(agent, now);
    if (pose.look) {
      const dirs = ["s", "e", "n", "w"];
      agent.facing = dirs[pose.frame % 4];
    }
    const ox = Math.round(agent.x * TILE) + 2 + (pose.shake || 0);
    const oy = Math.round(agent.y * TILE) - 6 + (pose.bob || 0);
    const dim = town.isDimmed ? town.isDimmed(agent) : false;
    if (dim) ctx.globalAlpha = 0.28;
    fill(ctx, ox + 2, oy + 18, 8, 3, "rgba(0,0,0,0.28)");
    drawPerson(ctx, ox, oy, styleFor(agent), pose, pose.frame, agent.facing);
    if (agent.state === "blocked") {
      ctx.globalAlpha = dim ? 0.12 : 0.33;
      fill(ctx, ox, oy + 2, 12, 16, "#e02020");
    }
    ctx.globalAlpha = 1;
    if (town.selected === agent.id) {
      const sx = Math.round(agent.x * TILE);
      const sy = Math.round(agent.y * TILE);
      ctx.fillStyle = "#ffe14a";
      fill(ctx, sx + 1, sy + 1, 4, 1, "#ffe14a");
      fill(ctx, sx + 1, sy + 1, 1, 4, "#ffe14a");
      fill(ctx, sx + TILE - 5, sy + 1, 4, 1, "#ffe14a");
      fill(ctx, sx + TILE - 2, sy + 1, 1, 4, "#ffe14a");
      fill(ctx, sx + 1, sy + TILE - 3, 4, 1, "#ffe14a");
      fill(ctx, sx + 1, sy + TILE - 6, 1, 4, "#ffe14a");
      fill(ctx, sx + TILE - 5, sy + TILE - 3, 4, 1, "#ffe14a");
      fill(ctx, sx + TILE - 2, sy + TILE - 6, 1, 4, "#ffe14a");
    }
  }

  for (const job of jobs) {
    if (!job.from || !job.to) continue;
    const x = (job.from.x + (job.to.x - job.from.x) * job.t) * TILE + 8;
    const y = (job.from.y + (job.to.y - job.from.y) * job.t) * TILE - 2;
    drawItem(ctx, x, y, job.item);
    if (job.phase === "pass" || job.phase === "show") {
      const label = String(job.item || "item").slice(0, 16);
      drawLabel(ctx, label, x, y - 18, "#e2b15a");
    }
  }

  drawBillboards(ctx, town);
  for (const agent of list) {
    const ox = Math.round(agent.x * TILE + TILE / 2);
    const oy = Math.round(agent.y * TILE) - 8;
    const short = SHORT[agent.id] || agent.name.slice(0, 12);
    if (town.isDimmed && town.isDimmed(agent)) continue;
    drawLabel(ctx, short, ox, oy - 12, agent.color);
    if (agent.stalled) drawStalled(ctx, ox, Math.round(agent.y * TILE) + 15);
    if (!quiet.has(agent.id)) {
      const bubble = bubbleFor(agent, now);
      if (bubble) drawBubble(ctx, ox, oy - 30, bubble.kind, now, bubble.text);
    }
  }

  if (town.chests) {
    for (const chest of town.chests) {
      const showTip = !chest.url && (town.hoverChest === chest.id || town.tipChest === chest.id);
      if (!showTip) continue;
      const cx = chest.x * TILE + TILE / 2;
      const cy = chest.y * TILE - 12;
      drawLabel(ctx, "no Drive folder yet", cx, cy, "#8a8680");
    }
  }
}

window.AgentTown = window.AgentTown || {};
Object.assign(window.AgentTown, { drawMap: drawMap, drawScene: drawScene });
})();
