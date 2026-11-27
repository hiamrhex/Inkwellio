"use client";

import { useEffect } from "react";

const STAGE_CENTRE_PROGRESS = [0.09, 0.36, 0.63, 0.91] as const;

/**
 * ScrollChoreography — Passive scroll driver (zero scroll-jacking).
 * Maintains sticky header hairline, scroll progress bar, cached scroll-spy, hero exit
 * (scrollY 0 -> 500), #post-life horizontal plateau glide + clickable step dots + keyboard focus sync,
 * #writer-reader fallback scrubbing, marquee velocity boost, and Newsreader warmup.
 */
export function ScrollChoreography() {
  useEffect(() => {
    const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const supportsTimeline =
      typeof CSS !== "undefined" &&
      typeof CSS.supports === "function" &&
      CSS.supports("animation-timeline", "view()");
    let rafPending = false;
    let lastScrollY = window.scrollY || 0;
    let lastScrollTs = performance.now();
    let marqueeResetTimer: ReturnType<typeof setTimeout> | null = null;
    let lastActiveStage = -1;

    const nav =
      document.querySelector<HTMLElement>(".site-header-bar") ??
      document.querySelector<HTMLElement>(".site-nav");
    const progressBar = document.querySelector<HTMLElement>(".site-scroll-progress-bar");
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

    const heroScrollEls = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".hero-silk-backdrop, .hero-copy, .hero-form-body, .hero-float-card",
      ),
    );
    const heroExitPx = Math.max(
      1,
      parseFloat(document.body.style.getPropertyValue("--hero-exit-scroll-px")) || 500,
    );
    const marqueeGain = parseFloat(document.body.style.getPropertyValue("--marquee-velocity-gain")) || 1.15;
    const readingSection = document.querySelector<HTMLElement>("#reading-room");
    const readingFill = document.querySelector<HTMLElement>(".reading-progress-fill");
    const sideGlideSection = document.querySelector<HTMLElement>("#writer-reader");
    const postLifeSection = document.querySelector<HTMLElement>("#post-life");
    const postLifeTrack = document.querySelector<HTMLElement>(".post-life-track");
    const postLifeSteps = Array.from(document.querySelectorAll<HTMLElement>(".post-life-step"));
    const postLifePanels = Array.from(document.querySelectorAll<HTMLElement>(".post-life-panel"));
    const postLifeDots = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-post-life-dot]"));
    const marqueeTrack = document.querySelector<HTMLElement>(".topic-marquee-track");
    const bentoCards = Array.from(document.querySelectorAll<HTMLElement>(".bento-cell-reveal"));

    let maxDocScroll = 1;
    let postLifeTop = 0;
    let postLifeTravel = 1;
    let marqueeTop = 0;
    let marqueeBottom = 0;

    const isMotionFrozen = () => {
      const attr = document.documentElement.getAttribute("data-motion");
      return attr === "paused" || (attr !== "active" && reducedQuery.matches);
    };

    const refreshCachedOffsets = () => {
      for (const item of spyItems) {
        item.top = item.el.offsetTop;
      }
      const vh = window.innerHeight || 900;
      maxDocScroll = Math.max(1, document.documentElement.scrollHeight - vh);
      if (postLifeTrack && postLifeSection) {
        postLifeTop = Math.round(postLifeTrack.getBoundingClientRect().top + (window.scrollY || 0));
        postLifeTravel = Math.max(1, postLifeTrack.offsetHeight - vh);
      }
      if (marqueeTrack) {
        marqueeTop = Math.round(marqueeTrack.getBoundingClientRect().top + (window.scrollY || 0));
        marqueeBottom = marqueeTop + marqueeTrack.offsetHeight + 120;
      }
    };

    const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

    // Piecewise dwell curve matching @keyframes post-life-horizontal-glide (returns 0..3 stage index float)
    const mapPlateauStage = (p: number): number => {
      if (p <= 0.19) return 0;
      if (p < 0.27) return (p - 0.19) / 0.08;
      if (p <= 0.46) return 1;
      if (p < 0.54) return 1 + (p - 0.46) / 0.08;
      if (p <= 0.73) return 2;
      if (p < 0.81) return 2 + (p - 0.73) / 0.08;
      return 3;
    };

    const setActiveStageUi = (idx: number) => {
      if (idx === lastActiveStage) return;
      lastActiveStage = idx;
      for (let i = 0; i < postLifePanels.length; i++) {
        if (i === idx) postLifePanels[i].setAttribute("data-stage-active", "true");
        else postLifePanels[i].removeAttribute("data-stage-active");
      }
      for (let i = 0; i < postLifeSteps.length; i++) {
        if (i === idx) postLifeSteps[i].setAttribute("data-stage-active", "true");
        else postLifeSteps[i].removeAttribute("data-stage-active");
      }
      for (let i = 0; i < postLifeDots.length; i++) {
        postLifeDots[i].setAttribute("aria-pressed", i === idx ? "true" : "false");
      }
    };

    let cachedMarqueeAnims: Animation[] | null = null;
    let lastMarqueeQueryAt = -1000;
    let lastSpyId: string | null = null;
    let lastDocProgress = "";
    let lastHeroVal = "";
    let lastStageVal = "";

    const getMarqueeAnims = (now: number) => {
      if (cachedMarqueeAnims && cachedMarqueeAnims.length > 0 && cachedMarqueeAnims[0].playState !== "finished") {
        return cachedMarqueeAnims;
      }
      if (!marqueeTrack || typeof marqueeTrack.getAnimations !== "function") return [];
      if (now - lastMarqueeQueryAt < 1000) return [];
      lastMarqueeQueryAt = now;
      const anims = marqueeTrack.getAnimations();
      if (anims.length > 0) cachedMarqueeAnims = anims;
      return anims;
    };

    const updateMarqueePace = (scrollY: number, vh: number, frozen: boolean) => {
      if (!marqueeTrack || scrollY + vh < marqueeTop || scrollY > marqueeBottom) return;
      const now = performance.now();
      const anims = getMarqueeAnims(now);
      if (!anims.length) return;
      if (frozen) {
        if (anims[0].playbackRate !== 1) {
          for (const anim of anims) anim.playbackRate = 1;
        }
        return;
      }
      const dt = Math.max(16, now - lastScrollTs);
      const velocity = Math.abs(scrollY - lastScrollY) / dt;
      lastScrollY = scrollY;
      lastScrollTs = now;
      const boostRate = Math.max(
        1,
        Math.min(3.0, +(1 + velocity * marqueeGain).toFixed(2)),
      );
      if (Math.abs(anims[0].playbackRate - boostRate) > 0.05) {
        for (const anim of anims) anim.playbackRate = boostRate;
      }
      if (marqueeResetTimer !== null) clearTimeout(marqueeResetTimer);
      marqueeResetTimer = setTimeout(() => {
        const list = getMarqueeAnims(performance.now());
        for (const anim of list) anim.playbackRate = 1;
      }, 180);
    };

    const updateScrollMetrics = (fromScrollEvent = false) => {
      rafPending = false;
      const scrollY = window.scrollY || window.pageYOffset || 0;
      const vh = window.innerHeight || 1;
      const frozen = isMotionFrozen();

      if (nav) {
        nav.classList.toggle("is-scrolled", scrollY > 64);
      }
      const docProg = frozen ? "0" : clamp01(scrollY / maxDocScroll).toFixed(4);
      if (docProg !== lastDocProgress) {
        lastDocProgress = docProg;
        progressBar?.style.setProperty("--scroll-progress", docProg);
      }

      if (spyItems.length > 0) {
        const probeY = scrollY + 140;
        let currentId = "";
        for (const item of spyItems) {
          if (item.top <= probeY) {
            currentId = item.id;
          }
        }
        if (currentId !== lastSpyId) {
          lastSpyId = currentId;
          for (const item of spyItems) {
            if (item.id === currentId) item.anchor.setAttribute("data-active", "true");
            else item.anchor.removeAttribute("data-active");
          }
        }
      }

      if (fromScrollEvent) {
        updateMarqueePace(scrollY, vh, frozen);
      }

      const heroVal = frozen ? "0" : clamp01(scrollY / heroExitPx).toFixed(4);
      if (heroVal !== lastHeroVal) {
        lastHeroVal = heroVal;
        for (const el of heroScrollEls) {
          el.style.setProperty("--hero-scroll", heroVal);
        }
      }

      if (postLifeSection) {
        const rawP = clamp01((scrollY - postLifeTop) / postLifeTravel);
        const stagePos = frozen ? 0 : mapPlateauStage(rawP);
        const stageStr = stagePos.toFixed(4);
        if (stageStr !== lastStageVal) {
          lastStageVal = stageStr;
          postLifeSection.style.setProperty("--post-life-stage", stageStr);
        }
        setActiveStageUi(frozen ? 0 : Math.max(0, Math.min(3, Math.round(stagePos))));
      }

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

    let offsetsReady = false;
    const ensureOffsets = () => {
      if (!offsetsReady) {
        offsetsReady = true;
        refreshCachedOffsets();
      }
    };

    const scrollToStage = (stageIdx: number) => {
      ensureOffsets();
      const targetP = STAGE_CENTRE_PROGRESS[Math.max(0, Math.min(3, stageIdx))] ?? 0;
      const top = Math.round(postLifeTop + targetP * postLifeTravel);
      window.scrollTo({ top, behavior: isMotionFrozen() ? "auto" : "smooth" });
    };

    const onDotClick = (ev: Event) => {
      const btn = (ev.currentTarget as HTMLButtonElement) || null;
      const idx = Number(btn?.getAttribute("data-post-life-dot"));
      if (Number.isInteger(idx)) scrollToStage(idx);
    };
    const onPanelFocus = (ev: Event) => {
      if (isMotionFrozen() || (window.innerWidth || 1440) < 768) return;
      const panel = ev.currentTarget as HTMLElement;
      const idx = Number(panel?.getAttribute("data-post-life-panel"));
      if (Number.isInteger(idx) && idx !== lastActiveStage) scrollToStage(idx);
    };

    for (const dot of postLifeDots) dot.addEventListener("click", onDotClick);
    for (const panel of postLifePanels) panel.addEventListener("focus", onPanelFocus);

    const scheduleUpdate = () => {
      ensureOffsets();
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => updateScrollMetrics(true));
    };

    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            refreshCachedOffsets();
            offsetsReady = true;
            updateScrollMetrics(false);
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

    let initIdleId: number | null = null;
    let initRaf = 0;
    const bootScrollMetrics = () => {
      ensureOffsets();
      updateScrollMetrics(false);
    };
    if ((window.scrollY || 0) > 0) {
      initRaf = requestAnimationFrame(bootScrollMetrics);
    } else if (typeof ric === "function") {
      initIdleId = ric(bootScrollMetrics, { timeout: 900 });
    } else {
      initRaf = requestAnimationFrame(bootScrollMetrics);
    }

    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", refreshCachedOffsets, { passive: true });
    reducedQuery.addEventListener("change", scheduleUpdate);
    window.addEventListener("inkwellio:motion-change", scheduleUpdate);

    return () => {
      cancelAnimationFrame(initRaf);
      if (
        initIdleId !== null &&
        typeof (window as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback ===
          "function"
      ) {
        (window as { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(initIdleId);
      }
      if (marqueeResetTimer !== null) clearTimeout(marqueeResetTimer);
      for (const dot of postLifeDots) dot.removeEventListener("click", onDotClick);
      for (const panel of postLifePanels) panel.removeEventListener("focus", onPanelFocus);
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
