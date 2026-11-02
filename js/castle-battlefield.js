/** Castle part: BATTLEFIELD below the castle, over the lowered drawbridge.
 *  Solo working bots that have no table fight their own monster. Collab bots (shared --with or the
 *  same --project) stand in a polygon formation around one monster: 2 = facing pair, 3 = triangle,
 *  ... 8 = octagon, 9+ = octagon plus an inner ring. Monsters are named after the task (truncated
 *  nameplate, full name on tap). The MEDIC TENT at the bottom holds blocked bots with the red X. */
(function () {
const NAME_MAX = 18;
const FIELD = { x0: 1, x1: 55, y0: 40, cols: 7, rows: [43.2, 49.6] };
const TENT = {
  id: "medic", name: "Medic Tent", x: 22, y: 53, w: 12, h: 6, doors: [[27, 53], [28, 53]],
  wall: "#d8cfb4", wallDk: "#b0a684", floor: "#e9e2cc", floor2: "#e1d9c0", trim: "#5fbf7a",
};
const KINDS = ["slime", "bat", "imp", "golem"];

function trunc(text, n) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

function cells() {
  const out = [];
  const cw = (FIELD.x1 - FIELD.x0) / FIELD.cols;
  // center columns first so small days stay near the bridge
  const order = [3, 2, 4, 1, 5, 0, 6];
  for (const cy of FIELD.rows) for (const c of order) out.push({ x: FIELD.x0 + cw * (c + 0.5) - 0.5, y: cy });
  return out;
}

/** Formation points around (0,0), in tiles. Exported for the tests. */
function formation(n) {
  const ring = (k, r, rot) => {
    const pts = [];
    for (let i = 0; i < k; i++) {
      const a = rot + (i / k) * Math.PI * 2;
      pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
    }
    return pts;
  };
  if (n <= 1) return [{ x: -1.4, y: 0 }];
  if (n === 2) return [{ x: -1.4, y: 0 }, { x: 1.4, y: 0 }]; // facing pair, monster between
  if (n <= 8) {
    const r = Math.max(1.5, 1.25 / (2 * Math.sin(Math.PI / n)));
    return ring(n, r, -Math.PI / 2);
  }
  // 9+: octagon outside, the rest on inner rings (8 per ring), then more outer rings.
  const pts = ring(8, 2.7, -Math.PI / 2);
  let rest = n - 8;
  const radii = [1.45, 3.9, 5.1];
  let k = 0;
  while (rest > 0) {
    const r = radii[Math.min(k, radii.length - 1)] + (k >= radii.length ? (k - radii.length + 1) * 1.2 : 0);
    const cap = Math.max(8, Math.floor((2 * Math.PI * r) / 1.1));
    const m = Math.min(rest, k === 0 ? 8 : cap);
    pts.push(...ring(m, r, Math.PI / 2 + Math.PI / 8)); // first inner bot stands in front of the monster
    rest -= m;
    k++;
  }
  return pts;
}

function facingTo(dx, dy) {
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "e" : "w") : dy > 0 ? "s" : "n";
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const part = {
  id: "battlefield",
  order: 10,
  formation,
  rooms(world) {
    world.addRoom(TENT);
    world.battleCells = cells();
  },
  place(ctx) {
    const town = ctx.town;
    // Medic tent first: every blocked bot goes here (even with a question).
    const cots = [];
    for (const y of [54.6, 56.4]) for (let x = 24; x <= 32; x += 2) cots.push({ x, y });
    const blocked = ctx.free().filter((a) => a.state === "blocked");
    blocked.forEach((a, i) => {
      const c = cots[i % cots.length];
      ctx.assign(a, { zone: "tent", x: c.x - (i >= cots.length ? 0.5 : 0), y: c.y, facing: "s" });
    });
    town.extras.monsters = [];
    town.extras.formations = [];
  },
};

/** Runs after side rooms (order 60): collab formations, then solo fights. */
const late = {
  id: "battlefield-fights",
  order: 60,
  place(ctx) {
    const town = ctx.town;
    const world = ctx.world;
    const free = new Set(ctx.free().map((a) => a.id));
    const monsters = (town.extras.monsters = []);
    const formations = (town.extras.formations = []);
    const cellList = world.battleCells.slice();
    const groups = (ctx.groups || []).map((g) => g.filter((a) => free.has(a.id))).filter((g) => g.length > 1);
    groups.sort((a, b) => b.length - a.length || (a[0].id < b[0].id ? -1 : 1));
    for (const g of groups) {
      const cell = cellList.shift();
      if (!cell) break;
      const pts = formation(g.length);
      const name = g[0].project || g[0].task || g[0].text || "Unnamed task";
      const mon = { x: cell.x, y: cell.y, name, label: trunc(name, NAME_MAX), size: g.length >= 9 ? 1 : Math.min(2, 1 + Math.floor(g.length / 4)), kind: KINDS[hashStr(name) % KINDS.length], group: g.map((a) => a.id) };
      monsters.push(mon);
      formations.push({ n: g.length, ids: mon.group, cx: cell.x, cy: cell.y });
      g.forEach((a, i) => {
        const p = pts[i];
        ctx.assign(a, { zone: "battle", x: cell.x + p.x, y: cell.y + p.y, facing: facingTo(-p.x, -p.y), collab: g.length });
      });
    }
    // Solo fights: two per cell.
    const solos = ctx.free().filter((a) => a.state === "working");
    let cell = null;
    solos.forEach((a, i) => {
      if (i % 2 === 0) cell = cellList.shift();
      if (!cell) return;
      const sx = cell.x + (i % 2 === 0 ? -2.4 : 0.6);
      const sy = cell.y + (i % 2 === 0 ? -1.3 : 1.3);
      const name = a.task || a.text || "Unnamed task";
      monsters.push({ x: sx + 1.5, y: sy, name, label: trunc(name, NAME_MAX), size: 1, kind: KINDS[hashStr(name) % KINDS.length], group: [a.id] });
      ctx.assign(a, { zone: "battle", x: sx, y: sy, facing: "e", collab: 1 });
    });
  },
  labels(town) {
    return (town.extras.monsters || []).map((m) => ({ kind: "monster", x: m.x * 16 + 8, y: m.y * 16 + 12 + m.size * 3, text: m.label, accent: "#ff5f5f", bg: "rgba(60,10,14,0.9)", minAbs: 0.55 }));
  },
  hit(town, wx, wy, ui) {
    for (const m of town.extras.monsters || []) {
      const r = 10 + m.size * 5;
      if (Math.hypot(wx - (m.x * 16 + 8), wy - (m.y * 16 + 6)) < r) return ui.showTip("Monster", m.name);
    }
    return false;
  },
  drawStatic(ctx, world, P) {
    const T = P.TILE;
    // drawbridge chains from the gate posts to the far end of the bridge
    const [bx0, bx1] = world.castle.bridgeX;
    const gy = world.castle.wallY * T;
    for (const [x0, x1] of [[bx0 * T + 2, bx0 * T + 1], [(bx1 + 1) * T - 3, (bx1 + 1) * T - 2]]) {
      for (let i = 0; i < 14; i++) P.fill(ctx, x0 + (x1 - x0) * (i / 14), gy + 6 + i * 4.4, 2, 2, i % 2 ? "#9aa3ad" : "#c5ccd4");
    }
    P.fill(ctx, bx0 * T, 38 * T + 12, (bx1 - bx0 + 1) * T, 4, "#5a3518");
    // tent canvas stripes and a green leaf sign (not a red cross emblem)
    const tx = TENT.x * T;
    const ty = TENT.y * T;
    for (let i = 0; i < TENT.w; i++) {
      P.fill(ctx, tx + i * T, ty, T, T, i % 2 ? "#e8e0c8" : "#cfc5a6");
      P.fill(ctx, tx + i * T, ty + (TENT.h - 1) * T, T, T, i % 2 ? "#e8e0c8" : "#cfc5a6");
    }
    for (let j = 1; j < TENT.h - 1; j++) {
      P.fill(ctx, tx, ty + j * T, T, T, "#cfc5a6");
      P.fill(ctx, tx + (TENT.w - 1) * T, ty + j * T, T, T, "#cfc5a6");
    }
    P.fill(ctx, tx, ty, TENT.w * T, 3, "#8a7f62");
    for (const dx of [27, 28]) P.fill(ctx, dx * T, ty, T, T, "#efe8d4");
    P.fill(ctx, 25 * T + 3, ty + 3, 10, 10, "#ffffff");
    P.fill(ctx, 25 * T + 5, ty + 5, 6, 6, "#4fae62");
    P.fill(ctx, 25 * T + 7, ty + 4, 2, 8, "#2f7a40");
    // cots
    for (const y of [54.6, 56.4]) {
      for (let x = 24; x <= 32; x += 2) {
        P.fill(ctx, x * T, y * T + 6, 16, 8, "#7a6a4a");
        P.fill(ctx, x * T + 1, y * T + 7, 14, 6, "#f4f1ea");
      }
    }
    // battlefield clutter: rocks and flags
    for (const [x, y] of [[2, 55], [8, 57], [15, 54], [40, 56], [47, 54], [52, 57], [4, 40], [51, 40]]) {
      P.fill(ctx, x * T + 3, y * T + 8, 9, 6, "#6b6873");
      P.fill(ctx, x * T + 4, y * T + 7, 6, 2, "#8a8791");
    }
    for (const [x, y, c] of [[12, 39, "#c0392b"], [43, 39, "#2e86de"]]) {
      P.fill(ctx, x * T + 7, y * T - 6, 2, 22, "#5a3518");
      P.fill(ctx, x * T + 9, y * T - 6, 10, 7, c);
    }
  },
  drawUnder(ctx, town, world, now, P) {
    for (const m of town.extras.monsters || []) drawMonster(ctx, P, m, now);
  },
};

function drawMonster(ctx, P, m, now) {
  const s = m.size;
  const cx = m.x * 16 + 8;
  const base = m.y * 16 + 10;
  const bob = Math.floor(now / 250) % 2;
  const hit = Math.floor((now + hashStr(m.name) % 700) / 180) % 4 === 1;
  const w = 10 + s * 6;
  const h = 8 + s * 5;
  const x = Math.round(cx - w / 2);
  const y = Math.round(base - h) + bob;
  P.fill(ctx, x + 1, base + 2, w - 2, 3, "rgba(0,0,0,0.3)");
  const col = { slime: "#5fd16a", bat: "#7b5bd6", imp: "#d8573a", golem: "#8d8a7a" }[m.kind];
  const body = hit ? "#ffffff" : col;
  const dk = P.shade(col, 0.6);
  if (m.kind === "slime") {
    P.fill(ctx, x, y + 3, w, h - 3, dk);
    P.fill(ctx, x + 1, y + 2, w - 2, h - 3, body);
    P.fill(ctx, x + 3, y, w - 6, 3, body);
    P.fill(ctx, x + 3, y + 3, 3, 2, "#e8ffe8");
  } else if (m.kind === "bat") {
    const flap = Math.floor(now / 120) % 2 ? -3 : 0;
    P.fill(ctx, x - 5, y + 2 + flap, 6, 5, dk);
    P.fill(ctx, x + w - 1, y + 2 + flap, 6, 5, dk);
    P.fill(ctx, x + 1, y, w - 2, h - 2, body);
    P.fill(ctx, x + 2, y - 2, 2, 3, body);
    P.fill(ctx, x + w - 4, y - 2, 2, 3, body);
  } else if (m.kind === "imp") {
    P.fill(ctx, x + 1, y + 2, w - 2, h - 2, body);
    P.fill(ctx, x + 1, y - 2, 2, 4, "#f2e2b0");
    P.fill(ctx, x + w - 3, y - 2, 2, 4, "#f2e2b0");
    P.fill(ctx, x + 2, y + h - 1, 3, 2, dk);
    P.fill(ctx, x + w - 5, y + h - 1, 3, 2, dk);
  } else {
    P.fill(ctx, x, y + 1, w, h, dk);
    P.fill(ctx, x + 1, y, w - 2, h - 1, body);
    P.fill(ctx, x + 3, y + 3, w - 6, 1, dk);
    P.fill(ctx, x + 2, y + h - 4, 3, 1, dk);
  }
  // eyes
  const ey = y + Math.floor(h / 3);
  P.fill(ctx, cx - 4, ey, 2, 2, "#1a1a1a");
  P.fill(ctx, cx + 2, ey, 2, 2, "#1a1a1a");
  P.fill(ctx, cx - 4, ey, 1, 1, "#ffffff");
  P.fill(ctx, cx + 2, ey, 1, 1, "#ffffff");
  if (hit) {
    P.fill(ctx, cx - 7, y - 4, 3, 1, "#ffe14a");
    P.fill(ctx, cx + 5, y - 3, 3, 1, "#ffe14a");
  }
}

window.AgentTown.castleParts.push(part, late);
window.AgentTown.battleFormation = formation;
})();
