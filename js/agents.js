/** Bot agents: path following, poses, handoffs, and demo activity. */
(function () {
const findPath = window.AgentTown.findPath;
const TILE = window.AgentTown.TILE;
const driveFolderUrl = window.AgentTown.driveFolderUrl;
const shortDescription = window.AgentTown.shortDescription;

const SPEED = 3.35;

const WORK_TASKS = [
  { task: "Drafting notes for the next pass", text: "Drafting level 3 cutscene" },
  { task: "Checking the latest build", text: "Checking a build" },
  { task: "Updating the design doc", text: "Updating a doc" },
  { task: "Reviewing the open changes", text: "Reviewing changes" },
  { task: "Sorting the shared files", text: "Sorting files" },
  { task: "Writing the project README", text: "Writing README" },
  { task: "Testing the opening scene", text: "Testing a scene" },
  { task: "Reconciling the October budget sheet", text: "Reconciling October budget" },
  { task: "Indexing the notes folder", text: "Indexing a folder" },
  { task: "Sketching a layout", text: "Sketching a layout" },
];
const WAIT_TASKS = ["Waiting on a decision", "Needs a look", "Holding for review", "Paused for input"];
const BLOCK_TASKS = ["Missing a file", "Stuck on a choice", "Cannot continue yet", "Blocked on a dependency"];
const DONE_TASKS = ["Finished the pass", "Ready for review", "Task complete", "Logged the result"];
const ITEMS = ["scroll", "sketch", "note", "checklist", "palette", "bug list", "draft", "sprite"];

function hashId(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function findChestTile(world, spawn, taken) {
  const dirs = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
    [2, 0], [-2, 0], [0, 2], [0, -2],
    [2, 1], [2, -1], [-2, 1], [-2, -1],
    [0, 0],
  ];
  for (const [dx, dy] of dirs) {
    const x = spawn.x + dx;
    const y = spawn.y + dy;
    if (taken.has(x + "," + y)) continue;
    if (x < 1 || y < 1 || x >= world.w - 1 || y >= world.h - 1) continue;
    if (world.solid[y][x]) continue;
    const ground = world.ground[y][x];
    if (ground === "wall" || ground === "water" || ground === "tree" || ground === "door") continue;
    return { x, y };
  }
  return { x: spawn.x, y: spawn.y };
}

function arrived(agent) {
  if (!agent.goal) return true;
  if (agent.stuck) return true;
  if (!agent.path || agent.path.length) return false;
  return Math.hypot(agent.x - agent.goal.x, agent.y - agent.goal.y) < 0.12;
}

function createTown(roster, world) {
  const agents = new Map();
  for (const bot of roster) {
    const homeSpots = world.spots[bot.home];
    if (!homeSpots || !homeSpots.idle.length) {
      throw new Error("Unknown home \"" + bot.home + "\" for " + bot.id);
    }
    const spawn = homeSpots.idle[hashId(bot.id) % homeSpots.idle.length];
    agents.set(bot.id, {
      id: bot.id,
      name: bot.name,
      role: bot.role,
      home: bot.home,
      color: bot.color,
      state: "idle",
      task: "",
      needsAlex: null,
      ts: null,
      handoffTo: null,
      item: null,
      text: "",
      with: [],
      collabId: null,
      collab: false,
      driveFolderUrl: driveFolderUrl(bot.driveFolderUrl),
      x: spawn.x,
      y: spawn.y,
      facing: "s",
      path: null,
      goal: null,
      goalKey: "",
      lockGoal: false,
      busy: false,
      stuck: false,
      moving: false,
      walk: 0,
      wander: 2 + Math.random() * 6,
    });
  }

  const seenHandoff = new Set();
  const queue = [];
  const active = [];
  const collabSpotOf = new Map();
  const chests = [];
  const chestById = new Map();
  const chestTaken = new Set();
  for (const bot of roster) {
    const homeSpots = world.spots[bot.home];
    const spawn = homeSpots.idle[hashId(bot.id) % homeSpots.idle.length];
    const tile = findChestTile(world, spawn, chestTaken);
    chestTaken.add(tile.x + "," + tile.y);
    const chest = {
      id: bot.id,
      x: tile.x,
      y: tile.y,
      url: driveFolderUrl(bot.driveFolderUrl),
      lid: 0,
      kick: 0,
    };
    chests.push(chest);
    chestById.set(bot.id, chest);
  }
  let freePairs = world.meetPairs.map((pair) => pair.map((s) => ({ x: s.x, y: s.y, facing: "s" })));
  let demo = false;
  let demoAcc = 0;
  let demoNext = 5;
  let now = 0;

  function setGoal(agent, spot, key) {
    if (agent.goalKey === key) return;
    agent.goalKey = key;
    agent.goal = { x: spot.x, y: spot.y, facing: spot.facing || "s" };
    agent.path = null;
    agent.stuck = false;
  }

  function retarget(agent) {
    if (!agent || agent.busy || agent.lockGoal) return;
    let spots;
    let prefix = agent.state;
    if (agent.state === "working") spots = world.spots[agent.home].work;
    else if (agent.state === "walking") spots = world.plazaSpots;
    else spots = world.spots[agent.home].idle;
    if (!spots || !spots.length) spots = world.spots[agent.home].idle;
    let index;
    if (agent.state === "walking") index = hashId(agent.id) % spots.length;
    else {
      const peers = [];
      for (const other of agents.values()) {
        if (other.busy || other.lockGoal) continue;
        if (other.home === agent.home && other.state === agent.state) peers.push(other);
      }
      peers.sort((a, b) => (a.id < b.id ? -1 : 1));
      index = peers.findIndex((p) => p.id === agent.id);
      if (index < 0) index = hashId(agent.id) % spots.length;
    }
    const spot = spots[index % spots.length];
    setGoal(agent, spot, prefix + ":" + spot.x + "," + spot.y);
  }

  function maybeHandoff(agent) {
    if (!agent.handoffTo || !agents.has(agent.handoffTo)) return;
    if (agent.handoffTo === agent.id) return;
    const key = agent.id + "|" + agent.ts + "|" + agent.handoffTo + "|" + (agent.item || "");
    if (seenHandoff.has(key)) return;
    seenHandoff.add(key);
    queue.push({ from: agent.id, to: agent.handoffTo, item: agent.item || "package", key });
  }

  function pump() {
    while (active.length < 3 && queue.length && freePairs.length) {
      let started = false;
      for (let i = 0; i < queue.length; i++) {
        const job = queue[i];
        const a = agents.get(job.from);
        const b = agents.get(job.to);
        if (!a || !b) {
          queue.splice(i, 1);
          i--;
          continue;
        }
        if (a.busy || b.busy) continue;
        const pair = freePairs.shift();
        queue.splice(i, 1);
        a.busy = true;
        b.busy = true;
        a.lockGoal = false;
        b.lockGoal = false;
        const run = {
          from: a.id,
          to: b.id,
          item: job.item,
          phase: "walk",
          pair,
          age: 0,
          pass: 0,
        };
        active.push(run);
        // Face each other across the counter gap when they stand on the pair.
        setGoal(a, { x: pair[0].x, y: pair[0].y, facing: "n" }, "handoff:" + pair[0].x + "," + pair[0].y);
        setGoal(b, { x: pair[1].x, y: pair[1].y, facing: "n" }, "handoff:" + pair[1].x + "," + pair[1].y);
        started = true;
        break;
      }
      if (!started) break;
    }
  }

  function finish(job) {
    const a = agents.get(job.from);
    const b = agents.get(job.to);
    for (const agent of [a, b]) {
      if (!agent) continue;
      agent.busy = false;
      agent.lockGoal = false;
      agent.goalKey = "";
    }
    if (job.pair) freePairs.push(job.pair);
    const idx = active.indexOf(job);
    if (idx >= 0) active.splice(idx, 1);
    retarget(a);
    retarget(b);
    pump();
  }

  function moveAgent(agent, dt) {
    if (!agent.goal) return 0;
    if (!agent.path) {
      const path = findPath(world, agent.x, agent.y, agent.goal.x, agent.goal.y);
      if (path === null) {
        agent.path = [];
        agent.stuck = true;
        return 0;
      }
      agent.path = path;
      agent.stuck = false;
    }
    if (!agent.path.length) return 0;
    const target = agent.path[0];
    const dx = target.x - agent.x;
    const dy = target.y - agent.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.001) {
      agent.x = target.x;
      agent.y = target.y;
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

  function wanderThink(agent, dt) {
    if (agent.busy || agent.state !== "idle") return;
    if (!arrived(agent)) return;
    agent.wander -= dt;
    if (agent.wander > 0) return;
    agent.wander = 6 + Math.random() * 8;
    const loc = Math.random() < 0.45 ? "tavern" : agent.home;
    const spots = (world.spots[loc] && world.spots[loc].idle) || world.spots[agent.home].idle;
    const spot = spots[Math.floor(Math.random() * spots.length)];
    agent.lockGoal = true;
    setGoal(agent, spot, "wander-" + Math.random());
  }

  function patrolThink(agent) {
    if (agent.busy || agent.state !== "walking") return;
    if (!arrived(agent)) return;
    const spots = world.plazaSpots;
    if (!spots.length) return;
    let spot = spots[Math.floor(Math.random() * spots.length)];
    if (agent.goal && spots.length > 1 && spot.x === agent.goal.x && spot.y === agent.goal.y) {
      const i = spots.indexOf(spot);
      spot = spots[(i + 1) % spots.length];
    }
    agent.lockGoal = true;
    setGoal(agent, spot, "roam-" + spot.x + "-" + spot.y + "-" + Math.random());
  }

  function updateHandoffs(dt) {
    for (let i = active.length - 1; i >= 0; i--) {
      const job = active[i];
      job.age += dt;
      const a = agents.get(job.from);
      const b = agents.get(job.to);
      if (!a || !b) {
        finish(job);
        continue;
      }
      if (job.phase === "walk") {
        if ((arrived(a) && arrived(b)) || job.age > 22) {
          job.phase = "pass";
          job.pass = 0;
          if (a.goal) a.facing = a.goal.facing || a.facing;
          if (b.goal) b.facing = b.goal.facing || b.facing;
        }
      } else if (job.phase === "pass") {
        job.pass += dt / 1.25;
        if (job.pass >= 1) {
          job.pass = 1;
          job.phase = "show";
          job.age = 0;
        }
      } else if (job.phase === "show") {
        if (job.age > 1.5) finish(job);
      }
    }
  }

  function eligibleCollab(agent) {
    if (!agent || agent.busy) return false;
    if (agent.state === "idle" || agent.state === "done") return false;
    return true;
  }

  function collabGroups() {
    const parent = new Map();
    function find(a) {
      if (!parent.has(a)) parent.set(a, a);
      if (parent.get(a) !== a) parent.set(a, find(parent.get(a)));
      return parent.get(a);
    }
    function union(a, b) {
      if (!agents.has(a) || !agents.has(b) || a === b) return;
      const pa = find(a);
      const pb = find(b);
      if (pa !== pb) parent.set(pa, pb);
    }
    const activeIds = new Set();
    function touch(id) {
      if (!agents.has(id)) return;
      activeIds.add(id);
      find(id);
    }

    for (const agent of agents.values()) {
      if (!eligibleCollab(agent)) continue;
      if (Array.isArray(agent.with)) {
        for (const id of agent.with) {
          const other = agents.get(id);
          if (!other || !eligibleCollab(other)) continue;
          touch(agent.id);
          touch(id);
          union(agent.id, id);
        }
      }
      if (agent.handoffTo) {
        const other = agents.get(agent.handoffTo);
        if (other && eligibleCollab(other)) {
          touch(agent.id);
          touch(agent.handoffTo);
          union(agent.id, agent.handoffTo);
        }
      }
    }

    const byCollab = new Map();
    const byTask = new Map();
    for (const agent of agents.values()) {
      if (!eligibleCollab(agent)) continue;
      if (agent.collabId) {
        if (!byCollab.has(agent.collabId)) byCollab.set(agent.collabId, []);
        byCollab.get(agent.collabId).push(agent.id);
      }
      if (agent.state === "working") {
        const taskKey = (agent.task || "").trim();
        if (taskKey.length >= 4) {
          if (!byTask.has(taskKey)) byTask.set(taskKey, []);
          byTask.get(taskKey).push(agent.id);
        }
      }
    }
    for (const ids of byCollab.values()) {
      if (ids.length < 2) continue;
      for (const id of ids) {
        touch(id);
        union(ids[0], id);
      }
    }
    for (const ids of byTask.values()) {
      if (ids.length < 2) continue;
      for (const id of ids) {
        touch(id);
        union(ids[0], id);
      }
    }

    const groups = new Map();
    for (const id of activeIds) {
      const root = find(id);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root).push(id);
    }
    return Array.from(groups.values()).filter((group) => group.length >= 2);
  }

  function syncCollab() {
    const spots = world.collabSpots || [];
    const groups = spots.length ? collabGroups() : [];
    const assigned = new Set();
    const reserved = new Set();
    for (const job of active) {
      if (!job.pair) continue;
      reserved.add(job.pair[0].x + "," + job.pair[0].y);
      reserved.add(job.pair[1].x + "," + job.pair[1].y);
    }
    const used = new Set();
    for (const group of groups) {
      group.sort();
      for (const id of group) {
        const agent = agents.get(id);
        if (!agent) continue;
        let index = collabSpotOf.get(id);
        if (index == null || !spots[index] || reserved.has(spots[index].x + "," + spots[index].y) || used.has(index)) {
          index = -1;
          for (let i = 0; i < spots.length; i++) {
            const spot = spots[i];
            if (used.has(i) || reserved.has(spot.x + "," + spot.y)) continue;
            index = i;
            break;
          }
          if (index < 0) index = group.indexOf(id) % spots.length;
        }
        used.add(index);
        collabSpotOf.set(id, index);
        const spot = spots[index];
        assigned.add(id);
        agent.collab = true;
        agent.lockGoal = true;
        setGoal(agent, spot, "collab:" + spot.x + "," + spot.y);
      }
    }
    for (const agent of agents.values()) {
      if (assigned.has(agent.id)) continue;
      collabSpotOf.delete(agent.id);
      if (!agent.collab) continue;
      agent.collab = false;
      if (!agent.busy) {
        agent.lockGoal = false;
        agent.goalKey = "";
        retarget(agent);
      }
    }
  }

  function applyCollabFields(agent, partial) {
    const ended = partial.collabEnd === true || partial.state === "idle" || partial.state === "done";
    if (ended) {
      agent.with = [];
      agent.collabId = null;
      return;
    }
    if (Array.isArray(partial.with)) agent.with = partial.with.filter(Boolean).slice(0, 8);
    else agent.with = [];
    agent.collabId = partial.collabId ? String(partial.collabId).slice(0, 80) : null;
  }

  function setStatus(id, partial) {
    const agent = agents.get(id);
    if (!agent || agent.busy) return;
    agent.state = partial.state || agent.state;
    if (partial.task != null) agent.task = partial.task;
    if (partial.text != null) agent.text = shortDescription({ text: partial.text });
    else if (partial.task != null) agent.text = shortDescription({ task: partial.task });
    agent.needsAlex = partial.needsAlex === "urgent" || partial.needsAlex === "question" ? partial.needsAlex : null;
    agent.ts = partial.ts || new Date().toISOString();
    agent.lockGoal = false;
    agent.goalKey = "";
    applyCollabFields(agent, partial);
    if (partial.handoffTo) {
      agent.handoffTo = partial.handoffTo;
      agent.item = partial.item || partial.task || "package";
      maybeHandoff(agent);
    } else {
      agent.handoffTo = null;
      agent.item = null;
      retarget(agent);
    }
    pump();
    syncCollab();
  }

  function stepDemo() {
    const list = [];
    for (const agent of agents.values()) if (!agent.busy) list.push(agent);
    if (!list.length) return;
    const agent = list[Math.floor(Math.random() * list.length)];
    const roll = Math.random();
    if (roll < 0.22) {
      const other = list[Math.floor(Math.random() * list.length)];
      if (other && other.id !== agent.id) {
        const item = pick(ITEMS);
        setStatus(agent.id, {
          state: "done",
          task: "Passed " + item,
          needsAlex: null,
          handoffTo: other.id,
          item,
        });
        return;
      }
    }
    const choiceRoll = Math.random();
    if (choiceRoll < 0.28) {
      const work = pick(WORK_TASKS);
      setStatus(agent.id, { state: "working", task: work.task, text: work.text, needsAlex: null });
    } else if (choiceRoll < 0.36) {
      const work = pick(WORK_TASKS);
      setStatus(agent.id, { state: "working", task: work.task, text: work.text, needsAlex: "urgent" });
    }
    else if (choiceRoll < 0.5) setStatus(agent.id, { state: "waiting", task: pick(WAIT_TASKS), needsAlex: "question" });
    else if (choiceRoll < 0.58) setStatus(agent.id, { state: "waiting", task: pick(WAIT_TASKS), needsAlex: null });
    else if (choiceRoll < 0.7) setStatus(agent.id, { state: "blocked", task: pick(BLOCK_TASKS), needsAlex: choiceRoll < 0.64 ? "urgent" : null });
    else if (choiceRoll < 0.8) setStatus(agent.id, { state: "done", task: pick(DONE_TASKS), needsAlex: null });
    else if (choiceRoll < 0.9) setStatus(agent.id, { state: "walking", task: "Crossing the square", needsAlex: null });
    else setStatus(agent.id, { state: "idle", task: "", needsAlex: null });
  }

  const COLLAB_CAST = [
    { id: "game-design-document-bot", task: "Drafting the level 3 cutscene with the crew", text: "Drafting level 3 cutscene" },
    { id: "cutscene-bot", task: "Writing the README scene beats", text: "Writing README" },
    { id: "concept-art-bot", task: "Painting the workshop forge", text: "Sketching the forge" },
  ];
  let collabOn = false;
  let collabTimer = 7;

  function stepCollabDemo(dt) {
    collabTimer -= dt;
    if (collabTimer > 0) return;
    const ids = COLLAB_CAST.map((row) => row.id);
    if (!collabOn) {
      for (const row of COLLAB_CAST) {
        setStatus(row.id, {
          state: "working",
          task: row.task,
          text: row.text,
          needsAlex: null,
          with: ids.filter((id) => id !== row.id),
          collabId: "demo-workshop",
        });
      }
      collabOn = true;
      collabTimer = 16;
    } else {
      for (const row of COLLAB_CAST) {
        setStatus(row.id, { state: "idle", task: "", text: "", needsAlex: null, collabEnd: true });
      }
      collabOn = false;
      collabTimer = 14;
    }
  }

  return {
    agents,
    world,
    chests,
    hoverChest: null,
    tipChest: null,
    selected: null,
    applySnapshot(bots) {
      for (const data of bots || []) {
        const agent = agents.get(data.id);
        if (!agent) continue;
        const nextNeed = data.needsAlex === "urgent" || data.needsAlex === "question" ? data.needsAlex : null;
        const nextHandoff = data.handoffTo || null;
        const nextWith = Array.isArray(data.with) ? data.with.join("|") : "";
        const changed =
          agent.state !== (data.state || "idle") ||
          agent.task !== (data.task || "") ||
          agent.text !== (data.text || "") ||
          agent.needsAlex !== nextNeed ||
          agent.ts !== (data.ts || null) ||
          agent.handoffTo !== nextHandoff ||
          agent.item !== (data.item || null) ||
          (agent.with || []).join("|") !== nextWith ||
          agent.collabId !== (data.collabId || null);
        agent.name = data.name || agent.name;
        agent.role = data.role || agent.role;
        agent.home = data.home || agent.home;
        agent.color = data.color || agent.color;
        agent.state = data.state || "idle";
        agent.task = data.task || "";
        agent.text = data.text || "";
        agent.needsAlex = nextNeed;
        agent.ts = data.ts || null;
        agent.handoffTo = nextHandoff;
        agent.item = data.item || null;
        agent.with = Array.isArray(data.with) ? data.with.slice() : [];
        agent.collabId = data.collabId || null;
        if (data.driveFolderUrl != null) {
          agent.driveFolderUrl = driveFolderUrl(data.driveFolderUrl);
          const chest = chestById.get(agent.id);
          if (chest) chest.url = agent.driveFolderUrl;
        }
        if (changed) {
          agent.lockGoal = false;
          agent.goalKey = "";
        }
      }
      for (const agent of agents.values()) retarget(agent);
      for (const agent of agents.values()) maybeHandoff(agent);
      pump();
      syncCollab();
    },
    update(dt, time) {
      const step = Math.max(0, Math.min(0.05, dt || 0));
      now = time || 0;
      for (const agent of agents.values()) {
        if (agent.state === "idle") wanderThink(agent, step);
        if (agent.state === "walking") patrolThink(agent);
        const moved = moveAgent(agent, step);
        agent.moving = moved > 0.001;
        if (!agent.moving && arrived(agent) && agent.goal && agent.goal.facing) {
          if (agent.state === "working" || agent.busy || agent.collab) agent.facing = agent.goal.facing;
        }
      }
      updateHandoffs(step);
      if (demo) {
        demoAcc += step;
        if (demoAcc >= demoNext) {
          demoAcc = 0;
          demoNext = 3.5 + Math.random() * 3.5;
          stepDemo();
        }
        stepCollabDemo(step);
      }
      syncCollab();
      const clock = time || 0;
      for (const chest of chests) {
        const open = this.hoverChest === chest.id || chest.kick > clock;
        const target = open ? 1 : 0;
        chest.lid += (target - chest.lid) * Math.min(1, step * 8);
      }
      if (this.tipChest) {
        const chest = chestById.get(this.tipChest);
        if (!chest || chest.kick < clock - 1600) this.tipChest = null;
      }
    },
    enableDemo() {
      demo = true;
      demoAcc = 0;
      demoNext = 4 + Math.random() * 2;
    },
    isDemo() {
      return demo;
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
      for (const agent of agents.values()) {
        if (agent.needsAlex === "urgent" || agent.needsAlex === "question") list.push(agent);
      }
      list.sort((a, b) => {
        if (a.needsAlex !== b.needsAlex) return a.needsAlex === "urgent" ? -1 : 1;
        return a.name < b.name ? -1 : 1;
      });
      return list;
    },
    hitChest(worldX, worldY) {
      let best = null;
      let bestD = 12;
      for (const chest of chests) {
        const px = chest.x * TILE + TILE / 2;
        const py = chest.y * TILE + TILE / 2;
        const d = Math.hypot(worldX - px, worldY - py);
        if (d < bestD) {
          bestD = d;
          best = chest;
        }
      }
      return best;
    },
    pokeChest(id, time) {
      const chest = chestById.get(id);
      if (!chest) return;
      chest.kick = (time || 0) + 700;
      if (!chest.url) this.tipChest = id;
    },
    hitTest(worldX, worldY) {
      let best = null;
      let bestD = 14;
      for (const agent of agents.values()) {
        const px = agent.x * TILE + TILE / 2;
        const py = agent.y * TILE + 6;
        const d = Math.hypot(worldX - px, worldY - py);
        if (d < bestD) {
          bestD = d;
          best = agent;
        }
      }
      return best;
    },
    handoffs() {
      return active.map((job) => {
        const a = agents.get(job.from);
        const b = agents.get(job.to);
        const t = job.phase === "walk" ? 0 : Math.max(0, Math.min(1, job.pass));
        return {
          from: a,
          to: b,
          item: job.item,
          phase: job.phase,
          t,
        };
      });
    },
    now() {
      return now;
    },
  };
}

function bubbleFor(agent, time) {
  if (!agent) return null;
  const blocked = agent.state === "blocked";
  const urgent = agent.needsAlex === "urgent";
  const question = agent.needsAlex === "question";
  if (blocked && urgent) return { kind: "blocked-urgent" };
  if (blocked && question) return { kind: "blocked-question" };
  if (urgent) return { kind: "urgent" };
  if (question) return { kind: "question" };
  if (blocked) return { kind: "blocked" };
  if (agent.collab || agent.busy || agent.state === "working") {
    if (agent.text) return { kind: "task", text: agent.text, time };
    if (agent.collab || agent.state === "working") return { kind: "working", time };
  }
  if (agent.state === "done") return { kind: "done" };
  if (agent.state === "idle" && !agent.moving) return { kind: "zzz", time };
  return null;
}

function poseFor(agent, time) {
  const moving = agent.moving;
  if (agent.busy && moving) return { pose: "walk", frame: Math.floor(agent.walk * 2) % 4, bob: 0, shake: 0 };
  if ((agent.collab || agent.busy || agent.state === "working") && !moving) {
    return { pose: "type", frame: Math.floor(time / 140) % 4, bob: 1, shake: 0 };
  }
  if (agent.state === "blocked" && !moving) {
    const shake = Math.floor(time / 70) % 2 === 0 ? 1 : 0;
    return { pose: "crossed", frame: 0, bob: 0, shake };
  }
  if (agent.state === "waiting" && !moving) {
    return { pose: "hips", frame: Math.floor(time / 700) % 4, bob: 0, shake: 0, look: true };
  }
  if (agent.state === "done" && !moving) {
    const hop = Math.floor(time / 160) % 2 === 0 ? -1 : 0;
    return { pose: "up", frame: 0, bob: hop, shake: 0 };
  }
  if (moving) return { pose: "walk", frame: Math.floor(agent.walk * 2) % 4, bob: Math.floor(agent.walk * 2) % 2 === 0 ? -1 : 0, shake: 0 };
  const breathe = Math.floor(time / 500) % 2 === 0 ? 0 : -1;
  return { pose: "idle", frame: 0, bob: breathe, shake: 0 };
}

window.AgentTown = window.AgentTown || {};
Object.assign(window.AgentTown, { createTown: createTown, bubbleFor: bubbleFor, poseFor: poseFor });
})();
