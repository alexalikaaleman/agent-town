/** Castle grid. Original procedural pixel art; no external art. Rooms come from js/castle/*.js parts. */
(function () {
const TILE = 16;
const MAP_W = 56;
const MAP_H = 60;

/**
 * HOME-ROOM MAPPING (change here). Key = the bot's "home" in data/bots.json.
 * "workshop" = Workshop (crafty and builder bots, right of the throne room).
 * "lab" = Wizard Lab (knowledge, art, language and records bots, left of the throne room).
 * BOT_ROOMS overrides one bot by id, e.g. { "budget-bot": "workshop" }.
 */
const HOME_ROOMS = {
  workshop: "workshop", // builders, QA, templates, maintenance
  townhall: "workshop", // MasterBot, Chief of Staff, Help (organisers, build the plan)
  post: "workshop", // marketing, scout, resumes (craft outgoing work)
  house: "workshop", // Robo Helper, Malu
  library: "lab", // knowledge and records: docs, Drive, library, context, language, bibles, logs
  studio: "lab", // art: cutscenes, concept art, prompts, Mochizuki, proportion
  bank: "lab", // records: hustle, budget, accounting, business, garage sale
  tavern: "lab", // knowledge: brainstorm, feedback, trivia
};
const BOT_ROOMS = {};

function roomFor(bot) {
  if (!bot) return "workshop";
  return BOT_ROOMS[bot.id] || HOME_ROOMS[bot.home] || "workshop";
}

// Castle frame (tiles). Interior y 2..34, front wall y 35..36 with the gate, moat y 37..38, battlefield y 39..59.
const CASTLE = { top: 2, wallY: 35, gateX: [27, 28], moatY: [37, 38], bridgeX: [26, 29], fieldY: 39 };

function hash(x, y) {
  let n = (x * 73856093) ^ (y * 19349663);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n >>> 0) / 4294967296;
}

function parts() {
  const list = (window.AgentTown && window.AgentTown.castleParts) || [];
  return list.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
}

function createWorld(roster) {
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
  const set = (x, y, g, s) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    ground[y][x] = g;
    solid[y][x] = !!s;
  };
  // Courtyard stone inside the castle, walls around it.
  for (let y = 0; y <= 36; y++) for (let x = 0; x < w; x++) set(x, y, "stone", false);
  for (let x = 0; x < w; x++) {
    set(x, 0, "battlement", true);
    set(x, 1, "castlewall", true);
    set(x, 35, "castlewall", true);
    set(x, 36, "battlement", true);
  }
  for (let y = 0; y <= 36; y++) {
    set(0, y, "castlewall", true);
    set(w - 1, y, "castlewall", true);
  }
  for (const gx of CASTLE.gateX) {
    set(gx, 35, "gate", false);
    set(gx, 36, "gate", false);
  }
  for (const my of CASTLE.moatY) for (let x = 0; x < w; x++) set(x, my, "water", true);
  for (let bx = CASTLE.bridgeX[0]; bx <= CASTLE.bridgeX[1]; bx++) for (const my of CASTLE.moatY) set(bx, my, "bridge", false);
  for (let y = CASTLE.fieldY; y < h; y++) {
    for (let x = 0; x < w; x++) set(x, y, hash(x, y) < 0.16 ? "dirt" : "grass", false);
  }

  const world = {
    w,
    h,
    ground,
    solid,
    bid,
    castle: CASTLE,
    buildings: [],
    byId: new Map(),
    decor: [],
    beds: [],
    chests: [],
    hash,
    roomFor,
    homeRooms: HOME_ROOMS,
    botRooms: BOT_ROOMS,
    parts: parts(),
    roster: roster || [],
  };
  world.addRoom = function (def) {
    const b = Object.assign({ doors: [] }, def);
    for (let iy = 0; iy < b.h; iy++) {
      for (let ix = 0; ix < b.w; ix++) {
        const tx = b.x + ix;
        const ty = b.y + iy;
        const edge = ix === 0 || iy === 0 || ix === b.w - 1 || iy === b.h - 1;
        bid[ty][tx] = b.id;
        set(tx, ty, edge ? "wall" : "floor", edge);
      }
    }
    for (const [dx, dy] of b.doors) set(dx, dy, "door", false);
    world.buildings.push(b);
    world.byId.set(b.id, b);
    return b;
  };
  world.inRoom = function (id, x, y) {
    const b = world.byId.get(id);
    return !!b && x > b.x && x < b.x + b.w - 1 && y > b.y && y < b.y + b.h - 1;
  };
  world.block = function (x, y) {
    if (x >= 0 && y >= 0 && x < w && y < h) solid[y][x] = true;
  };
  for (const p of world.parts) if (p.rooms) p.rooms(world);
  for (const p of world.parts) if (p.decorate) p.decorate(world, world.roster);
  // Fallback spots in the courtyard (used for any bot no part claims).
  world.yardSpots = [];
  for (let y = 3; y <= 34; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (ground[y][x] === "stone" && !solid[y][x] && !bid[y][x] && (x + y) % 2 === 0) world.yardSpots.push({ x, y, facing: "s" });
    }
  }
  return world;
}

window.AgentTown = window.AgentTown || {};
window.AgentTown.castleParts = window.AgentTown.castleParts || [];
Object.assign(window.AgentTown, { TILE, MAP_W, MAP_H, HOME_ROOMS, BOT_ROOMS, roomFor, createWorld, worldHash: hash });
})();
