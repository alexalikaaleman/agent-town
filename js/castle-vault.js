/** TREASURE VAULT: its own map (not an overlay), reached through the big door behind the throne.
 *  Tapping the door sends Bus Ninja walking to it, a smoke-bomb puff plays, then the screen fades
 *  into the vault map. The vault map shows only the vault: 25 arcade cabinets (5 x 5) from
 *  data/cabinets.json, an empty roped-off reserved area below them, an exit door and a
 *  "Back to castle" button. Published cabinets open https://<name>.grok.me in a new tab; coming-soon
 *  cabinets show "SOON" and do nothing. All art is drawn here (no screenshots). */
(function () {
const VW = 27;
const VH = 32;
const ROOM = {
  id: "vaultmap", name: "Treasure Vault", x: 0, y: 0, w: VW, h: VH,
  doors: [[13, VH - 1]],
  wall: "#6b5a2a", wallDk: "#3f3416", floor: "#3b3324", floor2: "#352d20", trim: "#ffd34d",
};
const EXIT = { x: 12, y: VH - 2, w: 3, h: 2 };
const RESERVED = { x: 3, y: 22, w: 21, h: 6 };
const COLS = [3, 8, 13, 18, 23];
const ROWS = [3, 7, 11, 15, 19];
const TITLE_MAX = 12;
const PUFF_MS = 700;

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
// 3x5 letters for the SOON marquee
const LETTERS = { S: ["111", "100", "111", "001", "111"], O: ["111", "101", "101", "101", "111"], N: ["101", "111", "111", "111", "101"] };

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
  if (pub) drawIcon(ctx, P, c.icon, x + 4, top + 2, col, P.shade(col, 0.5));
  else {
    let lx = x + 1;
    for (const ch of "SOON") {
      const rows = LETTERS[ch];
      for (let r = 0; r < 5; r++) for (let k = 0; k < 3; k++) if (rows[r][k] === "1") P.fill(ctx, lx + k, top + 2 + r, 1, 1, "#ffd34d");
      lx += 4;
    }
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
  P.fill(ctx, x + 4, top + 20, 2, 2, "#e8e8e8");
  P.fill(ctx, x + 9, top + 20, 2, 2, pub ? "#ff4d4d" : "#666");
  P.fill(ctx, x + 12, top + 20, 2, 2, pub ? "#4dd0ff" : "#666");
}

function createVaultWorld() {
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
  for (const s of slots()) solid[s.y][s.x] = true;
  world.parts = [scene];
  return world;
}

/** Parts of the vault map itself. */
const scene = {
  id: "vaultmap",
  labels(town) {
    const ss = slots();
    const out = CABS.map((c, i) => ({
      kind: "cabinet",
      x: ss[i].x * 16 + 8,
      y: ss[i].y * 16 + 18,
      text: trunc(c.title || "", TITLE_MAX),
      accent: c.status === "published" ? (c.colors || [])[1] || "#ffd34d" : "#8a8a96",
      bg: "rgba(20,16,6,0.9)",
    }));
    out.push({ kind: "sign", x: (EXIT.x + 1.5) * 16, y: (EXIT.y - 0.6) * 16, text: "Exit to castle", accent: "#ffd34d", bg: "rgba(40,30,8,0.92)" });
    return out;
  },
  hit(town, wx, wy, ui) {
    if (wx >= EXIT.x * 16 && wx <= (EXIT.x + EXIT.w) * 16 && wy >= (EXIT.y - 1.2) * 16 && wy <= VH * 16) {
      ui.leaveVault();
      return true;
    }
    const ss = slots();
    for (let i = 0; i < CABS.length; i++) {
      const s = ss[i];
      if (wx < s.x * 16 - 4 || wx > s.x * 16 + 20 || wy < s.y * 16 - 14 || wy > s.y * 16 + 26) continue;
      const url = urlFor(CABS[i]);
      if (!url) return true; // coming soon: no click, but the tap is consumed
      town.extras.vaultLit = i;
      town.extras.vaultLitUntil = performance.now() + 500;
      const dbg = (window.AgentTown.debug = window.AgentTown.debug || {});
      (dbg.vaultOpens = dbg.vaultOpens || []).push(url);
      window.open(url, "_blank", "noopener");
      return true;
    }
    return false;
  },
  drawStatic(ctx, world, P) {
    const T = P.TILE;
    const r = RESERVED;
    for (let x = r.x * T; x < (r.x + r.w) * T; x += 4) {
      P.fill(ctx, x, r.y * T, 2, 1, "#c9a23a");
      P.fill(ctx, x, (r.y + r.h) * T - 1, 2, 1, "#c9a23a");
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
    for (const [x, y] of [[1, 1], [VW - 2, 1], [1, 20], [VW - 2, 20]]) {
      P.fill(ctx, x * T + 2, y * T + 8, 12, 6, "#c9a23a");
      P.fill(ctx, x * T + 4, y * T + 5, 8, 4, "#ffd34d");
    }
  },
  drawUnder(ctx, town, world, now, P) {
    const ss = slots();
    const lit = town.extras && town.extras.vaultLit;
    for (let i = 0; i < ss.length; i++) drawCabinet(ctx, P, CABS[i], ss[i], now, lit === i && now < (town.extras.vaultLitUntil || 0));
  },
};

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
    if (wx < d.x * 16 - 6 || wx > (d.x + d.w) * 16 + 6 || wy < d.y * 16 - 14 || wy > (d.y + 2) * 16) return false;
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
part.enter = enter;
window.AgentTown.vault = part;
})();
