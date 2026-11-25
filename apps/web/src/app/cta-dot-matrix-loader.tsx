"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

const LazyCtaDotMatrix = dynamic(
  () => import("./cta-dot-matrix").then((m) => m.CtaDotMatrix),
  { ssr: false },
);

/**
 * CtaDotMatrixLoader — Lazily loads the 2D dot-matrix field only after window load
 * and when the closing section enters within 280px of the viewport.
 */
export function CtaDotMatrixLoader() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    let cancelled = false;
    let io: IntersectionObserver | null = null;

    const startObserving = () => {
      if (cancelled) return;
      if (typeof IntersectionObserver === "undefined") {
        setShouldLoad(true);
        return;
      }
      io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            setShouldLoad(true);
            io?.disconnect();
          }
        },
        { rootMargin: "280px" },
      );
      io.observe(el);
    };

    if (document.readyState === "complete") {
      startObserving();
    } else {
      window.addEventListener("load", startObserving, { once: true });
    }

    return () => {
      cancelled = true;
      window.removeEventListener("load", startObserving);
      io?.disconnect();
    };
  }, []);

  return (
    <div ref={hostRef} className="cta-dot-matrix-backdrop" aria-hidden="true">
      {shouldLoad && <LazyCtaDotMatrix />}
    </div>
  );
}
