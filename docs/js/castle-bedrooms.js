/** Castle part: two BEDROOMS above the throne room. 12 bunks each; sleepers lie in a bunk with "zzz".
 *  Overflow sleepers patrol the throne room with a small "sleepy" tag. */
(function () {
const BUNKS_PER_ROOM = 12;
const ROOMS = [
  { id: "bedroom-l", name: "Bedroom", x: 1, y: 3, w: 14, h: 12, doors: [[7, 14], [8, 14]] },
  { id: "bedroom-r", name: "Bedroom", x: 41, y: 3, w: 14, h: 12, doors: [[47, 14], [48, 14]] },
];
const LOOK = { wall: "#4b4a7a", wallDk: "#2c2b4d", floor: "#6f6a9c", floor2: "#655f92", trim: "#a99be0" };

/** 3 bunk frames x 2 rows x 2 berths (upper, lower) = 12 berths per room. */
function berths(room) {
  const out = [];
  for (const ry of [room.y + 1, room.y + 6]) {
    for (const fx of [room.x + 2, room.x + 6, room.x + 10]) {
      out.push({ x: fx, y: ry + 0.35, facing: "s", upper: true, frame: { x: fx, y: ry } });
      out.push({ x: fx, y: ry + 2.0, facing: "s", upper: false, frame: { x: fx, y: ry } });
    }
  }
  return out.slice(0, BUNKS_PER_ROOM);
}

const part = {
  id: "bedrooms",
  order: 30,
  rooms(world) {
    world.beds = [];
    for (const r of ROOMS) {
      world.addRoom(Object.assign({}, r, LOOK));
      for (const b of berths(r)) world.beds.push(Object.assign({ room: r.id }, b));
    }
  },
  place(ctx) {
    const world = ctx.world;
    const sleepers = ctx.free().filter((a) => a.state === "sleeping");
    const patrol = world.patrolSpots && world.patrolSpots.length ? world.patrolSpots : world.yardSpots;
    const taken = new Set();
    sleepers.forEach((a, i) => {
      const bed = world.beds[i];
      if (bed) ctx.assign(a, { zone: "bed", x: bed.x, y: bed.y, facing: "s", bed: bed.room });
      else {
        // spread out, and never two sleepy patrollers on one spot
        let k = (i * 7) % patrol.length;
        for (let n = 0; n < patrol.length && taken.has(k); n++) k = (k + 1) % patrol.length;
        taken.add(k);
        const p = patrol[k];
        ctx.assign(a, { zone: "patrol", x: p.x, y: p.y, facing: "s", tag: "sleepy", patrol });
      }
    });
  },
  drawStatic(ctx, world, P) {
    const T = P.TILE;
    for (const r of ROOMS) {
      // Rug, window with moon, nightstands.
      P.fill(ctx, (r.x + 4) * T + 4, (r.y + 4) * T + 4, 5 * T - 8, 1 * T, "#7b3b5e");
      P.fill(ctx, (r.x + 4) * T + 6, (r.y + 4) * T + 6, 5 * T - 12, T - 4, "#9c4d74");
      const wx = (r.x + r.w / 2 - 1) * T;
      P.fill(ctx, wx, r.y * T + 3, 2 * T, 10, "#1a1d3d");
      P.fill(ctx, wx + 1, r.y * T + 4, 2 * T - 2, 8, "#273066");
      P.fill(ctx, wx + 20, r.y * T + 5, 4, 4, "#f4efc0");
      P.fill(ctx, wx + 6, r.y * T + 6, 1, 1, "#fff");
      P.fill(ctx, wx + 13, r.y * T + 9, 1, 1, "#fff");
      P.fill(ctx, wx + 15, r.y * T + 3, 1, 10, "#2c2b4d");
    }
    const frames = new Map();
    for (const b of world.beds) frames.set(b.frame.x + "," + b.frame.y, b.frame);
    for (const f of frames.values()) {
      const px = f.x * T - 1;
      const py = f.y * T;
      // Bunk frame: two posts, two mattresses with pillows and blankets, a ladder.
      P.fill(ctx, px, py, 2, 3 * T + 4, "#5a3518");
      P.fill(ctx, px + 16, py, 2, 3 * T + 4, "#5a3518");
      for (const dy of [4, 30]) {
        P.fill(ctx, px + 1, py + dy, 16, 20, "#3a2410");
        P.fill(ctx, px + 2, py + dy + 1, 14, 18, "#e9e4d4");
        P.fill(ctx, px + 4, py + dy + 2, 10, 4, "#ffffff");
        P.fill(ctx, px + 2, py + dy + 9, 14, 10, "#5d5aa0");
        P.fill(ctx, px + 2, py + dy + 9, 14, 2, "#8a87cf");
      }
      P.fill(ctx, px - 3, py + 8, 2, 20, "#7a4a22");
      for (let k = 0; k < 4; k++) P.fill(ctx, px - 4, py + 10 + k * 5, 4, 1, "#7a4a22");
    }
  },
};
window.AgentTown.castleParts.push(part);
})();
