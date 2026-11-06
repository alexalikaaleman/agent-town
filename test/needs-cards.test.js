"use strict";

const test = require("node:test");
const assert = require("node:assert");
const {
  compareNeeds,
  sortNeeds,
  needKey,
  visibleNeeds,
  loadHiddenNeeds,
  saveHiddenNeeds,
  HIDDEN_STORE,
} = require("../js/needs-cards.js");

/** The strip's historical comparator, copied so a drift fails this test. */
function legacyCompare(a, b) {
  return a.kind === b.kind ? String(a.ts).localeCompare(String(b.ts)) : a.kind === "urgent" ? -1 : 1;
}

const queue = [
  { id: "q-new", bot: "beta", kind: "question", ts: "2026-11-05T10:00:00Z", text: "newer question", handled: false },
  { id: "u-new", bot: "gamma", kind: "urgent", ts: "2026-11-04T10:00:00Z", text: "newer urgent", handled: false },
  { id: "q-old", bot: "alpha", kind: "question", ts: "2026-11-01T10:00:00Z", text: "older question", handled: false },
  { id: "u-old", bot: "delta", kind: "urgent", ts: "2026-11-02T10:00:00Z", text: "older urgent", handled: false },
];

test("sort stays urgent first, then oldest", () => {
  const ids = sortNeeds(queue).map((it) => it.id);
  assert.deepEqual(ids, ["u-old", "u-new", "q-old", "q-new"]);
});

test("compareNeeds matches the original one-line sort", () => {
  const kinds = ["urgent", "question"];
  const times = ["2026-11-01T00:00:00Z", "2026-11-03T00:00:00Z", "2026-11-03T00:00:00Z"];
  for (const ka of kinds) {
    for (const kb of kinds) {
      for (const ta of times) {
        for (const tb of times) {
          const a = { kind: ka, ts: ta };
          const b = { kind: kb, ts: tb };
          assert.strictEqual(compareNeeds(a, b), legacyCompare(a, b));
        }
      }
    }
  }
});

test("sort does not mutate the caller's list", () => {
  const before = queue.map((it) => it.id);
  sortNeeds(queue);
  assert.deepEqual(queue.map((it) => it.id), before);
});

test("hide drops a card and leaves the rest in sort order", () => {
  const hidden = new Set([needKey(queue.find((it) => it.id === "u-new"))]);
  const view = visibleNeeds(queue, hidden, false);
  assert.deepEqual(view.map((it) => it.id), ["u-old", "q-old", "q-new"]);
  assert.strictEqual(queue.find((it) => it.id === "u-new").handled, false);
});

test("show hidden puts the card back in normal sort order, not at the end", () => {
  const hidden = new Set([
    needKey(queue.find((it) => it.id === "u-old")),
    needKey(queue.find((it) => it.id === "q-new")),
  ]);
  const view = visibleNeeds(queue, hidden, true);
  assert.deepEqual(view.map((it) => it.id), ["u-old", "u-new", "q-old", "q-new"]);
});

test("hiding one card does not mark the request handled or delete it", () => {
  const items = queue.map((it) => Object.assign({}, it));
  const hidden = new Set([needKey(items[0])]);
  visibleNeeds(items, hidden, false);
  assert.strictEqual(items.length, 4);
  assert.ok(items.every((it) => it.handled === false));
});

test("need key prefers the need id, so a new request is not stuck hidden", () => {
  const first = { id: "n1", bot: "help-bot", kind: "question", ts: "2026-11-01T00:00:00Z" };
  const next = { id: "n2", bot: "help-bot", kind: "question", ts: "2026-11-06T00:00:00Z" };
  const hidden = new Set([needKey(first)]);
  assert.notStrictEqual(needKey(first), needKey(next));
  assert.deepEqual(visibleNeeds([first, next], hidden, false).map((it) => it.id), ["n2"]);
});

test("a card with no id falls back to bot, time and kind", () => {
  const it = { id: null, bot: "help-bot", kind: "urgent", ts: "2026-11-02T00:00:00Z" };
  assert.strictEqual(needKey(it), "bot:help-bot:2026-11-02T00:00:00Z:urgent");
});

test("hidden keys round-trip in local storage", () => {
  const mem = new Map();
  const storage = {
    getItem(k) { return mem.has(k) ? mem.get(k) : null; },
    setItem(k, v) { mem.set(k, String(v)); },
  };
  const hidden = new Set(["id:n1", "id:n2"]);
  saveHiddenNeeds(hidden, storage);
  assert.strictEqual(mem.has(HIDDEN_STORE), true);
  const loaded = loadHiddenNeeds(storage);
  assert.deepEqual(Array.from(loaded).sort(), ["id:n1", "id:n2"]);
});

test("bad stored hide data loads as an empty set", () => {
  const storage = { getItem() { return "{not json"; } };
  assert.strictEqual(loadHiddenNeeds(storage).size, 0);
  const storage2 = { getItem() { return JSON.stringify({ no: "array" }); } };
  assert.strictEqual(loadHiddenNeeds(storage2).size, 0);
});
