/** Castle part: TREASURE VAULT behind the throne, through a big door.
 *  Left half: 25 arcade cabinets (5 x 5) from data/cabinets.json. The right half is empty and
 *  reserved. Published cabinets link to https://<name>.grok.me: a tap sends Bus Ninja walking to
 *  the cabinet, a smoke-bomb puff plays, then the game opens in a new tab. Coming-soon cabinets have
 *  a blank screen, a "SOON" marquee and do nothing on tap. All art is drawn here (no screenshots). */
(function () {
const ROOM = {
  id: "vault", name: "Treasure Vault", x: 16, y: 3, w: 24, h: 12,
  doors: [[27, 14], [28, 14]],
  wall: "#6b5a2a", wallDk: "#3f3416", floor: "#3b3324", floor2: "#352d20", trim: "#ffd34d",
};
const COLS = [18, 20, 22, 24, 26];
const ROWS = [4, 6, 8, 10, 12];
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

const part = {
  id: "vault",
  order: 5,
  cabinets: () => CABS.map((c, i) => Object.assign({ slot: slots()[i], url: urlFor(c) }, c)),
  rooms(world) {
    world.addRoom(ROOM);
    for (const s of slots()) world.block(s.x, s.y);
    load();
  },
  labels(town) {
    const ss = slots();
    return CABS.map((c, i) => ({
      kind: "cabinet",
      x: ss[i].x * 16 + 8,
      y: ss[i].y * 16 + 14,
      text: trunc(c.title || "", TITLE_MAX),
      accent: c.status === "published" ? (c.colors || [])[1] || "#ffd34d" : "#8a8a96",
      bg: "rgba(20,16,6,0.9)",
      minZoom: 2.2,
      avoid: true,
    }));
  },
  hit(town, wx, wy, ui) {
    const ss = slots();
    for (let i = 0; i < CABS.length; i++) {
      const s = ss[i];
      if (wx < s.x * 16 || wx > s.x * 16 + 16 || wy < s.y * 16 - 12 || wy > s.y * 16 + 16) continue;
      const c = CABS[i];
      const url = urlFor(c);
      if (!url) return true; // coming soon: no click, but the tap is consumed so nothing else opens
      launch(town, s, url);
      return true;
    }
    return false;
  },
  drawStatic(ctx, world, P) {
    const T = P.TILE;
    // reserved right half: an empty roped-off floor
    const rx = 29 * T;
    const ry = 4 * T;
    const rw = 9 * T;
    const rh = 9 * T;
    for (let x = rx; x < rx + rw; x += 4) {
      P.fill(ctx, x, ry, 2, 1, "#c9a23a");
      P.fill(ctx, x, ry + rh - 1, 2, 1, "#c9a23a");
    }
    for (let y = ry; y < ry + rh; y += 4) {
      P.fill(ctx, rx, y, 1, 2, "#c9a23a");
      P.fill(ctx, rx + rw - 1, y, 1, 2, "#c9a23a");
    }
    // the big door: heavy gold-banded doors drawn open on the vault's bottom wall
    for (const dx of [26, 29]) {
      P.fill(ctx, dx * T + 2, 14 * T - 6, 12, 22, "#5a3a14");
      P.fill(ctx, dx * T + 2, 14 * T - 2, 12, 2, "#ffd34d");
      P.fill(ctx, dx * T + 2, 14 * T + 8, 12, 2, "#ffd34d");
    }
    // coin piles in the corners
    for (const [x, y] of [[17, 13], [38, 4]]) {
      P.fill(ctx, x * T + 2, y * T + 8, 12, 6, "#c9a23a");
      P.fill(ctx, x * T + 4, y * T + 5, 8, 4, "#ffd34d");
    }
  },
  drawUnder(ctx, town, world, now, P) {
    const ss = slots();
    const lit = town.extras.vaultLit;
    for (let i = 0; i < ss.length; i++) drawCabinet(ctx, P, CABS[i], ss[i], now, lit === i && now < (town.extras.vaultLitUntil || 0));
  },
};

function launch(town, slot, url) {
  const dbg = (window.AgentTown.debug = window.AgentTown.debug || {});
  // Open a blank tab inside the tap itself so the popup blocker allows it, then send it to the game.
  let win = null;
  try {
    win = window.open("about:blank", "_blank");
    if (win) win.opener = null;
  } catch (e) {
    win = null;
  }
  const ss = slots();
  town.extras.vaultLit = ss.findIndex((s) => s.x === slot.x && s.y === slot.y);
  const nin = town.world.busNinja;
  let went = false;
  const go = () => {
    if (went) return;
    went = true;
    const now = performance.now();
    if (nin) nin.puff = now + PUFF_MS;
    town.extras.vaultLitUntil = now + PUFF_MS + 400;
    setTimeout(() => {
      (dbg.vaultOpens = dbg.vaultOpens || []).push(url);
      if (win && !win.closed) win.location.href = url;
      else window.open(url, "_blank", "noopener");
      if (nin) setTimeout(() => nin.goHome(), 900);
    }, PUFF_MS - 100);
  };
  if (nin && nin.goTo) {
    nin.goTo(slot.x + 0.5, slot.y + 1, () => {
      nin.facing = "n";
      go();
    });
    // The new tab usually comes to the front, which pauses this tab's animation frames.
    // A timer (estimated walk time) makes sure the game still loads.
    let len = 0;
    let px = nin.x;
    let py = nin.y;
    for (const q of nin.path) {
      len += Math.hypot(q.x - px, q.y - py);
      px = q.x;
      py = q.y;
    }
    setTimeout(go, (len / 7) * 1000 + 300);
  } else go();
}

window.AgentTown.castleParts.push(part);
window.AgentTown.vault = part;
})();
