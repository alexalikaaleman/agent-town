/** Procedural tile town. No external art. */
(function () {
const TILE = 16;
const MAP_W = 50;
const MAP_H = 36;

const BUILDING_DEFS = [
  {
    id: "workshop",
    name: "Workshop",
    x: 1,
    y: 1,
    w: 14,
    h: 10,
    door: "s",
    sign: "SHOP",
    wall: "#7a4e2d",
    wallDk: "#4a2e18",
    floor: "#c4a574",
    floor2: "#b89563",
    trim: "#e38b3a",
    roof: "#8d4630",
  },
  {
    id: "townhall",
    name: "Town Hall",
    x: 17,
    y: 1,
    w: 16,
    h: 10,
    door: "s",
    sign: "HALL",
    wall: "#c5ced6",
    wallDk: "#8e99a4",
    floor: "#e6e0d4",
    floor2: "#d9d3c5",
    trim: "#a33b3b",
    roof: "#8e2f2f",
  },
  {
    id: "studio",
    name: "Art Studio",
    x: 35,
    y: 1,
    w: 14,
    h: 10,
    door: "s",
    sign: "ART",
    wall: "#e7d4ea",
    wallDk: "#b894c0",
    floor: "#f7eef8",
    floor2: "#eadff0",
    trim: "#7a3e9d",
    roof: "#6a347c",
  },
  {
    id: "bank",
    name: "Bank",
    x: 1,
    y: 13,
    w: 14,
    h: 10,
    door: "n",
    sign: "BANK",
    wall: "#e6d7b0",
    wallDk: "#c2ae82",
    floor: "#f3ead2",
    floor2: "#e7dcc0",
    trim: "#1e6b45",
    roof: "#1d4e36",
  },
  {
    id: "library",
    name: "Library",
    x: 35,
    y: 13,
    w: 14,
    h: 10,
    door: "n",
    sign: "BOOKS",
    wall: "#b7c4d6",
    wallDk: "#8494ab",
    floor: "#efe4cf",
    floor2: "#e4d5ba",
    trim: "#243e73",
    roof: "#1e335c",
  },
  {
    id: "tavern",
    name: "Tavern",
    x: 1,
    y: 25,
    w: 14,
    h: 10,
    door: "n",
    sign: "INN",
    wall: "#b56545",
    wallDk: "#7d4030",
    floor: "#8d5a3c",
    floor2: "#7a4c32",
    trim: "#e2b15a",
    roof: "#6b3030",
  },
  {
    id: "post",
    name: "Post Office",
    x: 17,
    y: 25,
    w: 16,
    h: 10,
    door: "n",
    sign: "POST",
    wall: "#e4e7ee",
    wallDk: "#b7beca",
    floor: "#f4f1ea",
    floor2: "#e6e2d8",
    trim: "#2d62b5",
    roof: "#254e8c",
  },
  {
    id: "house",
    name: "Alex's House",
    x: 35,
    y: 25,
    w: 14,
    h: 10,
    door: "n",
    sign: "HOME",
    wall: "#f3ddc8",
    wallDk: "#d7b89a",
    floor: "#e8cba8",
    floor2: "#dbb992",
    trim: "#b6403a",
    roof: "#a33b3b",
  },
];

function hash(x, y) {
  let n = (x * 73856093) ^ (y * 19349663);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n >>> 0) / 4294967296;
}

function inRoad(x, y) {
  if (x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1) return false;
  const col = x === 15 || x === 16 || x === 33 || x === 34;
  const row = y === 11 || y === 12 || y === 23 || y === 24;
  return col || row;
}

function inPlaza(x, y) {
  return x >= 17 && x <= 32 && y >= 13 && y <= 22;
}

function spreadSpots(spots, minDist) {
  const sorted = [...spots].sort((a, b) => a.y - b.y || a.x - b.x);
  const chosen = [];
  for (const spot of sorted) {
    let ok = true;
    for (const other of chosen) {
      if (Math.abs(other.x - spot.x) + Math.abs(other.y - spot.y) < minDist) {
        ok = false;
        break;
      }
    }
    if (ok) chosen.push(spot);
  }
  return chosen.length ? chosen : sorted;
}

function createWorld() {
  const w = MAP_W;
  const h = MAP_H;
  const ground = [];
  const solid = [];
  const bid = [];
  for (let y = 0; y < h; y++) {
    ground.push(new Array(w).fill("grass"));
    solid.push(new Array(w).fill(false));
    bid.push(new Array(w).fill(null));
  }

  const buildings = BUILDING_DEFS.map((def) => {
    const b = { ...def, doorX: 0, doorY: 0 };
    for (let iy = 0; iy < b.h; iy++) {
      for (let ix = 0; ix < b.w; ix++) {
        const tx = b.x + ix;
        const ty = b.y + iy;
        const edge = ix === 0 || iy === 0 || ix === b.w - 1 || iy === b.h - 1;
        bid[ty][tx] = b.id;
        if (edge) {
          ground[ty][tx] = "wall";
          solid[ty][tx] = true;
        } else {
          ground[ty][tx] = "floor";
          solid[ty][tx] = false;
        }
      }
    }
    if (b.door === "s") {
      b.doorX = b.x + Math.floor(b.w / 2);
      b.doorY = b.y + b.h - 1;
    } else {
      b.doorX = b.x + Math.floor(b.w / 2);
      b.doorY = b.y;
    }
    ground[b.doorY][b.doorX] = "door";
    solid[b.doorY][b.doorX] = false;
    bid[b.doorY][b.doorX] = b.id;
    const outY = b.door === "s" ? b.doorY + 1 : b.doorY - 1;
    if (outY > 0 && outY < h - 1 && !bid[outY][b.doorX]) {
      ground[outY][b.doorX] = "path";
      solid[outY][b.doorX] = false;
    }
    return b;
  });

  const byId = new Map(buildings.map((b) => [b.id, b]));

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (bid[y][x]) continue;
      if (inRoad(x, y)) {
        ground[y][x] = "path";
        solid[y][x] = false;
      } else if (inPlaza(x, y)) {
        ground[y][x] = "plaza";
        solid[y][x] = false;
      }
    }
  }

  const water = [];
  for (let y = 17; y <= 18; y++) {
    for (let x = 23; x <= 25; x++) {
      ground[y][x] = "water";
      solid[y][x] = true;
      bid[y][x] = null;
      water.push({ x, y });
    }
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
        ground[y][x] = "tree";
        solid[y][x] = true;
        bid[y][x] = null;
      } else if (ground[y][x] === "grass" && hash(x, y) > 0.62) {
        ground[y][x] = "flower";
      }
    }
  }

  const decor = [];
  const entry = new Set();
  for (const b of buildings) {
    const dir = b.door === "s" ? -1 : 1;
    for (let step = 1; step <= 2; step++) {
      entry.add(b.doorX + "," + (b.doorY + dir * step));
      entry.add(b.doorX - 1 + "," + (b.doorY + dir * step));
      entry.add(b.doorX + 1 + "," + (b.doorY + dir * step));
    }
  }

  function tryBlock(x, y, kind, id) {
    if (y < 1 || x < 1 || y >= h - 1 || x >= w - 1) return false;
    if (entry.has(x + "," + y)) return false;
    if (bid[y][x] !== id) return false;
    if (ground[y][x] !== "floor") return false;
    if (solid[y][x]) return false;
    solid[y][x] = true;
    decor.push({ x, y, kind, bid: id });
    return true;
  }

  function windowAt(x, y, id) {
    if (y < 0 || x < 0 || y >= h || x >= w) return;
    if (ground[y][x] !== "wall" || bid[y][x] !== id) return;
    decor.push({ x, y, kind: "window", bid: id });
  }

  function rel(b, pairs, kind) {
    for (const [ix, iy] of pairs) tryBlock(b.x + ix, b.y + iy, kind, b.id);
  }

  const shop = byId.get("workshop");
  rel(shop, [[6, 2], [7, 2]], "forge");
  rel(shop, [[3, 3]], "anvil");
  rel(shop, [[9, 3], [10, 3]], "workbench");
  rel(shop, [[2, 3], [2, 4]], "tools");
  windowAt(shop.x, shop.y + 3, shop.id);
  windowAt(shop.x, shop.y + 6, shop.id);
  windowAt(shop.x + shop.w - 1, shop.y + 3, shop.id);
  windowAt(shop.x + shop.w - 1, shop.y + 6, shop.id);

  const hall = byId.get("townhall");
  rel(hall, [[3, 1], [7, 1], [11, 1], [5, 4], [9, 4]], "desk");
  windowAt(hall.x, hall.y + 4, hall.id);
  windowAt(hall.x + hall.w - 1, hall.y + 4, hall.id);

  const studio = byId.get("studio");
  rel(studio, [[2, 1], [5, 1], [8, 1], [11, 1], [4, 4], [9, 4]], "easel");
  windowAt(studio.x, studio.y + 3, studio.id);
  windowAt(studio.x + studio.w - 1, studio.y + 3, studio.id);
  windowAt(studio.x + studio.w - 1, studio.y + 6, studio.id);

  const bank = byId.get("bank");
  rel(bank, [[2, 8], [5, 8], [8, 8], [11, 8], [4, 5], [9, 5]], "counter");
  windowAt(bank.x, bank.y + 4, bank.id);
  windowAt(bank.x + bank.w - 1, bank.y + 4, bank.id);

  const library = byId.get("library");
  rel(library, [[2, 8], [5, 8], [8, 8], [11, 8], [3, 5], [6, 5], [9, 5], [12, 5]], "shelf");
  windowAt(library.x, library.y + 3, library.id);
  windowAt(library.x, library.y + 6, library.id);
  windowAt(library.x + library.w - 1, library.y + 3, library.id);
  windowAt(library.x + library.w - 1, library.y + 6, library.id);

  const tavern = byId.get("tavern");
  rel(tavern, [[2, 8], [3, 8], [5, 8], [8, 8], [10, 8], [11, 8]], "bar");
  rel(tavern, [[3, 5], [8, 5], [11, 5]], "table");
  windowAt(tavern.x, tavern.y + 4, tavern.id);
  windowAt(tavern.x + tavern.w - 1, tavern.y + 4, tavern.id);

  const post = byId.get("post");
  rel(post, [[2, 8], [5, 8], [10, 8], [13, 8]], "shelf");
  windowAt(post.x, post.y + 4, post.id);
  windowAt(post.x + post.w - 1, post.y + 4, post.id);

  const house = byId.get("house");
  rel(house, [[2, 7], [3, 7], [3, 8]], "bed");
  rel(house, [[8, 4], [10, 4]], "table");
  rel(house, [[11, 7]], "shelf");
  windowAt(house.x, house.y + 4, house.id);
  windowAt(house.x + house.w - 1, house.y + 3, house.id);
  windowAt(house.x + house.w - 1, house.y + 6, house.id);

  for (const b of buildings) {
    let sx = b.x + Math.floor(b.w / 2);
    if (b.doorY === b.y && Math.abs(b.doorX - sx) < 2) sx = Math.min(b.x + b.w - 2, b.doorX + 2);
    decor.push({ x: sx, y: b.y, kind: "sign", text: b.sign, bid: b.id });
  }

  const deskKinds = new Set(["desk", "bench", "easel", "counter", "shelf", "bar", "table", "bed", "anvil", "forge", "workbench", "tools"]);
  const spots = {};
  for (const b of buildings) {
    const work = [];
    const idle = [];
    for (let y = b.y + 1; y <= b.y + b.h - 2; y++) {
      for (let x = b.x + 1; x <= b.x + b.w - 2; x++) {
        if (solid[y][x]) continue;
        let facing = "s";
        let near = false;
        const neighbors = [
          [0, -1, "n"],
          [0, 1, "s"],
          [-1, 0, "w"],
          [1, 0, "e"],
        ];
        for (const [dx, dy, face] of neighbors) {
          const hit = decor.find((d) => d.x === x + dx && d.y === y + dy && d.bid === b.id && deskKinds.has(d.kind));
          if (hit) {
            near = true;
            facing = face;
            break;
          }
        }
        const spot = { x, y, facing };
        if (near) work.push(spot);
        else idle.push(spot);
      }
    }
    const spreadWork = spreadSpots(work, 3);
    const spreadIdle = spreadSpots(idle, 2);
    spots[b.id] = {
      work: spreadWork.length >= 3 ? spreadWork : work,
      idle: spreadIdle.length ? spreadIdle : idle,
    };
  }

  const plazaSpots = [];
  for (let y = 13; y <= 22; y++) {
    for (let x = 17; x <= 32; x++) {
      if (!solid[y][x] && (ground[y][x] === "plaza" || ground[y][x] === "path")) {
        plazaSpots.push({ x, y, facing: "s" });
      }
    }
  }

  const collabSpots = [];
  function addCollab(ix, iy) {
    const x = shop.x + ix;
    const y = shop.y + iy;
    if (y < 1 || x < 1 || y >= h - 1 || x >= w - 1) return;
    if (solid[y][x] || ground[y][x] !== "floor") return;
    collabSpots.push({ x, y, facing: "n" });
  }
  for (const ix of [3, 5, 7, 9, 11]) addCollab(ix, 6);
  for (const ix of [3, 5, 10, 12]) addCollab(ix, 8);

  const reserved = new Set(collabSpots.map((s) => s.x + "," + s.y));
  if (spots.workshop) {
    spots.workshop.work = spots.workshop.work.filter((s) => !reserved.has(s.x + "," + s.y));
    spots.workshop.idle = spots.workshop.idle.filter((s) => !reserved.has(s.x + "," + s.y));
    if (!spots.workshop.idle.length) spots.workshop.idle = spots.workshop.work.slice();
  }

  const meetPairs = [];
  const meetSource = collabSpots.filter((s) => s.y === shop.y + 8);
  const pairSource = meetSource.length >= 2 ? meetSource : collabSpots;
  for (let i = 0; i + 1 < pairSource.length && meetPairs.length < 3; i += 2) {
    meetPairs.push([pairSource[i], pairSource[i + 1]]);
  }

  return {
    w,
    h,
    tile: TILE,
    ground,
    solid,
    bid,
    buildings,
    byId,
    decor,
    spots,
    plazaSpots: spreadSpots(plazaSpots, 3),
    meetPairs,
    collabSpots,
    water,
    windows: decor.filter((d) => d.kind === "window"),
  };
}

window.AgentTown = window.AgentTown || {};
Object.assign(window.AgentTown, { TILE: TILE, MAP_W: MAP_W, MAP_H: MAP_H, createWorld: createWorld });
})();
