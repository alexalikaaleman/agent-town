"use strict";

/**
 * Builds the public site: dist/ and docs/ (GitHub Pages serves main /docs).
 * The page reads live status from the status branch, so no status data is
 * baked in here. Only static files and the roster are copied.
 *
 * Leak check: the build may contain no Drive links or ids except the chest
 * links in data/bots.json (driveFolderUrl), which are approved. Any other
 * Drive link, email or token fails the build.
 */

const fs = require("fs");
const path = require("path");
const { walk } = require("./lib/public");

const ROOT = __dirname;
const FILES = ["index.html", "style.css"];

function copyFile(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function build(out) {
  fs.rmSync(out, { recursive: true, force: true });
  for (const name of FILES) copyFile(path.join(ROOT, name), path.join(out, name));
  for (const name of fs.readdirSync(path.join(ROOT, "js"))) {
    if (name.endsWith(".js")) copyFile(path.join(ROOT, "js", name), path.join(out, "js", name));
  }
  copyFile(path.join(ROOT, "data", "bots.json"), path.join(out, "data", "bots.json"));
}

/** Approved chest links: the driveFolderUrl values in data/bots.json. */
function approvedLinks() {
  const roster = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "bots.json"), "utf8"));
  const list = Array.isArray(roster) ? roster : roster.bots || [];
  return new Set(list.map((b) => b && b.driveFolderUrl).filter(Boolean));
}

function leakCheck(dir) {
  const approved = approvedLinks();
  const problems = [];
  for (const file of walk(dir)) {
    let text = fs.readFileSync(file, "utf8");
    const rel = path.relative(ROOT, file);
    if (rel.endsWith(path.join("data", "bots.json"))) {
      const data = JSON.parse(text);
      for (const b of Array.isArray(data) ? data : data.bots || []) {
        if (b && b.driveFolderUrl && !approved.has(b.driveFolderUrl)) problems.push(rel + ": unapproved Drive link for " + b.id);
        if (b && b.driveFolderUrl) b.driveFolderUrl = "";
      }
      text = JSON.stringify(data);
    }
    if (/(drive|docs)\.google\.com\/[^\s"'`]*[-\w]{20,}/i.test(text)) problems.push(rel + ": Drive link outside the chest links");
    if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(text)) problems.push(rel + ": email address");
    if (/gh[pousr]_[A-Za-z0-9]{20,}|github_pat_|sk-[A-Za-z0-9]{20,}|xox[abprs]-|AIza[0-9A-Za-z_-]{30,}|BEGIN [A-Z ]*PRIVATE KEY/.test(text)) problems.push(rel + ": token-like string");
  }
  return problems;
}

function main() {
  const dist = path.join(ROOT, "dist");
  const docs = path.join(ROOT, "docs");
  build(dist);
  const problems = leakCheck(dist);
  if (problems.length) {
    console.error("Leak check failed, nothing copied to docs/:\n  " + problems.join("\n  "));
    process.exit(1);
  }
  build(docs);
  fs.writeFileSync(path.join(docs, ".nojekyll"), "");
  const again = leakCheck(docs);
  if (again.length) {
    console.error("Leak check failed on docs/:\n  " + again.join("\n  "));
    process.exit(1);
  }
  console.log("Wrote dist/ and docs/. Leak check clean (" + approvedLinks().size + " approved chest links).");
}

if (require.main === module) main();
module.exports = { leakCheck, approvedLinks };
