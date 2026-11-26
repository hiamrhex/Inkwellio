/**
 * landing-runtime.js — Layer 3 interactivity across Inkwellio.
 * 1. Theme toggle delegation ([data-theme-toggle]).
 * 2. Single shared passive pointermove + rAF loop (fine hover pointers & motion allowed):
 *    - Exposes window.__inkwellioPointer for lazy background canvases (zero extra listeners)
 *    - Caches element rects in WeakMap, invalidated on ResizeObserver + passive scroll
 *    - Drives hero 3D tilt (--tx, --ty <= +-5deg), sculpture offset (--mx, --my),
 *      spotlight surfaces ([data-spotlight]), signature card light tilt ([data-tilt-stage]),
 *      and magnetic primary buttons ([data-magnetic], <= +-5px). Loop stops at rest.
 */
(function () {
  "use strict";

  function applyTheme(t) {
    try {
      document.documentElement.setAttribute("data-theme", t);
      localStorage.setItem("inkwellio-theme", t);
    } catch {}
  }

  function applyMotionPaused(paused) {
    try {
      var d = document.documentElement;
      d.setAttribute("data-motion", paused ? "paused" : "active");
      localStorage.setItem("inkwellio-motion-paused", paused ? "1" : "0");
      var toggles = document.querySelectorAll("[data-motion-toggle]");
      for (var i = 0; i < toggles.length; i++) {
        toggles[i].setAttribute("aria-pressed", paused ? "true" : "false");
      }
      window.dispatchEvent(new Event("inkwellio:motion-change"));
    } catch {}
  }

  function syncMotionButton() {
    var paused = document.documentElement.getAttribute("data-motion") === "paused";
    var toggles = document.querySelectorAll("[data-motion-toggle]");
    for (var i = 0; i < toggles.length; i++) {
      toggles[i].setAttribute("aria-pressed", paused ? "true" : "false");
    }
  }

  document.addEventListener("click", function (e) {
    var themeBtn = e.target && e.target.closest ? e.target.closest("[data-theme-toggle]") : null;
    if (themeBtn) {
      var cur = document.documentElement.getAttribute("data-theme");
      applyTheme(cur === "dark" ? "light" : "dark");
      return;
    }
    var motionBtn = e.target && e.target.closest ? e.target.closest("[data-motion-toggle]") : null;
    if (motionBtn) {
      var isPaused = document.documentElement.getAttribute("data-motion") === "paused";
      applyMotionPaused(!isPaused);
    }
  });

  function initSharedPointer() {
    syncMotionButton();
    var fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    var stage = document.querySelector(".hero-stage");
    var heroTilt = document.querySelector("[data-tilt-hero]");
    var stageCards = Array.prototype.slice.call(document.querySelectorAll("[data-tilt-stage]"));
    var spotlights = Array.prototype.slice.call(document.querySelectorAll("[data-spotlight]"));
    var magnetics = Array.prototype.slice.call(document.querySelectorAll("[data-magnetic]"));
    var pointerState = { x: -9999, y: -9999, active: false };
    window.__inkwellioPointer = pointerState;

    if (!stage && !heroTilt && !stageCards.length && !spotlights.length && !magnetics.length) return;

    var rects = new WeakMap();
    var allMeasured = [].concat(heroTilt ? [heroTilt] : [], stageCards, spotlights, magnetics);
    var invalidate = function () {
      for (var i = 0; i < allMeasured.length; i++) rects.delete(allMeasured[i]);
    };

    if (typeof ResizeObserver !== "undefined" && allMeasured.length) {
      var ro = new ResizeObserver(invalidate);
      for (var i = 0; i < allMeasured.length; i++) ro.observe(allMeasured[i]);
    }
    window.addEventListener("scroll", invalidate, { passive: true });
    window.addEventListener("resize", invalidate, { passive: true });

    function getRect(el) {
      var r = rects.get(el);
      if (!r) {
        r = el.getBoundingClientRect();
        rects.set(el, r);
      }
      return r;
    }

    function clamp(v, min, max) {
      return v < min ? min : v > max ? max : v;
    }

    var rafId = 0;

    function resetTransforms() {
      if (stage) {
        stage.style.setProperty("--mx", "0");
        stage.style.setProperty("--my", "0");
      }
      if (heroTilt) {
        heroTilt.style.setProperty("--tx", "0");
        heroTilt.style.setProperty("--ty", "0");
      }
      for (var s = 0; s < stageCards.length; s++) {
        stageCards[s].style.setProperty("--sx", "0");
        stageCards[s].style.setProperty("--sy", "0");
      }
      for (var m = 0; m < magnetics.length; m++) {
        magnetics[m].style.setProperty("--mag-x", "0px");
        magnetics[m].style.setProperty("--mag-y", "0px");
      }
    }

    function isMotionFrozen() {
      return reduced.matches || document.documentElement.getAttribute("data-motion") === "paused";
    }

    function applyFrame() {
      rafId = 0;
      if (!fine.matches || isMotionFrozen()) {
        pointerState.active = false;
        resetTransforms();
        return;
      }

      var x = pointerState.x;
      var y = pointerState.y;

      if (stage) {
        var cx = window.innerWidth * 0.5 || 1;
        var cy = window.innerHeight * 0.5 || 1;
        stage.style.setProperty("--mx", ((x - cx) / cx).toFixed(4));
        stage.style.setProperty("--my", ((y - cy) / cy).toFixed(4));
      }

      if (heroTilt) {
        var hr = getRect(heroTilt);
        if (hr.width > 0 && hr.height > 0) {
          var insideHero = x >= hr.left && x <= hr.right && y >= hr.top && y <= hr.bottom;
          if (insideHero) {
            var hnx = ((x - hr.left) / hr.width - 0.5) * 2;
            var hny = ((y - hr.top) / hr.height - 0.5) * 2;
            heroTilt.style.setProperty("--tx", clamp(-hny * 4.5, -5, 5).toFixed(2));
            heroTilt.style.setProperty("--ty", clamp(hnx * 4.5, -5, 5).toFixed(2));
          } else {
            heroTilt.style.setProperty("--tx", "0");
            heroTilt.style.setProperty("--ty", "0");
          }
        }
      }

      for (var sc = 0; sc < stageCards.length; sc++) {
        var cardEl = stageCards[sc];
        var sr = getRect(cardEl);
        var near =
          x >= sr.left - 32 && x <= sr.right + 32 && y >= sr.top - 32 && y <= sr.bottom + 32;
        if (near && sr.width > 0 && sr.height > 0) {
          var snx = ((x - sr.left) / sr.width - 0.5) * 2;
          var sny = ((y - sr.top) / sr.height - 0.5) * 2;
          cardEl.style.setProperty("--sx", clamp(-sny * 2.5, -3, 3).toFixed(2));
          cardEl.style.setProperty("--sy", clamp(snx * 2.5, -3, 3).toFixed(2));
        } else {
          cardEl.style.setProperty("--sx", "0");
          cardEl.style.setProperty("--sy", "0");
        }
      }

      for (var i = 0; i < spotlights.length; i++) {
        var card = spotlights[i];
        var rect = getRect(card);
        card.style.setProperty("--spotlight-x", (x - rect.left).toFixed(1) + "px");
        card.style.setProperty("--spotlight-y", (y - rect.top).toFixed(1) + "px");
      }

      for (var j = 0; j < magnetics.length; j++) {
        var btn = magnetics[j];
        var mr = getRect(btn);
        var hoverBtn =
          x >= mr.left - 24 && x <= mr.right + 24 && y >= mr.top - 24 && y <= mr.bottom + 24;
        if (hoverBtn && mr.width > 0 && mr.height > 0) {
          var pullX = clamp((x - (mr.left + mr.width * 0.5)) * 0.16, -5, 5);
          var pullY = clamp((y - (mr.top + mr.height * 0.5)) * 0.16, -5, 5);
          btn.style.setProperty("--mag-x", pullX.toFixed(1) + "px");
          btn.style.setProperty("--mag-y", pullY.toFixed(1) + "px");
        } else {
          btn.style.setProperty("--mag-x", "0px");
          btn.style.setProperty("--mag-y", "0px");
        }
      }
    }

    document.addEventListener(
      "pointermove",
      function (e) {
        if (!fine.matches || isMotionFrozen()) return;
        pointerState.x = e.clientX;
        pointerState.y = e.clientY;
        pointerState.active = true;
        if (!rafId) rafId = requestAnimationFrame(applyFrame);
      },
      { passive: true }
    );

    window.addEventListener("inkwellio:motion-change", function () {
      if (isMotionFrozen()) {
        pointerState.active = false;
        resetTransforms();
      }
    });

    document.addEventListener(
      "pointerleave",
      function () {
        pointerState.active = false;
        resetTransforms();
      },
      { passive: true }
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSharedPointer);
  } else {
    initSharedPointer();
  }
})();
