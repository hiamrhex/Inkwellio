"use client";

import { useEffect, useRef } from "react";
import { motionConfig } from "@inkwellio/ui";

interface SharedPointerWindow extends Window {
  __inkwellioPointer?: { x: number; y: number; active: boolean; lastMoveAt?: number };
}

interface RibbonStrand {
  readonly offset: number;
  readonly amp: number;
  readonly freq: number;
  readonly width: number;
  readonly alpha: number;
}

const STRANDS: readonly RibbonStrand[] = [
  { offset: -0.2, amp: 0.14, freq: 2.0, width: 1.8, alpha: 0.34 },
  { offset: -0.07, amp: 0.19, freq: 1.7, width: 1.35, alpha: 0.28 },
  { offset: 0.05, amp: 0.16, freq: 2.35, width: 2.4, alpha: 0.22 },
  { offset: 0.17, amp: 0.21, freq: 1.5, width: 1.15, alpha: 0.24 },
  { offset: 0.28, amp: 0.13, freq: 2.6, width: 1.5, alpha: 0.18 },
];

/**
 * HeroRibbonCanvas — Subtle monochrome silver/slate threads layered over the 3D ribbon.
 * Runs at max DPR 1.5 and 30fps strictly during active pointer motion or initial settle,
 * halting requestAnimationFrame completely within < 850ms of idle (0 rAF calls at rest).
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
    let curMouseY = 0.42;
    let curPull = 0.12;
    let scrollTwist = 0;

    const isMotionFrozen = () => {
      const attr = document.documentElement.getAttribute("data-motion");
      return attr === "paused" || (attr !== "active" && reducedQuery.matches);
    };

    let cachedTheme: string | null = null;
    let cachedSilverGrad: CanvasGradient | null = null;
    let cachedEmeraldGrad: CanvasGradient | null = null;

    const buildGradients = () => {
      const theme = document.documentElement.getAttribute("data-theme") || "dark";
      const isLight = theme === "light";
      const isNarrow = cssW < 768;
      const anchorX = isNarrow ? cssW * 0.56 : cssW * 0.74;
      const anchorY = isNarrow ? cssH * 0.34 : cssH * 0.38;
      const spanX = isNarrow ? cssW * 0.95 : cssW * 0.56;
      const spanY = cssH * 0.34;
      const strokeRgb = isLight ? "30, 41, 59" : "226, 232, 240";
      const emeraldRgb = isLight ? "5, 150, 105" : "16, 185, 129";
      const ag = motionConfig.accentGain;
      const x0 = anchorX - spanX * 0.52;
      const y0 = anchorY - spanY * 0.5;
      const x1 = anchorX + spanX * 0.52;
      const y1 = anchorY + spanY * 0.5;

      const sGrad = ctx.createLinearGradient(x0, y0, x1, y1);
      sGrad.addColorStop(0, `rgba(${strokeRgb}, 0.015)`);
      sGrad.addColorStop(0.5, `rgba(${strokeRgb}, ${isLight ? 0.14 : 0.22})`);
      sGrad.addColorStop(1, `rgba(${strokeRgb}, 0.015)`);

      const eGrad = ctx.createLinearGradient(x0, y0, x1, y1);
      eGrad.addColorStop(0, `rgba(${strokeRgb}, 0.012)`);
      eGrad.addColorStop(0.5, `rgba(${emeraldRgb}, ${Math.min(0.45, 0.16 * ag).toFixed(3)})`);
      eGrad.addColorStop(1, `rgba(${strokeRgb}, 0.012)`);

      cachedTheme = theme;
      cachedSilverGrad = sGrad;
      cachedEmeraldGrad = eGrad;
    };

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
      buildGradients();
      scrollTwist = Math.max(
        0,
        Math.min(1, (window.scrollY || window.pageYOffset || 0) / Math.max(1, cssH)),
      );
    };

    const drawRibbons = (phaseTime: number) => {
      const isNarrow = cssW < 768;
      const anchorX = isNarrow ? cssW * 0.56 : cssW * 0.74;
      const anchorY = isNarrow ? cssH * 0.34 : cssH * 0.38;
      const spanX = isNarrow ? cssW * 0.95 : cssW * 0.56;
      const spanY = cssH * 0.34;
      const segments = isNarrow ? 24 : 34;

      const theme = document.documentElement.getAttribute("data-theme") || "dark";
      if (theme !== cachedTheme || !cachedSilverGrad || !cachedEmeraldGrad) {
        buildGradients();
      }

      const dirtyReset = cssW > 0 && cssH > 0;
      if (dirtyReset) ctx.clearRect(0, 0, cssW, cssH);

      const mg = motionConfig.motionGain;
      const mxPx = curMouseX * cssW;
      const myPx = curMouseY * cssH;
      const radius = isNarrow
        ? Math.round(motionConfig.pointer.canvasBendRadiusPx * 0.65)
        : motionConfig.pointer.canvasBendRadiusPx;
      ctx.lineCap = "round";

      for (let s = 0; s < STRANDS.length; s++) {
        const strand = STRANDS[s];
        const useEmeraldTint = s === 1 || s === 3;
        ctx.beginPath();
        ctx.strokeStyle = useEmeraldTint ? cachedEmeraldGrad! : cachedSilverGrad!;
        ctx.lineWidth = strand.width;

        for (let i = 0; i <= segments; i++) {
          const u = i / segments;
          const phase =
            u * Math.PI * strand.freq +
            phaseTime +
            scrollTwist * (1.1 + s * 0.2) +
            s * 0.9;

          const baseX =
            anchorX +
            (u - 0.5) * spanX +
            Math.sin(phase * 0.72 + strand.offset * 6) * cssW * 0.045;
          const waveY =
            anchorY +
            (u - 0.5) * -spanY * 0.42 +
            Math.sin(phase) * spanY * strand.amp +
            Math.cos(phase * 1.45 - u * 3.1) * spanY * 0.08 +
            strand.offset * spanY * 0.8;

          const dx = mxPx - baseX;
          const dy = myPx - waveY;
          let influence = 0;
          if (Math.abs(dx) < radius && Math.abs(dy) < radius) {
            const dist = Math.hypot(dx, dy);
            if (dist < radius) {
              const t = 1 - dist / radius;
              influence = t * t * curPull * 0.36 * mg;
            }
          }

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

      const shared = (window as SharedPointerWindow).__inkwellioPointer;
      const lastMoveAt = shared?.lastMoveAt ?? 0;
      const sinceMove = lastMoveAt ? now - lastMoveAt : Infinity;
      const inInitialSettle = now - startTime < 550;
      const pointerAlive =
        fineQuery.matches && sinceMove < motionConfig.pointer.idleStopMs;

      if (now - lastDraw >= minFrameMs) {
        lastDraw = now;
        let targetX = 0.74;
        let targetY = 0.38;
        let targetPull = 0.12;

        if (fineQuery.matches && shared && shared.active) {
          targetX = Math.max(0, Math.min(1, (shared.x - hostLeft) / cssW));
          targetY = Math.max(0, Math.min(1, (shared.y - hostTop) / cssH));
          targetPull = 0.85;
        }

        curMouseX += (targetX - curMouseX) * 0.105;
        curMouseY += (targetY - curMouseY) * 0.105;
        curPull += (targetPull - curPull) * 0.105;
        drawRibbons(0.6 + scrollTwist * 0.4 + (curMouseX - 0.5) * 0.35);
      }

      if (pointerAlive || inInitialSettle) {
        rafId = requestAnimationFrame(tick);
      } else {
        rafId = null;
      }
    };

    const wakeLoop = () => {
      if (isVisible && isTabVisible && !isMotionFrozen() && rafId === null) {
        rafId = requestAnimationFrame(tick);
      }
    };

    const syncRunState = () => {
      if (isMotionFrozen()) {
        stopLoop();
        curMouseX = 0.74;
        curMouseY = 0.38;
        curPull = 0.12;
        drawRibbons(0.6);
        return;
      }
      if (!isVisible || !isTabVisible) {
        stopLoop();
        return;
      }
      drawRibbons(0.6);
      wakeLoop();
    };

    syncBounds();
    syncRunState();

    const onPointerWake = () => wakeLoop();
    const onScrollWake = () => {
      if (!isVisible || isMotionFrozen() || !fineQuery.matches || cssW < 768) return;
      scrollTwist = Math.max(
        0,
        Math.min(1, (window.scrollY || window.pageYOffset || 0) / Math.max(1, cssH)),
      );
      wakeLoop();
    };

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
            drawRibbons(0.6);
          })
        : null;
    ro?.observe(host);

    const mo = new MutationObserver(() => syncRunState());
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "data-motion"],
    });

    const onVisibility = () => {
      isTabVisible = !document.hidden;
      syncRunState();
    };

    window.addEventListener("inkwellio:pointer-wake", onPointerWake);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("scroll", onScrollWake, { passive: true });
    reducedQuery.addEventListener("change", syncRunState);
    window.addEventListener("inkwellio:motion-change", syncRunState);

    return () => {
      stopLoop();
      window.removeEventListener("inkwellio:pointer-wake", onPointerWake);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("scroll", onScrollWake);
      reducedQuery.removeEventListener("change", syncRunState);
      window.removeEventListener("inkwellio:motion-change", syncRunState);
      io?.disconnect();
      ro?.disconnect();
      mo.disconnect();
    };
  }, []);

  return (
    <div ref={hostRef} className="hero-ribbon-backdrop" aria-hidden="true">
      <canvas ref={canvasRef} className="hero-ribbon-canvas" />
    </div>
  );
}
