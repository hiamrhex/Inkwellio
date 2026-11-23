/**
 * landing-runtime.js — Layer 3 interactivity for the landing page.
 * Responsibilities:
 *   1. Theme toggle: single-button sun/moon click handler.
 *   2. Spotlight cards: pointer-move → CSS custom property pair.
 *   3. Pointer island: passive pointermove with ResizeObserver rect caching.
 *
 * Rules:
 * - No frameworks. No dependencies.
 * - Passive event listeners only (no preventDefault on scroll/pointer).
 * - ResizeObserver caches card rect; recomputes only on resize.
 * - <= 3 KB gzip budget.
 * - catch variables: empty catch {} syntax (ES2019+, Chrome 66+).
 */

(function () {
  "use strict";

  /* ── 1. Theme toggle ─────────────────────────────────────────── */
  function applyTheme(t) {
    try {
      document.documentElement.setAttribute("data-theme", t);
      localStorage.setItem("inkwellio-theme", t);
    } catch {}
  }

  function toggleTheme() {
    var current = document.documentElement.getAttribute("data-theme");
    applyTheme(current === "dark" ? "light" : "dark");
  }

  document.addEventListener("click", function (e) {
    if (e.target && e.target.closest("[data-theme-toggle]")) {
      toggleTheme();
    }
  });

  /* ── 2. Spotlight cards ─────────────────────────────────────── */
  var cardRects = new WeakMap();
  var ro = null;

  function getRect(el) {
    if (!cardRects.has(el)) {
      cardRects.set(el, el.getBoundingClientRect());
    }
    return cardRects.get(el);
  }

  function initSpotlightCards() {
    var cards = document.querySelectorAll("[data-spotlight]");
    if (!cards.length) return;

    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(function () {
        cards.forEach(function (card) {
          cardRects.delete(card);
        });
      });
      cards.forEach(function (card) {
        ro.observe(card);
      });
    }

    document.addEventListener(
      "pointermove",
      function (e) {
        cards.forEach(function (card) {
          var rect = getRect(card);
          var x = e.clientX - rect.left;
          var y = e.clientY - rect.top;
          card.style.setProperty("--spotlight-x", x + "px");
          card.style.setProperty("--spotlight-y", y + "px");
        });
      },
      { passive: true }
    );
  }

  /* ── 3. Hero pointer parallax ──────────────────────────────── */
  function initHeroParallax() {
    var stage = document.querySelector(".hero-stage");
    if (!stage) return;

    document.addEventListener(
      "pointermove",
      function (e) {
        var cx = window.innerWidth / 2;
        var cy = window.innerHeight / 2;
        var mx = ((e.clientX - cx) / cx).toFixed(4);
        var my = ((e.clientY - cy) / cy).toFixed(4);
        stage.style.setProperty("--mx", mx);
        stage.style.setProperty("--my", my);
      },
      { passive: true }
    );
  }

  /* ── Init ───────────────────────────────────────────────────── */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      initSpotlightCards();
      initHeroParallax();
    });
  } else {
    initSpotlightCards();
    initHeroParallax();
  }
})();
