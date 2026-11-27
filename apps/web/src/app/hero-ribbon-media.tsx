"use client";

import { useEffect, useState } from "react";

type ResolvedTheme = "dark" | "light";

function readDomTheme(): ResolvedTheme | null {
  if (typeof document === "undefined") return null;
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

/**
 * Renders the single active-theme hero 3D ribbon <img> directly in SSR HTML so
 * /scripts/theme.js can bind src/srcSet immediately during HTML parse (zero wait on
 * React hydration), while keeping live theme-toggle updates in sync afterward.
 */
export function HeroRibbonMedia() {
  const [theme, setTheme] = useState<ResolvedTheme | null>(readDomTheme);

  useEffect(() => {
    const syncTheme = () => {
      setTheme(document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark");
    };
    const mo = new MutationObserver(syncTheme);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => {
      mo.disconnect();
    };
  }, []);

  return (
    <div className="hero-ribbon-media-box" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- Pre-optimized <= 45 KiB WebP with explicit srcset/sizes and head preload */}
      <img
        data-hero-ribbon="true"
        src={theme ? `/images/hero-ribbon-${theme}.webp` : undefined}
        srcSet={
          theme
            ? `/images/hero-ribbon-${theme}-mobile.webp 680w, /images/hero-ribbon-${theme}.webp 1280w`
            : undefined
        }
        sizes="(max-width: 767px) 74vw, 62vw"
        width={1280}
        height={714}
        alt=""
        aria-hidden="true"
        loading="eager"
        decoding="async"
        fetchPriority="high"
        className="hero-ribbon-img"
        suppressHydrationWarning
      />
    </div>
  );
}
