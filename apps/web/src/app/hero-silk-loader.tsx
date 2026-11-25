"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const LazyHeroSilkCanvas = dynamic(
  () => import("./hero-silk-canvas").then((m) => m.HeroSilkCanvas),
  { ssr: false },
);

interface NetworkInformationLike {
  saveData?: boolean;
}

/**
 * HeroSilkLoader — Strictly gated lazy loader for the WebGL2 silk shader.
 * The CSS gradient + SVG grain fallback is rendered in Server Component `page.tsx`;
 * WebGL2 mounts ONLY after window load + requestIdleCallback when fine pointer,
 * hardwareConcurrency >= 4, no saveData, and motion allowed all pass.
 */
export function HeroSilkLoader() {
  const [enableWebGL, setEnableWebGL] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let idleId: number | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const canRunShader = (): boolean => {
      if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return false;
      if ((navigator.hardwareConcurrency ?? 0) < 4) return false;
      const conn = (navigator as { connection?: NetworkInformationLike }).connection;
      if (conn?.saveData) return false;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
      return true;
    };

    const scheduleMount = () => {
      if (cancelled || !canRunShader()) return;
      const ric = (
        window as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }
      ).requestIdleCallback;

      if (typeof ric === "function") {
        idleId = ric(() => {
          if (!cancelled && canRunShader()) setEnableWebGL(true);
        }, { timeout: 1200 });
      } else {
        timeoutId = setTimeout(() => {
          if (!cancelled && canRunShader()) setEnableWebGL(true);
        }, 120);
      }
    };

    if (document.readyState === "complete") scheduleMount();
    else window.addEventListener("load", scheduleMount, { once: true });

    return () => {
      cancelled = true;
      window.removeEventListener("load", scheduleMount);
      if (idleId !== null && typeof (window as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback === "function") {
        (window as { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(idleId);
      }
      if (timeoutId !== null) clearTimeout(timeoutId);
    };
  }, []);

  if (!enableWebGL) return null;
  return <LazyHeroSilkCanvas />;
}
