"use client";

import { useEffect, useRef } from "react";

interface SharedPointerWindow extends Window {
  __inkwellioPointer?: { x: number; y: number; active: boolean };
}

interface RibbonStrand {
  readonly offset: number;
  readonly amp: number;
  readonly freq: number;
  readonly speed: number;
  readonly width: number;
  readonly emeraldMix: number;
  readonly alpha: number;
}

const STRANDS: readonly RibbonStrand[] = [
  { offset: -0.22, amp: 0.16, freq: 2.1, speed: 0.42, width: 2.2, emeraldMix: 0.08, alpha: 0.42 },
  { offset: -0.09, amp: 0.21, freq: 1.75, speed: 0.34, width: 1.5, emeraldMix: 0.32, alpha: 0.32 },
  { offset: 0.03, amp: 0.18, freq: 2.45, speed: 0.51, width: 3.1, emeraldMix: 0.14, alpha: 0.26 },
  { offset: 0.14, amp: 0.23, freq: 1.55, speed: 0.29, width: 1.25, emeraldMix: 0.48, alpha: 0.28 },
  { offset: 0.26, amp: 0.14, freq: 2.8, speed: 0.46, width: 1.75, emeraldMix: 0.18, alpha: 0.22 },
];

/**
 * HeroRibbonCanvas — Mathematical calligraphic ink-ribbon canvas behind Hero stage.
 * Renders continuous silver/emerald splines on Dark (#000000) and charcoal/emerald
 * ink strokes on Light (#f1f3f5). Pauses off-screen, on hidden tabs, under
 * prefers-reduced-motion: reduce, or when [data-motion="paused"] is toggled.
 */
export function HeroRibbonCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const fineQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
    let isVisible = true;
    let isTabVisible = !document.hidden;
    let rafId: number | null = null;
    let lastDraw = 0;
    const minFrameMs = 1000 / 30;
    const startTime = performance.now();

    let cssW = 1;
    let cssH = 1;
    let hostLeft = 0;
    let hostTop = 0;
    let curMouseX = 0.72;
    let curMouseY = 0.48;
    let curPull = 0.15;
    let scrollTwist = 0;

    const isMotionFrozen = () =>
      reducedQuery.matches ||
      document.documentElement.getAttribute("data-motion") === "paused";

    const syncBounds = () => {
      const rect = host.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      hostLeft = rect.left;
      hostTop = rect.top;
      cssW = Math.max(1, rect.width);
      cssH = Math.max(1, rect.height);
      const pxW = Math.floor(cssW * dpr);
      const pxH = Math.floor(cssH * dpr);
      if (canvas.width !== pxW || canvas.height !== pxH) {
        canvas.width = pxW;
        canvas.height = pxH;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const heroStage = document.querySelector(".hero-stage") as HTMLElement | null;
      const heroH = Math.max(1, cssH);
      scrollTwist = Math.max(
        0,
        Math.min(1, (window.scrollY || window.pageYOffset || 0) / heroH),
      );
      void heroStage;
    };

    const drawRibbons = (timeSec: number) => {
      ctx.clearRect(0, 0, cssW, cssH);

      const isLight = document.documentElement.getAttribute("data-theme") === "light";
      const isNarrow = cssW < 768;
      const anchorX = isNarrow ? cssW * 0.52 : cssW * 0.72;
      const anchorY = isNarrow ? cssH * 0.72 : cssH * 0.49;
      const spanX = isNarrow ? cssW * 1.15 : cssW * 0.68;
      const spanY = cssH * 0.38;
      const segments = isNarrow ? 34 : 52;

      const baseR = isLight ? 15 : 244;
      const baseG = isLight ? 23 : 246;
      const baseB = isLight ? 42 : 250;
      const accR = isLight ? 15 : 16;
      const accG = isLight ? 118 : 185;
      const accB = isLight ? 110 : 129;

      for (let s = 0; s < STRANDS.length; s++) {
        const strand = STRANDS[s];
        const strokeR = Math.round(baseR + (accR - baseR) * strand.emeraldMix);
        const strokeG = Math.round(baseG + (accG - baseG) * strand.emeraldMix);
        const strokeB = Math.round(baseB + (accB - baseB) * strand.emeraldMix);

        const grad = ctx.createLinearGradient(
          anchorX - spanX * 0.52,
          anchorY - spanY * 0.5,
          anchorX + spanX * 0.52,
          anchorY + spanY * 0.5,
        );
        const aEdge = (strand.alpha * 0.08).toFixed(3);
        const aMid = (strand.alpha * (isLight ? 0.92 : 1.0)).toFixed(3);
        grad.addColorStop(0, `rgba(${strokeR}, ${strokeG}, ${strokeB}, ${aEdge})`);
        grad.addColorStop(0.5, `rgba(${strokeR}, ${strokeG}, ${strokeB}, ${aMid})`);
        grad.addColorStop(1, `rgba(${strokeR}, ${strokeG}, ${strokeB}, ${aEdge})`);

        ctx.beginPath();
        ctx.strokeStyle = grad;
        ctx.lineWidth = strand.width;
        ctx.lineCap = "round";

        for (let i = 0; i <= segments; i++) {
          const u = i / segments;
          const phase =
            u * Math.PI * strand.freq +
            timeSec * strand.speed +
            scrollTwist * (1.2 + s * 0.25) +
            s * 0.9;

          const baseX =
            anchorX +
            (u - 0.5) * spanX +
            Math.sin(phase * 0.72 + strand.offset * 6) * cssW * 0.055;
          const waveY =
            anchorY +
            (u - 0.5) * -spanY * 0.42 +
            Math.sin(phase) * spanY * strand.amp +
            Math.cos(phase * 1.45 - u * 3.1) * spanY * 0.09 +
            strand.offset * spanY * 0.85;

          const mxPx = curMouseX * cssW;
          const myPx = curMouseY * cssH;
          const dx = mxPx - baseX;
          const dy = myPx - waveY;
          const dist = Math.hypot(dx, dy);
          const radius = isNarrow ? 180 : 290;
          const influence =
            dist < radius ? Math.pow(1 - dist / radius, 2) * curPull * 0.26 : 0;

          const px = baseX + dx * influence;
          const py = waveY + dy * influence;

          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
    };

    const stopLoop = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    };

    const tick = (now: number) => {
      if (!isVisible || !isTabVisible || isMotionFrozen()) {
        rafId = null;
        return;
      }

      if (now - lastDraw >= minFrameMs) {
        lastDraw = now;
        const shared = (window as SharedPointerWindow).__inkwellioPointer;
        let targetX = 0.72;
        let targetY = 0.48;
        let targetPull = 0.16;

        if (fineQuery.matches && shared && shared.active) {
          targetX = Math.max(0, Math.min(1, (shared.x - hostLeft) / cssW));
          targetY = Math.max(0, Math.min(1, (shared.y - hostTop) / cssH));
          targetPull = 1.0;
        }

        curMouseX += (targetX - curMouseX) * 0.095;
        curMouseY += (targetY - curMouseY) * 0.095;
        curPull += (targetPull - curPull) * 0.095;
        drawRibbons((now - startTime) * 0.001);
      }

      rafId = requestAnimationFrame(tick);
    };

    const syncRunState = () => {
      if (isMotionFrozen()) {
        stopLoop();
        drawRibbons(1.4);
        return;
      }
      if (isVisible && isTabVisible && rafId === null) {
        rafId = requestAnimationFrame(tick);
      } else if ((!isVisible || !isTabVisible) && rafId !== null) {
        stopLoop();
      }
    };

    syncBounds();

    const io =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(
            (entries) => {
              const entry = entries[0];
              if (entry) {
                isVisible = entry.isIntersecting;
                syncRunState();
              }
            },
            { threshold: 0.01 },
          )
        : null;
    io?.observe(host);

    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            syncBounds();
            if (isMotionFrozen()) drawRibbons(1.4);
          })
        : null;
    ro?.observe(host);

    const themeObserver = new MutationObserver(() => {
      syncRunState();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "data-motion"],
    });

    const handleVisibility = () => {
      isTabVisible = !document.hidden;
      syncRunState();
    };
    const handleScroll = () => {
      scrollTwist = Math.max(
        0,
        Math.min(1, (window.scrollY || window.pageYOffset || 0) / Math.max(1, cssH)),
      );
      if (isMotionFrozen()) drawRibbons(1.4);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", syncBounds, { passive: true });
    document.addEventListener("visibilitychange", handleVisibility);
    reducedQuery.addEventListener("change", syncRunState);
    window.addEventListener("inkwellio:motion-change", syncRunState);

    syncRunState();

    return () => {
      stopLoop();
      io?.disconnect();
      ro?.disconnect();
      themeObserver.disconnect();
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", syncBounds);
      document.removeEventListener("visibilitychange", handleVisibility);
      reducedQuery.removeEventListener("change", syncRunState);
      window.removeEventListener("inkwellio:motion-change", syncRunState);
    };
  }, []);

  return (
    <div ref={hostRef} className="hero-ribbon-backdrop" aria-hidden="true">
      <canvas ref={canvasRef} className="hero-ribbon-canvas" />
    </div>
  );
}
