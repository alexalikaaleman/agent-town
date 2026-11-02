/** Event merge shared by the browser and the Node server. */
(function (factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof window !== "undefined") {
    window.AgentTown = window.AgentTown || {};
    Object.assign(window.AgentTown, api);
  }
})(function () {
  "use strict";

  var STATES = new Set(["idle", "walking", "working", "waiting", "blocked", "done", "sleeping", "talking"]);

  function coerceEventList(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.filter(function (ev) { return ev && typeof ev === "object"; });
    if (typeof value === "object" && Array.isArray(value.events)) {
      return value.events.filter(function (ev) { return ev && typeof ev === "object"; });
    }
    if (typeof value === "object" && value.botId) return [value];
    return [];
  }

  function cleanText(value, max) {
    return String(value == null ? "" : value)
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, max);
  }

  /** Short bubble line. Prefer `text`, then `summary`, then `task`. */
  function shortDescription(ev) {
    if (!ev || typeof ev !== "object") return "";
    var raw = "";
    if (Object.prototype.hasOwnProperty.call(ev, "text") && String(ev.text == null ? "" : ev.text).trim()) raw = ev.text;
    else if (Object.prototype.hasOwnProperty.call(ev, "summary") && String(ev.summary == null ? "" : ev.summary).trim()) raw = ev.summary;
    else if (Object.prototype.hasOwnProperty.call(ev, "task")) raw = ev.task;
    else return "";
    var s = String(raw).replace(/\s+/g, " ").trim();
    if (!s) return "";
    if (s.length <= 40) return s;
    return s.slice(0, 39) + "…";
  }

  function driveFolderUrl(value) {
    var url = String(value == null ? "" : value).trim();
    if (url.startsWith("https://drive.google.com/")) return url;
    return "";
  }

  function cleanWith(ev) {
    if (!ev || ev.collabEnd === true) return [];
    if (ev.state === "idle" || ev.state === "done") return [];
    if (!Array.isArray(ev.with)) return [];
    var ids = [];
    for (var i = 0; i < ev.with.length; i++) {
      var clean = cleanText(ev.with[i], 80);
      if (clean && ids.indexOf(clean) === -1) ids.push(clean);
      if (ids.length >= 8) break;
    }
    return ids;
  }

  function cleanCollabId(ev) {
    if (!ev || ev.collabEnd === true) return null;
    if (ev.state === "idle" || ev.state === "done") return null;
    if (!Object.prototype.hasOwnProperty.call(ev, "collabId") || ev.collabId == null) return null;
    var id = cleanText(ev.collabId, 80);
    return id || null;
  }

  function blankBot(bot) {
    return {
      id: String(bot.id),
      name: String(bot.name || bot.id),
      role: String(bot.role || ""),
      home: String(bot.home || ""),
      color: String(bot.color || "#888888"),
      state: "idle",
      task: "",
      needsAlex: null,
      ts: null,
      handoffTo: null,
      item: null,
      text: "",
      with: [],
      collabId: null,
      driveFolderUrl: driveFolderUrl(bot.driveFolderUrl),
    };
  }

  function applyEvent(bot, ev) {
    if (ev.state && STATES.has(ev.state)) bot.state = ev.state;
    if (Object.prototype.hasOwnProperty.call(ev, "task")) bot.task = cleanText(ev.task, 160);
    if (
      Object.prototype.hasOwnProperty.call(ev, "text") ||
      Object.prototype.hasOwnProperty.call(ev, "summary") ||
      Object.prototype.hasOwnProperty.call(ev, "task")
    ) {
      bot.text = shortDescription(ev);
    }
    if (Object.prototype.hasOwnProperty.call(ev, "needsAlex")) {
      bot.needsAlex = ev.needsAlex === "urgent" || ev.needsAlex === "question" ? ev.needsAlex : null;
    } else {
      bot.needsAlex = null;
    }
    if (ev.ts) bot.ts = String(ev.ts);
    if (ev.handoffTo) {
      bot.handoffTo = cleanText(ev.handoffTo, 80);
      var item = ev.item != null && String(ev.item).trim() !== "" ? ev.item : bot.task || "package";
      bot.item = cleanText(item, 48) || "package";
    } else {
      bot.handoffTo = null;
      bot.item = null;
    }
    bot.with = cleanWith(ev);
    bot.collabId = cleanCollabId(ev);
  }

  /** Latest event per bot wins. Older timestamps apply first. */
  function reduceEvents(roster, events) {
    var byId = new Map();
    var list = roster || [];
    for (var r = 0; r < list.length; r++) {
      var bot = list[r];
      if (!bot || !bot.id) continue;
      byId.set(String(bot.id), blankBot(bot));
    }
    var incoming = (events || []).map(function (raw, index) {
      var ev = Object.assign({}, raw, { _i: index });
      if (!ev.ts) ev.ts = "seq-" + String(index).padStart(6, "0");
      return ev;
    });
    incoming.sort(function (a, b) {
      return String(a.ts).localeCompare(String(b.ts)) || a._i - b._i;
    });
    var applied = [];
    for (var i = 0; i < incoming.length; i++) {
      var ev = incoming[i];
      if (!ev.botId) continue;
      var target = byId.get(String(ev.botId));
      if (!target) continue;
      applyEvent(target, ev);
      applied.push({
        ts: target.ts,
        botId: target.id,
        state: target.state,
        task: target.task,
        needsAlex: target.needsAlex,
        handoffTo: target.handoffTo,
        item: target.item,
        text: target.text,
        with: target.with,
        collabId: target.collabId,
      });
    }
    return { bots: Array.from(byId.values()), events: applied.slice(-80) };
  }

  return {
    STATES: STATES,
    coerceEventList: coerceEventList,
    shortDescription: shortDescription,
    driveFolderUrl: driveFolderUrl,
    blankBot: blankBot,
    applyEvent: applyEvent,
    reduceEvents: reduceEvents,
  };
});
