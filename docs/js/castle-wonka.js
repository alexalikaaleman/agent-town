/* Agent Town castle: the Wonkavator controller (W2: parked, walk to it, door open, step in, door close, step out).
 * One global car. Timing comes from performance.now() deltas read every frame (tick), never from setTimeout chains,
 * so throttled or hidden tabs cannot stretch or replay frames. Later steps add the menu (W3) and the trip (W4). */
(function () {
"use strict";
const AT = (window.AgentTown = window.AgentTown || {});
const CAR = { x: 38, y: 9, w: 3, h: 3, apron: { x: 39, y: 13 }, cabin: { x: 39, y: 12 }, anchor: [632, 208] };
const WALK_GIVE_UP_MS = 15000; // same as the vault cabinet walk (castle-vault.js)
const STEP_MS = Math.round(1000 / 7); // one tile at Bus Ninja's 7 tiles/s
// W3: the destination menu (design §4). Data, so the no-dead-end test can walk it. The current room is absent.
const MENU = { vault: ["gallery", "music", "etsy", "back"], gallery: ["music", "etsy", "vault", "back"], music: ["gallery", "etsy", "vault", "back"] };
const LABELS = { gallery: "Art Gallery", music: "Music Gallery", etsy: "Etsy Shop", vault: "Treasure Vault", back: "Back" };
const ETSY_URL = ""; // filled only from Alex later; while empty the Etsy item is gray, "coming soon" and inert (fix 39 rule)
const W = { room: "vault", state: "S0", t0: 0, token: 0, cancelPending: false, from: null, legs: null, closeCol: 5, glintAt: 0, ui: null };
const LOAD_MS = 700; // the puff length (castle-vault PUFF_MS)
const dbg = () => {
  const d = (AT.debug = AT.debug || {});
  if (!d.wonka) d.wonka = { log: [], ignoredTaps: 0, inertTaps: 0 };
  return d.wonka;
};
function anim(name) {
  return (AT.WONKA_ANIM && AT.WONKA_ANIM.rows[name]) || { row: name === "open" ? 1 : name === "close" ? 2 : 0, ms: 80 };
}
function rm() {
  return typeof AT.reducedMotion === "function" ? !!AT.reducedMotion() : false;
}
function go(state, now) {
  W.state = state;
  W.t0 = now == null ? performance.now() : now;
  dbg().log.push({ s: state, t: Math.round(W.t0) });
}
function ninja() {
  const vw = AT.vault && (AT.vault.roomWorld ? AT.vault.roomWorld(W.room) : AT.vault.world());
  return vw ? vw.busNinja : null;
}
/** Release the camera and go back to S0 (same room). */
function park(now) {
  W.legs = null;
  W.cancelPending = false;
  go("S0", now);
  W.glintAt = (now || performance.now()) + 6000 + Math.random() * 3000;
  if (W.ui && W.ui.camRelease) W.ui.camRelease();
}

/** Tap on the car, its label, or the phone "Wonkavator ->" button. */
function tap(town, ui) {
  const d = dbg();
  if (ui) W.ui = ui;
  if (W.state !== "S0" || (AT.vault && AT.vault.launching && AT.vault.launching())) {
    d.ignoredTaps++;
    return false;
  }
  const nin = ninja();
  if (!nin || !nin.goTo) return false;
  const me = ++W.token;
  go("S1");
  if (W.ui && W.ui.stopFollow) W.ui.stopFollow();
  if (W.ui && W.ui.tourStop) W.ui.tourStop();
  // the agreed L-path: (25,22), along y22 to (39,22), up x39 through the rope gap to the apron (39,13)
  W.legs = W.room === "vault" ? [[25, 22], [39, 22], [CAR.apron.x, CAR.apron.y]] : [[CAR.apron.x, CAR.apron.y]];
  const t0 = performance.now();
  const next = () => {
    if (me !== W.token || W.state !== "S1") return;
    const leg = W.legs && W.legs.shift();
    if (!leg) {
      nin.mode = "stand";
      nin.facing = "n";
      go("S2");
      return;
    }
    if (Math.hypot(nin.x - leg[0], nin.y - leg[1]) < 0.05) return next();
    if (!nin.goTo(leg[0], leg[1], next)) {
      // no floor path: he stops and does not board
      nin.mode = "stand";
      nin.done = null;
      d.noPath = (d.noPath || 0) + 1;
      park();
    }
  };
  next();
  setTimeout(() => {
    if (me !== W.token || W.state !== "S1") return;
    d.giveUps = (d.giveUps || 0) + 1;
    if (performance.now() - t0 >= WALK_GIVE_UP_MS - 50) {
      nin.mode = "stand";
      nin.done = null;
      park();
    }
  }, WALK_GIVE_UP_MS);
  return true;
}

/** Cancel the boarding walk (a cabinet tap wins in S1). Returns true when it was cancelled. */
function cancelWalk() {
  if (W.state !== "S1") return false;
  W.token++;
  const nin = ninja();
  if (nin) {
    nin.done = null;
    nin.path = [];
    nin.mode = "stand";
  }
  park();
  return true;
}

/** S5: "Where do you wanna go?" in the fix-40 confirm box (stacked buttons, focus trap, Esc/outside = Back). */
function openMenu() {
  const d = dbg();
  const box = AT.confirmBox;
  const me = W.token;
  const items = MENU[W.room] || MENU.vault;
  d.menu = items.slice();
  if (!box) {
    go("S9");
    return;
  }
  box.open({
    title: "Where do you wanna go?",
    menu: true,
    buttons: items.map((id) => (id === "etsy" && !ETSY_URL ? { id, text: LABELS[id], sub: "coming soon", inert: true } : { id, text: LABELS[id] })),
    cancelId: "back",
    onInert() {
      d.inertTaps++;
    },
    onChoose(id) {
      if (me !== W.token || W.state !== "S5") return;
      (d.choices = d.choices || []).push(id == null ? "back" : id);
      // Back (or Esc / a tap outside) = Cancel: the door opens and he steps out (S9).
      if (MENU[W.room].includes(id) && id !== "back" && id !== "etsy" && id !== W.room) return startTrip(id);
      W.closeCol = 5;
      go("S9");
    },
  });
}

/** S6: the trip to another room (core travel; the scene switch is the same setScene fade as the vault door). */
function startTrip(target) {
  W.target = target;
  const nin = ninja();
  if (nin) nin.hidden = true;
  go("S6");
}
function switched() {
  W.room = W.target;
  W.switching = false;
  const nin = ninja();
  if (nin) {
    nin.path = [];
    nin.done = null;
    nin.mode = "stand";
    nin.facing = "s";
    nin.x = CAR.cabin.x;
    nin.y = CAR.cabin.y;
    nin.hidden = true;
    nin.puff = 0;
  }
  go("S10"); // landing (row 4) in the new room; the camera is already still on the car
}

/** Esc or Back while boarding: S1 cancels the walk; S2-S3 set cancelPending; S4 reverses the closing door now. */
function cancel() {
  if (W.state === "S1") return cancelWalk();
  if (W.state === "S2" || W.state === "S3") {
    W.cancelPending = true;
    return true;
  }
  if (W.state === "S4") {
    W.closeCol = Math.min(5, Math.floor((performance.now() - W.t0) / anim("close").ms));
    go("S9");
    return true;
  }
  return false;
}

/** Scene left (Exit / Back to castle) mid-job: drop it, no errors, S0. */
function reset() {
  if (W.state === "S0" || W.state === "S8") return; // S8 is our own scene switch
  W.token++;
  if (W.state === "S5" && AT.confirmBox && AT.confirmBox.isOpen()) AT.confirmBox.close(null);
  const nin = ninja();
  if (nin) {
    nin.done = null;
    nin.path = [];
    nin.hidden = false;
    nin.mode = "stand";
    if (W.state !== "S1") {
      nin.x = CAR.apron.x;
      nin.y = CAR.apron.y;
      nin.facing = "s";
    }
  }
  park();
}

function moveNinja(nin, fromY, toY, p) {
  nin.x = CAR.apron.x;
  nin.y = fromY + (toY - fromY) * Math.min(1, p);
}

/** Advance the state machine; called once per frame by the vault scene. */
function tick(now) {
  const nin = ninja();
  const el = now - W.t0;
  const open = anim("open").ms * 6;
  const close = anim("close").ms * 6;
  switch (W.state) {
    case "S2":
      if (el >= open) go("S3", W.t0 + open);
      break;
    case "S3":
      if (nin) {
        nin.mode = "stand";
        nin.facing = "n";
        moveNinja(nin, CAR.apron.y, CAR.cabin.y, el / STEP_MS);
      }
      if (el >= STEP_MS) go("S4", W.t0 + STEP_MS);
      break;
    case "S4":
      if (el >= close) {
        W.closeCol = 5;
        if (W.cancelPending) {
          // Esc/Back during S2-S3: the menu never shows; the door reopens and he steps out
          W.cancelPending = false;
          go("S9", W.t0 + close);
        } else {
          go("S5", W.t0 + close);
          openMenu();
        }
      }
      break;
    case "S6":
      if (el >= anim("takeoff").ms * 6) {
        // tonight's trip: no portal/swallow rows; a short load screen = the smoke puff + the scene fade
        if (nin) {
          nin.x = CAR.cabin.x;
          nin.y = CAR.cabin.y;
          nin.puff = now + LOAD_MS;
        }
        go("S7", W.t0 + anim("takeoff").ms * 6);
      }
      break;
    case "S7":
      if (el >= LOAD_MS - 150) {
        go("S8", now);
        W.switching = true;
        if (W.ui && W.ui.switchTo) W.ui.switchTo(W.target, switched);
        else switched();
      }
      break;
    case "S8":
      // safety: the switch never arrived (no UI); land anyway after 4 s
      if (el >= 4000 && W.switching) switched();
      break;
    case "S10":
      if (el >= anim("landing").ms * 6) {
        if (nin) {
          nin.hidden = false;
          nin.x = CAR.cabin.x;
          nin.y = CAR.cabin.y;
          nin.facing = "s";
        }
        go("S11", W.t0 + anim("landing").ms * 6);
      }
      break;
    case "S11":
      if (el >= open) go("S12a", W.t0 + open);
      break;
    case "S12a":
      if (nin) {
        nin.facing = "s";
        moveNinja(nin, CAR.cabin.y, CAR.apron.y, el / STEP_MS);
      }
      if (el >= STEP_MS) go("S12b", W.t0 + STEP_MS);
      break;
    case "S12b":
      if (el >= close) park(W.t0 + close);
      break;
    case "S9": {
      // row 1 from col (5 - current close frame): a half-closed door reverses
      const from = 5 - W.closeCol;
      const dur = (6 - from) * anim("open").ms;
      if (el >= dur) go("S9b", W.t0 + dur);
      break;
    }
    case "S9b":
      if (nin) {
        nin.facing = "s";
        moveNinja(nin, CAR.cabin.y, CAR.apron.y, el / STEP_MS);
      }
      if (el >= STEP_MS) go("S9c", W.t0 + STEP_MS);
      break;
    case "S9c":
      if (el >= close) {
        park(W.t0 + close);
        if (nin && nin.goHome && W.room === "vault") nin.goHome();
      }
      break;
    default:
      break;
  }
}

/** The sheet frame to draw now: {anim, row, col, t}. */
function frame(now) {
  const el = now - W.t0;
  const still = rm();
  const pick = (name, from) => {
    const a = anim(name);
    const col = still ? 5 : Math.min(5, (from || 0) + Math.floor(el / a.ms));
    return { anim: name, row: a.row, col, t: col / 5 };
  };
  switch (W.state) {
    case "S2":
      return pick("open");
    case "S3":
      return { anim: "open", row: anim("open").row, col: 5, t: 1 };
    case "S4":
      return pick("close");
    case "S9":
      return pick("open", 5 - W.closeCol);
    case "S6":
      return Object.assign(pick("takeoff"), { trip: true });
    case "S7":
    case "S8":
      return { anim: "takeoff", row: anim("takeoff").row, col: 5, t: 1, trip: true };
    case "S10":
      return Object.assign(pick("landing"), { trip: true });
    case "S11":
      return pick("open");
    case "S12a":
      return { anim: "open", row: anim("open").row, col: 5, t: 1 };
    case "S12b":
      return pick("close");
    case "S9b":
      return { anim: "open", row: anim("open").row, col: 5, t: 1 };
    case "S9c":
      return pick("close");
    default: {
      // S0/S1 parked: row 0 col 0; a glint (cols 1-4) every 6-9 s, none under reduced motion
      const idle = anim("idle");
      if (!still && W.state === "S0" && W.glintAt && now >= W.glintAt) {
        const g = Math.floor((now - W.glintAt) / idle.ms);
        if (g < 4) return { anim: "idle", row: idle.row, col: 1 + g, t: 0 };
        W.glintAt = now + 6000 + Math.random() * 3000;
      }
      if (!W.glintAt) W.glintAt = now + 6000 + Math.random() * 3000;
      return { anim: "idle", row: idle.row, col: 0, t: 0 };
    }
  }
}

/** Camera target while locked: the ninja in S1, the cabin centre afterwards. null when unlocked. */
function camTarget() {
  if (W.state === "S0") return null;
  if (["S6", "S7", "S8", "S10"].includes(W.state)) return { x: 632, y: 120 };
  if (W.state === "S1") {
    const nin = ninja();
    if (nin) return { x: nin.x * 16 + 8, y: nin.y * 16 + 8 };
  }
  return { x: 632, y: 176 };
}

AT.wonka = {
  CAR,
  tap,
  tick,
  frame,
  reset,
  cancelWalk,
  cancel,
  MENU,
  LABELS,
  camTarget,
  busy: () => W.state !== "S0",
  locked: () => W.state !== "S0",
  state: () => W.state,
  /** Ninja is inside the car (S3 end through S9 start): drawn behind the glass. */
  inside: () => ["S4", "S5", "S9", "S11"].includes(W.state) || (W.state === "S12a" && performance.now() - W.t0 < STEP_MS / 2) || (W.state === "S3" && performance.now() - W.t0 >= STEP_MS / 2) || (W.state === "S9b" && performance.now() - W.t0 < STEP_MS / 2),
  hideLabel: () => ["S6", "S7", "S8", "S10"].includes(W.state),
  room: () => W.room,
};
dbg();
})();
