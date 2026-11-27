# Design Principles: Inkwellio

Inkwellio is a calm place to write and read football. The design is judged by the reader and the writer, not by visual effects. Every interface decision follows these seven principles:

## 1. Clear in five seconds
A visitor should understand within five seconds what Inkwellio is, who it is for, and what to click next. Headings use plain everyday words, actions carry unambiguous labels, and navigation uses a single sticky top bar without competing pills or insider jargon.

## 2. Typography first
Interface controls and chrome use **Geist** (`--font-geist-sans`) and **Geist Mono** (`--font-geist-mono`); long-form reading uses **Newsreader** serif (`--font-newsreader`). Desktop reading measures hold between `62ch` and `68ch` (`65ch` default), with desktop body prose at `17px–18px` (`1.0625rem` default, `1.1875rem` in the reading sample) and mobile body at `>= 16px`.

## 3. Speed is design
Nothing jumps or lags on a mid-range phone. Cumulative Layout Shift stays under `0.1` (`0.0006`–`0.0008` desktop, `0.0022` mobile measured on `/`), first-party landing JavaScript stays within its `<= 15 KiB` gzipped budget (`14.99 KiB` / `15,349 B` measured; `/scripts/landing-runtime.js` `3,037 B <= 3,072 B`), active pointer and smooth-scroll handlers stay within real-time frame budgets (`16.7 ms` median / `16.8 ms` p95 desktop pointer sweep with `0.2 ms` JS; `33.4 ms` p95 / `0.3 ms` JS on `4x` CPU throttled mobile smooth scroll), five-run median LCP measures `404 ms` desktop dark, `372 ms` desktop light, and `2,100 ms` on `4x` CPU / `1.6 Mbps` throttled mobile, pointer `requestAnimationFrame` loops settle to `0` calls after `1.2 s` of idle, and canvases plus toggles honour `Pause motion` and `prefers-reduced-motion: reduce`.

## 4. Restraint and consistency
Inkwellio follows a `60 / 35 / 5` tonal hierarchy across both intentionally designed themes: `60%` calm canvas (`#000000` pure black dark; `#fafafa` crisp archival paper light), `35%` layered monochrome surfaces (`#08090c`–`#171a22` dark with `rgba(255,255,255,0.10)` hairlines; `#ffffff` floating cards on `#f1f4f7` wells with `rgba(9,11,16,0.12)` hairlines and two-layer shadows) plus primary ink (`#ffffff` dark, `#050608` light), and `<= 5%` whisper-light emerald (`#10b981` dark / `#0f766e` light) reserved for status marks, `:focus-visible` outlines, the nib breather dot in `<InkwellioLogo />`, nav progress gradient, active card rim speculars, `#post-life` active indicators, and soft compositor-only cursor mist (`<= 0.08` alpha) governed by `packages/ui/src/motion-config.ts`. Every form input and action defines its hover, focus, empty, loading, error, and autofill states.

## 5. Honesty
Nothing is invented — no fabricated writers, match stats, handles, dates, or customer quotes. Every capability described on public pages must correspond to real working functionality in the product, and preview widgets or roadmap notes are labeled as illustrations or draft samples.

## 6. Accessible by default
All color pairs meet WCAG AA/AAA contrast ratios verified programmatically from `packages/ui/src/tokens.ts`. Pages share a unified `<SiteHeader />` / `<SiteFooter />` shell with a skip link (`#main-content`), sticky anchor offsets (`scroll-margin-top`), visible `:focus-visible` rings, `>= 44px` minimum interactive touch targets (including `<MotionToggle />`, `<ThemeToggle />`, `#post-life` stage dots, and password show/hide toggles), `.sr-only` alternatives for visual sequences, and full ambient/scroll motion pause under `prefers-reduced-motion: reduce` or persisted `"Pause motion"`, with header keyboard `"Resume"` overriding OS reduced-motion back to `data-motion="active"`.

## 7. One earned moment of delight
Motion serves comprehension rather than filling every viewport. The landing page earns one signature pinned horizontal-dwell sequence (`#post-life`, `360vh` pinned runway with `24` notches and `1,380 px` horizontal travel across `4` dwell plateaus, clickable `44x44` stage dots, and keyboard-focusable panels) and subtle compositor-only tilt elsewhere, keeping `<= 3` simultaneous animations running at rest in the hero viewport (`2` measured), disabling hover/pointer drag on coarse touch devices, and banning scroll-jacking completely.
