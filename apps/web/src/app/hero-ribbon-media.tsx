"use client";

import { useEffect, useState } from "react";

type ResolvedTheme = "dark" | "light";

/**
 * Renders ONLY the active theme's pre-rendered 3D silk ribbon WebP image.
 * Defers image attribute mounting until client data-theme is read (matching the
 * active <link rel="preload"> injected synchronously in <head> by theme.js),
 * preventing dual dark+light image downloads while swapping cleanly on toggle.
 */
export function HeroRibbonMedia() {
  const [theme, setTheme] = useState<ResolvedTheme | null>(null);

  useEffect(() => {
    const syncTheme = () => {
      const attr = document.documentElement.getAttribute("data-theme");
      setTheme(attr === "light" ? "light" : "dark");
    };
    const raf = requestAnimationFrame(syncTheme);
    const mo = new MutationObserver(syncTheme);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => {
      cancelAnimationFrame(raf);
      mo.disconnect();
    };
  }, []);

  if (!theme) return null;

  return (
    <div className="hero-ribbon-media-box" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- Pre-optimized <= 45 KiB WebP with explicit srcset/sizes and head preload */}
      <img
        src={`/images/hero-ribbon-${theme}.webp`}
        srcSet={`/images/hero-ribbon-${theme}-mobile.webp 680w, /images/hero-ribbon-${theme}.webp 1280w`}
        sizes="(max-width: 1023px) 100vw, 56vw"
        width={1280}
        height={714}
        alt=""
        aria-hidden="true"
        loading="eager"
        decoding="async"
        fetchPriority="high"
        className="hero-ribbon-img"
      />
    </div>
  );
}
