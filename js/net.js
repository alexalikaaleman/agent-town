/** Live SSE, static polling, then a clearly labeled demo fallback. */
(function () {
const coerceEventList = window.AgentTown.coerceEventList;
const reduceEvents = window.AgentTown.reduceEvents;

async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

function tryLive(onMessage) {
  return new Promise((resolve) => {
    let settled = false;
    let source = null;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      if (!ok && source) source.close();
      resolve(ok ? source : null);
    };
    try {
      source = new EventSource(new URL("events", document.baseURI).href);
    } catch (err) {
      finish(false);
      return;
    }
    const timer = setTimeout(() => finish(false), 1800);
    source.onmessage = (ev) => {
      clearTimeout(timer);
      let data = null;
      try {
        data = JSON.parse(ev.data);
      } catch (err) {
        return;
      }
      if (!settled) {
        settled = true;
        resolve(source);
      }
      onMessage(data);
    };
    source.onerror = () => {
      if (!settled) {
        clearTimeout(timer);
        finish(false);
      }
    };
  });
}

function demoQuery() {
  try {
    return new URLSearchParams(window.location.search).get("demo") === "1";
  } catch (err) {
    return false;
  }
}

function isFilePage() {
  try {
    return window.location.protocol === "file:";
  } catch (err) {
    return false;
  }
}

function fallbackBundle() {
  const fb = window.AgentTownFallback;
  if (!fb || typeof fb !== "object") return null;
  return fb;
}

async function loadRoster() {
  try {
    const roster = await fetchJson(new URL("data/bots.json", document.baseURI).href);
    if (!Array.isArray(roster)) throw new Error("bots.json");
    return roster;
  } catch (err) {
    const fb = fallbackBundle();
    if (fb && Array.isArray(fb.bots)) return fb.bots;
    throw err;
  }
}

async function loadSampleEvents() {
  try {
    const raw = await fetchJson(new URL("data/events.json", document.baseURI).href);
    return coerceEventList(raw);
  } catch (err) {
    const fb = fallbackBundle();
    if (fb) return coerceEventList(fb.events);
    return [];
  }
}

async function connectFeed({ onSnapshot, onMode, onDemo }) {
  const roster = await loadRoster();

  let pollTimer = 0;
  let demoStarted = false;
  const beginDemo = async () => {
    if (demoStarted) return;
    demoStarted = true;
    if (pollTimer) clearInterval(pollTimer);
    const events = await loadSampleEvents();
    onMode("demo");
    onDemo(reduceEvents(roster, events));
  };

  if (demoQuery() || isFilePage()) {
    await beginDemo();
    return { roster, stop() {} };
  }

  const live = await tryLive(onSnapshot);
  if (live) {
    onMode("live");
    return { roster, stop() { live.close(); } };
  }

  let failures = 0;
  const poll = async () => {
    try {
      const url = new URL("data/status.json", document.baseURI);
      url.searchParams.set("t", String(Date.now()));
      const data = await fetchJson(url.href);
      failures = 0;
      onMode("poll");
      onSnapshot(data);
    } catch (err) {
      failures += 1;
      if (failures === 1) beginDemo();
    }
  };

  try {
    const url = new URL("data/status.json", document.baseURI);
    url.searchParams.set("t", String(Date.now()));
    const data = await fetchJson(url.href);
    onMode("poll");
    onSnapshot(data);
    pollTimer = setInterval(poll, 10000);
    return { roster, stop() { clearInterval(pollTimer); } };
  } catch (err) {
    await beginDemo();
    return { roster, stop() {} };
  }
}

window.AgentTown = window.AgentTown || {};
window.AgentTown.connectFeed = connectFeed;
})();
