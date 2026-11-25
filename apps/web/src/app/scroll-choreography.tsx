"use client";

import { useEffect } from "react";

/**
 * ScrollChoreography — Single passive rAF scroll driver (zero scroll-jacking).
 * Updates transform/opacity CSS custom properties only:
 *  1. Hero scroll exit (`--hero-scroll`: 0 -> 1) separating sculpture (0.6x, 0->8deg) & card.
 *  2. Sticky left-rail fill (`--essentials-progress`: 0 -> 1) inside `#essentials`.
 *  3. Live 2px Reading Room progress bar (`0% -> 100%`) across `#reading-room`.
 *  4. Inverted `#publishing` rhythm-flip entrance (`--flip-scroll`: 0 -> 1).
 *  5. Staggered Bento reveal via IntersectionObserver (opacity always readable).
 */
export function ScrollChoreography() {
  useEffect(() => {
    const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let rafPending = false;

    const heroOuter = document.querySelector<HTMLElement>(".hero-stage-outer");
    const heroStage = document.querySelector<HTMLElement>(".hero-stage");
    const pageRailFill = document.querySelector<HTMLElement>(".progress-rail-fill");

    const essentialsSection = document.querySelector<HTMLElement>("#essentials");
    const essentialsRailFill = document.querySelector<HTMLElement>(".essentials-rail-fill");

    const readingSection = document.querySelector<HTMLElement>("#reading-room");
    const readingFill = document.querySelector<HTMLElement>(".reading-progress-fill");

    const publishingSection = document.querySelector<HTMLElement>("#publishing");
    const bentoCards = Array.from(
      document.querySelectorAll<HTMLElement>(".bento-cell-reveal"),
    );

    const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

    const updateScrollMetrics = () => {
      rafPending = false;
      const scrollY = window.scrollY || window.pageYOffset || 0;
      const vh = window.innerHeight || 1;
      const docHeight = document.documentElement.scrollHeight - vh;
      const isReduced = reducedQuery.matches;

      if (pageRailFill && docHeight > 0) {
        const pageProgress = clamp01(scrollY / docHeight);
        pageRailFill.style.transform = `scaleY(${pageProgress.toFixed(4)})`;
      }

      // 1. Hero scroll exit (--hero-scroll on both stage & outer sculpture container)
      const heroVal = isReduced
        ? "0"
        : clamp01(scrollY / Math.max(1, (heroOuter?.offsetHeight || heroStage?.offsetHeight || vh) * 0.9)).toFixed(4);
      heroStage?.style.setProperty("--hero-scroll", heroVal);
      heroOuter?.style.setProperty("--hero-scroll", heroVal);

      // 2. Sticky left-rail progress through #essentials
      if (essentialsSection && essentialsRailFill) {
        if (isReduced) {
          essentialsRailFill.style.transform = "scaleY(1)";
        } else {
          const rect = essentialsSection.getBoundingClientRect();
          const travel = Math.max(1, rect.height - vh * 0.35);
          const progress = clamp01((vh * 0.55 - rect.top) / travel);
          essentialsRailFill.style.transform = `scaleY(${progress.toFixed(4)})`;
        }
      }

      // 3. Reading Room 2px live progress bar (0% -> 100%)
      if (readingSection && readingFill) {
        if (isReduced) {
          readingFill.style.transform = "scaleX(1)";
        } else {
          const rect = readingSection.getBoundingClientRect();
          const travel = Math.max(1, rect.height - vh * 0.25);
          const progress = clamp01((vh * 0.65 - rect.top) / travel);
          readingFill.style.transform = `scaleX(${progress.toFixed(4)})`;
        }
      }

      // 4. Inverted rhythm-flip entrance (#publishing)
      if (publishingSection) {
        if (isReduced) {
          publishingSection.style.setProperty("--flip-scroll", "1");
        } else {
          const rect = publishingSection.getBoundingClientRect();
          const progress = clamp01((vh - rect.top) / (vh * 0.65));
          publishingSection.style.setProperty("--flip-scroll", progress.toFixed(4));
        }
      }
    };

    const scheduleUpdate = () => {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(updateScrollMetrics);
    };

    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== "undefined" && bentoCards.length > 0) {
      io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-revealed");
              io?.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.12 },
      );
      bentoCards.forEach((card, index) => {
        card.style.setProperty("--reveal-delay", `${index * 70}ms`);
        io?.observe(card);
      });
    }

    updateScrollMetrics();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate, { passive: true });
    reducedQuery.addEventListener("change", scheduleUpdate);

    return () => {
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      reducedQuery.removeEventListener("change", scheduleUpdate);
      io?.disconnect();
    };
  }, []);

  return null;
}
