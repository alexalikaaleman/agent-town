/** Castle part: DONE WALL. Bots whose last line is "done" stand at attention in a row along the
 *  top castle wall (walkway row y=2), facing the courtyard. Tapping one opens its panel, which shows
 *  the full done line including its "next:" clause. */
(function () {
const ROW = 2;

function spots(world) {
  const out = [];
  // every 2 tiles first, then the gaps in between, so a busy day still fits (up to 54 bots)
  for (let x = 2; x < world.w - 1; x += 2) out.push(x);
  for (let x = 1; x < world.w - 1; x += 2) out.push(x);
  return out.filter((x) => !world.solid[ROW][x]);
}

const part = {
  id: "donewall",
  order: 40,
  place(ctx) {
    const xs = spots(ctx.world);
    const done = ctx.free().filter((a) => a.state === "done");
    // most recent first, so the newest finishers sit near the middle-left start
    done.sort((a, b) => (b.ts || "").localeCompare(a.ts || "") || (a.id < b.id ? -1 : 1));
    done.forEach((a, i) => {
      if (i >= xs.length) return;
      ctx.assign(a, { zone: "wall", x: xs[i], y: ROW, facing: "s" });
    });
  },
  labels(town, world) {
    return [{ kind: "sign", x: 3 * 16, y: 1 * 16 + 6, text: "Done wall", accent: "#ffd34d", bg: "rgba(40,30,8,0.88)", minZoom: 0.9 }];
  },
  drawStatic(ctx, world, P) {
    const T = P.TILE;
    // gold pennants on the inner face of the top wall, one above every standing spot
    for (let x = 2; x < world.w - 1; x += 2) {
      P.fill(ctx, x * T + 7, T + 2, 2, 10, "#6b4a1e");
      P.fill(ctx, x * T + 9, T + 2, 5, 3, "#ffd34d");
      P.fill(ctx, x * T + 9, T + 5, 3, 2, "#e0a92b");
    }
    // a lighter walkway strip so the line reads as "on the wall"
    for (let x = 1; x < world.w - 1; x++) {
      if (world.solid[ROW][x]) continue;
      P.fill(ctx, x * T, ROW * T + 14, T, 2, "rgba(0,0,0,0.18)");
    }
  },
};

window.AgentTown.castleParts.push(part);
})();
