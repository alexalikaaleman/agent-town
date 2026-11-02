/** 4-direction A* on the town grid. Interiors are private except the start and goal buildings. */
(function () {
function bidAt(world, x, y) {
  if (x < 0 || y < 0 || x >= world.w || y >= world.h) return null;
  return world.bid[y][x] || null;
}

function walkable(world, x, y, allow) {
  if (x < 0 || y < 0 || x >= world.w || y >= world.h) return false;
  if (world.solid[y][x]) return false;
  const b = world.bid[y][x];
  if (b && !allow.has(b)) return false;
  return true;
}

function popMin(heap) {
  const top = heap[0];
  const last = heap.pop();
  if (heap.length === 0) return top;
  heap[0] = last;
  let i = 0;
  for (;;) {
    const l = i * 2 + 1;
    const r = l + 1;
    let s = i;
    if (l < heap.length && heap[l].f < heap[s].f) s = l;
    if (r < heap.length && heap[r].f < heap[s].f) s = r;
    if (s === i) break;
    const tmp = heap[s];
    heap[s] = heap[i];
    heap[i] = tmp;
    i = s;
  }
  return top;
}

function heapPush(heap, node) {
  heap.push(node);
  let i = heap.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (heap[p].f <= heap[i].f) break;
    const tmp = heap[p];
    heap[p] = heap[i];
    heap[i] = tmp;
    i = p;
  }
}

function findPath(world, sx, sy, gx, gy) {
  sx = Math.round(sx);
  sy = Math.round(sy);
  gx = Math.round(gx);
  gy = Math.round(gy);
  const allow = new Set();
  const startBid = bidAt(world, sx, sy);
  const goalBid = bidAt(world, gx, gy);
  if (startBid) allow.add(startBid);
  if (goalBid) allow.add(goalBid);
  if (!walkable(world, gx, gy, allow)) return null;
  if (sx === gx && sy === gy) return [];

  const W = world.w;
  const H = world.h;
  const size = W * H;
  const gScore = new Float64Array(size);
  gScore.fill(Infinity);
  const prev = new Int32Array(size);
  prev.fill(-1);
  const closed = new Uint8Array(size);
  const key = (x, y) => y * W + x;
  const heap = [];
  gScore[key(sx, sy)] = 0;
  heapPush(heap, { f: Math.abs(gx - sx) + Math.abs(gy - sy), g: 0, x: sx, y: sy });

  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  let guard = 0;
  const limit = size * 6;
  while (heap.length && guard++ < limit) {
    const cur = popMin(heap);
    const ck = key(cur.x, cur.y);
    if (closed[ck]) continue;
    if (cur.g !== gScore[ck]) continue;
    if (cur.x === gx && cur.y === gy) {
      const path = [];
      let k = ck;
      const startK = key(sx, sy);
      while (k !== startK && k !== -1) {
        const x = k % W;
        const y = Math.floor(k / W);
        path.push({ x, y });
        k = prev[k];
      }
      path.reverse();
      return path;
    }
    closed[ck] = 1;
    for (let d = 0; d < 4; d++) {
      const nx = cur.x + dirs[d][0];
      const ny = cur.y + dirs[d][1];
      if (!walkable(world, nx, ny, allow)) continue;
      const nk = key(nx, ny);
      if (closed[nk]) continue;
      const ng = cur.g + 1;
      if (ng < gScore[nk]) {
        gScore[nk] = ng;
        prev[nk] = ck;
        heapPush(heap, { f: ng + Math.abs(gx - nx) + Math.abs(gy - ny), g: ng, x: nx, y: ny });
      }
    }
  }
  return null;
}

/** Fix 36: tiles nobody may ever step on (room walls, castle walls, battlements, water). */
const WALL_GROUND = { wall: 1, castlewall: 1, battlement: 1, water: 1 };
function isWallTile(world, x, y) {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || y < 0 || x >= world.w || y >= world.h) return true;
  return !!WALL_GROUND[world.ground[y][x]];
}

/** Fix 36: a floor-only walk from (fx,fy) to (tx,ty). Starts at the walker's own tile centre (so an
 *  off-grid walker never cuts a wall corner) and ends on the exact goal. null when there is no path:
 *  callers must then NOT walk (never a straight line through walls). */
function walkPath(world, fx, fy, tx, ty) {
  const p = findPath(world, fx, fy, tx, ty);
  if (!p) return null;
  const sx = Math.round(fx);
  const sy = Math.round(fy);
  if (Math.abs(fx - sx) > 0.001 || Math.abs(fy - sy) > 0.001) p.unshift({ x: sx, y: sy });
  p.push({ x: tx, y: ty });
  return p;
}

/** Fix 36: every tile a walker actually steps on is checked; a wall step is recorded for the tests. */
const wallSteps = [];
function noteStep(world, who, x, y) {
  if (!isWallTile(world, x, y)) return;
  if (wallSteps.length < 200) wallSteps.push({ who: who, x: Math.round(x), y: Math.round(y), g: world.ground[Math.round(y)] && world.ground[Math.round(y)][Math.round(x)] });
}

window.AgentTown = window.AgentTown || {};
Object.assign(window.AgentTown, { walkable: walkable, findPath: findPath, walkPath: walkPath, isWallTile: isWallTile, noteStep: noteStep, wallSteps: wallSteps });
})();
