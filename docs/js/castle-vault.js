/** TREASURE VAULT: its own map (not an overlay), reached through the big door behind the throne.
 *  Tapping the door sends Bus Ninja walking to it, a smoke-bomb puff plays, then the screen fades
 *  into the vault map. The vault map shows only the vault: the LEFT HALF holds 25 arcade cabinets
 *  (5 x 5) from data/cabinets.json, the RIGHT HALF is an empty roped-off reserved area, plus an exit
 *  door and a "Back to castle" button. Tapping a published cabinet (or its title below it) sends
 *  Bus Ninja walking to it; he sits, vanishes in a cloud of smoke, then https://<name>.grok.me opens in this same tab (fix 38).
 *  Coming-soon cabinets show their name grayed out with "coming soon" under it, and are inert (fix 39). All art is drawn here (no screenshots). */
(function () {
const VW = 52;
const VH = 26;
const ROOM = {
  id: "vaultmap", name: "Treasure Vault", x: 0, y: 0, w: VW, h: VH,
  doors: [[25, VH - 1]],
  wall: "#6b5a2a", wallDk: "#3f3416", floor: "#3b3324", floor2: "#352d20", trim: "#ffd34d",
};
const EXIT = { x: 24, y: VH - 2, w: 3, h: 2 };
// Left half (x 1-25): cabinets. Right half (x 27-50): reserved, empty.
const RESERVED = { x: 28, y: 2, w: 22, h: 20 };
const NINJA_HOME = { x: 25, y: 22 };
const COLS = [3, 8, 13, 18, 23];
const ROWS = [3, 7, 11, 15, 19];
const TITLE_MAX = 40;
const PUFF_MS = 700;
let vaultWorldRef = null;

let CABS = [];
let loading = null;

function load() {
  if (loading) return loading;
  loading = fetch("data/cabinets.json", { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : { cabinets: [] }))
    .then((d) => {
      CABS = ((d && d.cabinets) || []).slice(0, COLS.length * ROWS.length);
    })
    .catch(() => {
      CABS = [];
    });
  return loading;
}

function urlFor(c) {
  return c && c.status === "published" && /^[a-z0-9-]+$/.test(c.name || "") ? "https://" + c.name + ".grok.me" : null;
}

function slots() {
  const out = [];
  for (const y of ROWS) for (const x of COLS) out.push({ x, y });
  return out;
}

function trunc(t, n) {
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

/** Split a long title on spaces: 2 lines normally, up to 3 when longer than 26. */
function wrapTitle(t, n) {
  const s = trunc(String(t || ""), n);
  if (s.length <= 14) return s;
  const lines = s.length > 26 ? 3 : 2;
  const parts = [];
  let rest = s;
  for (let left = lines; left > 1; left--) {
    const mid = Math.ceil(rest.length / left);
    let best = -1;
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === " " && Math.abs(i - mid) <= Math.abs(best - mid)) best = i;
    }
    if (best < 1) break;
    parts.push(rest.slice(0, best));
    rest = rest.slice(best + 1);
  }
  parts.push(rest);
  return parts.join("\n");
}

// 7x5 original icons, "1" = icon colour, "2" = accent.
const ICONS = {
  dragon: ["0110000", "1121110", "0111111", "0011010", "0110110"],
  dog: ["1100011", "1111111", "0121210", "0111110", "0110110"],
  crown: ["1010101", "1111111", "1121211", "1111111", "0000000"],
  portal: ["0011100", "0122210", "1220221", "0122210", "0011100"],
  cookie: ["0111110", "1121121", "1111111", "1211211", "0111110"],
  eagle: ["1000001", "1100011", "0111110", "0012100", "0011100"],
  house: ["0001000", "0011100", "0111110", "0121210", "0121210"],
  note: ["0001111", "0001001", "0001001", "0111011", "0110011"],
  dove: ["0000110", "0011121", "1111110", "0111100", "0010000"],
  leaf: ["0000011", "0001111", "0011210", "0112100", "1100000"],
  wave: ["0011000", "0110110", "1100011", "0002200", "2220222"],
  clapper: ["1212121", "1111111", "1000001", "1000001", "1111111"],
};

function drawIcon(ctx, P, name, x, y, c1, c2) {
  const rows = ICONS[name];
  if (!rows) return;
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      const v = rows[r][c];
      if (v !== "0") P.fill(ctx, x + c, y + r, 1, 1, v === "1" ? c1 : c2);
    }
  }
}

const marqueeCache = new Map();
/** The game's marquee picture (js/marquees.js), once it has loaded; null otherwise. */
function marqueeImage(name) {
  const src = (window.AgentTown.marquees || {})[name];
  if (!src) return null;
  let img = marqueeCache.get(name);
  if (!img) {
    img = new Image();
    img.src = src;
    marqueeCache.set(name, img);
  }
  return img.complete && img.naturalWidth ? img : null;
}

function drawCabinet(ctx, P, c, s, now, lit) {
  const T = P.TILE;
  const x = s.x * T;
  const top = s.y * T - 12;
  const pub = c && c.status === "published";
  const col = pub ? c.colors[0] : "#4a4a55";
  const acc = pub ? c.colors[1] : "#8a8a96";
  P.fill(ctx, x + 1, s.y * T + 14, 15, 3, "rgba(0,0,0,0.35)");
  P.fill(ctx, x, top, 16, 28, P.shade(col, 0.45));
  P.fill(ctx, x + 1, top + 1, 14, 26, P.shade(col, 0.8));
  // marquee
  P.fill(ctx, x + 1, top + 1, 14, 7, pub ? acc : "#2a2a33");
  // published: the game's own marquee (its X banner) across the top; coming soon: blank
  const img = pub ? marqueeImage(c.name) : null;
  if (img) {
    P.fill(ctx, x - 1, top - 2, 18, 6, "#14110a");
    ctx.drawImage(img, x, top - 1, 16, 4);
    P.fill(ctx, x + 1, top + 4, 14, 4, P.shade(col, 0.5));
  } else if (pub) {
    // Plain FF6-style title plate when the game has no X-banner marquee (no watermark).
    P.fill(ctx, x - 1, top - 2, 18, 8, "#14110a");
    P.fill(ctx, x, top - 1, 16, 6, "#2a2210");
    P.fill(ctx, x, top - 1, 16, 1, "#ffd34d");
    P.fill(ctx, x, top + 4, 16, 1, "#c9a23a");
    P.fill(ctx, x, top - 1, 1, 6, "#ffd34d");
    P.fill(ctx, x + 15, top - 1, 1, 6, "#c9a23a");
    drawIcon(ctx, P, c.icon, x + 4, top + 1, col, P.shade(col, 0.5));
  }
  // screen
  P.fill(ctx, x + 2, top + 9, 12, 9, "#0b0b12");
  if (pub) {
    const phase = Math.floor(now / 220 + s.x + s.y) % 6;
    for (let i = 0; i < 4; i++) P.fill(ctx, x + 3, top + 10 + ((i * 2 + phase) % 8), 10, 1, i % 2 ? col : acc);
    if (lit) P.fill(ctx, x + 2, top + 9, 12, 9, "rgba(255,255,255,0.35)");
  }
  // control panel
  P.fill(ctx, x + 1, top + 19, 14, 4, P.shade(col, 0.6));
  if (pub) {
    P.fill(ctx, x + 4, top + 20, 2, 2, "#e8e8e8");
    P.fill(ctx, x + 9, top + 20, 2, 2, "#ff4d4d");
    P.fill(ctx, x + 12, top + 20, 2, 2, "#4dd0ff");
  }
}

/** W2: one builder for every room map (vault now; gallery and music in W5). spec = {room, w, h, solids, ninjaAt, parts}. */
function createRoomWorld(spec) {
  const VW = spec.w, VH = spec.h, ROOM = spec.room;
  const ground = [];
  const solid = [];
  const bid = [];
  for (let y = 0; y < VH; y++) {
    ground.push(new Array(VW).fill("floor"));
    solid.push(new Array(VW).fill(false));
    bid.push(new Array(VW).fill(null));
  }
  const world = { w: VW, h: VH, ground, solid, bid, buildings: [], byId: new Map(), decor: [], beds: [], chests: [], hash: window.AgentTown.worldHash, isVault: true };
  for (let y = 0; y < VH; y++) {
    for (let x = 0; x < VW; x++) {
      const edge = x === 0 || y === 0 || x === VW - 1 || y === VH - 1;
      bid[y][x] = ROOM.id;
      ground[y][x] = edge ? "wall" : "floor";
      solid[y][x] = edge;
    }
  }
  for (const [dx, dy] of ROOM.doors) ground[dy][dx] = "door";
  world.buildings.push(ROOM);
  world.byId.set(ROOM.id, ROOM);
  for (const [sx, sy] of spec.solids || []) solid[sy][sx] = true;
  // W2: the Wonkavator stands on x38-40, y9-11 in every room; the cabin floor (39,12) and apron (39,13) stay floor
  for (let y = 9; y <= 11; y++) for (let x = 38; x <= 40; x++) solid[y][x] = true;
  world.parts = spec.parts;
  const kit = window.AgentTown.ninjaKit;
  world.busNinja = kit ? kit.make(world, spec.ninjaAt[0], spec.ninjaAt[1]) : null;
  return world;
}
function createVaultWorld() {
  const world = createRoomWorld({ room: ROOM, w: VW, h: VH, solids: slots().map((s) => [s.x, s.y]), ninjaAt: [NINJA_HOME.x, NINJA_HOME.y], parts: [scene] });
  vaultWorldRef = world;
  return world;
}

/** Parts of the vault map itself. */
const scene = {
  id: "vaultmap",
  labels(town) {
    const ss = slots();
    const out = [];
    const nin = vaultWorldRef && vaultWorldRef.busNinja;
    CABS.forEach((c, i) => {
      const soon = c.status !== "published";
      // fix 39: coming soon shows its name grayed out with "coming soon" underneath
      out.push({
      soon: soon,
      sub: soon ? "coming soon" : undefined,
      textColor: soon ? "#a4a4b0" : undefined,
      kind: "cabinet",
      // the title is a tap target too: a tap on it acts as a tap on its cabinet
      at: [ss[i].x * 16 + 8, ss[i].y * 16 + 4],
      x: ss[i].x * 16 + 8,
      y: ss[i].y * 16 + 18,
      text: wrapTitle(c.title || "", TITLE_MAX),
      full: c.title || "",
      accent: c.status === "published" ? (c.colors || [])[1] || "#ffd34d" : "#8a8a96",
      bg: soon ? "rgba(26,26,32,0.9)" : "rgba(20,16,6,0.9)",
      });
    });
    if (nin && !nin.hidden) out.push({ kind: "busninja", avoid: true, x: nin.x * 16 + 8, y: nin.y * 16 + 18, text: "Bus Ninja", accent: "#f2c230", bg: "rgba(29,31,43,0.94)" });
    // W2: the Wonkavator's label; a tap on it acts as a tap on the car (hidden during the trip, W4)
    const wk = window.AgentTown.wonka;
    if (!(wk && wk.hideLabel())) out.push({ kind: "wonka", at: [632, 176], x: 632, y: 220, text: "Wonkavator", accent: "#ffd34d", bg: "rgba(40,30,8,0.92)" });
    out.push({ kind: "sign", x: (EXIT.x + 1.5) * 16, y: (EXIT.y - 0.6) * 16, text: "Exit to castle", accent: "#ffd34d", bg: "rgba(40,30,8,0.92)" });
    return out;
  },
  hit(town, wx, wy, ui) {
    if (wx >= EXIT.x * 16 && wx <= (EXIT.x + EXIT.w) * 16 && wy >= (EXIT.y - 1.2) * 16 && wy <= VH * 16) {
      ui.leaveVault();
      return true;
    }
    const wk = window.AgentTown.wonka;
    // W2: the car (world x604-652, y136-216) before the cabinets
    if (wk && wx >= 604 && wx <= 652 && wy >= 136 && wy <= 216) {
      wk.tap(town, ui);
      return true;
    }
    const ss = slots();
    for (let i = 0; i < CABS.length; i++) {
      const s = ss[i];
      if (wx < s.x * 16 - 4 || wx > s.x * 16 + 20 || wy < s.y * 16 - 14 || wy > s.y * 16 + 26) continue;
      const url = urlFor(CABS[i]);
      // W2: one job at a time. A cabinet tap cancels the boarding walk (S1); later in the boarding it is ignored.
      if (wk && wk.busy() && url && !wk.cancelWalk()) {
        const wd = (window.AgentTown.debug || {}).wonka;
        if (wd) wd.ignoredTaps++;
        return true;
      }
      if (!url) {
        // coming soon (fix 39): inert, no walk, no smoke, no link
        const dbg = (window.AgentTown.debug = window.AgentTown.debug || {});
        dbg.vaultInertTaps = (dbg.vaultInertTaps || 0) + 1;
        return false;
      }
      // fix 38 walk already running: repeat taps are ignored (counted), no box
      if (launching) {
        launch(town, s, i, url);
        return true;
      }
      // fix 40: ask "Play <game>?" first; only Yes starts the fix 38 walk
      const box = window.AgentTown.confirmBox;
      if (!box) {
        launch(town, s, i, url);
        return true;
      }
      if (box.isOpen()) return true;
      box.open({
        title: "Play " + (CABS[i].title || "this game") + "?",
        buttons: [{ id: "yes", text: "Yes" }, { id: "no", text: "No" }],
        cancelId: "no",
        onChoose: (id) => {
          if (id === "yes") launch(town, s, i, url);
        },
      });
      return true;
    }
    return false;
  },
  drawStatic(ctx, world, P) {
    const T = P.TILE;
    const r = RESERVED;
    for (let x = r.x * T; x < (r.x + r.w) * T; x += 4) {
      // W2: no top dashes in the overhead keep-clear column x37-41; a walk-in gap in the bottom row at x38-40
      if (x < 37 * T || x >= 42 * T) P.fill(ctx, x, r.y * T, 2, 1, "#c9a23a");
      if (x < 38 * T || x >= 41 * T) P.fill(ctx, x, (r.y + r.h) * T - 1, 2, 1, "#c9a23a");
    }
    for (let y = r.y * T; y < (r.y + r.h) * T; y += 4) {
      P.fill(ctx, r.x * T, y, 1, 2, "#c9a23a");
      P.fill(ctx, (r.x + r.w) * T - 1, y, 1, 2, "#c9a23a");
    }
    // exit door on the bottom wall: two open gold-banded leaves
    const ex = EXIT.x * T;
    const ey = (VH - 1) * T;
    P.fill(ctx, ex + 4, ey - 10, 3 * T - 8, T + 10, "#1c140a");
    for (const dx of [0, 2 * T + 4]) {
      P.fill(ctx, ex + dx, ey - 12, 12, T + 12, "#5a3a14");
      P.fill(ctx, ex + dx, ey - 8, 12, 2, "#ffd34d");
      P.fill(ctx, ex + dx, ey + 4, 12, 2, "#ffd34d");
    }
    for (const [x, y] of [[1, 1], [VW - 2, 1], [1, VH - 4], [VW - 2, VH - 4]]) {
      P.fill(ctx, x * T + 2, y * T + 8, 12, 6, "#c9a23a");
      P.fill(ctx, x * T + 4, y * T + 5, 8, 4, "#ffd34d");
    }
  },
  drawUnder(ctx, town, world, now, P) {
    const ss = slots();
    const lit = town.extras && town.extras.vaultLit;
    for (let i = 0; i < ss.length; i++) drawCabinet(ctx, P, CABS[i], ss[i], now, lit === i && now < (town.extras.vaultLitUntil || 0));
    const nin = world.busNinja;
    const kit = window.AgentTown.ninjaKit;
    const wk = window.AgentTown.wonka;
    if (nin && kit) {
      const dt = Math.min(0.05, Math.max(0, (now - (nin.lastStep || now)) / 1000));
      nin.lastStep = now;
      kit.step(nin, dt);
    }
    if (wk) wk.tick(now);
    const f = wk ? wk.frame(now) : null;
    // W2 draw order (sort-y of the car = 208, the bottom of row 12): north of the car he is behind it;
    // inside the cabin (y9-12) the interior, then him, then the glass front; on the apron he is in front.
    const me = () => nin && kit && kit.draw(ctx, P, nin, now);
    if (!f) return me();
    if (nin && nin.y < 9) {
      me();
      drawCar(ctx, P, f, true);
    } else if (nin && nin.y <= 12.01) {
      drawCar(ctx, P, f, false, true);
      me();
      drawCar(ctx, P, f, false, false);
    } else {
      drawCar(ctx, P, f, true);
      me();
    }
  },
};

/** W2: the Wonkavator. Painted sheet frame (wonkavator.png, 192x256 frames drawn as 48x64 at world (608,144));
 *  the interior back wall only while parked. Nothing while the art is still loading; code art if it failed. */
function drawCar(ctx, P, f, both, interiorOnly) {
  const A = window.AgentTown.art;
  if (!A) return;
  const draw = (name, sx, sy) => {
    const a = A.get(name);
    if (!a || !a.ok || !a.bitmap) return a && a.state === "loading" ? "wait" : "fail";
    const s = a.scale || 1;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(a.bitmap, sx * s, sy * s, 192 * s, 256 * s, 608, 144, 48, 64);
    ctx.restore();
    return "ok";
  };
  if (both || interiorOnly) draw("wonkavator-interior", 0, 0);
  if (interiorOnly) return;
  if (draw("wonkavator", f.col * 192, f.row * 256) === "fail" && A.drawWonkaCode) A.drawWonkaCode(ctx, P, { anim: f.anim, t: f.t, x: 632, y: 208 }, 16);
}

/** Cabinet tap (fix 38): Bus Ninja walks to the cabinet on a floor-only path, sits on it, vanishes in a
 *  cloud of smoke, and only then the game opens, in this same tab (location.assign), so no popup blocker
 *  can stop it. Repeat taps during the walk are ignored; if the walk cannot finish, nothing opens. */
const WALK_GIVE_UP_MS = 15000;
const SIT_MS = 350;
let launching = null;
/** He reappears normally (visible, walks home) when the game did not open, e.g. stubbed or Back. */
function reappear(nin) {
  if (!nin || !nin.hidden || launching) return;
  nin.hidden = false;
  nin.puff = 0;
  if (nin.goHome) nin.goHome();
}
// Back from the game (page restored from the back/forward cache): show him again
window.addEventListener("pageshow", (e) => {
  if (!e.persisted) return;
  launching = null;
  const nin = vaultWorldRef && vaultWorldRef.busNinja;
  if (nin && nin.hidden) {
    nin.hidden = false;
    nin.puff = 0;
    nin.mode = "stand";
    if (nin.goHome) nin.goHome();
  }
});
function launch(town, slot, index, url) {
  const dbg = (window.AgentTown.debug = window.AgentTown.debug || {});
  if (launching) {
    dbg.vaultIgnoredTaps = (dbg.vaultIgnoredTaps || 0) + 1;
    return;
  }
  const vw = vaultWorldRef;
  const nin = vw && vw.busNinja;
  if (!nin || !nin.goTo) return;
  const me = { url, index, t0: performance.now() };
  const giveUp = () => {
    if (launching !== me) return;
    launching = null;
    (dbg.vaultFailed = dbg.vaultFailed || []).push(url);
    if (nin.mode === "walk") nin.goHome();
  };
  launching = me;
  town.extras.vaultLit = index;
  const ok = nin.goTo(slot.x + 0.5, slot.y + 1, () => {
    if (launching !== me) return;
    // arrived: sit on the cabinet's stool, then vanish in a cloud of smoke, then open the game
    nin.mode = "seat";
    nin.facing = "n";
    nin.y = slot.y + 0.6;
    town.extras.vaultLitUntil = performance.now() + SIT_MS + PUFF_MS + 400;
    setTimeout(() => {
      if (launching !== me) return;
      const now = performance.now();
      nin.hidden = true; // gone: only the cloud is drawn from here on
      nin.puff = now + PUFF_MS;
      dbg.vaultVanishAt = now;
      setTimeout(() => {
        if (launching !== me) return;
        launching = null;
        (dbg.vaultOpens = dbg.vaultOpens || []).push(url);
        dbg.vaultOpenMethod = "same-tab location.assign after he vanishes in the smoke";
        if (dbg.vaultNavigate === false || window.__agentTownNoNavigate) {
          setTimeout(() => reappear(nin), 900); // opening stubbed: he comes back
          return;
        }
        try {
          window.location.assign(url);
        } catch (e) {
          reappear(nin);
          return;
        }
        // if the page is still here a while later (navigation did not happen), bring him back
        setTimeout(() => reappear(nin), 6000);
      }, PUFF_MS - 100);
    }, SIT_MS);
  });
  if (!ok) {
    // no floor path: no walk and no link
    nin.mode = "stand";
    nin.done = null;
    launching = null;
    (dbg.vaultFailed = dbg.vaultFailed || []).push(url);
    return;
  }
  setTimeout(giveUp, WALK_GIVE_UP_MS);
}

/** Castle side: the big door in the throne room's back wall (position set by the throne part). */
const part = {
  id: "vault",
  order: 25,
  cabinets: () => CABS.map((c, i) => Object.assign({ slot: slots()[i], url: urlFor(c) }, c)),
  rooms() {
    load();
  },
  hit(town, wx, wy, ui) {
    const d = town.world.vaultDoor;
    if (!d) return false;
    // the door art (4 tiles wide) plus its label just below it
    if (wx < (d.x - 1) * 16 - 4 || wx > (d.x + d.w + 1) * 16 + 4 || wy < (d.y - 1) * 16 - 10 || wy > (d.y + 2.6) * 16) return false;
    enter(town, ui);
    return true;
  },
};

let entering = false;
function enter(town, ui) {
  if (entering) return;
  entering = true;
  const nin = town.world.busNinja;
  const d = town.world.vaultDoor;
  let went = false;
  const go = () => {
    if (went) return;
    went = true;
    if (nin) nin.puff = performance.now() + PUFF_MS;
    setTimeout(() => {
      ui.enterVault(() => {
        entering = false;
        // W2: on every entry from the castle he stands just inside the exit door, facing north
        const vn = vaultWorldRef && vaultWorldRef.busNinja;
        if (vn) {
          vn.path = [];
          vn.done = null;
          vn.hidden = false;
          vn.x = 25;
          vn.y = 24;
          vn.mode = "stand";
          vn.facing = "n";
        }
        if (nin && nin.goHome) nin.goHome();
      });
    }, PUFF_MS - 150);
  };
  if (nin && nin.goTo && d) {
    nin.goTo(d.x + d.w / 2, d.y + 1, () => {
      nin.facing = "n";
      go();
    });
    let len = 0;
    let px = nin.x;
    let py = nin.y;
    for (const q of nin.path || []) {
      len += Math.hypot(q.x - px, q.y - py);
      px = q.x;
      py = q.y;
    }
    setTimeout(go, (len / 7) * 1000 + 1500);
  } else go();
}

window.AgentTown.castleParts.push(part);
part.createWorld = createVaultWorld;
part.createRoomWorld = createRoomWorld;
part.world = () => vaultWorldRef;
part.launching = () => !!launching;
part.enter = enter;
window.AgentTown.vault = part;
})();
