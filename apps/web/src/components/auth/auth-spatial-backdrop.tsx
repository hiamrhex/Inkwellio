"use client";

import { useEffect, useState } from "react";

type ResolvedTheme = "dark" | "light";

/**
 * Lazy-loaded spatial architecture backdrop for auth routes.
 * Renders strictly one active theme render (spatial-monolith-dark.webp or
 * spatial-slab-light.webp) after initial mount so card paint never blocks.
 */
export function AuthSpatialBackdrop() {
  const [theme, setTheme] = useState<ResolvedTheme | null>(null);

  useEffect(() => {
    let cancelled = false;
    let idleId: number | null = null;
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const syncTheme = () => {
      if (cancelled) return;
      const attr = document.documentElement.getAttribute("data-theme");
      setTheme(attr === "light" ? "light" : "dark");
    };

    const ric = (
      window as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }
    ).requestIdleCallback;
    if (typeof ric === "function") {
      idleId = ric(syncTheme, { timeout: 600 });
    } else {
      timerId = setTimeout(syncTheme, 120);
    }

    const mo = new MutationObserver(syncTheme);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => {
      cancelled = true;
      mo.disconnect();
      if (
        idleId !== null &&
        typeof (window as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback ===
          "function"
      ) {
        (window as { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(idleId);
      }
      if (timerId !== null) clearTimeout(timerId);
    };
  }, []);

  if (!theme) return null;

  const file =
    theme === "light" ? "/images/spatial-slab-light.webp" : "/images/spatial-monolith-dark.webp";

  return (
    // eslint-disable-next-line @next/next/no-img-element -- Pre-optimized <= 38 KiB WebP lazy-mounted per active theme
    <img
      src={file}
      width={1280}
      height={714}
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      className="auth-spatial-img"
    />
  );
}
