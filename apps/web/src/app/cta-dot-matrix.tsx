"use client";

import { useEffect, useRef } from "react";

const GRID_STEP = 22;
const CURSOR_HALO_RADIUS = 260;

interface SharedPointerWindow extends Window {
  __inkwellioPointer?: { x: number; y: number; active: boolean };
}

/**
 * CtaDotMatrix — 2D dot-matrix field behind closing CTA.
 * Caches host bounds in ResizeObserver + passive scroll (zero getBoundingClientRect
 * inside rAF draw loop), reads shared window.__inkwellioPointer, and caps at 30 fps.
 */
export function CtaDotMatrix() {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let isReduced = reducedMotionQuery.matches;
    let isVisible = true;
    let isTabVisible = !document.hidden;
    let rafId: number | null = null;
    const startTime = performance.now();
    let lastDrawTime = 0;
    const minFrameMs = 1000 / 30;

    let currentX = -9999;
    let currentY = -9999;

    let cssW = 1;
    let cssH = 1;
    let hostLeft = 0;
    let hostTop = 0;

    const syncRect = () => {
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
    };

    const draw = (timeSec: number) => {
      ctx.clearRect(0, 0, cssW, cssH);

      const isLight = document.documentElement.getAttribute("data-theme") === "light";
      const rgb = isLight ? "10, 10, 11" : "255, 255, 255";

      const shared = (window as SharedPointerWindow).__inkwellioPointer;
      let pointerNear = false;
      if (!isReduced && shared && shared.active) {
        const lx = shared.x - hostLeft;
        const ly = shared.y - hostTop;
        pointerNear =
          lx >= -CURSOR_HALO_RADIUS &&
          lx <= cssW + CURSOR_HALO_RADIUS &&
          ly >= -CURSOR_HALO_RADIUS &&
          ly <= cssH + CURSOR_HALO_RADIUS;
        if (pointerNear) {
          if (currentX < -5000) {
            currentX = lx;
            currentY = ly;
          } else {
            currentX += (lx - currentX) * 0.14;
            currentY += (ly - currentY) * 0.14;
          }
        }
      }

      const cx = cssW * 0.5;
      const cy = cssH * 0.5;
      const maxRadius = Math.max(160, Math.min(cssW, cssH) * 0.58);
      const orbitalBase = Math.min(cssW, cssH) * 0.34;
      const orbitalRadius = isReduced ? orbitalBase : orbitalBase + Math.sin(timeSec * 0.7) * 14;
      const bandWidth = 42;

      const cols = Math.ceil(cssW / GRID_STEP);
      const rows = Math.ceil(cssH / GRID_STEP);
      const offsetX = (cssW - (cols - 1) * GRID_STEP) * 0.5;
      const offsetY = (cssH - (rows - 1) * GRID_STEP) * 0.5;

      for (let r = 0; r < rows; r++) {
        const y = offsetY + r * GRID_STEP;
        for (let c = 0; c < cols; c++) {
          const x = offsetX + c * GRID_STEP;
          const distCenter = Math.hypot(x - cx, y - cy);

          const edgeFade = Math.max(0, 1 - distCenter / maxRadius);
          if (edgeFade <= 0.02) continue;

          const ringDist = Math.abs(distCenter - orbitalRadius);
          const ringBoost = ringDist < bandWidth ? (1 - ringDist / bandWidth) * 0.22 : 0;

          let haloBoost = 0;
          if (!isReduced && pointerNear) {
            const pDist = Math.hypot(x - currentX, y - currentY);
            if (pDist < CURSOR_HALO_RADIUS) {
              const t = 1 - pDist / CURSOR_HALO_RADIUS;
              haloBoost = t * t * 0.45;
            }
          }

          const baseAlpha = isLight ? 0.08 : 0.09;
          const alpha = Math.min(
            0.72,
            (baseAlpha + ringBoost + haloBoost) * (0.35 + 0.65 * edgeFade),
          );
          const radius = 1.05 + haloBoost * 1.45 + ringBoost * 0.8;

          ctx.fillStyle = `rgba(${rgb}, ${alpha.toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    const stopLoop = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    };

    const tick = (now: number) => {
      if (!isVisible || !isTabVisible || isReduced) {
        rafId = null;
        return;
      }

      if (now - lastDrawTime >= minFrameMs) {
        lastDrawTime = now;
        draw((now - startTime) * 0.001);
      }
      rafId = requestAnimationFrame(tick);
    };

    const syncRunState = () => {
      if (isReduced) {
        stopLoop();
        draw(0);
        return;
      }
      if (isVisible && isTabVisible && rafId === null) {
        rafId = requestAnimationFrame(tick);
      } else if ((!isVisible || !isTabVisible) && rafId !== null) {
        stopLoop();
      }
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
            syncRect();
            if (isReduced) draw(0);
          })
        : null;
    ro?.observe(host);

    const handleVisibility = () => {
      isTabVisible = !document.hidden;
      syncRunState();
    };

    const handleMotion = (e: MediaQueryListEvent) => {
      isReduced = e.matches;
      syncRunState();
    };

    const themeObserver = new MutationObserver(() => {
      if (isReduced) draw(0);
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    syncRect();
    window.addEventListener("scroll", syncRect, { passive: true });
    document.addEventListener("visibilitychange", handleVisibility);
    reducedMotionQuery.addEventListener("change", handleMotion);

    syncRunState();

    return () => {
      stopLoop();
      io?.disconnect();
      ro?.disconnect();
      themeObserver.disconnect();
      window.removeEventListener("scroll", syncRect);
      document.removeEventListener("visibilitychange", handleVisibility);
      reducedMotionQuery.removeEventListener("change", handleMotion);
    };
  }, []);

  return (
    <div
      ref={hostRef}
      className="cta-dot-matrix-backdrop"
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 0,
        overflow: "hidden",
      }}
    >
      <canvas
        ref={canvasRef}
        className="cta-dot-matrix-canvas"
        style={{
          display: "block",
          width: "100%",
          height: "100%",
        }}
      />
    </div>
  );
}
