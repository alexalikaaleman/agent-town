"use strict";

const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { loadParts } = require("./lib/load");
const { reduceEvents, coerceEventList } = require("./js/model.js");
const { writeFallback } = require("./sync-data.js");

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || "127.0.0.1";
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

const clients = new Set();
let current = null;
let lastKey = "";

function safeFile(urlPath) {
  let rel = decodeURIComponent(urlPath.split("?")[0]);
  if (rel === "/") rel = "index.html";
  rel = rel.replace(/^\/+/, "");
  if (!rel || rel.includes("\0")) return null;
  const parts = rel.split(/[/\\]+/);
  if (parts.some((part) => !part || part === ".." || part.startsWith("."))) return null;
  const ext = path.extname(rel).toLowerCase();
  if (!MIME[ext]) return null;
  const full = path.resolve(ROOT, rel);
  if (full !== ROOT && !full.startsWith(ROOT + path.sep)) return null;
  return full;
}

function computeState() {
  const parts = loadParts(ROOT);
  const events = [];
  for (const value of parts.jsonValues) events.push(...coerceEventList(value));
  for (const value of parts.lineValues) events.push(...coerceEventList(value));
  const reduced = reduceEvents(parts.roster, events);
  return {
    type: "snapshot",
    updatedAt: new Date().toISOString(),
    bots: reduced.bots,
    events: reduced.events,
  };
}

function broadcast(payload) {
  const body = "data: " + JSON.stringify(payload) + "\n\n";
  for (const res of clients) res.write(body);
}

function reload(force) {
  try {
    const next = computeState();
    const key = JSON.stringify(next.bots);
    current = next;
    if (force || key !== lastKey) {
      lastKey = key;
      broadcast(current);
    }
  } catch (err) {
    console.error(err.message || err);
  }
}

function sendFile(req, res) {
  const full = safeFile(req.url || "/");
  if (!full) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }
  fs.readFile(full, (err, buf) => {
    if (err) {
      res.writeHead(err.code === "ENOENT" ? 404 : 500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(err.code === "ENOENT" ? "Not found" : "Error");
      return;
    }
    const ext = path.extname(full).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(buf);
  });
}

function lanUrls(port) {
  const urls = ["http://localhost:" + port];
  if (HOST !== "0.0.0.0") return urls;
  const nets = os.networkInterfaces();
  for (const list of Object.values(nets)) {
    for (const net of list || []) {
      const v4 = net.family === "IPv4" || net.family === 4;
      if (v4 && !net.internal) urls.push("http://" + net.address + ":" + port);
    }
  }
  return urls;
}

const server = http.createServer((req, res) => {
  const pathname = (req.url || "/").split("?")[0];
  if (pathname === "/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    });
    res.write(": ok\n\n");
    if (current) res.write("data: " + JSON.stringify(current) + "\n\n");
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }
  sendFile(req, res);
});

function listen(port) {
  server.once("error", (err) => {
    if (err.code === "EADDRINUSE" && port < PORT + 10) {
      listen(port + 1);
      return;
    }
    console.error(err.message || err);
    process.exit(1);
  });
  server.listen(port, HOST, () => {
    writeFallback(ROOT);
    fs.mkdirSync(path.join(ROOT, "feed"), { recursive: true });
    reload(true);
    const feed = path.join(ROOT, "feed");
    let timer = null;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => reload(false), 120);
    };
    try {
      fs.watch(feed, schedule);
    } catch (err) {
      console.warn("Feed watch unavailable, using a poll.");
    }
    const eventsFile = path.join(ROOT, "data", "events.json");
    if (fs.existsSync(eventsFile)) {
      try {
        fs.watch(eventsFile, schedule);
      } catch (err) {
        /* sample file watch is optional */
      }
    }
    setInterval(() => reload(false), 2000).unref();
    setInterval(() => {
      for (const client of clients) client.write(": ping\n\n");
    }, 15000).unref();
    console.log("Agent Town");
    for (const url of lanUrls(port)) console.log("  " + url);
    console.log("Drop .json or .jsonl events into feed/");
  });
}

listen(PORT);
