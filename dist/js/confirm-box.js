/* Agent Town: reusable confirm box (fix 40).
 *  AgentTown.confirmBox.open({ title, buttons: [{ id, text, disabled?, inert?, sub? }], onChoose(id), cancelId, menu?, onInert(id)? })
 *  W3: inert = aria-disabled and gray; a tap only calls onInert (no choice, no close). menu = stacked full-width buttons.
 *  A native modal <dialog> (#confirm-box): one choice per open (double taps count once), Esc or a tap
 *  outside = cancelId, focus trapped inside, focus returned on close. Used by the vault arcade
 *  ("Play <game>?") and later by the Wonkavator menu and the Etsy confirm. */
(function () {
  "use strict";
  const AT = (window.AgentTown = window.AgentTown || {});
  const dbg = () => (AT.debug = AT.debug || {});
  let dlg = null, opts = null, choosing = false, openedAt = 0, returnTo = null, lastDown = -1;
  // The tap that opens the box ends in a click that the browser may deliver to the box itself
  // (a button or the backdrop now under the finger). A click whose press started before the box
  // opened belongs to that opening tap and is ignored.
  document.addEventListener("pointerdown", () => (lastDown = performance.now()), true);
  const staleClick = (ev) => ev.isTrusted && ev.detail > 0 && lastDown < openedAt;

  function el() {
    if (dlg) return dlg;
    dlg = document.getElementById("confirm-box");
    if (!dlg) {
      dlg = document.createElement("dialog");
      dlg.id = "confirm-box";
      document.body.appendChild(dlg);
    }
    dlg.setAttribute("role", "dialog");
    dlg.setAttribute("aria-modal", "true");
    dlg.setAttribute("aria-labelledby", "confirm-title");
    dlg.addEventListener("cancel", (ev) => {
      ev.preventDefault();
      if (opts) close(opts.cancelId);
    });
    dlg.addEventListener("keydown", onKey);
    dlg.addEventListener("click", (ev) => {
      // tap on the backdrop (outside the card) = cancel; ignore the click that belongs to the opening tap
      if (ev.target !== dlg || !opts) return;
      if (staleClick(ev)) return;
      const r = dlg.getBoundingClientRect();
      const inside = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
      if (!inside) close(opts.cancelId);
    });
    return dlg;
  }

  function buttons() {
    return dlg ? Array.from(dlg.querySelectorAll(".confirm-buttons button")).filter((b) => !b.disabled && b.getAttribute("aria-disabled") !== "true") : [];
  }

  function onKey(ev) {
    if (ev.key === "Escape") {
      ev.preventDefault();
      ev.stopPropagation();
      if (opts) close(opts.cancelId);
      return;
    }
    const bs = buttons();
    if (!bs.length) {
      if (ev.key === "Tab") ev.preventDefault();
      return;
    }
    const at = bs.indexOf(document.activeElement);
    let to = -1;
    if (ev.key === "Tab") to = ev.shiftKey ? (at <= 0 ? bs.length - 1 : at - 1) : (at < 0 || at >= bs.length - 1 ? 0 : at + 1);
    else if (ev.key === "ArrowDown" || ev.key === "ArrowRight") to = at < 0 || at >= bs.length - 1 ? 0 : at + 1;
    else if (ev.key === "ArrowUp" || ev.key === "ArrowLeft") to = at <= 0 ? bs.length - 1 : at - 1;
    if (to >= 0) {
      ev.preventDefault();
      ev.stopPropagation();
      bs[to].focus();
    }
  }

  function choose(id) {
    if (choosing) {
      dbg().confirmIgnored = (dbg().confirmIgnored || 0) + 1;
      return;
    }
    choosing = true;
    dlg.querySelectorAll(".confirm-buttons button").forEach((b) => b.setAttribute("aria-disabled", "true"));
    close(id);
  }

  function open(o) {
    const d = el();
    if (d.open) close(opts ? opts.cancelId : null);
    opts = o || {};
    choosing = false;
    returnTo = document.activeElement;
    d.textContent = "";
    d.classList.toggle("confirm-menu", !!opts.menu);
    const h = document.createElement("h2");
    h.id = "confirm-title";
    h.textContent = opts.title || "";
    const row = document.createElement("div");
    row.className = "confirm-buttons";
    (opts.buttons || []).forEach((b) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.id = "confirm-" + b.id;
      btn.textContent = b.text;
      if (b.sub) {
        const s = document.createElement("small");
        s.textContent = b.sub;
        btn.appendChild(s);
      }
      if (b.disabled) btn.disabled = true;
      if (b.inert) btn.setAttribute("aria-disabled", "true");
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (staleClick(ev)) return;
        if (b.inert) {
          if (opts && typeof opts.onInert === "function") opts.onInert(b.id);
          return;
        }
        choose(b.id);
      });
      row.appendChild(btn);
    });
    d.appendChild(h);
    d.appendChild(row);
    openedAt = performance.now();
    d.showModal();
    const first = buttons()[0];
    if (first) first.focus();
    dbg().confirmShown = (dbg().confirmShown || 0) + 1;
    dbg().confirmLast = { title: opts.title || "", choice: null };
  }

  function close(choice) {
    if (!dlg || !dlg.open) return;
    const o = opts;
    opts = null;
    dlg.close();
    dbg().confirmLast = { title: (o && o.title) || "", choice: choice == null ? null : choice };
    if (returnTo && returnTo.focus && document.contains(returnTo)) {
      try { returnTo.focus(); } catch (e) {}
    }
    returnTo = null;
    if (o && typeof o.onChoose === "function") o.onChoose(choice);
  }

  AT.confirmBox = { open, close, isOpen: () => !!(dlg && dlg.open) };
})();
