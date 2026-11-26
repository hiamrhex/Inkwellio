"use client";

import { useEffect } from "react";

/**
 * ScrollChoreography — Passive scroll driver (zero sync layout during mount, zero scroll-jacking).
 * Maintains sticky header hairline border > 64px, cached scroll-spy, horizontal progress for
 * #post-life, fallback reveal variables when CSS animation-timeline: view() is unavailable,
 * and idle Newsreader font activation. Respects both prefers-reduced-motion and [data-motion="paused"].
 */
export function ScrollChoreography() {
  useEffect(() => {
    const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const supportsTimeline =
      typeof CSS !== "undefined" &&
      typeof CSS.supports === "function" &&
      CSS.supports("animation-timeline", "view()");
    let rafPending = false;

    const nav =
      document.querySelector<HTMLElement>(".site-header-bar") ??
      document.querySelector<HTMLElement>(".site-nav");
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
    const sideGlideSection = document.querySelector<HTMLElement>("#writer-reader");
    const postLifeSection = document.querySelector<HTMLElement>("#post-life");
    const postLifeTrack = document.querySelector<HTMLElement>(".post-life-track");
    const bentoCards = Array.from(document.querySelectorAll<HTMLElement>(".bento-cell-reveal"));

    let heroHeight = 760;
    let postLifeTop = 0;
    let postLifeTravel = 1;

    const isMotionFrozen = () =>
      reducedQuery.matches ||
      document.documentElement.getAttribute("data-motion") === "paused";

    const refreshCachedOffsets = () => {
      for (const item of spyItems) {
        item.top = item.el.offsetTop;
      }
      heroHeight = Math.max(
        1,
        (heroOuter?.offsetHeight || heroStage?.offsetHeight || window.innerHeight) * 0.9,
      );
      if (postLifeTrack && postLifeSection) {
        postLifeTop = postLifeSection.offsetTop;
        const vh = window.innerHeight || 900;
        postLifeTravel = Math.max(1, postLifeTrack.offsetHeight - vh);
      }
    };

    const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

    const updateScrollMetrics = () => {
      rafPending = false;
      const scrollY = window.scrollY || window.pageYOffset || 0;
      const vh = window.innerHeight || 1;
      const frozen = isMotionFrozen();

      // 1. Sticky unified bar hairline > 64px + scroll-spy using cached offsets
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

      // 2. Hero exit twist variable + horizontal post-life progress
      const heroVal = frozen ? "0" : clamp01(scrollY / heroHeight).toFixed(4);
      heroStage?.style.setProperty("--hero-scroll", heroVal);
      heroOuter?.style.setProperty("--hero-scroll", heroVal);

      if (postLifeSection) {
        const pVal = frozen ? "0" : clamp01((scrollY - postLifeTop) / postLifeTravel).toFixed(4);
        postLifeSection.style.setProperty("--post-life-p", pVal);
      }

      // 3. Fallback progress when CSS animation-timeline: view() is unsupported or frozen
      if (!supportsTimeline || frozen) {
        if (readingSection && readingFill) {
          if (frozen) {
            readingFill.style.transform = "scaleX(1)";
          } else {
            const rect = readingSection.getBoundingClientRect();
            const travel = Math.max(1, rect.height - vh * 0.25);
            const progress = clamp01((vh * 0.65 - rect.top) / travel);
            readingFill.style.transform = `scaleX(${progress.toFixed(4)})`;
          }
        }
        if (sideGlideSection) {
          if (frozen) {
            sideGlideSection.style.setProperty("--glide-progress", "1");
          } else {
            const rect = sideGlideSection.getBoundingClientRect();
            const progress = clamp01((vh * 0.92 - rect.top) / (vh * 0.45));
            sideGlideSection.style.setProperty("--glide-progress", progress.toFixed(4));
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
    ro?.observe(document.body);

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

    // Activate deferred Newsreader serif on idle / approach
    let fontIo: IntersectionObserver | null = null;
    const activateFonts = () => document.documentElement.classList.add("editorial-font-ready");
    const ric = (window as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
    const targets = [postLifeSection, readingSection].filter(
      (el): el is HTMLElement => el !== null,
    );
    if (typeof IntersectionObserver !== "undefined" && targets.length > 0) {
      fontIo = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            if (typeof ric === "function") ric(activateFonts, { timeout: 600 });
            else requestAnimationFrame(activateFonts);
            fontIo?.disconnect();
          }
        },
        { rootMargin: "420px" },
      );
      for (const target of targets) {
        fontIo.observe(target);
      }
    } else if (typeof ric === "function") {
      ric(activateFonts, { timeout: 900 });
    }

    const mo = new MutationObserver(() => scheduleUpdate());
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });

    const initRaf = requestAnimationFrame(() => {
      refreshCachedOffsets();
      updateScrollMetrics();
    });

    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", refreshCachedOffsets, { passive: true });
    reducedQuery.addEventListener("change", scheduleUpdate);
    window.addEventListener("inkwellio:motion-change", scheduleUpdate);

    return () => {
      cancelAnimationFrame(initRaf);
      mo.disconnect();
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", refreshCachedOffsets);
      reducedQuery.removeEventListener("change", scheduleUpdate);
      window.removeEventListener("inkwellio:motion-change", scheduleUpdate);
      ro?.disconnect();
      bentoIo?.disconnect();
      fontIo?.disconnect();
    };
  }, []);

  return null;
}
