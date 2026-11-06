"use strict";

const test = require("node:test");
const assert = require("node:assert");
const {
  compareNeeds,
  sortNeeds,
  visibleNeeds,
  loadNeedsCardsHidden,
  saveNeedsCardsHidden,
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

test("Hide all drops every card and does not mark a request handled", () => {
  const items = queue.map((it) => Object.assign({}, it));
  const view = visibleNeeds(items, true);
  assert.deepEqual(view, []);
  assert.strictEqual(items.length, 4);
  assert.ok(items.every((it) => it.handled === false));
});

test("Show all puts every card back in urgent-first, then oldest order", () => {
  const view = visibleNeeds(queue, false);
  assert.deepEqual(view.map((it) => it.id), ["u-old", "u-new", "q-old", "q-new"]);
});

test("hide-all flag round-trips in local storage", () => {
  const mem = new Map();
  const storage = {
    getItem(k) { return mem.has(k) ? mem.get(k) : null; },
    setItem(k, v) { mem.set(k, String(v)); },
  };
  assert.strictEqual(loadNeedsCardsHidden(storage), false);
  saveNeedsCardsHidden(true, storage);
  assert.strictEqual(mem.get(HIDDEN_STORE), "1");
  assert.strictEqual(loadNeedsCardsHidden(storage), true);
  saveNeedsCardsHidden(false, storage);
  assert.strictEqual(loadNeedsCardsHidden(storage), false);
});

test("unreadable hide-all storage stays shown", () => {
  const storage = { getItem() { throw new Error("blocked"); } };
  assert.strictEqual(loadNeedsCardsHidden(storage), false);
});
