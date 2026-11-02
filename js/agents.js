/** Bot agents: castle placement (by js/castle parts), path following and poses. */
(function () {
const findPath = window.AgentTown.findPath;
const TILE = window.AgentTown.TILE;
const driveFolderUrl = window.AgentTown.driveFolderUrl;
const shortDescription = window.AgentTown.shortDescription;

const SPEED = 3.35;

function hashId(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Collab groups: working bots linked by a shared --with or the same --project. Only groups of 2+. */
function collabGroups(agents) {
  const work = Array.from(agents.values()).filter((a) => a.state === "working");
  const parent = new Map(work.map((a) => [a.id, a.id]));
  const find = (id) => {
    while (parent.get(id) !== id) id = parent.get(id);
    return id;
  };
  const join = (a, b) => {
    if (!parent.has(a) || !parent.has(b)) return;
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb);
  };
  const byProject = new Map();
  for (const a of work) {
    for (const w of a.with) join(a.id, w);
    if (a.project) {
      if (byProject.has(a.project)) join(a.id, byProject.get(a.project));
      else byProject.set(a.project, a.id);
    }
  }
  const groups = new Map();
  for (const a of work) {
    const r = find(a.id);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(a);
  }
  return Array.from(groups.values())
    .filter((g) => g.length > 1)
    .map((g) => g.sort((a, b) => (a.id < b.id ? -1 : 1)))
    .sort((a, b) => (a[0].id < b[0].id ? -1 : 1));
}

function createTown(roster, world) {
  const agents = new Map();
  roster.forEach((bot, i) => {
    const spot = world.yardSpots[i % world.yardSpots.length] || { x: 27, y: 30 };
    agents.set(bot.id, {
      id: bot.id,
      name: bot.name,
      role: bot.role,
      home: bot.home,
      room: world.roomFor(bot),
      color: bot.color,
      state: "idle",
      task: "",
      text: "",
      needsAlex: null,
      ts: null,
      since: null,
      with: [],
      project: null,
      stalled: false,
      reported: false,
      driveFolderUrl: driveFolderUrl(bot.driveFolderUrl),
      x: spot.x,
      y: spot.y,
      facing: "s",
      spot: null,
      goalKey: "",
      path: null,
      moving: false,
      walk: 0,
      pause: 0,
    });
  });
  let placed = false;
  let now = 0;
  const town = {};

  function layout() {
    const taken = new Set();
    const ctx = {
      world,
      town,
      agents,
      free() {
        return Array.from(agents.values())
          .filter((a) => !taken.has(a.id))
          .sort((a, b) => (a.id < b.id ? -1 : 1));
      },
      assign(agent, spot) {
        if (taken.has(agent.id)) return;
        taken.add(agent.id);
        agent.spot = spot;
      },
    };
    town.extras = {};
    ctx.groups = collabGroups(agents);
    ctx.groupOf = new Map();
    for (const g of ctx.groups) for (const a of g) ctx.groupOf.set(a.id, g);
    for (const p of world.parts) if (p.place) p.place(ctx);
    // Anyone no part claimed stands in the courtyard.
    let i = 0;
    for (const a of ctx.free()) ctx.assign(a, Object.assign({ zone: "yard" }, world.yardSpots[i++ % world.yardSpots.length]));
    for (const a of agents.values()) {
      const s = a.spot;
      const key = s.zone + ":" + s.x.toFixed(2) + "," + s.y.toFixed(2);
      if (!placed) {
        a.x = s.x;
        a.y = s.y;
        a.facing = s.facing || "s";
        a.path = [];
      } else if (key !== a.goalKey) {
        a.path = null;
      }
      a.goalKey = key;
    }
    placed = true;
  }

  function moveAgent(agent, dt) {
    const s = agent.spot;
    if (!s) return 0;
    if (!agent.path) {
      const p = findPath(world, agent.x, agent.y, s.x, s.y) || [];
      p.push({ x: s.x, y: s.y });
      agent.path = p;
    }
    if (!agent.path.length) {
      agent.facing = s.facing || agent.facing;
      return 0;
    }
    const target = agent.path[0];
    const dx = target.x - agent.x;
    const dy = target.y - agent.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.001) {
      agent.path.shift();
      return 0;
    }
    const step = Math.min(dist, SPEED * dt);
    agent.x += (dx / dist) * step;
    agent.y += (dy / dist) * step;
    if (Math.abs(dx) > Math.abs(dy)) agent.facing = dx > 0 ? "e" : "w";
    else if (dy !== 0) agent.facing = dy > 0 ? "s" : "n";
    agent.walk += step;
    if (step >= dist - 0.0001) {
      agent.x = target.x;
      agent.y = target.y;
      agent.path.shift();
    }
    return step;
  }

  /** Working bots in a side room walk their loop (table, chest, station), pausing to type at each stop. */
  function busyLoop(agent, dt) {
    const s = agent.spot;
    if (!s || !s.loop || s.loop.length < 2 || agent.path === null || agent.path.length) return;
    agent.pause -= dt;
    if (agent.pause > 0) return;
    agent.pause = 3 + (hashId(agent.id) % 20) / 10;
    agent.loopI = ((agent.loopI || 0) + 1) % s.loop.length;
    const next = s.loop[agent.loopI];
    agent.spot = Object.assign({}, s, { x: next.x, y: next.y, facing: next.facing });
    agent.path = null;
  }

  function patrol(agent, dt) {
    const s = agent.spot;
    if (!s || !s.patrol || !s.patrol.length || agent.path === null || agent.path.length) return;
    agent.pause -= dt;
    if (agent.pause > 0) return;
    agent.pause = 2 + Math.random() * 4;
    const next = s.patrol[Math.floor(Math.random() * s.patrol.length)];
    agent.spot = Object.assign({}, s, { x: next.x, y: next.y });
    agent.path = null;
  }

  Object.assign(town, {
    agents,
    world,
    selected: null,
    follow: null,
    hoverChest: null,
    filter: new Set(),
    extras: {},
    isDimmed(agent) {
      // Focus (single tap on a bot): every other bot turns see-through.
      if (this.follow) return agent.id !== this.follow;
      if (this.filter.size) return !this.filter.has(agent.id);
      return false;
    },
    applySnapshot(bots) {
      for (const data of bots) {
        const agent = agents.get(data.id);
        if (!agent) continue;
        agent.state = data.state || "idle";
        agent.text = shortDescription({ text: data.text || "" });
        agent.task = String(data.task || data.text || "");
        agent.needsAlex = data.needsAlex === "urgent" || data.needsAlex === "question" ? data.needsAlex : null;
        agent.ts = data.ts || null;
        agent.since = data.since || data.ts || null;
        agent.with = Array.isArray(data.with) ? data.with.filter((id) => agents.has(id) && id !== agent.id) : [];
        agent.project = data.project || null;
        agent.stalled = Boolean(data.stalled);
        agent.ping = data.ping || null;
        agent.reported = Boolean(data.reported);
      }
      layout();
    },
    relayout: layout,
    update(dt, time) {
      now = time;
      for (const agent of agents.values()) {
        const step = moveAgent(agent, dt);
        agent.moving = step > 0;
        if (!agent.moving) {
          patrol(agent, dt);
          busyLoop(agent, dt);
        }
      }
      for (const p of world.parts) if (p.update) p.update(town, dt, time);
    },
    counts() {
      const counts = { working: 0, waiting: 0, blocked: 0, needs: 0 };
      for (const agent of agents.values()) {
        if (agent.state === "working") counts.working++;
        if (agent.state === "waiting") counts.waiting++;
        if (agent.state === "blocked") counts.blocked++;
        if (agent.needsAlex === "urgent" || agent.needsAlex === "question") counts.needs++;
      }
      return counts;
    },
    needsList() {
      const list = [];
      for (const agent of agents.values()) if (agent.needsAlex) list.push(agent);
      list.sort((a, b) => (a.needsAlex !== b.needsAlex ? (a.needsAlex === "urgent" ? -1 : 1) : String(a.ts).localeCompare(String(b.ts))));
      return list;
    },
    hitChest(worldX, worldY) {
      let best = null;
      let bestD = 12;
      for (const chest of world.chests) {
        const d = Math.hypot(worldX - (chest.x * TILE + TILE / 2), worldY - (chest.y * TILE + TILE / 2));
        if (d < bestD) {
          bestD = d;
          best = chest;
        }
      }
      return best;
    },
    pokeChest(id, time) {
      const chest = world.chests.find((c) => c.id === id);
      if (chest) chest.kick = (time || 0) + 700;
    },
    hitTest(worldX, worldY, radius) {
      let best = null;
      let bestD = radius || 14;
      for (const agent of agents.values()) {
        const d = Math.hypot(worldX - (agent.x * TILE + TILE / 2), worldY - (agent.y * TILE + 6));
        if (d < bestD) {
          bestD = d;
          best = agent;
        }
      }
      return best;
    },
    now() {
      return now;
    },
  });
  return town;
}

function bubbleFor(agent, time) {
  if (!agent) return null;
  const blocked = agent.state === "blocked";
  if (blocked && agent.needsAlex === "urgent") return { kind: "blocked-urgent" };
  if (blocked && agent.needsAlex === "question") return { kind: "blocked-question" };
  if (blocked) return { kind: "blocked" };
  if (agent.needsAlex === "urgent") return { kind: "urgent" };
  // On the carpet the line itself says "question"; a bubble there would cover the bot ahead (or Bus Ninja).
  if (agent.needsAlex === "question") return agent.spot && agent.spot.zone === "carpet" ? null : { kind: "question" };
  // "zzz" only for a bot lying in a bedroom bunk.
  const s = agent.spot;
  if (agent.state === "sleeping" && s && s.zone === "bed" && !agent.moving) return { kind: "zzz", time };
  return null;
}

function poseFor(agent, time) {
  const s = agent.spot || {};
  const moving = agent.moving;
  if (moving) return { pose: "walk", frame: Math.floor(agent.walk * 2) % 4, bob: Math.floor(agent.walk * 2) % 2 === 0 ? -1 : 0, shake: 0 };
  if (s.zone === "bed") return { pose: "lie", frame: 0, bob: 0, shake: 0, sleep: true };
  if (s.zone === "table" || s.loop) return { pose: "type", frame: Math.floor(time / 140) % 4, bob: 1, shake: 0 };
  if (s.zone === "battle") {
    const beat = Math.floor((time + (hashId(agent.id) % 600)) / 180) % 4;
    return { pose: beat < 2 ? "up" : "type", frame: beat, bob: beat === 1 ? -1 : 0, shake: 0, attack: true };
  }
  if (s.zone === "tent") return { pose: "sit", frame: 0, bob: 0, shake: Math.floor(time / 600) % 2 };
  if (s.zone === "wall") return { pose: "idle", frame: 0, bob: 0, shake: 0 };
  if (agent.state === "blocked") return { pose: "crossed", frame: 0, bob: 0, shake: Math.floor(time / 70) % 2 };
  if (s.zone === "carpet") return { pose: "hips", frame: Math.floor(time / 700) % 4, bob: 0, shake: 0 };
  const breathe = Math.floor(time / 500) % 2 === 0 ? 0 : -1;
  return { pose: "idle", frame: 0, bob: breathe, shake: 0 };
}

window.AgentTown = window.AgentTown || {};
Object.assign(window.AgentTown, { createTown, bubbleFor, poseFor, hashId });
})();
