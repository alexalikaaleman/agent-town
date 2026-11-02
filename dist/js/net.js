/** Live status from the public `status` branch, re-read every 2 minutes. No demo data. */
(function () {
const STATUS_BASE = "https://raw.githubusercontent.com/alexalikaaleman/agent-town/status/data/";
const POLL_MS = 2 * 60 * 1000;
const STALL_MS = 30 * 60 * 1000;

async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

async function fetchText(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 404) return "";
  if (!res.ok) throw new Error(String(res.status));
  return res.text();
}

/** URL of a file on the status branch, with a cache-busting query. */
function statusUrl(name) {
  return STATUS_BASE + name + "?t=" + Date.now();
}

async function loadRoster() {
  const roster = await fetchJson(new URL("data/bots.json", document.baseURI).href);
  if (!Array.isArray(roster)) throw new Error("bots.json");
  return roster;
}

/** status.json (bots keyed by id) -> array the town understands. */
function toSnapshot(roster, status, now) {
  const byAlias = new Map();
  for (const bot of roster) {
    byAlias.set(bot.id, bot.id);
    for (const alias of bot.aliases || []) byAlias.set(alias, bot.id);
  }
  const entries = new Map();
  const raw = (status && status.bots) || {};
  for (const key of Object.keys(raw)) {
    const id = byAlias.get(key);
    const e = raw[key];
    if (!id || !e || typeof e !== "object") continue;
    const prev = entries.get(id);
    if (!prev || String(e.ts || "") > String(prev.ts || "")) entries.set(id, e);
  }
  const bots = [];
  for (const bot of roster) {
    const e = entries.get(bot.id);
    if (!e) {
      bots.push({ id: bot.id, state: "idle", text: "", task: "", needsAlex: null, ts: null, with: [], project: null, stalled: false, reported: false });
      continue;
    }
    const state = e.state === "needs-alex" ? "waiting" : ["working", "done", "blocked", "idle"].includes(e.state) ? e.state : "idle";
    let needsAlex = null;
    if (e.needs && (e.needs.kind === "urgent" || e.needs.kind === "question")) needsAlex = e.needs.kind;
    else if (e.state === "needs-alex") needsAlex = "question";
    const ts = e.ts ? String(e.ts) : null;
    const age = ts ? now - Date.parse(ts) : 0;
    bots.push({
      id: bot.id,
      state,
      rawState: e.state,
      text: String(e.text || "").slice(0, 40),
      task: String(e.text || "").slice(0, 40),
      needsAlex,
      ts,
      since: e.since || ts,
      with: Array.isArray(e.with) ? e.with.map((w) => byAlias.get(w)).filter(Boolean) : [],
      project: e.project ? String(e.project).slice(0, 24) : null,
      stalled: e.state === "working" && age >= STALL_MS,
      reported: true,
    });
  }
  return bots;
}

/**
 * onSnapshot(bots, status) on every read; onStatus({ ok, updatedAt }) for the HUD.
 * Returns { roster, refresh(), stop() }.
 */
async function connectFeed({ onSnapshot, onStatus, onRoster, onNeeds }) {
  const roster = await loadRoster();
  if (onRoster) onRoster(roster);
  let last = null;
  let timer = 0;
  let busy = false;

  const read = async () => {
    if (busy) return;
    busy = true;
    try {
      const status = await fetchJson(statusUrl("status.json"));
      last = status;
      onSnapshot(toSnapshot(roster, status, Date.now()), status);
      onStatus({ ok: true, updatedAt: status.updatedAt || null });
      if (onNeeds) {
        try {
          const needs = await fetchJson(statusUrl("needs.json"));
          onNeeds(Array.isArray(needs.items) ? needs.items : []);
        } catch (_) {
          onNeeds(null);
        }
      }
    } catch (err) {
      if (last) onSnapshot(toSnapshot(roster, last, Date.now()), last);
      onStatus({ ok: false, updatedAt: last ? last.updatedAt : null });
    } finally {
      busy = false;
    }
  };

  await read();
  timer = setInterval(read, POLL_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") read();
  });
  return { roster, refresh: read, stop() { clearInterval(timer); } };
}

/** Month key (YYYY-MM) in Alex's time zone, matching report.js history files. */
function monthKey(date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Honolulu", year: "numeric", month: "2-digit" }).formatToParts(date);
  const get = (t) => (parts.find((p) => p.type === t) || {}).value;
  return get("year") + "-" + get("month");
}

/** This month's history lines, newest first. Bad lines are skipped. */
async function loadHistory(date) {
  const text = await fetchText(statusUrl("history-" + monthKey(date || new Date()) + ".jsonl"));
  const out = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch (_) {}
  }
  return out.reverse();
}

window.AgentTown = window.AgentTown || {};
Object.assign(window.AgentTown, { loadHistory, monthKey, connectFeed, statusUrl, fetchJson, fetchText, toSnapshot, STALL_MS });
})();
