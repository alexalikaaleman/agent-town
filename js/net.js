/** Live status from the public `status` branch, re-read every 2 minutes. No demo data. */
(function () {
const STATUS_BASE = "https://raw.githubusercontent.com/alexalikaaleman/agent-town/status/data/";
const POLL_MS = 2 * 60 * 1000;
const STALL_MS = 2 * 60 * 60 * 1000; // a working bot quiet 2h+ gets a "stalled?" tag but stays working
const SLEEP_MS = 10 * 60 * 1000; // a done or idle line 10+ minutes old shows as sleeping
const FETCH_TIMEOUT_MS = 12000;

/** fetch with a timeout, so a hung request can never leave a panel on "Loading…". */
async function fetchT(url, opts) {
  const ctl = typeof AbortController === "function" ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS) : 0;
  try {
    return await fetch(url, Object.assign({}, opts, ctl ? { signal: ctl.signal } : {}));
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url) {
  const res = await fetchT(url, { cache: "no-store" });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

async function fetchText(url) {
  const res = await fetchT(url, { cache: "no-store" });
  if (res.status === 404) return "";
  if (!res.ok) throw new Error(String(res.status));
  return res.text();
}

// raw.githubusercontent.com caches a branch file for up to 5 minutes and ignores
// query strings, so each read first asks the GitHub API for the branch's latest
// commit (one small call, revalidated with its ETag) and then reads files at that
// exact commit, which is never stale. If the API is unavailable or rate limited,
// it falls back to the branch URL with a cache-busting query.
const RAW_ROOT = "https://raw.githubusercontent.com/alexalikaaleman/agent-town/";
const REF_API = "https://api.github.com/repos/alexalikaaleman/agent-town/git/ref/heads/status";
let headSha = null;

async function refreshHead() {
  try {
    const res = await fetchT(REF_API, { cache: "no-cache", headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    const sha = data && data.object && data.object.sha;
    headSha = /^[0-9a-f]{40}$/.test(sha || "") ? sha : null;
  } catch (_) {
    headSha = null;
  }
  return headSha;
}

/** URL of a file on the status branch: pinned to the latest commit when known. */
function statusUrl(name) {
  if (headSha) return RAW_ROOT + headSha + "/data/" + name;
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
      // No status line ever: the bot stays idle in its home room (not the Bedroom).
      bots.push({ id: bot.id, state: "idle", text: "", task: "", needsAlex: null, ts: null, with: [], project: null, stalled: false, reported: false });
      continue;
    }
    const ts0 = e.ts ? Date.parse(String(e.ts)) : NaN;
    let state = e.state === "needs-alex" ? "waiting" : ["working", "done", "blocked", "idle", "sleeping"].includes(e.state) ? e.state : "idle";
    // A bot only sleeps after posting "sleeping" itself, or once its last line was done or idle AND
    // 10+ minutes have passed. Working stays working however long between lines (2h+ adds "stalled?").
    // Blocked and needs-alex keep their state.
    if ((state === "idle" || state === "done") && !e.needs && Number.isFinite(ts0) && now - ts0 >= SLEEP_MS) state = "sleeping";
    let needsAlex = null;
    if (e.needs && (e.needs.kind === "urgent" || e.needs.kind === "question")) needsAlex = e.needs.kind;
    else if (e.state === "needs-alex") needsAlex = "question";
    const ts = e.ts ? String(e.ts) : null;
    const ping = e.ping ? String(e.ping) : null;
    // Last sign of life: the newer of the last line and the last 30-minute ping.
    const seen = Math.max(ts ? Date.parse(ts) : 0, ping ? Date.parse(ping) : 0) || 0;
    const age = seen ? now - seen : 0;
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
      stalled: state === "working" && age >= STALL_MS,
      reported: true,
      ping,
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
      await refreshHead();
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
  const name = "history-" + monthKey(date || new Date()) + ".jsonl";
  if (!headSha) await refreshHead();
  let text;
  try {
    text = await fetchText(statusUrl(name));
  } catch (err) {
    // Commit-pinned read failed: fall back to the branch URL.
    if (!headSha) throw err;
    text = await fetchText(STATUS_BASE + name + "?t=" + Date.now());
  }
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
Object.assign(window.AgentTown, { loadHistory, monthKey, connectFeed, statusUrl, fetchJson, fetchText, toSnapshot, STALL_MS, SLEEP_MS });
})();
