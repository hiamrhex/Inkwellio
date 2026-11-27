/**
 * theme.js — zero-FOUC theme & motion bootstrap + single-theme hero ribbon preload/mount.
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
      var srcset =
        "/images/hero-ribbon-" +
        resolved +
        "-mobile.webp 680w, /images/hero-ribbon-" +
        resolved +
        ".webp 1280w";
      var sizes = "(max-width: 767px) 74vw, 62vw";
      var link = document.createElement("link");
      link.rel = "preload";
      link.as = "image";
      link.setAttribute("fetchpriority", "high");
      link.setAttribute("data-hero-preload", "true");
      link.imageSrcset = srcset;
      link.imageSizes = sizes;
      head.appendChild(link);

      var bindRibbon = function (el) {
        el.setAttribute("srcset", srcset);
        el.setAttribute("sizes", sizes);
        el.setAttribute("src", "/images/hero-ribbon-" + resolved + ".webp");
      };
      var existing = document.querySelector("img[data-hero-ribbon]");
      if (existing) {
        bindRibbon(existing);
      } else if (typeof MutationObserver !== "undefined") {
        var obs = new MutationObserver(function () {
          var img = document.querySelector("img[data-hero-ribbon]");
          if (img) {
            obs.disconnect();
            bindRibbon(img);
          }
        });
        obs.observe(d, { childList: true, subtree: true });
      }
    }
  } catch {}
})();
