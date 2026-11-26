/**
 * theme.js — zero-FOUC theme & motion bootstrap + single-theme hero ribbon preload.
 * Loaded as a blocking <script> in <head> before first paint.
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

    if (window.location && window.location.pathname === "/") {
      var head = document.head || d;
      var link = document.createElement("link");
      link.rel = "preload";
      link.as = "image";
      link.setAttribute("fetchpriority", "high");
      link.setAttribute("data-hero-preload", "true");
      link.imageSrcset =
        "/images/hero-ribbon-" +
        resolved +
        "-mobile.webp 680w, /images/hero-ribbon-" +
        resolved +
        ".webp 1280w";
      link.imageSizes = "(max-width: 1023px) 100vw, 56vw";
      head.appendChild(link);
    }
  } catch {}
})();
