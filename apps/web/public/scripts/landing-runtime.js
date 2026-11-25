/**
 * landing-runtime.js — Layer 3 interactivity for Inkwellio landing page.
 * Responsibilities:
 *   1. Theme toggle: single-button sun/moon click handler.
 *   2. ONE shared passive pointermove + rAF driver (hover/fine pointers & motion allowed):
 *      - Spotlight cards with WeakMap rect cache invalidated on ResizeObserver + scroll
 *      - Hero stage normalized coordinates (--mx, --my), stopping loop immediately at rest.
 */

(function () {
  "use strict";

  function applyTheme(t) {
    try {
      document.documentElement.setAttribute("data-theme", t);
      localStorage.setItem("inkwellio-theme", t);
    } catch {}
  }

  document.addEventListener("click", function (e) {
    if (e.target && e.target.closest("[data-theme-toggle]")) {
      var cur = document.documentElement.getAttribute("data-theme");
      applyTheme(cur === "dark" ? "light" : "dark");
    }
  });

  function initSharedPointer() {
    var fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    var stage = document.querySelector(".hero-stage");
    var cards = Array.prototype.slice.call(document.querySelectorAll("[data-spotlight]"));
    if (!stage && !cards.length) return;

    var rects = new WeakMap();
    var invalidate = function () {
      for (var i = 0; i < cards.length; i++) rects.delete(cards[i]);
    };

    if (typeof ResizeObserver !== "undefined" && cards.length) {
      var ro = new ResizeObserver(invalidate);
      for (var i = 0; i < cards.length; i++) ro.observe(cards[i]);
    }
    window.addEventListener("scroll", invalidate, { passive: true });

    var lastX = 0;
    var lastY = 0;
    var rafId = 0;

    function applyFrame() {
      rafId = 0;
      if (!fine.matches || reduced.matches) return;
      if (stage) {
        var cx = window.innerWidth * 0.5 || 1;
        var cy = window.innerHeight * 0.5 || 1;
        stage.style.setProperty("--mx", ((lastX - cx) / cx).toFixed(4));
        stage.style.setProperty("--my", ((lastY - cy) / cy).toFixed(4));
      }
      for (var i = 0; i < cards.length; i++) {
        var card = cards[i];
        var rect = rects.get(card);
        if (!rect) {
          rect = card.getBoundingClientRect();
          rects.set(card, rect);
        }
        card.style.setProperty("--spotlight-x", (lastX - rect.left).toFixed(1) + "px");
        card.style.setProperty("--spotlight-y", (lastY - rect.top).toFixed(1) + "px");
      }
    }

    document.addEventListener(
      "pointermove",
      function (e) {
        if (!fine.matches || reduced.matches) return;
        lastX = e.clientX;
        lastY = e.clientY;
        if (!rafId) rafId = requestAnimationFrame(applyFrame);
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
