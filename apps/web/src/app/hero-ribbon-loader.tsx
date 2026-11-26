"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const LazyHeroRibbonCanvas = dynamic(
  () => import("./hero-ribbon-canvas").then((m) => m.HeroRibbonCanvas),
  { ssr: false },
);

interface NetworkInformationLike {
  saveData?: boolean;
}

/**
 * HeroRibbonLoader — Idle-deferred loader for the live mathematical ink-ribbon canvas.
 * Defers mount until window load + requestIdleCallback (minimum 450ms settle)
 * and skips mounting if navigator.connection.saveData is active.
 */
export function HeroRibbonLoader() {
  const [mountCanvas, setMountCanvas] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let idleId: number | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const shouldLoad = (): boolean => {
      const conn = (navigator as { connection?: NetworkInformationLike }).connection;
      if (conn?.saveData) return false;
      if ((navigator.hardwareConcurrency ?? 4) < 2) return false;
      return true;
    };

    const scheduleMount = () => {
      if (cancelled || !shouldLoad()) return;
      timeoutId = setTimeout(() => {
        if (cancelled || !shouldLoad()) return;
        const ric = (
          window as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }
        ).requestIdleCallback;
        if (typeof ric === "function") {
          idleId = ric(
            () => {
              if (!cancelled && shouldLoad()) setMountCanvas(true);
            },
            { timeout: 1400 },
          );
        } else {
          setMountCanvas(true);
        }
      }, 450);
    };

    if (document.readyState === "complete") scheduleMount();
    else window.addEventListener("load", scheduleMount, { once: true });

    return () => {
      cancelled = true;
      window.removeEventListener("load", scheduleMount);
      if (
        idleId !== null &&
        typeof (window as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback ===
          "function"
      ) {
        (window as { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(idleId);
      }
      if (timeoutId !== null) clearTimeout(timeoutId);
    };
  }, []);

  if (!mountCanvas) return null;
  return <LazyHeroRibbonCanvas />;
}
