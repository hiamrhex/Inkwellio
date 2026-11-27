# Art Direction Plan: Ink & Paper (WP7)

Written 21 November 2026. Updated 27 November 2026 to reflect Wave A Phase 1C (`60/35/5` tonal system, compositor spotlight & scroll frame-budget optimisation, `360vh` `#post-life` horizontal dwell, auth-page motion, plain copy).
Evidence tags: **[V]** verified by test / code / CDP computation, **[R]** reasoning, **[U]** unverified.

## 1. Palette: Ink & Paper (`60 / 35 / 5` Tonal System)

Contrast ratios computed using the WCAG 2.1 relative-luminance formula ($L_1 + 0.05 / L_2 + 0.05$) programmatically in `packages/ui/tests/components.test.ts` and `apps/web/tests/landing.test.ts` [V].

### Dark mode (Ink — `#000000` canvas, `#08090c` cards, `#ffffff` ink)
- **Canvas (`60%`):** `#000000` (true black)
- **Surface 1 (`35%` cards):** `#08090c` (elevated card base)
- **Surface 2:** `#101218` (elevated 2 steps / floating pills)
- **Surface 3:** `#171a22` (elevated 3 steps / wells)
- **Text primary:** `#ffffff` — contrast on `#000000` canvas: **21:1** (AAA), on `#08090c` Surface 1: **19.91:1** (AAA) [V]
- **Text muted:** `#b4b9c2` — contrast on `#000000` canvas: **10.66:1** (AAA) [V]
- **Text faint:** `#969ca8` — contrast on `#000000` canvas: **7.62:1** (AAA), on `#08090c` Surface 1: **7.22:1** (AAA) [V]
- **Primary Buttons & CTAs:** High-contrast monochrome (`#ffffff` fill with `#000000` text, **21:1** contrast) [V].
- **Accent & Atmosphere (`<= 5%` Emerald budget via `tokens.ts` & `motionConfig.accent`):**
  - Live status dot, nib breather dot, active `#post-life` hairline, & `:focus-visible` ring (`2px solid`, `2px` offset): `#10b981` (**8.28:1** on `#000000`) [V]
  - Autosaved / draft dot: `#ffd60a` (**14.88:1** on `#000000`) [V]
  - `accentPinch`: `rgba(16, 185, 129, 0.075)`; atmospheric ambient & spotlight washes capped at `<= 0.08` emerald alpha (`darkMistEmeraldAlpha: 0.075`, `darkCornerEmeraldAlpha: 0.08`, active card rim highlight `darkRimEmeraldAlpha: 0.36`) [V]
- **Border hairline:** `rgba(255, 255, 255, 0.10)`
- **Flip section:** Paper white `#ffffff` canvas with `#0a0a0b` ink text (rhythm break)

### Light mode (Paper — `#fafafa` canvas, `#ffffff` elevated cards, `#050608` ink)
- **Canvas (`60%`):** `#fafafa` (bright paper canvas)
- **Surface 1 (`35%` cards):** `#ffffff` (pure white floating card with two-layer shadow)
- **Surface 2:** `#ffffff` (floating status pill / modal)
- **Surface 3:** `#f1f4f7` (recessed well / badge background)
- **Text primary:** `#050608` — contrast on `#fafafa` canvas: **19.42:1** (AAA), on `#ffffff` Surface 1: **20.27:1** (AAA) [V]
- **Text muted:** `#3f4451` — contrast on `#fafafa` canvas: **9.33:1** (AAA) [V]
- **Text faint:** `#505663` — contrast on `#fafafa` canvas: **7.05:1** (AAA) [V]
- **Primary Buttons & CTAs:** High-contrast monochrome (`#050608` fill with `#ffffff` text) [V].
- **Accent & Atmosphere (`<= 5%` Emerald budget via `tokens.ts` & `motionConfig.accent`):**
  - Live status dot, nib breather dot, active `#post-life` hairline, & `:focus-visible` ring (`2px solid`, `2px` offset): `#0f766e` (**5.24:1** on `#fafafa`, **5.47:1** on `#ffffff`, AA/AA-large) [V]
  - Autosaved / draft dot: `#b45309` (**4.81:1** on `#fafafa`, AA) [V]
  - `accentPinch`: `rgba(5, 150, 105, 0.065)`; light-mode emerald ambient mist `0.06`, corner glaze `0.07`, active rim highlight `0.32` [V]
- **Border hairline:** `rgba(9, 11, 16, 0.12)`
- **Flip section:** Ink black `#000000` canvas with `#ffffff` text

## 2. Typography
- **UI & Display:** `Geist` (`var(--font-geist-sans)`, `preload: true`), monospace `Geist Mono` (`var(--font-geist-mono)`, `preload: false`)
- **Editorial Reading Voice:** `Newsreader` (`var(--font-newsreader)`, `preload: false`) variable serif via `next/font/google` for long-form reading mode and reading room showcases.
- **Desktop body copy:** `1.0625rem` (`17px`), line-height `1.65`, color `var(--text-muted)`; mobile `>= 16px` (`1rem`) [V].
- **Editorial long-form:** `1.1875rem` (`19px`), line-height `1.72`, measure `65ch`, font `var(--font-editorial)`
- **Plain everyday copy:** Headings and UI labels use `<= 16`-word plain sentences with zero engineering jargon (required headlines retained: `"Publish football. Own it."`, `"Write. Publish. Keep it yours."`, `"Write the game. Own the link."`) [V].

## 3. Component Architecture (`@inkwellio/ui` & App Shell)
- `InkwellioLogo`: Sharp concave-tapered fountain-pen nib mark (`packages/ui/src/inkwellio-logo.tsx`, inline SVG `< 0.45 KiB`), no outer circle, slit ending in emerald breather dot (`#10b981` / `#0f766e`), mounted beside `"Inkwellio"` in `SiteHeader` and `SiteFooter`, paired with adaptive `apps/web/src/app/icon.svg` and `favicon.ico` [V].
- `MotionConfig`: Central amplitude and accent multipliers in `packages/ui/src/motion-config.ts` serialized on `<body>` via `getMotionCssVars()` so client scroll/runtime modules avoid importing `@inkwellio/ui` [V].
- `SiteHeader` / `.site-header-bar`: Unified single `60px` sticky top bar (`minimalHeader` mode on auth routes) with `ThemeToggle` (`>= 44x44 px`), `MotionToggle` (`>= 44x44 px`, `Pause motion` / `Resume` button that also overrides OS `prefers-reduced-motion: reduce` to `data-motion="active"`), and auth/session actions [V].
- `SiteFooter`: Compact monochrome footer carrying topics/search/privacy/terms links plus persistent `"Pause motion"` / `"Resume motion"` button [V].
- `IconTile` & `SectionHeader`: Squircle `clipPath` superellipse icons and clean section headers [V].
- `PasswordField`: Reusable auth password field with `<button type="button">` show/hide toggle, constant `aria-label="Show password"`, toggling `aria-pressed`, `>= 44x44 px` target, `spellCheck={false}`, and `#0d0f14` dark / `#ffffff` light autofill & focus states [V].

## 4. Layered Motion & Runtime
- **Zero-FOUC Theme & Single-Asset Preload:** `/scripts/theme.js` (`887 B` gz [V]) sets `data-theme`, resolves `data-motion` from `inkwellio-motion` / `prefers-reduced-motion`, and injects a single `<link rel="preload" as="image" fetchpriority="high">` with `680w, 1280w` `srcSet` (`sizes="(max-width: 767px) 74vw, 62vw"`) matched to `HeroRibbonMedia` (`decoding="sync"`) so only the active theme + viewport size downloads [V].
- **Layer 1 (Hero Composition):** Pre-rendered 3D ribbon (`HeroRibbonMedia`, `<= 45 KiB` desktop / `<= 20 KiB` mobile) blends softly (`screen` dark / `multiply` `brightness(1.08) contrast(1.05)` + radial `closest-side` mask light) behind `<LivingHeroArtifact />` (auto-typing deferred `1400 ms` past mobile LCP), alongside deferred `<HeroRibbonCanvas />` (`1150 ms` after `load` + `timeout: 1400` idle, `1.5` max DPR, cached gradients, coarse-scroll skip). At rest, hero animations stay `<= 3`; decorative hero wireframe frame removed (`W8.3`) [V].
- **Layer 2 (Scroll Choreography):** Non-inheriting `@property --hero-scroll` and `@property --scroll-progress` keep scroll updates local to target elements (`p95Mob: 33.4 ms`, `0.3 ms` JS on `4x` CPU mobile scroll) with zero `getAnimations()` off-screen stalls:
  - Hero 3-rate scroll exit (`500 px` distance; copy `-48 px`, card `-96 px` / `6°`, silk backdrop `+75 px` / `1.06x`; `>= 45 px` pairwise separation at `scrollY=480`) [V].
  - Signature pinned dwell track `#post-life` (`360vh` runway, `24` 100px notches, `1,380 px` horizontal travel across `4` dwell plateaus, clickable `44x44` stage dots, and keyboard `tabIndex={0}` panel sync; stacks with `content-visibility: auto` below `768px`) with zero scroll-jacking [V].
  - `#writer-reader` symmetric horizontal side glide (`±180 px`, `36 px` drop, `±10°` `rotateY`, `scale(0.9)`) converging cleanly without horizontal overflow [V].
  - Below-fold `.section-entry` reveal (`44 px`, `scale(0.97)`); `TopicMarquee` velocity boost on scroll (`marqueeVelocityGain: 1.15`) only when marquee is inside the viewport, pausing cleanly on hover/focus/reduced-motion/Pause motion [V].
  - Lazy bottom CTA `<CtaDotMatrix />` (`IntersectionObserver`, pause-aware).
- **Layer 3 (Pointer & Auth Physics):** `/scripts/landing-runtime.js` (`3,037 B <= 3,072 B` gz; total landing first-party JS `14.99 KiB / 15,349 B <= 15 KiB` gz [V]) attaches one shared passive `pointermove` listener with `ResizeObserver`/scroll `WeakMap` rect cache: `580px` compositor `translate3d` cursor spotlight (`0 px` landing lag measured), `±9°` hero card tilt (`8.95°` measured), `±38 px` / `±2°` ribbon glide (`69.4 px` corner delta), `8.5 px` magnetic CTA pull + `2 px` `.mag-label` shift, Bento `±5°` tilt & `-7 px` lift with stationary non-magnetic buttons (`0 px` move), and on auth routes (`5` routes) `±28 px` spatial backdrop parallax (`74 px` corner delta, zero exposed edges), `±6°` margin card tilt (`5.56°` measured) + compositor spotlight (`0.1 px` lag), `200 ms` flatten over interactive controls (`<= 0.02°`), and stationary `.auth-submit` (`0 px` rect move). Touch devices disable hover/drag; idle `1.2 s` flattens tilt (`280 ms` transition) and stops `rAF` (`0` active callbacks) [V].

## 5. Security & CSP
- Zero inline scripts in JSX (no `dangerouslySetInnerHTML`, no inline `<script>` tags) [V].
- External scripts only: `/scripts/theme.js` and `/scripts/landing-runtime.js`. Zero analytics or third-party trackers [V].
- Every auth route (`/sign-in`, `/sign-up`, `/forgot-password`, `/reset-password`, `/verify-email`) pairs cleanly with live `/api/auth/**` endpoints, maps rate limits (`429`), validation (`400`/`422`), invalid credentials (`401`), email-unverified (`403`), conflicts (`409`), and transport failures (`500`) without fabricating backend behaviour (`docs/handoffs/frontend-needs.md` documents local email-transport & limiter gaps) [V].
