#!/usr/bin/env node
"use strict";

/**
 * report.js: one bot writes one status line to the public `status` branch.
 *
 *   node report.js --bot <id> --state <working|done|blocked|needs-alex|idle|sleeping|talking> --text "<=40 chars"
 *                  [--project <name>] [--with id,id] [--needs urgent|question]
 *                  [--handled <needId>] [--usage <pct>] [--list] [--dry-run]
 *   node report.js --bot <id> --ping
 *
 * Reporting: every bot writes a line on start (working), finish (done/idle), blocked and
 * needs-alex, plus a heartbeat ping every 30 minutes. A ping (--ping) keeps the bot's state,
 * text and timestamp exactly as they are and only sets "ping" to now, so the town knows the bot
 * is alive (no "stalled?" tag) without waking a done/idle bot or resetting its 10-minute sleep
 * clock. Pings are not added to the History log.
 *
 * Every write is ONE commit on the `status` branch (never main, so GitHub Pages
 * does not rebuild). The commit changes only this bot's entry in
 * data/status.json, appends one line to data/history-YYYY-MM.jsonl and, when
 * needed, updates data/needs.json. If another bot moved the branch first, the
 * fast-forward update fails (409/422): re-read and retry, up to 3 times, after a
 * short random wait. No queue, no lock, no background timer, no polling loop.
 *
 * Rate guard: mid-task lines (working -> working, working -> blocked) must be
 * at least 6 minutes apart. Start lines (first "working" line), done/idle/sleeping
 * (finish) lines, needs-alex and talking lines always write at once.
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { cleanBubble } = require("./lib/privacy");

const REPO = process.env.AGENT_TOWN_REPO || "alexalikaaleman/agent-town";
const BRANCH = process.env.AGENT_TOWN_BRANCH || "status";
const STATES = ["working", "done", "blocked", "needs-alex", "idle", "sleeping", "talking"];
const GUARD_MS = 6 * 60 * 1000;
const MAX_RETRIES = 3;
const KEEP_HANDLED_MS = 30 * 24 * 60 * 60 * 1000;

class Rejected extends Error {}

function fail(msg, code) {
  console.error("report.js: " + msg);
  process.exit(code || 1);
}

function parseArgs(argv) {
  const out = {};
  const flags = new Set(["list", "dry-run", "help", "ping"]);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) fail("unexpected argument: " + a);
    const key = a.slice(2);
    if (flags.has(key)) out[key] = true;
    else {
      if (i + 1 >= argv.length) fail("missing value for " + a);
      out[key] = argv[++i];
    }
  }
  return out;
}

function loadRoster() {
  const roster = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "bots.json"), "utf8"));
  const map = new Map();
  for (const b of roster) {
    map.set(b.id, b.id);
    for (const alias of b.aliases || []) map.set(alias, b.id);
  }
  return map;
}

/** Month of the Hawaii clock, e.g. 2026-11. */
function monthKey(date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Honolulu", year: "numeric", month: "2-digit" }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t).value;
  return get("year") + "-" + get("month");
}

// ---------- GitHub (via gh api) ----------

function gh(args, input) {
  try {
    return execFileSync("gh", ["api", ...args], {
      input: input == null ? undefined : input,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (err) {
    const text = String(err.stderr || "") + String(err.stdout || "");
    const m = text.match(/HTTP (\d{3})/);
    const e = new Error("gh api " + args.filter((x) => !x.startsWith("-")).slice(-1)[0] + " failed: " + text.trim().split("\n")[0]);
    e.status = m ? Number(m[1]) : 0;
    throw e;
  }
}

function ghJson(method, endpoint, body) {
  const args = ["-X", method, endpoint];
  if (body !== undefined) args.push("--input", "-");
  const out = gh(args, body === undefined ? null : JSON.stringify(body));
  return out.trim() ? JSON.parse(out) : null;
}

function readRaw(file, ref) {
  try {
    return gh(["-H", "Accept: application/vnd.github.raw", "repos/" + REPO + "/contents/" + file + "?ref=" + ref]);
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

function readJsonAt(file, ref, fallback) {
  const text = readRaw(file, ref);
  if (text == null || !text.trim()) return fallback;
  return JSON.parse(text);
}

function headCommit() {
  const ref = ghJson("GET", "repos/" + REPO + "/git/ref/heads/" + BRANCH);
  return ref.object.sha;
}

/** One commit with all changed files, then a fast-forward-only ref update. */
function commitFiles(parentSha, files, message) {
  const parent = ghJson("GET", "repos/" + REPO + "/git/commits/" + parentSha);
  const tree = ghJson("POST", "repos/" + REPO + "/git/trees", {
    base_tree: parent.tree.sha,
    tree: Object.entries(files).map(([p, content]) => ({ path: p, mode: "100644", type: "blob", content })),
  });
  const commit = ghJson("POST", "repos/" + REPO + "/git/commits", { message, tree: tree.sha, parents: [parentSha] });
  ghJson("PATCH", "repos/" + REPO + "/git/refs/heads/" + BRANCH, { sha: commit.sha, force: false });
  return commit.sha;
}

// ---------- privacy ----------

const SECRET_PATTERNS = [
  /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/,
  /(?:drive|docs)\.google\.com/i,
  /\bgh[opsur]_[A-Za-z0-9]{20,}/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/,
  /\bsk-[A-Za-z0-9]{20,}/,
  /\bxox[abpr]-[A-Za-z0-9-]{10,}/,
  /\bAIza[0-9A-Za-z_-]{30,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /password\s*[:=]/i,
];

/** Last check on everything that is about to be pushed to the public branch. */
function assertPublicSafe(files) {
  for (const [name, content] of Object.entries(files)) {
    for (const re of SECRET_PATTERNS) {
      if (re.test(content)) throw new Rejected("refusing to write " + name + ": it looks like it holds private data (" + re.source.slice(0, 24) + ")");
    }
  }
}

// ---------- the change itself ----------

function newNeedId(now) {
  const stamp = now.toISOString().replace(/[-:T]/g, "").slice(0, 12);
  return "n" + stamp + "-" + Math.random().toString(16).slice(2, 6);
}

/**
 * Pure function: given the current files, return the new files (or throw Rejected).
 * Only the reporting bot's entry is touched.
 */
function applyReport(current, req, now) {
  const status = current.status;
  const needs = current.needs;
  const nowIso = now.toISOString();
  const files = {};
  const history = { ts: nowIso, bot: req.bot };
  status.bots = status.bots && typeof status.bots === "object" ? status.bots : {};
  needs.items = Array.isArray(needs.items) ? needs.items : [];
  let touchedStatus = false;
  let touchedNeeds = false;
  const prev = status.bots[req.bot] || null;

  if (req.state) {
    const prevTs = prev && prev.ts ? Date.parse(prev.ts) : 0;
    const wasWorking = prev && prev.state === "working";
    const midTask = wasWorking && (req.state === "working" || req.state === "blocked");
    if (midTask && now.getTime() - prevTs < GUARD_MS) {
      const waitMin = Math.ceil((GUARD_MS - (now.getTime() - prevTs)) / 60000);
      throw new Rejected(
        "rate guard: mid-task lines for " + req.bot + " must be 6 minutes apart. Last line was " +
          Math.floor((now.getTime() - prevTs) / 60000) + " min ago; try again in about " + waitMin +
          " min. (Start, done, idle, sleeping and needs-alex lines always write.)"
      );
    }
    const entry = {
      state: req.state,
      text: req.text,
      project: req.project || null,
      with: req.with,
      needs: null,
      ts: nowIso,
      since: req.state === "working" && wasWorking && prev.since ? prev.since : nowIso,
    };
    if (req.state === "needs-alex") {
      const item = { id: newNeedId(now), bot: req.bot, kind: req.needs || "question", text: req.text, project: req.project || null, ts: nowIso, handled: false, handledAt: null };
      needs.items.push(item);
      entry.needs = { id: item.id, kind: item.kind };
      history.needId = item.id;
      touchedNeeds = true;
    } else if (prev && prev.needs) {
      // A still-open need stays visible on the bot until it is marked handled.
      const open = needs.items.find((n) => n.id === prev.needs.id && !n.handled);
      if (open) entry.needs = prev.needs;
    }
    status.bots[req.bot] = entry;
    Object.assign(history, { state: entry.state, text: entry.text });
    if (entry.project) history.project = entry.project;
    if (entry.with.length) history.with = entry.with;
    if (req.needs) history.needs = req.needs;
    touchedStatus = true;
  }

  if (req.ping) {
    if (!prev) throw new Rejected("ping: " + req.bot + " has no status line yet; post a start line (--state working) first");
    status.bots[req.bot] = Object.assign({}, prev, { ping: nowIso });
    touchedStatus = true;
  }

  if (req.handled) {
    const item = needs.items.find((n) => n.id === req.handled);
    if (!item) throw new Rejected("no need with id " + req.handled);
    if (item.bot !== req.bot) throw new Rejected("need " + req.handled + " belongs to " + item.bot + "; only that bot can mark it handled");
    if (item.handled) throw new Rejected("need " + req.handled + " is already handled");
    item.handled = true;
    item.handledAt = nowIso;
    touchedNeeds = true;
    const entry = status.bots[req.bot];
    if (entry && entry.needs && entry.needs.id === req.handled) {
      entry.needs = null;
      touchedStatus = true;
    }
    history.handled = req.handled;
  }

  if (req.usage != null) {
    status.usage = Object.assign({}, status.usage, { weeklyPct: req.usage, ts: nowIso });
    history.usage = req.usage;
    touchedStatus = true;
  }

  if (touchedNeeds) {
    const cutoff = now.getTime() - KEEP_HANDLED_MS;
    needs.items = needs.items.filter((n) => !n.handled || Date.parse(n.handledAt || n.ts) >= cutoff);
    needs.updatedAt = nowIso;
    files["data/needs.json"] = JSON.stringify(needs, null, 2) + "\n";
  }
  if (touchedStatus) {
    status.updatedAt = nowIso;
    files["data/status.json"] = JSON.stringify(status, null, 2) + "\n";
  }
  const histName = "data/history-" + monthKey(now) + ".jsonl";
  // A ping alone is a heartbeat, not an event: it does not go into History.
  if (!(req.ping && !req.state && !req.handled && req.usage == null)) files[histName] = (current.history[histName] || "") + JSON.stringify(history) + "\n";
  return files;
}

function readCurrent(sha, now) {
  const histName = "data/history-" + monthKey(now) + ".jsonl";
  return {
    status: readJsonAt("data/status.json", sha, { version: 1, updatedAt: null, usage: { weeklyPct: null, ts: null }, bots: {} }),
    needs: readJsonAt("data/needs.json", sha, { version: 1, updatedAt: null, items: [] }),
    history: { [histName]: readRaw(histName, sha) || "" },
  };
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function buildRequest(args, aliases) {
  const req = {};
  const botArg = String(args.bot || "").trim();
  if (!botArg) fail("--bot <id> is required");
  req.bot = aliases.get(botArg);
  if (!req.bot) fail("unknown bot id: " + botArg + " (see data/bots.json)");

  if (args.needs != null) {
    if (!["urgent", "question"].includes(args.needs)) fail("--needs must be urgent or question");
    req.needs = args.needs;
    if (args.state == null) args.state = "needs-alex";
    if (args.state !== "needs-alex") fail("--needs goes with --state needs-alex");
  }
  if (args.state != null) {
    if (!STATES.includes(args.state)) fail("--state must be one of " + STATES.join(", "));
    req.state = args.state;
    const rawText = String(args.text == null ? "" : args.text);
    req.text = cleanBubble(rawText);
    if (Array.from(rawText.trim()).length > 40) console.warn("report.js: text is over 40 characters; it was cut to: " + req.text);
    if (!req.text && ["working", "blocked", "needs-alex"].includes(req.state)) fail("--text is required for state " + req.state + " (after the privacy filter it was empty)");
    if (req.state === "talking" && req.text == null) req.text = "";
    req.project = args.project ? cleanBubble(args.project, 24) : null;
    req.with = [];
    for (const id of String(args.with || "").split(",").map((s) => s.trim()).filter(Boolean)) {
      const real = aliases.get(id);
      if (!real) console.warn("report.js: --with ignores unknown bot " + id);
      else if (real !== req.bot && !req.with.includes(real)) req.with.push(real);
    }
    req.with = req.with.slice(0, 8);
  } else if (args.text != null || args.project != null || args.with != null) {
    fail("--text, --project and --with need --state");
  }
  if (args.handled != null) req.handled = String(args.handled).trim();
  if (args.usage != null) {
    const pct = Number(String(args.usage).replace(/%$/, ""));
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) fail("--usage must be a number from 0 to 100");
    req.usage = Math.round(pct * 10) / 10;
  }
  if (args.ping) {
    if (args.state != null) fail("--ping goes alone (it keeps the current state)");
    req.ping = true;
  }
  if (!req.state && !req.handled && req.usage == null && !req.ping) fail("nothing to write: give --state, --handled, --usage or --ping");
  return req;
}

function list() {
  const sha = headCommit();
  const cur = readCurrent(sha, new Date());
  const bots = cur.status.bots || {};
  const ids = Object.keys(bots).sort();
  console.log("status branch " + BRANCH + " @ " + sha.slice(0, 7) + ", updated " + (cur.status.updatedAt || "never"));
  if (cur.status.usage && cur.status.usage.weeklyPct != null) console.log("weekly usage: " + cur.status.usage.weeklyPct + "%");
  for (const id of ids) {
    const b = bots[id];
    console.log("  " + id.padEnd(28) + " " + String(b.state).padEnd(10) + " " + (b.ts || "") + "  " + (b.text || "") + (b.project ? "  [" + b.project + "]" : ""));
  }
  const open = (cur.needs.items || []).filter((n) => !n.handled);
  console.log("open needs: " + (open.length ? "" : "none"));
  for (const n of open) console.log("  " + n.id + "  " + n.bot + "  " + n.kind + "  " + n.text);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(fs.readFileSync(__filename, "utf8").split("*/")[0]);
    return;
  }
  if (args.list) return list();
  const req = buildRequest(args, loadRoster());

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const now = new Date();
    const sha = headCommit();
    const files = applyReport(readCurrent(sha, now), req, now);
    assertPublicSafe(files);
    const message = "status: " + req.bot + " " + (req.state || (req.handled ? "handled " + req.handled : req.ping ? "ping" : "usage " + req.usage + "%"));
    if (args["dry-run"]) {
      console.log("dry run, would commit on " + BRANCH + " @ " + sha.slice(0, 7) + ": " + message);
      for (const [name, content] of Object.entries(files)) console.log("--- " + name + " (" + content.length + " bytes)");
      console.log(files["data/status.json"] ? JSON.stringify(JSON.parse(files["data/status.json"]).bots[req.bot]) : "");
      return;
    }
    try {
      const commit = commitFiles(sha, files, message);
      console.log("ok " + commit.slice(0, 7) + " " + message);
      const st = files["data/status.json"] && JSON.parse(files["data/status.json"]).bots[req.bot];
      if (st && st.needs && req.state === "needs-alex") console.log("need id: " + st.needs.id + "  (mark it later with --handled " + st.needs.id + ")");
      return;
    } catch (err) {
      if ((err.status === 409 || err.status === 422) && attempt < MAX_RETRIES) {
        sleep(400 + Math.floor(Math.random() * 1600));
        continue;
      }
      throw err;
    }
  }
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    if (err instanceof Rejected) fail(err.message, 2);
    fail(err.message || String(err));
  }
}

module.exports = { applyReport, buildRequest, assertPublicSafe, monthKey, GUARD_MS };
