/**
 * theme.js — zero-FOUC theme bootstrap.
 * Loaded as a blocking <script> in <head> before first paint.
 * Sets data-theme on <html> and preloads only the active theme's hero sculpture on /.
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

    if (window.location.pathname === "/") {
      var imgUrl =
        resolved === "light" ? "/images/hero-ink-light.webp" : "/images/hero-ink-dark.webp";
      var l = document.createElement("link");
      l.rel = "preload";
      l.as = "image";
      l.href = imgUrl;
      l.setAttribute("fetchpriority", "high");
      document.head.appendChild(l);
    }
  } catch {}
})();
