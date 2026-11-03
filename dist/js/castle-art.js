/* Agent Town castle: art loader, Wonkavator animation table, flash timer and code safety net (Wonkavator W1). */
(function () {
"use strict";
const AT = (window.AgentTown = window.AgentTown || {});

/** Wonkavator sheet: 6x6 frames of 192x256 (48x64 at 1x), anchor bottom-centre. Timings live only here. */
const WONKA_ANIM = {
  FRAME_W: 192,
  FRAME_H: 256,
  COLS: 6,
  ANCHOR: [96, 256],
  rows: {
    idle: { row: 0, ms: 150 },
    open: { row: 1, ms: 80 },
    close: { row: 2, ms: 80 },
    takeoff: { row: 3, ms: 80 },
    swallow: { row: 5, ms: 80 },
    landing: { row: 4, ms: 80 },
  },
  TRIP: ["takeoff", "swallow", "switch", "landing"],
  SWITCH_MS: 620,
  HOLD_MAX_MS: 160,
  SWITCH_EXTRA_MAX_MS: 400,
};

const state = { list: null, listP: null, entries: new Map(), fallbackDraws: 0 };

function buildParam() {
  const m = document.querySelector('meta[name="build"]');
  const v = m && m.getAttribute("content");
  return v && v !== "dev" ? "?v=" + encodeURIComponent(v) : "";
}
function blocked(name) {
  const list = (AT.debug && AT.debug.artBlock) || AT.artBlock || [];
  return Array.isArray(list) && list.indexOf(name) >= 0;
}
function loadList() {
  if (!state.listP) {
    state.listP = fetch("data/art.json" + buildParam())
      .then((r) => (r.ok ? r.json() : { art: [] }))
      .catch(() => ({ art: [] }))
      .then((j) => {
        state.list = {};
        for (const a of j.art || []) state.list[a.name] = a;
        return state.list;
      });
  }
  return state.listP;
}
/** Texels per world pixel worth keeping: k = min(4, ceil(maxZoom x dpr)); maxZoom = shorter side / 64. */
function keepScale() {
  const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  const mz = Math.min(window.innerWidth || 1024, window.innerHeight || 768) / 64;
  return Math.max(1, Math.min(4, Math.ceil(mz * dpr)));
}
async function downscale(img, w, h) {
  const k = keepScale();
  // Small sheets (under 1 MP) and k = 4 keep the decoded image as is.
  if (k >= 4 || w * h < 1e6) return { bitmap: img, scale: 1 };
  const rw = Math.round((w * k) / 4), rh = Math.round((h * k) / 4);
  try {
    if (window.createImageBitmap) return { bitmap: await createImageBitmap(img, { resizeWidth: rw, resizeHeight: rh, resizeQuality: "high" }), scale: k / 4 };
  } catch (e) { /* canvas below */ }
  const c = document.createElement("canvas");
  c.width = rw; c.height = rh;
  const x = c.getContext("2d");
  x.imageSmoothingQuality = "high";
  x.drawImage(img, 0, 0, rw, rh);
  return { bitmap: c, scale: k / 4 };
}
/** Decode src and check the exact size. Never throws; a failure gives ok false (the code safety net draws). */
async function probe(e, src, w, h) {
  try {
    const img = new Image();
    img.src = src;
    await img.decode();
    e.natural = [img.naturalWidth, img.naturalHeight];
    if (img.naturalWidth === w && img.naturalHeight === h) {
      const d = await downscale(img, w, h);
      e.bitmap = d.bitmap; e.scale = d.scale; e.img = img; e.ok = true; e.state = "ok";
      if (e.flash !== false && e.name === "wonkavator") e.flashes = flashTimer(img);
    } else if (e.name === "wonkavator" && img.naturalWidth === w && img.naturalHeight === 768) {
      // the old 3-row sheet: rows 0-2 usable, rows 3-5 from code; still ok false
      e.img = img; e.bitmap = img; e.scale = 1; e.rows = 3; e.state = "wrong-size";
    } else e.state = "wrong-size";
  } catch (err) {
    e.state = "fail";
  }
  return e;
}
function entry(name) {
  return { name, ok: false, state: "loading", bitmap: null, img: null, scale: 1, rows: 0, natural: null, flashes: null };
}
/** AgentTown.art.get(name) -> {bitmap, ok, ...}; loads on first call, ok turns true once decoded at the exact size. */
function get(name) {
  if (blocked(name)) return { name, ok: false, state: "blocked", bitmap: null, img: null, scale: 1, rows: 0 };
  let e = state.entries.get(name);
  if (e) return e;
  e = entry(name);
  state.entries.set(name, e);
  e.ready = loadList().then((list) => {
    const a = list[name];
    if (!a) { e.state = "missing"; return e; }
    e.frameH = a.frameH || null; e.anchorY = a.anchorY || null;
    return probe(e, "art/" + a.file + buildParam(), a.w, a.h);
  });
  return e;
}
/** Test hook: probe any URL against an expected size (no cache). */
function load(name, src, w, h) {
  if (blocked(name)) return Promise.resolve({ name, ok: false, state: "blocked" });
  const e = entry(name);
  e.flash = false;
  return probe(e, src, w, h);
}

// ---------- flash timer (WCAG 2.3.1: at most 3 flashes in any 1 s), timing only, art untouched ----------
function relLum(r, g, b) {
  const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
/** Mean relative luminance of each frame of rows 3, 5, 4 at 1x (alpha-weighted over black). */
function frameLums(src) {
  const A = WONKA_ANIM;
  const sw = (src.naturalWidth || src.width) / (A.FRAME_W * A.COLS);
  const c = document.createElement("canvas");
  c.width = 48; c.height = 64;
  const x = c.getContext("2d", { willReadFrequently: true });
  const out = {};
  for (const key of ["takeoff", "swallow", "landing"]) {
    const row = A.rows[key].row;
    out[key] = [];
    for (let col = 0; col < A.COLS; col++) {
      x.clearRect(0, 0, 48, 64);
      x.drawImage(src, col * A.FRAME_W * sw, row * A.FRAME_H * sw, A.FRAME_W * sw, A.FRAME_H * sw, 0, 0, 48, 64);
      const d = x.getImageData(0, 0, 48, 64).data;
      let s = 0;
      for (let i = 0; i < d.length; i += 4) s += relLum(d[i], d[i + 1], d[i + 2]) * (d[i + 3] / 255);
      out[key].push(s / (d.length / 4));
    }
  }
  return out;
}
/** Flashes on a timeline: a pair of opposite luminance changes of >= 0.1 where the darker side is < 0.8. */
function flashTimes(frames) {
  const tr = [];
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1].lum, b = frames[i].lum;
    if (Math.abs(b - a) >= 0.1 && Math.min(a, b) < 0.8) tr.push({ t: frames[i].t, i, sign: Math.sign(b - a) });
  }
  const fl = [];
  for (let j = 1; j < tr.length; j++) if (tr[j].sign !== tr[j - 1].sign) { fl.push({ t: tr[j].t, i: tr[j].i, peak: tr[j - 1].i }); j++; }
  return fl;
}
function timeline(lums, dur, gap) {
  const frames = [];
  let t = 0, k = 0;
  for (const key of ["takeoff", "swallow", "switch", "landing"]) {
    if (key === "switch") { t += WONKA_ANIM.SWITCH_MS + gap; continue; }
    for (let col = 0; col < WONKA_ANIM.COLS; col++) { frames.push({ key, col, t, ms: dur[k], lum: lums[key][col] }); t += dur[k]; k++; }
  }
  return { frames, total: t };
}
function worstWindow(fl) {
  let worst = { n: 0, at: 0 };
  for (const f of fl) {
    const n = fl.filter((g) => g.t >= f.t && g.t < f.t + 1000).length;
    if (n > worst.n) worst = { n, at: f.t };
  }
  return worst;
}
/** Measure rows 3/5/4 and, if needed, hold frames longer or widen the switch gap so no 1 s window has more than 3 flashes. */
function flashTimer(src, lumsIn) {
  const lums = lumsIn || frameLums(src);
  const base = WONKA_ANIM.rows;
  const dur = [].concat(Array(6).fill(base.takeoff.ms), Array(6).fill(base.swallow.ms), Array(6).fill(base.landing.ms));
  let gap = 0;
  const holds = [];
  for (let guard = 0; guard < 400; guard++) {
    const tl = timeline(lums, dur, gap);
    const fl = flashTimes(tl.frames);
    const w = worstWindow(fl);
    if (w.n <= 3) return { ok: true, maxPerWindow: w.n, flashes: fl.length, durations: dur.slice(), gapExtra: gap, holds, frames: tl.frames.length, total: tl.total, lums };
    const inWin = fl.filter((g) => g.t >= w.at && g.t < w.at + 1000);
    const spansGap = inWin.some((g) => g.i < 12) && inWin.some((g) => g.i >= 12);
    if (spansGap && gap < WONKA_ANIM.SWITCH_EXTRA_MAX_MS) { gap += 50; holds.push("gap+50"); continue; }
    let held = false;
    for (const g of inWin) {
      const f = Math.min(dur.length - 1, g.peak); // the frame after the change into the peak
      if (dur[f] < WONKA_ANIM.HOLD_MAX_MS) { dur[f] += 10; holds.push("f" + f + "+10"); held = true; break; }
    }
    if (!held) {
      for (let f = 0; f < dur.length && !held; f++) if (dur[f] < WONKA_ANIM.HOLD_MAX_MS) { dur[f] += 10; holds.push("f" + f + "+10"); held = true; }
      if (!held && gap < WONKA_ANIM.SWITCH_EXTRA_MAX_MS) { gap += 50; holds.push("gap+50"); held = true; }
    }
    if (!held) break;
  }
  const tl = timeline(lums, dur, gap);
  const w = worstWindow(flashTimes(tl.frames));
  return { ok: w.n <= 3, maxPerWindow: w.n, durations: dur.slice(), gapExtra: gap, holds, frames: tl.frames.length, total: tl.total, lums };
}

// ---------- code safety net (art missing): no text, no flashes ----------
/** drawWonkaCode(ctx, P, st, k): st = {anim, t (0..1), x, y (world anchor bottom-centre)}; k = door slide px. */
function drawWonkaCode(ctx, P, st, k) {
  state.fallbackDraws++;
  const ax = st.x == null ? 632 : st.x, ay = st.y == null ? 208 : st.y;
  const t = Math.max(0, Math.min(1, st.t || 0));
  const anim = st.anim || "idle";
  let lift = 0, alpha = 1, ring = 0;
  if (anim === "takeoff") {
    lift = t < 0.3 ? 0 : t < 0.8 ? ((t - 0.3) / 0.5) * 24 : 24 + ((t - 0.8) / 0.2) * 16;
    ring = t < 0.6 ? 0 : (t - 0.6) / 0.4;
  } else if (anim === "swallow") { lift = 40; alpha = 1 - t; ring = 1 - t; }
  else if (anim === "landing") { ring = t < 0.2 ? t / 0.2 : t > 0.85 ? (1 - t) / 0.15 : 1; lift = t < 0.8 ? (1 - t / 0.8) * 40 : 0; }
  const jitter = anim === "takeoff" && t < 0.3 ? (Math.floor(t * 40) % 2 ? 1 : -1) : 0;
  const x0 = Math.round(ax - 24 + jitter), y0 = Math.round(ay - 64 - lift);
  ctx.save();
  if (ring > 0) {
    ctx.strokeStyle = "#9b7bff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    // the portal ring rides with the lift: 48 px above the car top (at full lift that is the old fixed y 56)
    ctx.arc(ax, y0 - 48, Math.max(0.5, 22 * ring), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = alpha;
  P.fill(ctx, x0, y0, 48, 64, "#7f5719");
  P.fill(ctx, x0 + 2, y0 + 2, 44, 60, "#c9a23a");
  // roof crest: a pixel "W" (no text)
  for (const [dx, dy] of [[18, 4], [19, 5], [20, 6], [21, 5], [22, 4], [23, 5], [24, 6], [25, 5], [26, 4], [27, 5], [28, 6], [29, 5], [30, 4]]) P.fill(ctx, x0 + dx, y0 + dy, 1, 1, "#7f5719");
  P.fill(ctx, x0 + 6, y0 + 12, 36, 34, "#1a1410");
  P.fill(ctx, x0 + 6, y0 + 12, 36, 34, "rgba(160,220,255,0.45)");
  const open = anim === "open" ? t : anim === "close" ? 1 - t : 0;
  const slide = Math.round(open * (k || 16));
  P.fill(ctx, x0 + 10 - slide, y0 + 46, 14, 16, "#7f5719");
  P.fill(ctx, x0 + 24 + slide, y0 + 46, 14, 16, "#7f5719");
  if (anim === "takeoff" && t >= 0.3) for (let i = 0; i < 3; i++) P.fill(ctx, x0 + 12 + i * 10, y0 + 64, 4, 3 + ((i + Math.floor(t * 20)) % 3), "#ff8a2a");
  if (anim === "landing" && t >= 0.8) for (let i = 0; i < 3; i++) P.fill(ctx, x0 - 4 + i * 22, ay - 3, 8, 3, "#b8a58a");
  ctx.restore();
}

AT.WONKA_ANIM = WONKA_ANIM;
AT.art = {
  get,
  load,
  list: () => loadList(),
  flashTimer,
  frameLums,
  drawWonkaCode,
  WONKA_ANIM,
  get fallbackDraws() { return state.fallbackDraws; },
  countFallback() { state.fallbackDraws++; },
};
})();
