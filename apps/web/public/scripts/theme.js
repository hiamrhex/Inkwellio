/**
 * theme.js — zero-FOUC theme bootstrap.
 * Loaded as a blocking <script> in <head> before first paint.
 * < 400 bytes uncompressed. No dependencies.
 * CSP: add its hash/nonce before strict CSP ships (documented in
 * docs/plans/art-direction-plan.md §Security).
 */
(function () {
  try {
    var t = localStorage.getItem("inkwellio-theme");
    var d = document.documentElement;
    if (!t || t === "system") {
      d.setAttribute(
        "data-theme",
        window.matchMedia("(prefers-color-scheme:dark)").matches
          ? "dark"
          : "light"
      );
    } else {
      d.setAttribute("data-theme", t === "dark" ? "dark" : "light");
    }
  } catch {}
})();
