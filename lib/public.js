"use strict";

/**
 * Builds the public (GitHub Pages) view of the data: no Drive links or ids,
 * no long task text, privacy-filtered bubbles, and no demo events.
 */

const fs = require("fs");
const path = require("path");
const { loadParts } = require("./load");
const { reduceEvents, coerceEventList, shortDescription, STATES } = require("../js/model.js");
const { cleanBubble } = require("./privacy");

const MAX_EVENTS = 40;
const PRIVATE_KEYS = new Set(["driveFolderUrl", "driveUrl", "driveId", "folderId", "folderUrl"]);

/** Drive folder / file ids referenced by the private roster (used for leak checks). */
function driveIds(roster) {
  const ids = new Set();
  for (const bot of roster || []) {
    for (const key of Object.keys(bot || {})) {
      const value = String(bot[key] == null ? "" : bot[key]);
      if (!/google\.com/.test(value) && !PRIVATE_KEYS.has(key)) continue;
      const re = /[-\w]{20,}/g;
      let m;
      while ((m = re.exec(value))) if (/\d/.test(m[0]) && /[A-Za-z]/.test(m[0])) ids.add(m[0]);
    }
  }
  return Array.from(ids);
}

/** Roster entry safe to publish. `hasDrive` only says a folder exists (chest looks unlocked). */
function publicBot(bot) {
  return {
    id: String(bot.id),
    name: String(bot.name || bot.id),
    role: String(bot.role || ""),
    home: String(bot.home || ""),
    color: String(bot.color || "#888888"),
    hasDrive: Boolean(String(bot.driveFolderUrl || "").trim()),
  };
}

function publicRoster(roster) {
  return (roster || []).filter((b) => b && b.id).map(publicBot);
}

function cleanId(value) {
  return String(value == null ? "" : value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** One raw feed event -> a privacy-safe event (bubble text only, no task). */
function publicEvent(raw, ids) {
  if (!raw || typeof raw !== "object" || !raw.botId) return null;
  const botId = String(raw.botId);
  if (!ids.has(botId)) return null;
  const ev = { botId };
  const ts = new Date(raw.ts);
  if (raw.ts && !Number.isNaN(ts.getTime())) ev.ts = ts.toISOString();
  if (raw.state && STATES.has(raw.state)) ev.state = raw.state;
  const text = cleanBubble(shortDescription(raw));
  ev.text = text;
  ev.task = text;
  if (raw.needsAlex === "urgent" || raw.needsAlex === "question") ev.needsAlex = raw.needsAlex;
  if (Array.isArray(raw.with)) ev.with = raw.with.map(String).filter((id) => ids.has(id) && id !== botId).slice(0, 8);
  if (raw.collabId != null && String(raw.collabId).trim()) ev.collabId = cleanId(raw.collabId) || null;
  if (raw.collabEnd === true) ev.collabEnd = true;
  if (raw.handoffTo && ids.has(String(raw.handoffTo))) {
    ev.handoffTo = String(raw.handoffTo);
    ev.item = cleanBubble(raw.item || "package", 24) || "package";
  }
  return ev;
}

/** Strip any key or string that could carry a Drive link or id. */
function scrub(value) {
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, v] of Object.entries(value)) {
      if (PRIVATE_KEYS.has(key)) continue;
      out[key] = scrub(v);
    }
    return out;
  }
  if (typeof value === "string" && /(?:drive|docs)\.google\.com/i.test(value)) return "";
  return value;
}

/** Feed-only events (never data/events.json), cleaned. */
function feedEvents(root, roster) {
  const parts = loadParts(root, { samples: false });
  const list = roster || parts.roster;
  const ids = new Set(list.map((b) => String(b.id)));
  const raw = [];
  for (const value of parts.jsonValues) raw.push(...coerceEventList(value));
  for (const value of parts.lineValues) raw.push(...coerceEventList(value));
  const out = [];
  for (const ev of raw) {
    const clean = publicEvent(ev, ids);
    if (clean) out.push(clean);
  }
  return { roster: parts.roster, events: out, rawCount: raw.length };
}

/**
 * Public status snapshot: latest state per bot plus the last N events.
 * `key` is the content without timestamps of generation, for change detection.
 */
function buildStatus(root, opts) {
  const maxEvents = (opts && opts.maxEvents) || MAX_EVENTS;
  const parts = loadParts(root, { samples: false });
  const roster = publicRoster(parts.roster);
  const { events, rawCount } = feedEvents(root, parts.roster);
  const reduced = reduceEvents(roster, events);
  const hasDrive = new Map(roster.map((b) => [b.id, b.hasDrive]));
  const bots = reduced.bots.map((b) => {
    const out = Object.assign({}, b, { task: b.text, hasDrive: hasDrive.get(b.id) || false });
    delete out.driveFolderUrl;
    return out;
  });
  const recent = reduced.events.slice(-maxEvents).map((e) => Object.assign({}, e, { task: e.text }));
  const body = scrub({ bots, events: recent });
  const generatedAt = new Date().toISOString();
  const status = {
    type: "snapshot",
    source: "feed",
    generatedAt,
    updatedAt: generatedAt,
    eventCount: events.length,
    bots: body.bots,
    events: body.events,
  };
  return { status, key: JSON.stringify(body), rawCount };
}

/** Content key of an existing status.json (ignores generatedAt/updatedAt). */
function statusKey(status) {
  if (!status || typeof status !== "object") return "";
  return JSON.stringify({ bots: status.bots || [], events: status.events || [] });
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    return null;
  }
}

/** Atomic write: temp file + rename. */
function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + "." + process.pid + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n");
  fs.renameSync(tmp, file);
}

/** Recursively list files under dir. */
function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

/** Returns a list of "file: problem" strings when a public folder leaks Drive links or ids. */
function findLeaks(dir, roster) {
  const ids = driveIds(roster);
  const problems = [];
  for (const file of walk(dir)) {
    let text = "";
    try {
      text = fs.readFileSync(file, "utf8");
    } catch (err) {
      continue;
    }
    if (/drive\.google\.com|docs\.google\.com/i.test(text)) problems.push(file + ": Google Drive link");
    for (const id of ids) if (text.includes(id)) problems.push(file + ": Drive id " + id.slice(0, 6) + "…");
  }
  return problems;
}

module.exports = {
  walk,
  MAX_EVENTS,
  driveIds,
  publicBot,
  publicRoster,
  publicEvent,
  scrub,
  feedEvents,
  buildStatus,
  statusKey,
  readJson,
  writeJsonAtomic,
  findLeaks,
};
