"use client";

import { useEffect } from "react";

/**
 * ScrollChoreography — Lightweight passive scroll driver (zero sync layout during mount,
 * zero scroll-jacking). Defers scroll CSS custom properties for fallback engines when
 * CSS animation-timeline: view() is unsupported, maintains nav compact + cached scroll-spy,
 * and activates deferred Newsreader fonts on idle when approaching reading sections.
 */
export function ScrollChoreography() {
  useEffect(() => {
    const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const supportsTimeline =
      typeof CSS !== "undefined" &&
      typeof CSS.supports === "function" &&
      CSS.supports("animation-timeline", "view()");
    let rafPending = false;

    const nav = document.querySelector<HTMLElement>(".site-nav");
    const navAnchors = Array.from(
      document.querySelectorAll<HTMLAnchorElement>('.nav-links a[href^="#"], .nav-links a[href^="/#"]'),
    );
    const spyItems = navAnchors
      .map((anchor) => {
        const href = anchor.getAttribute("href") ?? "";
        const hashIdx = href.indexOf("#");
        const id = hashIdx >= 0 ? href.slice(hashIdx + 1) : "";
        const el = id ? document.getElementById(id) : null;
        return el ? { anchor, el, id, top: 0 } : null;
      })
      .filter(
        (item): item is { anchor: HTMLAnchorElement; el: HTMLElement; id: string; top: number } =>
          item !== null,
      );

    const heroOuter = document.querySelector<HTMLElement>(".hero-stage-outer");
    const heroStage = document.querySelector<HTMLElement>(".hero-stage");
    const readingSection = document.querySelector<HTMLElement>("#reading-room");
    const readingFill = document.querySelector<HTMLElement>(".reading-progress-fill");
    const curtain = document.querySelector<HTMLElement>(".flip-curtain");
    const publishingSection = document.querySelector<HTMLElement>("#publishing");
    const postLifeSection = document.querySelector<HTMLElement>("#post-life");
    const bentoCards = Array.from(document.querySelectorAll<HTMLElement>(".bento-cell-reveal"));

    let heroHeight = 760;

    const refreshCachedOffsets = () => {
      for (const item of spyItems) {
        item.top = item.el.offsetTop;
      }
      heroHeight = Math.max(1, (heroOuter?.offsetHeight || heroStage?.offsetHeight || window.innerHeight) * 0.9);
    };

    const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

    const updateScrollMetrics = () => {
      rafPending = false;
      const scrollY = window.scrollY || window.pageYOffset || 0;
      const vh = window.innerHeight || 1;
      const isReduced = reducedQuery.matches;

      // 1. Sticky nav compact > 64px + scroll-spy using cached offsets (zero forced reflow)
      if (nav) {
        nav.classList.toggle("is-scrolled", scrollY > 64);
      }
      if (spyItems.length > 0) {
        const probeY = scrollY + 140;
        let currentId = "";
        for (const item of spyItems) {
          if (item.top <= probeY) {
            currentId = item.id;
          }
        }
        for (const item of spyItems) {
          if (item.id === currentId) {
            item.anchor.setAttribute("data-active", "true");
          } else {
            item.anchor.removeAttribute("data-active");
          }
        }
      }

      // 2. Hero exit depth
      const heroVal = isReduced ? "0" : clamp01(scrollY / heroHeight).toFixed(4);
      heroStage?.style.setProperty("--hero-scroll", heroVal);
      heroOuter?.style.setProperty("--hero-scroll", heroVal);

      // 3. Fallback JS scroll progress only when native CSS view() timeline is unsupported or reduced
      if (!supportsTimeline || isReduced) {
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
        if (curtain) {
          if (isReduced) {
            curtain.style.setProperty("--curtain-progress", "1");
          } else {
            const rect = curtain.getBoundingClientRect();
            const progress = clamp01((vh - rect.top) / Math.max(1, rect.height + vh * 0.25));
            curtain.style.setProperty("--curtain-progress", progress.toFixed(4));
          }
        }
        if (publishingSection) {
          if (isReduced) {
            publishingSection.style.setProperty("--flip-scroll", "1");
          } else {
            const rect = publishingSection.getBoundingClientRect();
            const progress = clamp01((vh - rect.top) / (vh * 0.65));
            publishingSection.style.setProperty("--flip-scroll", progress.toFixed(4));
          }
        }
      }
    };

    const scheduleUpdate = () => {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(updateScrollMetrics);
    };

    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            refreshCachedOffsets();
            scheduleUpdate();
          })
        : null;
    if (ro) {
      ro.observe(document.body);
    }

    let bentoIo: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== "undefined" && bentoCards.length > 0) {
      bentoIo = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-revealed");
              bentoIo?.unobserve(entry.target);
            }
          }
        },
        { threshold: 0.12 },
      );
      bentoCards.forEach((card, index) => {
        card.style.setProperty("--reveal-delay", `${index * 60}ms`);
        bentoIo?.observe(card);
      });
    }

    // Defer Newsreader serif activation until approaching #post-life or #reading-room
    let fontIo: IntersectionObserver | null = null;
    const targets = [postLifeSection, readingSection].filter(
      (el): el is HTMLElement => el !== null,
    );
    if (typeof IntersectionObserver !== "undefined" && targets.length > 0) {
      fontIo = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            const activate = () => document.documentElement.classList.add("editorial-font-ready");
            const ric = (window as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
            if (typeof ric === "function") {
              ric(activate, { timeout: 600 });
            } else {
              requestAnimationFrame(activate);
            }
            fontIo?.disconnect();
          }
        },
        { rootMargin: "240px" },
      );
      for (const target of targets) {
        fontIo.observe(target);
      }
    }

    // Initial geometry refresh queued outside synchronous useEffect commit
    const initRaf = requestAnimationFrame(() => {
      refreshCachedOffsets();
      updateScrollMetrics();
    });

    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", refreshCachedOffsets, { passive: true });
    reducedQuery.addEventListener("change", scheduleUpdate);

    return () => {
      cancelAnimationFrame(initRaf);
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", refreshCachedOffsets);
      reducedQuery.removeEventListener("change", scheduleUpdate);
      ro?.disconnect();
      bentoIo?.disconnect();
      fontIo?.disconnect();
    };
  }, []);

  return null;
}
