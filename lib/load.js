"use strict";

const fs = require("fs");
const path = require("path");

function readText(file) {
  return fs.readFileSync(file, "utf8");
}

function parseJson(file) {
  const text = readText(file);
  if (!text.trim()) return null;
  return JSON.parse(text);
}

/**
 * Roster plus every raw JSON value from feed/*.json / *.jsonl.
 * data/events.json (demo samples) is included only with { samples: true };
 * the live server and the public status never use it.
 */
function loadParts(root, opts) {
  const samples = Boolean(opts && opts.samples);
  const rosterFile = path.join(root, "data", "bots.json");
  const roster = parseJson(rosterFile);
  if (!Array.isArray(roster)) throw new Error("data/bots.json must be a JSON array");

  const jsonValues = [];
  const eventsFile = path.join(root, "data", "events.json");
  if (samples && fs.existsSync(eventsFile)) {
    try {
      const parsed = parseJson(eventsFile);
      if (parsed) jsonValues.push(parsed);
    } catch (err) {
      console.warn("Skipping unreadable data/events.json");
    }
  }

  const lineValues = [];
  const feedDir = path.join(root, "feed");
  if (fs.existsSync(feedDir)) {
    const names = fs.readdirSync(feedDir).sort();
    for (const name of names) {
      if (name.startsWith(".")) continue; // locks, publish state
      const lower = name.toLowerCase();
      if (!(lower.endsWith(".json") || lower.endsWith(".jsonl"))) continue;
      const full = path.join(feedDir, name);
      let text = "";
      try {
        text = readText(full);
      } catch (err) {
        console.warn("Skipping unreadable feed file " + name);
        continue;
      }
      if (lower.endsWith(".jsonl")) {
        const lines = text.split(/\r?\n/);
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            lineValues.push(JSON.parse(trimmed));
          } catch (err) {
            // A writer may still be appending this line.
          }
        }
      } else {
        try {
          const parsed = JSON.parse(text);
          if (parsed) jsonValues.push(parsed);
        } catch (err) {
          console.warn("Skipping unreadable feed file " + name);
        }
      }
    }
  }

  return { roster, jsonValues, lineValues };
}

module.exports = { loadParts };
