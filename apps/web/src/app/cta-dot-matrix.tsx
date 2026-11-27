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
    const finePointerQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
    let isVisible = true;
    let isTabVisible = !document.hidden;
    let rafId: number | null = null;
    const startTime = performance.now();
    let lastDrawTime = 0;
    const minFrameMs = 1000 / 30;

    let currentX = -9999;
    let currentY = -9999;

    const isFrozen = () =>
      reducedMotionQuery.matches ||
      document.documentElement.getAttribute("data-motion") === "paused";

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
      const frozen = isFrozen();
      ctx.clearRect(0, 0, cssW, cssH);

      const isLight = document.documentElement.getAttribute("data-theme") === "light";
      const rgb = isLight ? "15, 23, 42" : "255, 255, 255";
      const silverRgb = isLight ? "51, 65, 85" : "203, 213, 225";

      const shared = (window as SharedPointerWindow).__inkwellioPointer;
      let pointerNear = false;
      if (!frozen && finePointerQuery.matches && shared && shared.active) {
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
            currentX += (lx - currentX) * 0.1;
            currentY += (ly - currentY) * 0.1;
          }
        }
      }

      const cx = cssW * 0.5;
      const cy = cssH * 0.5;
      const maxRadius = Math.max(160, Math.min(cssW, cssH) * 0.62);
      const orbitalBase = Math.min(cssW, cssH) * 0.34;
      const orbitalRadius = frozen ? orbitalBase : orbitalBase + Math.sin(timeSec * 0.7) * 14;
      const bandWidth = 42;
      // Subtle horizontal glowing scanline sweeping smoothly top -> bottom
      const scanPosY = frozen ? cy : ((timeSec * 52) % (cssH + 140)) - 70;
      const scanSpread = 76;

      const cols = Math.ceil(cssW / GRID_STEP);
      const rows = Math.ceil(cssH / GRID_STEP);
      const offsetX = (cssW - (cols - 1) * GRID_STEP) * 0.5;
      const offsetY = (cssH - (rows - 1) * GRID_STEP) * 0.5;

      for (let r = 0; r < rows; r++) {
        const y = offsetY + r * GRID_STEP;
        const scanDist = Math.abs(y - scanPosY);
        const scanFactor = scanDist < scanSpread ? Math.pow(1 - scanDist / scanSpread, 2) : 0;

        for (let c = 0; c < cols; c++) {
          const x = offsetX + c * GRID_STEP;
          const distCenter = Math.hypot(x - cx, y - cy);

          const edgeFade = Math.max(0, 1 - distCenter / maxRadius);
          if (edgeFade <= 0.02) continue;

          const ringDist = Math.abs(distCenter - orbitalRadius);
          const ringBoost = ringDist < bandWidth ? (1 - ringDist / bandWidth) * 0.2 : 0;
          const rippleX = frozen ? 1 : 0.75 + 0.25 * Math.sin(x * 0.015 - timeSec * 1.4);
          const scanBoost = scanFactor * 0.34 * rippleX;

          let haloBoost = 0;
          if (!frozen && pointerNear) {
            const pDist = Math.hypot(x - currentX, y - currentY);
            if (pDist < CURSOR_HALO_RADIUS) {
              const t = 1 - pDist / CURSOR_HALO_RADIUS;
              haloBoost = t * t * 0.45;
            }
          }

          const baseAlpha = isLight ? 0.08 : 0.09;
          const alpha = Math.min(
            0.78,
            (baseAlpha + ringBoost + haloBoost + scanBoost) * (0.35 + 0.65 * edgeFade),
          );
          const radius = 1.05 + haloBoost * 1.45 + ringBoost * 0.7 + scanBoost * 1.25;
          const useSilver = scanBoost + haloBoost > 0.16;

          ctx.fillStyle = `rgba(${useSilver ? silverRgb : rgb}, ${alpha.toFixed(3)})`;
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

    let settledAt = performance.now();

    const tick = (now: number) => {
      if (!isVisible || !isTabVisible || isFrozen()) {
        rafId = null;
        return;
      }

      const shared = (window as SharedPointerWindow & { __inkwellioPointer?: { lastMoveAt?: number } }).__inkwellioPointer;
      const lastMoveAt = shared?.lastMoveAt ?? 0;
      const pointerAlive = finePointerQuery.matches && lastMoveAt && now - lastMoveAt < 780;
      const settling = now - settledAt < 650;

      if (now - lastDrawTime >= minFrameMs) {
        lastDrawTime = now;
        draw((now - startTime) * 0.001);
      }

      if (pointerAlive || settling) {
        rafId = requestAnimationFrame(tick);
      } else {
        rafId = null;
      }
    };

    const wake = () => {
      settledAt = performance.now();
      if (isVisible && isTabVisible && !isFrozen() && rafId === null) {
        rafId = requestAnimationFrame(tick);
      }
    };

    const syncRunState = () => {
      if (isFrozen()) {
        stopLoop();
        draw(0);
        return;
      }
      if (!isVisible || !isTabVisible) {
        stopLoop();
        return;
      }
      draw(0);
      wake();
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
            if (isFrozen()) draw(0);
          })
        : null;
    ro?.observe(host);

    const handleVisibility = () => {
      isTabVisible = !document.hidden;
      syncRunState();
    };

    const themeObserver = new MutationObserver(() => {
      syncRunState();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "data-motion"],
    });

    syncRect();
    window.addEventListener("scroll", syncRect, { passive: true });
    window.addEventListener("inkwellio:pointer-wake", wake);
    document.addEventListener("visibilitychange", handleVisibility);
    reducedMotionQuery.addEventListener("change", syncRunState);
    window.addEventListener("inkwellio:motion-change", syncRunState);

    syncRunState();

    return () => {
      stopLoop();
      io?.disconnect();
      ro?.disconnect();
      themeObserver.disconnect();
      window.removeEventListener("scroll", syncRect);
      window.removeEventListener("inkwellio:pointer-wake", wake);
      document.removeEventListener("visibilitychange", handleVisibility);
      reducedMotionQuery.removeEventListener("change", syncRunState);
      window.removeEventListener("inkwellio:motion-change", syncRunState);
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
