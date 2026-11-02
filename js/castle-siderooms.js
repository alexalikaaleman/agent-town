/** Castle part: SIDE ROOMS. Wizard Lab on the left (potion tables), Workshop on the right (crafting tables).
 *  Working bots stand at a table with a task label under it (truncated; tap for the full text).
 *  Only working bots stay here (room per HOME_ROOMS in world.js); idle, done and never-posted bots
 *  stand in the moat line-up (js/castle-lineup.js).
 *  Bots with a Drive folder have a chest on the room's outer wall. */
(function () {
const LABEL_MAX = 18;
const ROOMS = [
  {
    key: "lab", id: "lab", name: "Wizard Lab", x: 1, y: 16, w: 12, h: 18, outer: "left",
    doors: [[12, 24], [12, 25], [6, 33], [7, 33]],
    wall: "#40366e", wallDk: "#28204a", floor: "#5e5a8c", floor2: "#555182", trim: "#b48cff",
  },
  {
    key: "workshop", id: "workshop", name: "Workshop", x: 43, y: 16, w: 12, h: 18, outer: "right",
    doors: [[43, 24], [43, 25], [48, 33], [49, 33]],
    wall: "#6e4a2c", wallDk: "#4a2f1a", floor: "#b08856", floor2: "#a27c4c", trim: "#f0a94a",
  },
];

function trunc(text, n) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

function layoutRoom(r) {
  const tables = [];
  for (const ty of [r.y + 4, r.y + 11]) for (const dx of [2, 7]) tables.push({ room: r.key, x: r.x + dx, y: ty });
  const chestX = r.outer === "left" ? r.x + 1 : r.x + r.w - 2;
  const chestSlots = [];
  for (let y = r.y + 2; y <= r.y + r.h - 2; y++) chestSlots.push({ x: chestX, y });
  return { tables, chestSlots };
}

const part = {
  id: "siderooms",
  order: 50,
  rooms(world) {
    world.sideRooms = {};
    for (const r of ROOMS) {
      world.addRoom(r);
      const L = layoutRoom(r);
      world.sideRooms[r.key] = Object.assign({ def: r }, L);
      for (const t of L.tables) {
        world.block(t.x, t.y);
        world.block(t.x + 1, t.y);
      }
    }
  },
  decorate(world, roster) {
    const clean = window.AgentTown.driveFolderUrl || ((u) => u);
    const used = { workshop: 0, lab: 0 };
    for (const bot of roster) {
      const url = clean(bot.driveFolderUrl);
      if (!url) continue;
      const key = world.roomFor(bot) === "lab" ? "lab" : "workshop";
      const slots = world.sideRooms[key].chestSlots;
      const slot = slots[used[key]++ % slots.length];
      world.chests.push({ id: bot.id, x: slot.x, y: slot.y, url, lid: 0, kick: 0, name: bot.name });
    }
  },
  place(ctx) {
    const world = ctx.world;
    const free = ctx.free();
    const tablesUsed = [];
    // Working bots (not in a collab) take a table in their room, oldest first.
    const workers = free
      .filter((a) => a.state === "working" && !(ctx.groupOf && ctx.groupOf.has(a.id)))
      .sort((a, b) => String(a.since || a.ts).localeCompare(String(b.since || b.ts)) || (a.id < b.id ? -1 : 1));
    const freeTables = {};
    for (const k of Object.keys(world.sideRooms)) freeTables[k] = world.sideRooms[k].tables.slice();
    for (const a of workers) {
      const list = freeTables[a.room === "lab" ? "lab" : "workshop"];
      const t = list.shift();
      if (!t) continue;
      // Working bots look busy: a loop table -> their Drive chest (if any) -> the room station
      // (anvil / cauldron) -> table, typing at each stop.
      const room = world.sideRooms[t.room];
      const r = room.def;
      const loop = [{ x: t.x + 0.5, y: t.y - 1, facing: "s" }];
      const chest = world.chests.find((c) => c.id === a.id);
      if (chest) loop.push({ x: chest.x + (r.outer === "left" ? 1 : -1), y: chest.y, facing: r.outer === "left" ? "w" : "e" });
      // each of the 4 seats has its own spot at the station, so two bots never stand on one tile
      const seat = room.tables.indexOf(t);
      const STATION_STOPS = [[4, 9, "n"], [6, 9, "n"], [4, 8, "e"], [6, 8, "w"]];
      const st = STATION_STOPS[seat % STATION_STOPS.length];
      loop.push({ x: r.x + st[0], y: r.y + st[1], facing: st[2] });
      ctx.assign(a, { zone: "table", x: t.x + 0.5, y: t.y - 1, facing: "s", table: t.room + ":" + t.x + "," + t.y, room: t.room, loop });
      tablesUsed.push({ x: t.x, y: t.y, room: t.room, agent: a.id, name: a.name, full: a.task || a.text || "", label: trunc(a.text || a.task, LABEL_MAX) });
    }
    ctx.town.extras.tables = tablesUsed;
    // Only working bots stay in the side rooms; idle and never-posted bots go to the moat line-up.
  },
  update(town, dt, time) {
    for (const chest of town.world.chests) {
      const open = town.hoverChest === chest.id || chest.kick > time;
      chest.lid += ((open ? 1 : 0) - chest.lid) * Math.min(1, dt * 8);
    }
  },
  labels(town) {
    const out = (town.extras.tables || []).map((t) => ({ kind: "table", x: (t.x + 1) * 16, y: (t.y + 1) * 16 - 2, text: t.label || "…", accent: "#f0a94a", minAbs: 0.55 }));
    // The short task label also walks with the bot while it is away from its table.
    for (const t of town.extras.tables || []) {
      const a = town.agents.get(t.agent);
      if (!a || !a.spot || !a.spot.loop) continue;
      if (Math.hypot(a.x - (t.x + 0.5), a.y - (t.y - 1)) < 0.6) continue;
      out.push({ kind: "task", x: a.x * 16 + 8, y: a.y * 16 + 22, text: t.label || "…", accent: "#ffe680", minAbs: 0.55 });
    }
    return out;
  },
  hit(town, wx, wy, ui) {
    for (const t of town.extras.tables || []) {
      if (wx >= t.x * 16 - 4 && wx <= (t.x + 2) * 16 + 4 && wy >= t.y * 16 - 2 && wy <= (t.y + 1) * 16 + 14) {
        return ui.showTip(t.name + " · " + (t.room === "lab" ? "Wizard Lab" : "Workshop") + " table", t.full || "No task text.");
      }
    }
    return false;
  },
  drawStatic(ctx, world, P) {
    const T = P.TILE;
    for (const key of Object.keys(world.sideRooms)) {
      const room = world.sideRooms[key];
      const r = room.def;
      for (const t of room.tables) {
        const px = t.x * T;
        const py = t.y * T;
        if (key === "workshop") {
          // crafting table: thick wood top, legs, tools, a gear
          P.fill(ctx, px, py + 2, 2 * T, 10, "#5a3518");
          P.fill(ctx, px + 1, py + 2, 2 * T - 2, 7, "#9a6232");
          P.fill(ctx, px + 1, py + 2, 2 * T - 2, 1, "#c48a4e");
          P.fill(ctx, px + 2, py + 12, 3, 4, "#3e2410");
          P.fill(ctx, px + 2 * T - 5, py + 12, 3, 4, "#3e2410");
          P.fill(ctx, px + 4, py + 3, 8, 2, "#b8c0c8");
          P.fill(ctx, px + 10, py + 2, 3, 4, "#6e4a2c");
          P.fill(ctx, px + 20, py + 3, 5, 5, "#c9a23a");
          P.fill(ctx, px + 21, py + 4, 3, 3, "#7a5a1a");
        } else {
          // potion table: dark wood, cloth, three flasks
          P.fill(ctx, px, py + 2, 2 * T, 10, "#2c2140");
          P.fill(ctx, px + 1, py + 2, 2 * T - 2, 7, "#4b3a6e");
          P.fill(ctx, px + 4, py + 2, 2 * T - 8, 2, "#7d63b8");
          P.fill(ctx, px + 2, py + 12, 3, 4, "#1d1630");
          P.fill(ctx, px + 2 * T - 5, py + 12, 3, 4, "#1d1630");
          const flask = [["#4ee08a", 5], ["#ff5fa2", 14], ["#59c3ff", 23]];
          for (const [c, fx] of flask) {
            P.fill(ctx, px + fx, py - 2, 2, 3, "#d8e4f0");
            P.fill(ctx, px + fx - 2, py + 1, 6, 5, "#d8e4f0");
            P.fill(ctx, px + fx - 1, py + 3, 4, 3, c);
          }
        }
      }
      // wall decor
      const top = r.y * T;
      if (key === "workshop") {
        for (const dx of [3, 8]) {
          const x = (r.x + dx) * T;
          P.fill(ctx, x, top + 3, 24, 9, "#4a2f1a");
          P.fill(ctx, x + 3, top + 4, 2, 7, "#b8c0c8");
          P.fill(ctx, x + 9, top + 4, 2, 7, "#b8c0c8");
          P.fill(ctx, x + 8, top + 4, 4, 2, "#8a96a2");
          P.fill(ctx, x + 16, top + 5, 5, 5, "#c9a23a");
        }
        // anvil
        const ax = (r.x + 5) * T;
        const ay = (r.y + 8) * T;
        P.fill(ctx, ax + 2, ay + 4, 12, 4, "#3d4048");
        P.fill(ctx, ax + 5, ay + 8, 6, 5, "#2b2d33");
        P.fill(ctx, ax, ay + 4, 3, 2, "#3d4048");
      } else {
        for (const dx of [2, 5, 8]) {
          const x = (r.x + dx) * T;
          P.fill(ctx, x, top + 2, 2 * T - 4, 12, "#3b2a18");
          const books = ["#c0392b", "#2e86de", "#27ae60", "#f1c40f", "#8e44ad", "#e67e22"];
          for (let i = 0; i < 6; i++) P.fill(ctx, x + 2 + i * 4, top + 4 + (i % 2), 3, 8 - (i % 2), books[i]);
        }
        // cauldron
        const cx = (r.x + 5) * T;
        const cy = (r.y + 8) * T;
        P.fill(ctx, cx + 1, cy + 4, 14, 9, "#22202a");
        P.fill(ctx, cx + 2, cy + 3, 12, 3, "#4ee08a");
      }
      // floor rug
      P.fill(ctx, (r.x + 4) * T, (r.y + 15) * T + 4, 4 * T, T - 8, key === "workshop" ? "#7b4a22" : "#2f2a5a");
    }
  },
  drawUnder(ctx, town, world, now, P) {
    // bubbling potions and cauldron, forge sparks
    for (const key of Object.keys(world.sideRooms)) {
      const r = world.sideRooms[key].def;
      if (key === "lab") {
        const cx = (r.x + 5) * 16;
        const cy = (r.y + 8) * 16;
        for (let i = 0; i < 3; i++) {
          const k = ((now / 600 + i / 3) % 1);
          P.fill(ctx, cx + 4 + i * 4, cy + 2 - k * 10, 2, 2, "rgba(150,255,190," + (1 - k) + ")");
        }
      } else {
        const ax = (r.x + 5) * 16;
        const ay = (r.y + 8) * 16;
        if (Math.floor(now / 300) % 3 === 0) P.fill(ctx, ax + 6 + ((now / 50) % 6), ay + 1, 1, 1, "#ffcc33");
      }
    }
  },
};
window.AgentTown.castleParts.push(part);
})();
