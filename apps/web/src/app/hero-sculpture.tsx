"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import darkSculpture from "../../public/images/hero-ink-dark.webp";
import lightSculpture from "../../public/images/hero-ink-light.webp";

/**
 * HeroSculpture — Dual-mode pre-rendered 3D architectural ink sculptures.
 * Layered behind LivingHeroArtifact (`aria-hidden="true"`, non-LCP, defers to <h1>).
 * Mounts ONLY the active theme's image so dark mode never downloads the light asset
 * and light mode never downloads the dark asset until toggled.
 */
export function HeroSculpture() {
  const [activeTheme, setActiveTheme] = useState<"dark" | "light" | null>(null);

  useEffect(() => {
    const resolveTheme = (): "dark" | "light" => {
      const explicit = document.documentElement.getAttribute("data-theme");
      if (explicit === "light") return "light";
      if (explicit === "dark") return "dark";
      return window.matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark";
    };

    const rafId = requestAnimationFrame(() => {
      setActiveTheme(resolveTheme());
    });

    const themeObserver = new MutationObserver(() => {
      setActiveTheme(resolveTheme());
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => {
      cancelAnimationFrame(rafId);
      themeObserver.disconnect();
    };
  }, []);

  const isLight = activeTheme === "light";

  return (
    <div className="hero-sculpture-stage" aria-hidden="true">
      <div className="hero-sculpture-scroll">
        <div className="hero-sculpture-parallax">
          {activeTheme !== null && (
            <Image
              key={activeTheme}
              src={isLight ? lightSculpture : darkSculpture}
              alt=""
              aria-hidden="true"
              width={768}
              height={768}
              unoptimized
              loading="eager"
              decoding="async"
              className={`hero-sculpture-img ${isLight ? "hero-sculpture-light" : "hero-sculpture-dark"}`}
            />
          )}
        </div>
      </div>
    </div>
  );
}
