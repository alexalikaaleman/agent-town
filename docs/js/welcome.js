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
  // Lift the block 25vh above centre; keep a small top margin, and shrink the intro just enough if it would clip.
  function fit() {
    if (!el.parentNode) return;
    var inner = el.querySelector(".wo-inner"), body = el.querySelector(".wo-text");
    if (!inner || !body) return;
    body.style.fontSize = "";
    inner.style.transform = "";
    var H = window.innerHeight, margin = Math.max(6, H * 0.02);
    var px = parseFloat(getComputedStyle(body).fontSize);
    for (var i = 0; i < 40 && inner.getBoundingClientRect().height > H - 2 * margin && px > 10; i++) {
      px -= 1;
      body.style.fontSize = px + "px";
    }
    var top = inner.getBoundingClientRect().top;
    var lift = Math.max(0, Math.min(H * 0.25, top - margin));
    inner.style.transform = "translateY(" + -lift + "px)";
  }
  fit();
  window.addEventListener("resize", fit);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
  TAP.forEach(function (t) { el.addEventListener(t, tapClose, { passive: false }); });
  window.addEventListener("keydown", close, true);
  timer = setTimeout(close, 35000);
})();
