"use strict";

const fs = require("fs");
const path = require("path");
const { loadParts } = require("./lib/load");
const { reduceEvents, coerceEventList } = require("./js/model.js");
const { writeFallback } = require("./sync-data.js");

function copyFile(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function main() {
  const root = __dirname;
  writeFallback(root);
  const parts = loadParts(root);
  const events = [];
  for (const value of parts.jsonValues) events.push(...coerceEventList(value));
  for (const value of parts.lineValues) events.push(...coerceEventList(value));
  const reduced = reduceEvents(parts.roster, events);
  const state = {
    type: "snapshot",
    updatedAt: new Date().toISOString(),
    bots: reduced.bots,
    events: reduced.events,
  };

  const rootStatus = path.join(root, "data", "status.json");
  if (fs.existsSync(rootStatus)) fs.unlinkSync(rootStatus);

  const dist = path.join(root, "dist");
  fs.rmSync(dist, { recursive: true, force: true });
  fs.mkdirSync(path.join(dist, "data"), { recursive: true });
  fs.mkdirSync(path.join(dist, "js"), { recursive: true });

  copyFile(path.join(root, "index.html"), path.join(dist, "index.html"));
  copyFile(path.join(root, "style.css"), path.join(dist, "style.css"));
  for (const name of fs.readdirSync(path.join(root, "js"))) {
    if (!name.endsWith(".js")) continue;
    copyFile(path.join(root, "js", name), path.join(dist, "js", name));
  }
  copyFile(path.join(root, "data", "bots.json"), path.join(dist, "data", "bots.json"));
  copyFile(path.join(root, "data", "events.json"), path.join(dist, "data", "events.json"));
  copyFile(path.join(root, "data", "fallback-data.js"), path.join(dist, "data", "fallback-data.js"));

  const out = path.join(dist, "data", "status.json");
  fs.writeFileSync(out, JSON.stringify(state, null, 2) + "\n");
  console.log("Wrote dist/ (" + state.bots.length + " bots). Open dist/index.html or upload dist/ only.");
}

try {
  main();
} catch (err) {
  console.error(err.message || err);
  process.exit(1);
}
