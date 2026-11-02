/** Castle part: THRONE ROOM in the center. Bus Ninja sits on the throne with a rock-punch idle loop.
 *  A red carpet runs from the throne to the door; needs-Alex bots line up on it facing the throne,
 *  urgent first, then oldest. Also gives the throne-room patrol spots for overflow sleepers. */
(function () {
const ROOM = {
  id: "throne",
  name: "Throne Room",
  x: 14,
  y: 16,
  w: 28,
  h: 18,
  // bottom door, top openings (patrol + vault door), side doors to Workshop and Wizard Lab
  doors: [[27, 33], [28, 33], [17, 16], [38, 16], [26, 16], [27, 16], [28, 16], [29, 16], [14, 24], [14, 25], [41, 24], [41, 25]],
  wall: "#6b5a7e",
  wallDk: "#45385a",
  floor: "#a99f8a",
  floor2: "#9d937e",
  trim: "#e0b84a",
};
const THRONE = { x: 27.5, y: 18 };
const CARPET = { x0: 27, x1: 28, y0: 19, y1: 32 };
const LINE_STEP = 1.5;
const PILLARS = [[17, 20], [38, 20], [17, 25], [38, 25], [17, 30], [38, 30]];

function lineSpots() {
  const out = [];
  for (let y = CARPET.y0 + 2; y <= CARPET.y1 - 0.2; y += LINE_STEP) out.push({ x: THRONE.x, y });
  return out;
}

function makeNinja(world) {
  const nin = { x: THRONE.x, y: THRONE.y, mode: "throne", path: [], walk: 0, facing: "s", done: null, puff: 0 };
  nin.goTo = function (tx, ty, done) {
    const findPath = window.AgentTown.findPath;
    const p = findPath(world, nin.x, nin.y, tx, ty) || [];
    p.push({ x: tx, y: ty });
    nin.path = p;
    nin.mode = "walk";
    nin.done = done || null;
  };
  nin.goHome = function () {
    nin.goTo(THRONE.x, THRONE.y, () => {
      nin.mode = "throne";
      nin.facing = "s";
    });
  };
  return nin;
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

const part = {
  id: "throne",
  order: 20,
  rooms(world) {
    world.addRoom(ROOM);
    for (const [x, y] of PILLARS) world.block(x, y);
    // throne dais and rock are solid
    world.block(27, 17);
    world.block(28, 17);
    world.block(30, 18);
    world.throne = { x: THRONE.x, y: THRONE.y, carpet: CARPET };
    world.busNinja = makeNinja(world);
    const spots = [];
    for (let y = 22; y <= 31; y += 2) {
      for (let x = 16; x <= 39; x += 3) {
        if (x >= CARPET.x0 - 1 && x <= CARPET.x1 + 1) continue;
        if (!world.solid[y][x]) spots.push({ x, y, facing: "s" });
      }
    }
    world.patrolSpots = spots;
  },
  place(ctx) {
    const town = ctx.town;
    const taken = new Set(ctx.free().map((a) => a.id));
    const line = town.needsList().filter((a) => taken.has(a.id));
    const spots = lineSpots();
    line.forEach((a, i) => {
      const s = spots[i] || { x: THRONE.x + (i % 2 ? -2 : 2), y: CARPET.y1 - Math.floor((i - spots.length) / 2) * LINE_STEP };
      ctx.assign(a, { zone: "carpet", x: s.x, y: s.y, facing: "n", line: i + 1 });
    });
    town.extras.carpetLine = line.map((a) => a.id);
  },
  update(town, dt) {
    const nin = town.world.busNinja;
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
    }
    if (step >= dist - 0.0001) nin.path.shift();
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
    P.fill(ctx, 25 * T, 17 * T, 6 * T, 2 * T + 6, "#7d6a4c");
    P.fill(ctx, 25 * T, 19 * T + 2, 6 * T, 4, "#5c4c34");
    P.fill(ctx, 25 * T, 17 * T, 6 * T, 1, "#a8916a");
    // throne: high back, red cushion, gold trim
    const tx = 27 * T + 3;
    const ty = 16 * T + 4;
    P.fill(ctx, tx - 1, ty - 1, 2 * T - 4, 30, "#5a3f12");
    P.fill(ctx, tx, ty, 2 * T - 6, 28, "#d9a63a");
    P.fill(ctx, tx + 3, ty + 3, 2 * T - 12, 14, "#a3202a");
    P.fill(ctx, tx + 2, ty + 20, 2 * T - 10, 6, "#a3202a");
    P.fill(ctx, tx + 9, ty - 4, 8, 4, "#d9a63a");
    P.fill(ctx, tx + 12, ty - 6, 2, 2, "#ff5a5a");
    // the rock Bus Ninja punches
    const rx = 30 * T;
    const ry = 18 * T;
    P.fill(ctx, rx + 1, ry + 4, 14, 11, "#4e4b55");
    P.fill(ctx, rx + 3, ry + 2, 10, 3, "#6b6873");
    P.fill(ctx, rx + 3, ry + 5, 4, 2, "#8a8791");
    P.fill(ctx, rx + 9, ry + 9, 3, 1, "#2f2d35");
    // pillars, banners, torches
    for (const [x, y] of [[17, 20], [38, 20], [17, 25], [38, 25], [17, 30], [38, 30]]) {
      P.fill(ctx, x * T + 2, y * T - 8, 12, 24, "#d8d2c2");
      P.fill(ctx, x * T + 4, y * T - 8, 2, 24, "#f2eee2");
      P.fill(ctx, x * T, y * T - 10, 16, 3, "#b8b0a0");
      P.fill(ctx, x * T, y * T + 14, 16, 3, "#b8b0a0");
    }
    for (const bx of [20, 23, 32, 35]) {
      P.fill(ctx, bx * T + 3, 16 * T + 4, 10, 18, "#3b4fa8");
      P.fill(ctx, bx * T + 3, 16 * T + 4, 10, 2, "#e0b84a");
      P.fill(ctx, bx * T + 7, 16 * T + 9, 2, 6, "#e0b84a");
      P.fill(ctx, bx * T + 3, 16 * T + 22, 4, 3, "#3b4fa8");
      P.fill(ctx, bx * T + 9, 16 * T + 22, 4, 3, "#3b4fa8");
    }
  },
  drawUnder(ctx, town, world, now, P) {
    const T = P.TILE;
    for (const tx of [15, 40]) {
      const flick = Math.floor(now / 120) % 3;
      P.fill(ctx, tx * T + 6, 18 * T + 2, 4, 8, "#5a3f12");
      P.fill(ctx, tx * T + 5, 18 * T - 4 + flick, 6, 6, "#ff9a2e");
      P.fill(ctx, tx * T + 6, 18 * T - 2 + flick, 4, 3, "#ffe17a");
    }
    const nin = world.busNinja;
    if (!nin) return;
    const hitRock = drawNinja(ctx, P, nin, now);
    if (hitRock) {
      // rock shakes and chips fly
      const t = now % 1800;
      P.fill(ctx, 30 * T + 15 + ((t / 40) % 4), 18 * T + 3 - ((t / 60) % 5), 2, 2, "#8a8791");
      P.fill(ctx, 30 * T + 14 + ((t / 30) % 5), 18 * T + 8 - ((t / 50) % 4), 1, 1, "#8a8791");
    }
    if (nin.puff > now) {
      // smoke-bomb puff
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
  },
};
window.AgentTown.castleParts.push(part);
})();
