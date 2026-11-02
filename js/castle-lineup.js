/** Castle part: MOAT LINE-UP. Done, idle and never-posted bots stand in a row on the grass just
 *  below the moat, split across both sides of the drawbridge, facing the castle. The entrance path
 *  (the bridge, x26-29) keeps at least 3 clear tiles on each side. More rows are added below as
 *  needed. Tapping one opens its panel (for done bots: the full done line with its "next:" clause). */
(function () {
const ROWS = [39.6, 41.0, 42.4, 43.8];
const STEP = 2;
const CLEAR = 3; // clear tiles on each side of the entrance path

function spots(world) {
  const [b0, b1] = world.castle.bridgeX;
  const leftMax = b0 - CLEAR - 1; // a bot at x covers tiles x..x+1
  const rightMin = b1 + CLEAR + 1;
  const out = [];
  for (const y of ROWS) {
    const left = [];
    const right = [];
    for (let x = leftMax; x >= 1; x -= STEP) left.push(x);
    for (let x = rightMin; x <= world.w - 3; x += STEP) right.push(x);
    // fill from the bridge outward, alternating sides
    for (let i = 0; i < Math.max(left.length, right.length); i++) {
      if (left[i] != null) out.push({ x: left[i], y, side: "left" });
      if (right[i] != null) out.push({ x: right[i], y, side: "right" });
    }
  }
  return out;
}

const part = {
  id: "lineup",
  order: 40,
  place(ctx) {
    const ss = spots(ctx.world);
    const free = ctx.free();
    const done = free.filter((a) => a.state === "done").sort((a, b) => (b.ts || "").localeCompare(a.ts || "") || (a.id < b.id ? -1 : 1));
    const idle = free.filter((a) => a.state === "idle");
    done.concat(idle).forEach((a, i) => {
      const s = ss[i];
      if (s) ctx.assign(a, { zone: "lineup", x: s.x, y: s.y, facing: "n", side: s.side });
    });
  },
};

window.AgentTown.castleParts.push(part);
window.AgentTown.lineupSpots = spots;
})();
