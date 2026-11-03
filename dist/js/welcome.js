"use strict";
(function () {
  var el = document.getElementById("welcome-overlay");
  if (!el) return;
  var timer = null;
  var TAP = ["pointerdown", "touchstart", "mousedown", "click"];
  var AFTER = ["pointerdown", "pointerup", "touchstart", "touchend", "mousedown", "mouseup", "click"];
  function swallow(e) { e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); }
  function close() {
    if (!el.parentNode) return;
    clearTimeout(timer);
    el.parentNode.removeChild(el);
    window.removeEventListener("keydown", close, true);
  }
  function tapClose(e) {
    swallow(e);
    if (!el.parentNode) return;
    close();
    // the rest of this tap (up / end / click) must not reach the castle
    AFTER.forEach(function (t) { window.addEventListener(t, swallow, { capture: true, passive: false }); });
    setTimeout(function () {
      AFTER.forEach(function (t) { window.removeEventListener(t, swallow, { capture: true }); });
    }, 400);
  }
  TAP.forEach(function (t) { el.addEventListener(t, tapClose, { passive: false }); });
  window.addEventListener("keydown", close, true);
  timer = setTimeout(close, 35000);
})();
