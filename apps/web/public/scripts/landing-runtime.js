/** landing-runtime.js — theme/motion toggle + single passive pointer controller */
(function () {
  "use strict";
  var d = document.documentElement;
  function qAll(s) { return document.querySelectorAll(s); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function sv(el, k, v) { if (el) el.style.setProperty(k, v); }
  function applyTheme(t) {
    try { d.setAttribute("data-theme", t); localStorage.setItem("inkwellio-theme", t); } catch {}
  }
  function syncMotion(paused) {
    var ts = qAll("[data-motion-toggle]");
    for (var i = 0; i < ts.length; i++) ts[i].setAttribute("aria-pressed", paused ? "true" : "false");
  }
  function applyMotionPaused(paused) {
    try {
      d.setAttribute("data-motion", paused ? "paused" : "active");
      localStorage.setItem("inkwellio-motion-paused", paused ? "1" : "0");
      syncMotion(paused);
      window.dispatchEvent(new Event("inkwellio:motion-change"));
    } catch {}
  }
  document.addEventListener("click", function (e) {
    var t = e.target && e.target.closest;
    var tb = t ? e.target.closest("[data-theme-toggle]") : null;
    if (tb) { applyTheme(d.getAttribute("data-theme") === "dark" ? "light" : "dark"); return; }
    var mb = t ? e.target.closest("[data-motion-toggle]") : null;
    if (mb) applyMotionPaused(d.getAttribute("data-motion") !== "paused");
  });

  function initPointer() {
    syncMotion(d.getAttribute("data-motion") === "paused");
    var fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    var heroOuter = document.querySelector(".hero-stage-outer");
    var stage = document.querySelector(".hero-stage");
    var ribbonBox = document.querySelector(".hero-ribbon-media-box");
    var heroTilt = document.querySelector("[data-tilt-hero]");
    var stageCards = [].slice.call(qAll("[data-tilt-stage]"));
    var spotlights = [].slice.call(qAll("[data-spotlight]"));
    var magnetics = [].slice.call(qAll("[data-magnetic]"));
    var vw = window.innerWidth || 1440, vh = window.innerHeight || 900;
    var p = { x: vw * 0.65, y: vh * 0.42, curX: vw * 0.65, curY: vh * 0.42, rx: 0, ry: 0, tx: 0, ty: 0, lastMoveAt: 0, active: false };
    window.__inkwellioPointer = p;
    if (!stage && !heroTilt && !ribbonBox && !stageCards.length && !spotlights.length && !magnetics.length) return;

    var rects = new WeakMap();
    var allMeasured = [].concat(heroOuter || [], heroTilt || [], stageCards, spotlights, magnetics);
    function invalidate() {
      vw = window.innerWidth || 1440; vh = window.innerHeight || 900;
      for (var i = 0; i < allMeasured.length; i++) rects.delete(allMeasured[i]);
    }
    if (typeof ResizeObserver !== "undefined" && allMeasured.length) {
      var ro = new ResizeObserver(invalidate);
      for (var i = 0; i < allMeasured.length; i++) ro.observe(allMeasured[i]);
    }
    window.addEventListener("scroll", invalidate, { passive: true });
    window.addEventListener("resize", invalidate, { passive: true });
    function getRect(el) { var r = rects.get(el); if (!r) { r = el.getBoundingClientRect(); rects.set(el, r); } return r; }
    function frozen() { return reduced.matches || d.getAttribute("data-motion") === "paused"; }
    var rafId = 0, lastAt = 0;

    function reset() {
      p.rx = p.ry = p.tx = p.ty = 0;
      if (heroOuter) {
        sv(heroOuter, "--mx", "0"); sv(heroOuter, "--my", "0");
        sv(heroOuter, "--rx", "0px"); sv(heroOuter, "--ry", "0px");
        sv(heroOuter, "--cursor-x", "65%"); sv(heroOuter, "--cursor-y", "42%");
        heroOuter.style.removeProperty("--spotlight-active");
      }
      sv(stage, "--mx", "0"); sv(stage, "--my", "0");
      sv(ribbonBox, "--rx", "0px"); sv(ribbonBox, "--ry", "0px");
      sv(heroTilt, "--tx", "0"); sv(heroTilt, "--ty", "0");
      for (var s = 0; s < stageCards.length; s++) { sv(stageCards[s], "--sx", "0"); sv(stageCards[s], "--sy", "0"); }
      for (var m = 0; m < magnetics.length; m++) { sv(magnetics[m], "--mag-x", "0px"); sv(magnetics[m], "--mag-y", "0px"); }
    }

    function tick(now) {
      rafId = 0;
      if (!fine.matches || frozen()) { p.active = false; reset(); return; }
      var dt = lastAt ? clamp(now - lastAt, 8, 50) : 16.667;
      lastAt = now;
      var idle = p.lastMoveAt ? now - p.lastMoveAt : 0;
      var baseLerp = idle > 280 ? Math.min(0.45, 0.11 + (idle - 280) * 0.0012) : 0.11;
      var a = 1 - Math.pow(1 - baseLerp, dt / 16.667);
      var x = p.x, y = p.y;
      var nx = clamp((x / (vw || 1)) * 2 - 1, -1, 1), ny = clamp((y / (vh || 1)) * 2 - 1, -1, 1);
      var tRx = nx * 18, tRy = ny * 12, tTx = 0, tTy = 0;
      if (heroTilt) {
        var hr = getRect(heroTilt);
        var topB = heroOuter ? getRect(heroOuter).top : hr.top - 120;
        var botB = heroOuter ? getRect(heroOuter).bottom : hr.bottom + 120;
        if (y >= topB && y <= botB) { tTx = clamp(-ny * 2.2, -3.5, 3.5); tTy = clamp(nx * 5.8, -6, 6); }
      }
      if (idle >= 780) { p.curX = x; p.curY = y; p.rx = tRx; p.ry = tRy; p.tx = tTx; p.ty = tTy; }
      else { p.curX += (x - p.curX) * a; p.curY += (y - p.curY) * a; p.rx += (tRx - p.rx) * a; p.ry += (tRy - p.ry) * a; p.tx += (tTx - p.tx) * a; p.ty += (tTy - p.ty) * a; }

      if (heroOuter) {
        var or = getRect(heroOuter);
        sv(heroOuter, "--mx", nx.toFixed(4)); sv(heroOuter, "--my", ny.toFixed(4));
        sv(heroOuter, "--cursor-x", (p.curX - or.left).toFixed(1) + "px");
        sv(heroOuter, "--cursor-y", (p.curY - or.top).toFixed(1) + "px");
        sv(heroOuter, "--spotlight-active", "1");
        sv(heroOuter, "--rx", p.rx.toFixed(2) + "px"); sv(heroOuter, "--ry", p.ry.toFixed(2) + "px");
      }
      sv(stage, "--mx", nx.toFixed(4)); sv(stage, "--my", ny.toFixed(4));
      sv(ribbonBox, "--rx", p.rx.toFixed(2) + "px"); sv(ribbonBox, "--ry", p.ry.toFixed(2) + "px");
      sv(heroTilt, "--tx", p.tx.toFixed(2)); sv(heroTilt, "--ty", p.ty.toFixed(2));

      for (var sc = 0; sc < stageCards.length; sc++) {
        var c = stageCards[sc], sr = getRect(c);
        if (x >= sr.left - 32 && x <= sr.right + 32 && y >= sr.top - 32 && y <= sr.bottom + 32 && sr.width > 0) {
          sv(c, "--sx", clamp(-((y - sr.top) / sr.height - 0.5) * 5, -3, 3).toFixed(2));
          sv(c, "--sy", clamp(((x - sr.left) / sr.width - 0.5) * 5, -3, 3).toFixed(2));
        } else { sv(c, "--sx", "0"); sv(c, "--sy", "0"); }
      }
      for (var i = 0; i < spotlights.length; i++) {
        var sp = spotlights[i], spr = getRect(sp);
        sv(sp, "--spotlight-x", (p.curX - spr.left).toFixed(1) + "px");
        sv(sp, "--spotlight-y", (p.curY - spr.top).toFixed(1) + "px");
      }
      for (var j = 0; j < magnetics.length; j++) {
        var btn = magnetics[j], mr = getRect(btn);
        if (x >= mr.left - 28 && x <= mr.right + 28 && y >= mr.top - 28 && y <= mr.bottom + 28 && mr.width > 0) {
          sv(btn, "--mag-x", clamp((x - (mr.left + mr.width * 0.5)) * 0.18, -6, 6).toFixed(1) + "px");
          sv(btn, "--mag-y", clamp((y - (mr.top + mr.height * 0.5)) * 0.18, -6, 6).toFixed(1) + "px");
        } else { sv(btn, "--mag-x", "0px"); sv(btn, "--mag-y", "0px"); }
      }
      var settled = Math.abs(x - p.curX) < 0.35 && Math.abs(y - p.curY) < 0.35 && Math.abs(tRx - p.rx) < 0.1 && Math.abs(tTy - p.ty) < 0.05;
      if (!settled && idle < 780) rafId = requestAnimationFrame(tick);
      else { lastAt = 0; p.active = false; }
    }

    document.addEventListener("pointermove", function (e) {
      if (e.pointerType === "touch" || !fine.matches || frozen()) return;
      p.x = e.clientX; p.y = e.clientY; p.lastMoveAt = performance.now(); p.active = true;
      if (!rafId) rafId = requestAnimationFrame(tick);
      window.dispatchEvent(new Event("inkwellio:pointer-wake"));
    }, { passive: true });
    function stop() { p.active = false; if (rafId) { cancelAnimationFrame(rafId); rafId = 0; } reset(); }
    window.addEventListener("inkwellio:motion-change", function () { if (frozen()) stop(); });
    document.addEventListener("pointerleave", stop, { passive: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initPointer);
  else initPointer();
})();
