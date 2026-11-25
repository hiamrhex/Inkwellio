"use client";

import { useEffect } from "react";

/**
 * ScrollChoreography — Single passive rAF scroll driver (zero scroll-jacking).
 * Handles only behaviors CSS animation-timeline cannot handle reliably cross-browser:
 *  1. Compacts sticky nav after 64px scroll (`is-scrolled`) + active nav scroll-spy.
 *  2. Hero scroll exit (`--hero-scroll`: 0 -> 1) separating sculpture & card.
 *  3. Bento staggered reveal via IntersectionObserver (60ms stagger, opacity untouched).
 *  4. Reading Room 2px live progress bar (`scaleX(0 -> 1)`).
 *  5. Smooth black-to-white curtain & `#publishing` scroll-scrubbed entrance.
 *  6. Defers Newsreader editorial font activation until approaching lower sections.
 */
export function ScrollChoreography() {
  useEffect(() => {
    const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let rafPending = false;

    const nav = document.querySelector<HTMLElement>(".site-nav");
    const navAnchors = Array.from(
      document.querySelectorAll<HTMLAnchorElement>('.nav-links a[href^="#"]'),
    );
    const spySections = navAnchors
      .map((a) => {
        const id = a.getAttribute("href")?.slice(1);
        const el = id ? document.getElementById(id) : null;
        return el ? { anchor: a, el } : null;
      })
      .filter((item): item is { anchor: HTMLAnchorElement; el: HTMLElement } => item !== null);

    const heroOuter = document.querySelector<HTMLElement>(".hero-stage-outer");
    const heroStage = document.querySelector<HTMLElement>(".hero-stage");

    const readingSection = document.querySelector<HTMLElement>("#reading-room");
    const readingFill = document.querySelector<HTMLElement>(".reading-progress-fill");

    const curtain = document.querySelector<HTMLElement>(".flip-curtain");
    const publishingSection = document.querySelector<HTMLElement>("#publishing");
    const bentoCards = Array.from(
      document.querySelectorAll<HTMLElement>(".bento-cell-reveal"),
    );

    const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

    const updateScrollMetrics = () => {
      rafPending = false;
      const scrollY = window.scrollY || window.pageYOffset || 0;
      const vh = window.innerHeight || 1;
      const isReduced = reducedQuery.matches;

      // 1. Nav compact state + scroll-spy
      if (nav) {
        nav.classList.toggle("is-scrolled", scrollY > 64);
      }
      if (spySections.length > 0) {
        const probeY = scrollY + 140;
        let currentId = "";
        for (const item of spySections) {
          if (item.el.offsetTop <= probeY) {
            currentId = item.el.id;
          }
        }
        for (const item of spySections) {
          if (item.el.id === currentId) {
            item.anchor.setAttribute("data-active", "true");
          } else {
            item.anchor.removeAttribute("data-active");
          }
        }
      }

      // 2. Hero exit depth
      const heroVal = isReduced
        ? "0"
        : clamp01(scrollY / Math.max(1, (heroOuter?.offsetHeight || heroStage?.offsetHeight || vh) * 0.9)).toFixed(4);
      heroStage?.style.setProperty("--hero-scroll", heroVal);
      heroOuter?.style.setProperty("--hero-scroll", heroVal);

      // 3. Reading Room 2px live progress bar
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

      // 4. Black-to-white curtain & #publishing flip entrance
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
    };

    const scheduleUpdate = () => {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(updateScrollMetrics);
    };

    let bentoIo: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== "undefined" && bentoCards.length > 0) {
      bentoIo = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-revealed");
              bentoIo?.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.12 },
      );
      bentoCards.forEach((card, index) => {
        card.style.setProperty("--reveal-delay", `${index * 60}ms`);
        bentoIo?.observe(card);
      });
    }

    // Defer Newsreader font loading until user approaches #reading-room (saves ~123 KB on first paint)
    let fontIo: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== "undefined" && readingSection) {
      fontIo = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            document.documentElement.classList.add("editorial-font-ready");
            fontIo?.disconnect();
          }
        },
        { rootMargin: "200px" },
      );
      fontIo.observe(readingSection);
    }

    updateScrollMetrics();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate, { passive: true });
    reducedQuery.addEventListener("change", scheduleUpdate);

    return () => {
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      reducedQuery.removeEventListener("change", scheduleUpdate);
      bentoIo?.disconnect();
      fontIo?.disconnect();
    };
  }, []);

  return null;
}
