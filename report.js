#!/usr/bin/env node
"use strict";

/**
 * Agent Town status reporter. Any bot on this box can call it:
 *
 *   node /workspace/agent-town/report.js --bot <botId> --state <state> --text "<text>" \
 *        [--with <id,id>] [--collab <id>] [--end] [--needs urgent|question]
 *
 * It appends one event to feed/queue.jsonl under a file lock and exits.
 * It never touches git. publish-status.js publishes the queue later.
 */

const fs = require("fs");
const path = require("path");
const { acquire } = require("./lib/lock");
const { stripPrivate, truncate, MAX_TEXT } = require("./lib/privacy");

const ROOT = __dirname;
const FEED = path.join(ROOT, "feed");
const QUEUE = path.join(FEED, "queue.jsonl");
const LOCK = path.join(FEED, ".queue.lock");
const STATES = ["idle", "walking", "working", "waiting", "blocked", "done"];

const USAGE =
  "Usage: node report.js --bot <botId> --state <" + STATES.join("|") + "> --text \"<max 40 chars>\"\n" +
  "                      [--with <id,id>] [--collab <id>] [--end] [--needs urgent|question] [--quiet]\n" +
  "       node report.js --list   (show valid bot ids)";

function fail(msg, code) {
  process.stderr.write("report.js: " + msg + "\n");
  process.exit(code || 2);
}

function parseArgs(argv) {
  const out = { with: [] };
  for (let i = 0; i < argv.length; i++) {
    let arg = argv[i];
    let value = null;
    const eq = arg.indexOf("=");
    if (arg.startsWith("--") && eq > 0) {
      value = arg.slice(eq + 1);
      arg = arg.slice(0, eq);
    }
    const next = () => {
      if (value != null) return value;
      if (i + 1 >= argv.length) fail("missing value for " + arg + "\n" + USAGE);
      return argv[++i];
    };
    switch (arg) {
      case "--bot": out.bot = next(); break;
      case "--state": out.state = next(); break;
      case "--text": case "--summary": out.text = next(); break;
      case "--with": out.with.push(...String(next()).split(",")); break;
      case "--collab": out.collab = next(); break;
      case "--end": out.end = true; break;
      case "--needs": out.needs = next(); break;
      case "--quiet": case "-q": out.quiet = true; break;
      case "--list": out.list = true; break;
      case "--help": case "-h": process.stdout.write(USAGE + "\n"); process.exit(0); break;
      default: fail("unknown option " + arg + "\n" + USAGE);
    }
  }
  return out;
}

function loadRoster() {
  try {
    const list = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "bots.json"), "utf8"));
    if (!Array.isArray(list)) throw new Error("not an array");
    return list;
  } catch (err) {
    fail("cannot read data/bots.json (" + err.message + ")", 3);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const roster = loadRoster();
  const ids = new Set(roster.map((b) => String(b.id)));
  if (args.list) {
    for (const b of roster) process.stdout.write(b.id + "\t" + b.name + "\n");
    return;
  }

  if (!args.bot) fail("--bot is required\n" + USAGE);
  const botId = String(args.bot).trim();
  if (!ids.has(botId)) fail("unknown bot id \"" + botId + "\". Run: node report.js --list");

  if (!args.state) fail("--state is required (" + STATES.join(", ") + ")");
  const state = String(args.state).trim().toLowerCase();
  if (!STATES.includes(state)) fail("bad state \"" + args.state + "\". Use one of: " + STATES.join(", "));

  let text = "";
  if (args.text != null && String(args.text).trim()) {
    const cleaned = stripPrivate(args.text);
    if (cleaned.removed.length && !args.quiet) {
      process.stderr.write("report.js: removed private-looking text (" + cleaned.removed.join(", ") + ")\n");
    }
    if (!cleaned.text) fail("text is empty after removing URLs, emails, paths, ids, or money. Rephrase it.");
    text = truncate(cleaned.text, MAX_TEXT);
  }

  const withIds = [];
  for (const raw of args.with) {
    const id = String(raw).trim();
    if (!id) continue;
    if (!ids.has(id)) fail("unknown bot id in --with: \"" + id + "\"");
    if (id !== botId && !withIds.includes(id)) withIds.push(id);
  }
  if (withIds.length > 8) fail("--with takes at most 8 bot ids");

  let collabId = null;
  if (args.collab != null) {
    collabId = String(args.collab).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
    if (!collabId) fail("--collab needs letters or digits");
  }

  let needsAlex = null;
  if (args.needs != null) {
    needsAlex = String(args.needs).trim().toLowerCase();
    if (needsAlex !== "urgent" && needsAlex !== "question") fail("--needs must be urgent or question");
  }

  const ev = { ts: new Date().toISOString(), botId, state, text, needsAlex };
  if (withIds.length) ev.with = withIds;
  if (collabId) ev.collabId = collabId;
  if (args.end) ev.collabEnd = true;
  ev.pid = process.pid;
  const line = JSON.stringify(ev) + "\n";

  fs.mkdirSync(FEED, { recursive: true });
  const release = acquire(LOCK, { timeoutMs: 15000, staleMs: 10000 });
  if (!release) fail("feed is busy (lock held over 15s); event not written, try again", 4);
  try {
    const fd = fs.openSync(QUEUE, "a", 0o644);
    try {
      fs.writeSync(fd, line);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  } finally {
    release();
  }
  if (!args.quiet) process.stdout.write("queued " + botId + " " + state + (text ? " \"" + text + "\"" : "") + "\n");
}

main();
