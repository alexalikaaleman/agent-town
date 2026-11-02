/** Castle part: THRONE ROOM in the center. Bus Ninja sits on the throne with a rock-punch idle loop.
 *  A red carpet runs from the throne to the door; needs-Alex bots line up on it facing the throne,
 *  urgent first, then oldest. The room runs from the castle's back wall (y3, with the big vault door) down to y33, between the bedrooms. Also gives the throne-room patrol spots for overflow sleepers. */
(function () {
const ROOM = {
  id: "throne",
  name: "Throne Room",
  labelX: 19, // left of centre, so the vault door and its label stay clear
  x: 14,
  y: 3,
  w: 28,
  h: 31,
  // bottom door, side doors to Workshop and Wizard Lab
  doors: [[27, 33], [28, 33], [14, 24], [14, 25], [41, 24], [41, 25]],
  wall: "#6b5a7e",
  wallDk: "#45385a",
  floor: "#a99f8a",
  floor2: "#9d937e",
  trim: "#e0b84a",
};
// Fix 35: the carpet runs ~75% up the room (y10-32 of y3-33); the throne and its dais sit at its top end.
const THRONE = { x: 27.5, y: 9 };
const DY = THRONE.y - 18; // offset from the original throne row (dais/throne/rock art was drawn for y18)
const CARPET = { x0: 27, x1: 28, y0: THRONE.y + 1, y1: 32 };
const LINE_STEP = 1.5;
const VAULT_DOOR = { x: 27, y: 3, w: 2 }; // the big vault door in the back wall (tiles x..x+w-1)
const PILLARS = [[17, 8], [38, 8], [17, 14], [38, 14], [17, 20], [38, 20], [17, 25], [38, 25], [17, 30], [38, 30]];

function lineSpots() {
  const out = [];
  for (let y = CARPET.y0 + 2; y <= CARPET.y1 - 0.2; y += LINE_STEP) out.push({ x: THRONE.x, y });
  return out;
}

function makeNinja(world) {
  const nin = { x: THRONE.x, y: THRONE.y, mode: "throne", path: [], walk: 0, facing: "s", done: null, puff: 0 };
  nin.goTo = function (tx, ty, done) {
    // fix 36: floor-only path; with no path he does not walk (returns false, done still runs so entry never hangs)
    const p = window.AgentTown.walkPath(world, nin.x, nin.y, tx, ty);
    nin.path = p || [];
    nin.mode = "walk";
    nin.done = done || null;
    nin.world = world;
    return !!p;
  };
  nin.goHome = function () {
    nin.goTo(THRONE.x, THRONE.y, () => {
      nin.mode = "throne";
      nin.facing = "s";
    });
  };
  return nin;
}

/** Moves Bus Ninja along his path (shared with the vault map). */
function stepNinja(nin, dt) {
  if (!nin || nin.mode !== "walk") return;
  const target = nin.path[0];
  if (!target) {
    nin.mode = "stand";
    const done = nin.done;
    nin.done = null;
    if (done) done();
    return;
  }
  const dx = target.x - nin.x;
  const dy = target.y - nin.y;
  const dist = Math.hypot(dx, dy);
  const step = Math.min(dist, 7 * dt);
  if (dist > 0.0001) {
    nin.x += (dx / dist) * step;
    nin.y += (dy / dist) * step;
    nin.walk += step;
    nin.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "e" : "w") : dy > 0 ? "s" : "n";
    if (nin.world) window.AgentTown.noteStep(nin.world, "busNinja", nin.x, nin.y);
  }
  if (step >= dist - 0.0001) nin.path.shift();
}

/** Smoke-bomb puff around Bus Ninja (a ninja smoke bomb; he never smokes). */
function drawPuff(ctx, P, nin, now) {
  if (!(nin.puff > now)) return;
  const T = P.TILE;
  const k = 1 - (nin.puff - now) / 700;
  const r = 4 + k * 14;
  ctx.globalAlpha = Math.max(0, 1 - k);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    P.fill(ctx, nin.x * T + 8 + Math.cos(a) * r - 4, nin.y * T + 2 + Math.sin(a) * r * 0.7 - 4, 8, 8, i % 2 ? "#d8d8e0" : "#a9a9b8");
  }
  P.fill(ctx, nin.x * T + 2, nin.y * T - 4, 12, 12, "#eeeef4");
  ctx.globalAlpha = 1;
}

/** Bus Ninja drawn 1.5x with a bright outline so he stands out at every zoom (and on phone). */
const NINJA_SCALE = 1.5;
let ninOff = null;
let ninSil = null;
function drawNinjaBig(ctx, P, nin, now) {
  const T = P.TILE;
  const W = 64;
  const H = 48;
  if (!ninOff) {
    ninOff = document.createElement("canvas");
    ninOff.width = W;
    ninOff.height = H;
    ninSil = document.createElement("canvas");
    ninSil.width = W;
    ninSil.height = H;
  }
  const o = ninOff.getContext("2d");
  o.setTransform(1, 0, 0, 1, 0, 0);
  o.clearRect(0, 0, W, H);
  // local frame: the ninja's tile origin sits at (16, 16)
  o.translate(16 - Math.round(nin.x * T), 16 - Math.round(nin.y * T));
  const hit = drawNinja(o, P, nin, now);
  const s = ninSil.getContext("2d");
  s.globalCompositeOperation = "source-over";
  s.clearRect(0, 0, W, H);
  s.drawImage(ninOff, 0, 0);
  s.globalCompositeOperation = "source-in";
  s.fillStyle = "#ffe680";
  s.fillRect(0, 0, W, H);
  // anchor: the feet (local 24, 30) stay on the ninja's tile, the sprite grows up and out
  const ax = nin.x * T + 8;
  const ay = nin.y * T + 14;
  const dx = ax - 24 * NINJA_SCALE;
  const dy = ay - 30 * NINJA_SCALE;
  const k = NINJA_SCALE;
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  for (const [ex, ey] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]]) {
    ctx.drawImage(ninSil, dx + ex * 1.2, dy + ey * 1.2, W * k, H * k);
  }
  ctx.drawImage(ninOff, dx, dy, W * k, H * k);
  ctx.imageSmoothingEnabled = smooth;
  return hit;
}

function drawNinja(ctx, P, nin, now) {
  const T = P.TILE;
  const ox = Math.round(nin.x * T) + 2;
  let oy = Math.round(nin.y * T) - 6;
  const black = "#1d1f2b";
  const suit = "#2b3046";
  const sash = "#f2c230"; // school-bus yellow sash
  const band = "#d0312d";
  const skin = "#e8b48a";
  if (nin.mode === "throne") {
    const t = now % 1800;
    const wind = t > 800 && t < 1000;
    const punch = t >= 1000 && t < 1250;
    oy += 2;
    // seated body
    P.fill(ctx, ox + 1, oy + 9, 10, 8, suit);
    P.fill(ctx, ox + 1, oy + 12, 10, 2, sash);
    P.fill(ctx, ox + 2, oy + 17, 3, 3, black);
    P.fill(ctx, ox + 7, oy + 17, 3, 3, black);
    // head: hood with eye slit and a red headband
    P.blob(ctx, ox + 2, oy, 8, 9, black);
    P.fill(ctx, ox + 3, oy + 4, 6, 2, skin);
    P.fill(ctx, ox + 4, oy + 4, 1, 1, "#111");
    P.fill(ctx, ox + 7, oy + 4, 1, 1, "#111");
    P.fill(ctx, ox + 2, oy + 2, 8, 1, band);
    P.fill(ctx, ox, oy + 2, 2, 1, band);
    P.fill(ctx, ox - 2, oy + 3, 2, 1, band);
    // left arm rests, right arm punches toward the rock
    P.fill(ctx, ox, oy + 10, 2, 5, suit);
    if (punch) {
      P.fill(ctx, ox + 10, oy + 10, 9, 3, suit);
      P.fill(ctx, ox + 19, oy + 9, 4, 4, skin);
      P.fill(ctx, ox + 23, oy + 8, 2, 1, "#fff6c8");
      P.fill(ctx, ox + 23, oy + 13, 2, 1, "#fff6c8");
    } else if (wind) {
      P.fill(ctx, ox + 9, oy + 9, 3, 4, suit);
      P.fill(ctx, ox + 9, oy + 7, 3, 3, skin);
    } else {
      P.fill(ctx, ox + 10, oy + 10, 2, 5, suit);
      P.fill(ctx, ox + 10, oy + 15, 2, 2, skin);
    }
    return punch;
  }
  // walking (or standing at a cabinet)
  const moving = nin.mode === "walk";
  const step = moving ? Math.floor(nin.walk * 3) % 2 : 0;
  P.fill(ctx, ox + 2, oy + 18, 8, 3, "rgba(0,0,0,0.28)");
  P.fill(ctx, ox + 2, oy + 9, 8, 8, suit);
  P.fill(ctx, ox + 2, oy + 12, 8, 2, sash);
  P.fill(ctx, ox + 3, oy + 17, 2, 3 - step, black);
  P.fill(ctx, ox + 7, oy + 17, 2, 2 + step, black);
  P.blob(ctx, ox + 2, oy, 8, 9, black);
  if (nin.facing !== "n") {
    P.fill(ctx, ox + 3, oy + 4, 6, 2, skin);
    P.fill(ctx, ox + 4, oy + 4, 1, 1, "#111");
    P.fill(ctx, ox + 7, oy + 4, 1, 1, "#111");
  }
  P.fill(ctx, ox + 2, oy + 2, 8, 1, band);
  P.fill(ctx, ox - 1 + step, oy + 3, 3, 1, band);
  P.fill(ctx, ox, oy + 10, 2, 5, suit);
  P.fill(ctx, ox + 10, oy + 10, 2, 5, suit);
  return false;
}

/** The big vault door: an arched gold-banded double door set into the back wall. */
function drawVaultDoor(ctx, P) {
  const T = P.TILE;
  const d = VAULT_DOOR;
  // 4 tiles wide, set into the back wall and rising above it, so it reads at the framed zoom
  const x = (d.x - 1) * T;
  const w = (d.w + 2) * T;
  const y = (d.y - 1) * T - 4;
  const h = 2 * T + 4;
  P.fill(ctx, x - 3, y - 6, w + 6, h + 6, "#2a2008");
  P.fill(ctx, x - 1, y - 4, w + 2, 6, "#ffd34d");
  P.fill(ctx, x, y + 2, w, h - 2, "#6b4614");
  P.fill(ctx, x + 2, y + 4, w - 4, h - 6, "#7f5719");
  P.fill(ctx, x + w / 2 - 1, y + 2, 2, h - 2, "#2a1a08");
  for (const by of [8, 18, 28]) P.fill(ctx, x, y + by, w, 3, "#ffd34d");
  for (const rx of [6, w - 10]) for (const ry of [12, 22]) P.fill(ctx, x + rx, y + ry, 3, 3, "#c9a23a");
  // big round lock wheel in the middle
  P.fill(ctx, x + w / 2 - 7, y + 10, 14, 14, "#c9a23a");
  P.fill(ctx, x + w / 2 - 5, y + 12, 10, 10, "#ffe98a");
  P.fill(ctx, x + w / 2 - 1, y + 13, 2, 8, "#6b4614");
  P.fill(ctx, x + w / 2 - 4, y + 16, 8, 2, "#6b4614");
}

/** Fix 35: honour the OS "reduce motion" setting (static door, static gold text). */
function reducedMotion() {
  try {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  } catch (e) {
    return false;
  }
}

/** Slow, smooth rainbow for the "Vault door" text (one full cycle every 12 s). Static gold when motion is reduced. */
function vaultDoorTextColor(now) {
  if (reducedMotion()) return "#ffd34d";
  const hue = Math.round(((now || 0) / 12000) * 360) % 360;
  return "hsl(" + hue + ", 95%, 72%)";
}

/** Fix 35: a soft light band sweeps across the vault door every few seconds. */
function drawDoorShimmer(ctx, P, now) {
  if (reducedMotion()) return;
  const T = P.TILE;
  const d = VAULT_DOOR;
  const x = (d.x - 1) * T;
  const w = (d.w + 2) * T;
  const y = (d.y - 1) * T - 4;
  const h = 2 * T + 4;
  const period = 3200;
  const k = (now % period) / period; // 0..1
  const bandX = x - 12 + k * (w + 24);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  for (let i = 0; i < 3; i++) {
    ctx.globalAlpha = [0.18, 0.35, 0.18][i];
    ctx.fillStyle = "#fff6c8";
    ctx.beginPath();
    const bx = bandX + i * 3;
    ctx.moveTo(bx, y);
    ctx.lineTo(bx + 3, y);
    ctx.lineTo(bx + 3 - h * 0.5, y + h);
    ctx.lineTo(bx - h * 0.5, y + h);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

const part = {
  id: "throne",
  order: 20,
  rooms(world) {
    world.addRoom(ROOM);
    for (const [x, y] of PILLARS) world.block(x, y);
    // throne dais and rock are solid
    world.block(27, 17 + DY);
    world.block(28, 17 + DY);
    world.block(30, 18 + DY);
    world.throne = { x: THRONE.x, y: THRONE.y, carpet: CARPET };
    world.busNinja = makeNinja(world);
    world.vaultDoor = VAULT_DOOR;
    world.vaultDoorFx = { reducedMotion, textColor: vaultDoorTextColor };
    const spots = [];
    for (let y = 5; y <= 31; y += 2) {
      if (y >= THRONE.y - 3 && y <= THRONE.y + 2) continue; // keep the throne and dais clear
      for (let x = 16; x <= 39; x += 3) {
        if (x >= CARPET.x0 - 1 && x <= CARPET.x1 + 1) continue;
        if (!world.solid[y][x]) spots.push({ x, y, facing: "s" });
      }
    }
    world.patrolSpots = spots;
  },
  labels(town) {
    // The vault door is a labelled tap target at every zoom (no minZoom); Bus Ninja always has his name.
    const nin = town && town.world && town.world.busNinja;
    const out = [];
    if (nin) out.push({ reserve: [nin.x * 16 - 6, nin.y * 16 - 24, nin.x * 16 + 22, nin.y * 16 + 16] });
    if (nin) out.push({ kind: "busninja", x: nin.x * 16 + 8, y: nin.y * 16 + 18, text: "Bus Ninja", accent: "#f2c230", bg: "rgba(29,31,43,0.94)" });
    return out.concat([{ kind: "vaultdoor", x: (VAULT_DOOR.x + VAULT_DOOR.w / 2) * 16, y: (VAULT_DOOR.y + 1) * 16 + 8, text: "Vault door", accent: "#ffd34d", textColor: vaultDoorTextColor(performance.now()), bg: "rgba(42,32,8,0.94)" }]);
  },
  place(ctx) {
    const town = ctx.town;
    // Voice-call bots stand beside the throne (fix 9 / FIXES #6): 2 sides, extras below the dais.
    const talkers = ctx.free().filter((a) => a.state === "talking").sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
    const talkSpots = [
      { x: THRONE.x - 2, y: THRONE.y, facing: "e" },
      { x: THRONE.x + 2, y: THRONE.y, facing: "w" },
    ];
    talkers.forEach((a, i) => {
      let s;
      if (i < 2) s = talkSpots[i];
      else {
        const k = i - 2;
        s = { x: THRONE.x + (k % 2 ? 2.5 : -2.5), y: THRONE.y + 2 + Math.floor(k / 2) * 1.5, facing: "n" };
      }
      ctx.assign(a, { zone: "talk", x: s.x, y: s.y, facing: s.facing, line: i + 1 });
    });
    town.extras.talkLine = talkers.map((a) => a.id);
    const freeIds = new Set(ctx.free().map((a) => a.id));
    const carpet = town.needsList().filter((a) => freeIds.has(a.id));
    const spots = lineSpots();
    carpet.forEach((a, i) => {
      const s = spots[i] || { x: THRONE.x + (i % 2 ? -2 : 2), y: CARPET.y1 - Math.floor((i - spots.length) / 2) * LINE_STEP };
      ctx.assign(a, { zone: "carpet", x: s.x, y: s.y, facing: "n", line: i + 1 });
    });
    town.extras.carpetLine = carpet.map((a) => a.id);
  },
  update(town, dt) {
    stepNinja(town.world.busNinja, dt);
  },
  drawStatic(ctx, world, P) {
    const T = P.TILE;
    // red carpet with gold edges
    const cx = CARPET.x0 * T;
    for (let y = CARPET.y0 * T; y < (CARPET.y1 + 1) * T; y++) {
      P.fill(ctx, cx + 2, y, 2 * T - 4, 1, y % 8 < 1 ? "#9c1f26" : "#c22b33");
    }
    P.fill(ctx, cx + 2, CARPET.y0 * T, 2, (CARPET.y1 - CARPET.y0 + 1) * T, "#e0b84a");
    P.fill(ctx, cx + 2 * T - 4, CARPET.y0 * T, 2, (CARPET.y1 - CARPET.y0 + 1) * T, "#e0b84a");
    // dais
    P.fill(ctx, 25 * T, (17 + DY) * T, 6 * T, 2 * T + 6, "#7d6a4c");
    P.fill(ctx, 25 * T, (19 + DY) * T + 2, 6 * T, 4, "#5c4c34");
    P.fill(ctx, 25 * T, (17 + DY) * T, 6 * T, 1, "#a8916a");
    // throne: high back, red cushion, gold trim
    const tx = 27 * T + 3;
    const ty = (16 + DY) * T + 4;
    P.fill(ctx, tx - 1, ty - 1, 2 * T - 4, 30, "#5a3f12");
    P.fill(ctx, tx, ty, 2 * T - 6, 28, "#d9a63a");
    P.fill(ctx, tx + 3, ty + 3, 2 * T - 12, 14, "#a3202a");
    P.fill(ctx, tx + 2, ty + 20, 2 * T - 10, 6, "#a3202a");
    P.fill(ctx, tx + 9, ty - 4, 8, 4, "#d9a63a");
    P.fill(ctx, tx + 12, ty - 6, 2, 2, "#ff5a5a");
    // the rock Bus Ninja punches
    const rx = 30 * T;
    const ry = (18 + DY) * T;
    P.fill(ctx, rx + 1, ry + 4, 14, 11, "#4e4b55");
    P.fill(ctx, rx + 3, ry + 2, 10, 3, "#6b6873");
    P.fill(ctx, rx + 3, ry + 5, 4, 2, "#8a8791");
    P.fill(ctx, rx + 9, ry + 9, 3, 1, "#2f2d35");
    drawVaultDoor(ctx, P);
    // pillars, banners, torches
    for (const [x, y] of PILLARS) {
      P.fill(ctx, x * T + 2, y * T - 8, 12, 24, "#d8d2c2");
      P.fill(ctx, x * T + 4, y * T - 8, 2, 24, "#f2eee2");
      P.fill(ctx, x * T, y * T - 10, 16, 3, "#b8b0a0");
      P.fill(ctx, x * T, y * T + 14, 16, 3, "#b8b0a0");
    }
    for (const bx of [20, 23, 32, 35]) {
      // banners hang on the back wall
      P.fill(ctx, bx * T + 3, 3 * T + 4, 10, 18, "#3b4fa8");
      P.fill(ctx, bx * T + 3, 3 * T + 4, 10, 2, "#e0b84a");
      P.fill(ctx, bx * T + 7, 3 * T + 9, 2, 6, "#e0b84a");
      P.fill(ctx, bx * T + 3, 3 * T + 22, 4, 3, "#3b4fa8");
      P.fill(ctx, bx * T + 9, 3 * T + 22, 4, 3, "#3b4fa8");
    }
  },
  drawUnder(ctx, town, world, now, P) {
    const T = P.TILE;
    drawDoorShimmer(ctx, P, now);
    for (const tx of [15, 40]) {
      const flick = Math.floor(now / 120) % 3;
      P.fill(ctx, tx * T + 6, 18 * T + 2, 4, 8, "#5a3f12");
      P.fill(ctx, tx * T + 5, 18 * T - 4 + flick, 6, 6, "#ff9a2e");
      P.fill(ctx, tx * T + 6, 18 * T - 2 + flick, 4, 3, "#ffe17a");
    }
    const nin = world.busNinja;
    if (!nin) return;
    const hitRock = drawNinjaBig(ctx, P, nin, now);
    if (hitRock) {
      // rock shakes and chips fly
      const t = now % 1800;
      P.fill(ctx, 30 * T + 15 + ((t / 40) % 4), (18 + DY) * T + 3 - ((t / 60) % 5), 2, 2, "#8a8791");
      P.fill(ctx, 30 * T + 14 + ((t / 30) % 5), (18 + DY) * T + 8 - ((t / 50) % 4), 1, 1, "#8a8791");
    }
    drawPuff(ctx, P, nin, now);
    // Fix 9: Bus Ninja shows "..." while any bot is on a voice call beside the throne.
    const talking = town && town.agents && [...town.agents.values()].some((a) => a.state === "talking");
    if (talking && P.drawBubble) P.drawBubble(ctx, nin.x * T + T / 2, nin.y * T - 10, "working", now);
  },
};
window.AgentTown.castleParts.push(part);
// Shared with the vault map (fix 28): same Bus Ninja, same walk and puff.
window.AgentTown.ninjaKit = {
  make(world, x, y) {
    const nin = makeNinja(world);
    nin.x = x;
    nin.y = y;
    nin.mode = "stand";
    nin.goHome = function () {
      nin.goTo(x, y, () => {
        nin.mode = "stand";
        nin.facing = "s";
      });
    };
    return nin;
  },
  step: stepNinja,
  draw(ctx, P, nin, now) {
    drawNinjaBig(ctx, P, nin, now);
    drawPuff(ctx, P, nin, now);
  },
};
})();
