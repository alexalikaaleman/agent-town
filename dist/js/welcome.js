"use strict";
(function () {
  var el = document.getElementById("welcome-overlay");
  if (!el) return;
  var timer = null;
  function close() {
    if (!el.parentNode) return;
    clearTimeout(timer);
    el.parentNode.removeChild(el);
    ["pointerdown", "click", "keydown", "touchstart"].forEach(function (t) { window.removeEventListener(t, close, true); });
  }
  timer = setTimeout(close, 35000);
  ["pointerdown", "click", "keydown", "touchstart"].forEach(function (t) { window.addEventListener(t, close, true); });
})();
