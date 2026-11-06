/** Desktop Needs Alex cards: urgent-first then oldest, plus local hide/show.
 *  Hide is viewer state only. It does not mark a need handled or remove it. */
(function (factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof window !== "undefined") {
    window.AgentTown = window.AgentTown || {};
    Object.assign(window.AgentTown, api);
  }
})(function () {
  "use strict";

  var HIDDEN_STORE = "agentTownHiddenNeeds";

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

  /** showHidden true: every card, in compareNeeds order (hidden cards stay in place). */
  function visibleNeeds(items, hidden, showHidden) {
    var set = hidden instanceof Set ? hidden : new Set(hidden || []);
    var sorted = sortNeeds(items || []);
    if (showHidden) return sorted;
    return sorted.filter(function (it) { return !set.has(needKey(it)); });
  }

  function loadHiddenNeeds(storage) {
    try {
      var raw = JSON.parse((storage || localStorage).getItem(HIDDEN_STORE) || "[]");
      return new Set(Array.isArray(raw) ? raw.filter(function (x) { return typeof x === "string"; }) : []);
    } catch (e) {
      return new Set();
    }
  }

  function saveHiddenNeeds(set, storage) {
    (storage || localStorage).setItem(HIDDEN_STORE, JSON.stringify(Array.from(set)));
  }

  function cardLabel(it, name) {
    return (it.kind === "urgent" ? "! " : "? ") + name + (it.text ? ": " + it.text : "");
  }

  /**
   * Fill a Needs Alex strip. desktop false keeps the plain buttons (no Hide).
   * opts: { desktop, hidden, showHidden, nameOf, ago, onOpen, onHide, onToggleShow }
   */
  function renderNeedsStrip(el, items, opts) {
    opts = opts || {};
    var hidden = opts.hidden instanceof Set ? opts.hidden : new Set(opts.hidden || []);
    var desktop = !!opts.desktop;
    var showHidden = !!opts.showHidden;
    var sorted = sortNeeds(items || []);
    var view = visibleNeeds(sorted, hidden, !desktop || showHidden);
    var hiddenCount = 0;
    for (var i = 0; i < sorted.length; i++) if (hidden.has(needKey(sorted[i]))) hiddenCount++;

    var head = document.createElement(desktop ? "div" : "span");
    head.className = desktop ? "needs-head" : "needs-label";
    if (desktop) {
      var label = document.createElement("span");
      label.className = "needs-label";
      label.textContent = "Needs Alex (urgent first, then oldest)";
      head.appendChild(label);
    } else {
      head.textContent = "Needs Alex (urgent first, then oldest)";
    }

    if (desktop && (hiddenCount > 0 || showHidden)) {
      var toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "needs-show-hidden" + (showHidden ? " on" : "");
      toggle.setAttribute("aria-pressed", showHidden ? "true" : "false");
      toggle.textContent = "Show hidden" + (hiddenCount ? " (" + hiddenCount + ")" : "");
      toggle.addEventListener("click", function () { if (opts.onToggleShow) opts.onToggleShow(); });
      head.appendChild(toggle);
    }
    el.appendChild(head);

    for (var n = 0; n < view.length; n++) {
      var it = view[n];
      var name = opts.nameOf ? opts.nameOf(it) : it.bot;
      var text = cardLabel(it, name);
      var title = opts.ago ? opts.ago(it.ts) : "";
      var concealed = hidden.has(needKey(it));
      if (!desktop) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "need " + it.kind;
        btn.dataset.needKey = needKey(it);
        btn.textContent = text;
        btn.title = title;
        btn.addEventListener("click", openOf(opts, it));
        el.appendChild(btn);
        continue;
      }
      var card = document.createElement("div");
      card.className = "need " + it.kind + (concealed ? " is-hidden" : "");
      card.dataset.needKey = needKey(it);
      var open = document.createElement("button");
      open.type = "button";
      open.className = "need-open";
      open.textContent = text;
      open.title = title;
      open.addEventListener("click", openOf(opts, it));
      var hide = document.createElement("button");
      hide.type = "button";
      hide.className = "need-hide";
      hide.textContent = concealed ? "Unhide" : "Hide";
      hide.setAttribute("aria-label", (concealed ? "Unhide " : "Hide ") + name);
      hide.addEventListener("click", hideOf(opts, it));
      card.append(open, hide);
      el.appendChild(card);
    }
  }

  function openOf(opts, it) {
    return function () { if (opts.onOpen) opts.onOpen(it); };
  }

  function hideOf(opts, it) {
    return function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      if (opts.onHide) opts.onHide(it);
    };
  }

  return {
    HIDDEN_STORE: HIDDEN_STORE,
    compareNeeds: compareNeeds,
    sortNeeds: sortNeeds,
    needKey: needKey,
    visibleNeeds: visibleNeeds,
    loadHiddenNeeds: loadHiddenNeeds,
    saveHiddenNeeds: saveHiddenNeeds,
    renderNeedsStrip: renderNeedsStrip,
  };
});
