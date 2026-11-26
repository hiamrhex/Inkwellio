/**
 * theme.js — zero-FOUC theme & motion preference bootstrap.
 * Loaded as a blocking <script> in <head> before first paint.
 * Sets data-theme and data-motion on <html> immediately.
 */
(function () {
  try {
    var t = localStorage.getItem("inkwellio-theme");
    var d = document.documentElement;
    var resolved =
      !t || t === "system"
        ? window.matchMedia("(prefers-color-scheme:dark)").matches
          ? "dark"
          : "light"
        : t === "dark"
          ? "dark"
          : "light";
    d.setAttribute("data-theme", resolved);

    var paused = localStorage.getItem("inkwellio-motion-paused") === "1";
    d.setAttribute("data-motion", paused ? "paused" : "active");
  } catch {}
})();
