/** Needs Alex strip: urgent-first then oldest, plus Hide all / Show all.
 *  Those buttons only hide cards in this browser. They do not change the request. */
(function (factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof window !== "undefined") {
    window.AgentTown = window.AgentTown || {};
    Object.assign(window.AgentTown, api);
  }
})(function () {
  "use strict";

  var HIDDEN_STORE = "agentTownNeedsHideAll";

  /** Same order the strip has always used: urgent first, then oldest timestamp. */
  function compareNeeds(a, b) {
    return a.kind === b.kind ? String(a.ts).localeCompare(String(b.ts)) : a.kind === "urgent" ? -1 : 1;
  }

  function sortNeeds(items) {
    return items.slice().sort(compareNeeds);
  }

  function needKey(it) {
    if (it && it.id) return "id:" + it.id;
    return "bot:" + (it && it.bot) + ":" + String(it && it.ts || "") + ":" + (it && it.kind || "");
  }

  /** hideAll hides every card. Show all returns the full list in compareNeeds order. */
  function visibleNeeds(items, hideAll) {
    var sorted = sortNeeds(items || []);
    return hideAll ? [] : sorted;
  }

  function loadNeedsCardsHidden(storage) {
    try {
      return (storage || localStorage).getItem(HIDDEN_STORE) === "1";
    } catch (e) {
      return false;
    }
  }

  function saveNeedsCardsHidden(hidden, storage) {
    (storage || localStorage).setItem(HIDDEN_STORE, hidden ? "1" : "0");
  }

  function cardLabel(it, name) {
    return (it.kind === "urgent" ? "! " : "? ") + name + (it.text ? ": " + it.text : "");
  }

  /**
   * Label, then Hide all, then Show all, then the cards (unless hideAll).
   * opts: { hideAll, nameOf, ago, onOpen, onHideAll, onShowAll }
   */
  function renderNeedsStrip(el, items, opts) {
    opts = opts || {};
    var hideAll = !!opts.hideAll;
    var view = visibleNeeds(items, hideAll);

    var head = document.createElement("div");
    head.className = "needs-head";
    var label = document.createElement("span");
    label.className = "needs-label";
    label.textContent = "Needs Alex (urgent first, then oldest)";
    var hideBtn = document.createElement("button");
    hideBtn.type = "button";
    hideBtn.className = "needs-hide-all";
    hideBtn.textContent = "Hide all";
    hideBtn.setAttribute("aria-pressed", hideAll ? "true" : "false");
    hideBtn.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      if (opts.onHideAll) opts.onHideAll();
    });
    var showBtn = document.createElement("button");
    showBtn.type = "button";
    showBtn.className = "needs-show-all";
    showBtn.textContent = "Show all";
    showBtn.setAttribute("aria-pressed", hideAll ? "false" : "true");
    showBtn.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      if (opts.onShowAll) opts.onShowAll();
    });
    head.append(label, hideBtn, showBtn);
    el.appendChild(head);

    for (var n = 0; n < view.length; n++) {
      var it = view[n];
      var name = opts.nameOf ? opts.nameOf(it) : it.bot;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "need " + it.kind;
      btn.dataset.needKey = needKey(it);
      btn.textContent = cardLabel(it, name);
      btn.title = opts.ago ? opts.ago(it.ts) : "";
      btn.addEventListener("click", openOf(opts, it));
      el.appendChild(btn);
    }
  }

  function openOf(opts, it) {
    return function () { if (opts.onOpen) opts.onOpen(it); };
  }

  return {
    HIDDEN_STORE: HIDDEN_STORE,
    compareNeeds: compareNeeds,
    sortNeeds: sortNeeds,
    needKey: needKey,
    visibleNeeds: visibleNeeds,
    loadNeedsCardsHidden: loadNeedsCardsHidden,
    saveNeedsCardsHidden: saveNeedsCardsHidden,
    renderNeedsStrip: renderNeedsStrip,
  };
});
