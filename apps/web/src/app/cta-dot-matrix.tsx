"use client";

import { useEffect, useRef } from "react";

const GRID_STEP = 22;
const CURSOR_HALO_RADIUS = 260;

/**
 * CtaDotMatrix — Phase 3 interactive 2D dot-matrix field behind the closing CTA.
 * Strictly isolated to the lower CTA section (never stacked on Hero WebGL).
 * Features a 22px monochrome grid, subtle orbital ring, 260px cursor halo,
 * offscreen IntersectionObserver pause, and reduced-motion static fallback.
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

    let pointerActive = false;
    let targetX = -9999;
    let targetY = -9999;
    let currentX = -9999;
    let currentY = -9999;

    let cssW = 0;
    let cssH = 0;

    const resize = () => {
      const rect = host.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
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
      resize();
      ctx.clearRect(0, 0, cssW, cssH);

      const isLight = document.documentElement.getAttribute("data-theme") === "light";
      const rgb = isLight ? "10, 10, 11" : "255, 255, 255";

      const cx = cssW * 0.5;
      const cy = cssH * 0.5;
      const maxRadius = Math.max(160, Math.min(cssW, cssH) * 0.58);
      const orbitalBase = Math.min(cssW, cssH) * 0.34;
      const orbitalRadius = isReduced
        ? orbitalBase
        : orbitalBase + Math.sin(timeSec * 0.7) * 14;
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

          // Radial edge fade
          const edgeFade = Math.max(0, 1 - distCenter / maxRadius);
          if (edgeFade <= 0.02) continue;

          // Subtle breathing orbital ring emphasis
          const ringDist = Math.abs(distCenter - orbitalRadius);
          const ringBoost =
            ringDist < bandWidth ? (1 - ringDist / bandWidth) * 0.22 : 0;

          // Crisp 260px cursor illumination halo
          let haloBoost = 0;
          if (!isReduced && pointerActive) {
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

      if (pointerActive) {
        currentX += (targetX - currentX) * 0.14;
        currentY += (targetY - currentY) * 0.14;
      }

      draw((now - startTime) * 0.001);
      rafId = requestAnimationFrame(tick);
    };

    const syncRunState = () => {
      if (isReduced) {
        stopLoop();
        draw(0); // Single static non-animated dot grid
        return;
      }
      if (isVisible && isTabVisible && rafId === null) {
        rafId = requestAnimationFrame(tick);
      } else if ((!isVisible || !isTabVisible) && rafId !== null) {
        stopLoop();
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (isReduced) return;
      const rect = host.getBoundingClientRect();
      const lx = e.clientX - rect.left;
      const ly = e.clientY - rect.top;
      const inside =
        lx >= -CURSOR_HALO_RADIUS &&
        lx <= rect.width + CURSOR_HALO_RADIUS &&
        ly >= -CURSOR_HALO_RADIUS &&
        ly <= rect.height + CURSOR_HALO_RADIUS;

      if (inside) {
        if (!pointerActive) {
          currentX = lx;
          currentY = ly;
        }
        pointerActive = true;
        targetX = lx;
        targetY = ly;
      } else {
        pointerActive = false;
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

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    document.addEventListener("visibilitychange", handleVisibility);
    reducedMotionQuery.addEventListener("change", handleMotion);

    syncRunState();

    return () => {
      stopLoop();
      io?.disconnect();
      ro?.disconnect();
      themeObserver.disconnect();
      window.removeEventListener("pointermove", handlePointerMove);
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
