# Art Direction Plan: Ink & Paper (WP7)

Written 21 November 2026. Updated 27 November 2026 to reflect Wave A Phase 1B (brand mark, 3D assets, pointer physics, scroll dwell, auth hardening, plain copy).
Evidence tags: **[V]** verified by test / code computation, **[R]** reasoning, **[U]** unverified.

## 1. Palette: Ink & Paper (Strict Monochrome + Archival Elevation)

Contrast ratios computed using the WCAG 2.1 relative-luminance formula ($L_1 + 0.05 / L_2 + 0.05$) programmatically in `packages/ui/tests/components.test.ts` and `apps/web/tests/landing.test.ts` [V].

### Dark mode (Ink)
- **Canvas:** `#000000` (true black OLED)
- **Surface 1:** `#0a0b0e` (elevated card base)
- **Surface 2:** `#121318` (elevated 2 steps / modal)
- **Surface 3:** `#191b22` (elevated 3 steps / popover)
- **Text primary:** `#fafafa` — contrast on canvas: **20.12:1** (AAA) [V]
- **Text muted:** `#a1a1a6` — contrast on canvas: **8.16:1** (AA) [V]
- **Text faint:** `#7c7c82` — contrast on canvas: **5.06:1** (AA) [V]
- **Primary Buttons & CTAs:** Strictly high-contrast monochrome (`#ffffff` fill with `#000000` text, 21:1 contrast) [V].
- **Functional Status Marks (`<= 6px` dots, nib breather dot & focus rings only):**
  - Live status dot & nib breather dot: `#10b981`
  - Autosaved / draft dot: `#ffd60a`
  - Keyboard `:focus-visible` ring: `2px solid #0a84ff` (offset 2px)
  - Subtle neutral surface pinch (`accentPinch`): `rgba(226, 232, 240, 0.095)` — zero green/teal washes or border tints on larger surfaces [V].
- **Border hairline:** `rgba(255, 255, 255, 0.08)`
- **Flip section:** Paper white `#ffffff` canvas with `#0a0a0b` ink text (rhythm break)

### Light mode (Paper - Cool Archival Slate Canvas)
- **Canvas:** `#f1f3f5` (cool archival slate paper canvas)
- **Surface 1:** `#ffffff` (pure white elevated card)
- **Surface 2:** `#ffffff` (pure white modal / floating card)
- **Surface 3:** `#e7eaee` (recessed well / badge background)
- **Text primary:** `#0a0a0b` — contrast on `#f1f3f5`: **17.79:1** (AAA) [V]
- **Text muted:** `#4d515a` — contrast on `#f1f3f5`: **7.15:1** (AA) [V]
- **Text faint:** `#60656e` — contrast on `#f1f3f5`: **5.27:1** (AA) [V]
- **Primary Buttons & CTAs:** Strictly high-contrast monochrome (`#0a0a0b` fill with `#ffffff` text) [V].
- **Functional Status Marks (`<= 6px` dots, nib breather dot & focus rings only):**
  - Live status dot & nib breather dot: `#0f766e`
  - Autosaved / draft dot: `#b45309`
  - Keyboard `:focus-visible` ring: `2px solid #0066cc` (offset 2px)
  - Subtle neutral surface pinch (`accentPinch`): `rgba(15, 23, 42, 0.06)`
- **Border hairline:** `rgba(15, 23, 42, 0.10)`
- **Flip section:** Ink black `#000000` canvas with `#fafafa` text

## 2. Typography
- **UI & Display:** `Geist` (`var(--font-geist-sans)`, `preload: true`), monospace `Geist Mono` (`var(--font-geist-mono)`, `preload: false`)
- **Editorial Reading Voice:** `Newsreader` (`var(--font-newsreader)`, `preload: false`) variable serif via `next/font/google` for long-form reading mode and reading room showcases.
- **Desktop body copy:** `1.0625rem` (17px), line-height 1.65, color `var(--text-muted)`
- **Editorial long-form:** `1.1875rem` (19px), line-height 1.72, measure `65ch`, font `var(--font-editorial)`
- **Plain everyday copy:** Headings and UI labels use `<= 16`-word plain sentences with zero engineering jargon (required headlines retained: `"Publish football. Own it."`, `"Write. Publish. Keep it yours."`, `"Write the game. Own the link."`) [V].

## 3. Component Architecture (`@inkwellio/ui` & App Shell)
- `InkwellioLogo`: Sharp concave-tapered fountain-pen nib mark (`packages/ui/src/inkwellio-logo.tsx`, inline SVG `< 0.45 KiB`), no outer circle, slit ending in emerald breather dot (`#10b981` / `#0f766e`), mounted beside `"Inkwellio"` in `SiteHeader` and `SiteFooter`, paired with adaptive `apps/web/src/app/icon.svg` and `favicon.ico` [V].
- `SiteHeader` / `.site-header-bar`: Unified single sticky top bar (`minimalHeader` mode on auth routes) with `ThemeToggle` (`>= 44x44 px`) and auth links (`Sign in`, `Sign up`) or active session nav [V].
- `SiteFooter`: Compact monochrome footer carrying topics/search/privacy/terms links plus persistent `"Pause motion"` / `"Resume motion"` button [V].
- `IconTile` & `SectionHeader`: Squircle `clipPath` superellipse icons and clean section headers [V].
- `PasswordField`: Reusable auth password field with `<button type="button">` show/hide toggle, constant `aria-label="Show password"`, toggling `aria-pressed`, `>= 44x44 px` target, `spellCheck={false}`, and `#0d0f14` dark / `#ffffff` light autofill & focus states [V].

## 4. Layered Motion & Runtime
- **Zero-FOUC Theme & Single-Asset Preload:** `/scripts/theme.js` (`605 B` gz [V]) sets `data-theme`, honours `inkwellio-motion-paused`, and injects a single `<link rel="preload" as="image" fetchpriority="high">` with `680w, 1280w` `srcSet` (`sizes="(max-width: 767px) 74vw, 62vw"`) so only the active theme + viewport size downloads [V].
- **Layer 1 (Hero Composition):** Pre-rendered 3D ribbon (`HeroRibbonMedia`, `<= 45 KiB` desktop / `<= 22 KiB` mobile) blends softly (`screen` dark / `multiply` + radial `closest-side` mask light) behind `<LivingHeroArtifact />`, alongside lazy `<HeroRibbonCanvas />` (`1.5` max DPR, 30 fps cap). At rest, `document.getAnimations()` inside the hero viewport stays `<= 3` (`2` measured: caret blink & entrance reveal); decorative hero wireframe frame removed (`W8.3`) to cut visual clutter [V].
- **Layer 2 (Scroll Choreography):**
  - Hero 3-rate scroll exit (`heroExit` copy, card, silk backdrop) via GPU `transform` only.
  - Signature pinned dwell track `#post-life` (`350vh`, "A post's life") pausing across stages 01–04 (`4–5` stable wheel notches per stage measured) with zero scroll-jacking [V].
  - `#writer-reader` symmetric horizontal side glide (`±120px`, `±6deg` `rotateY`, `scale(0.94)`) converging cleanly without horizontal overflow (`scrollWidth <= innerWidth`) [V].
  - `TopicMarquee` velocity boost on scroll (`playbackRate` `1.0 -> ~1.53` measured) pausing cleanly on hover/focus/reduced-motion/Pause motion [V].
  - Lazy bottom CTA `<CtaDotMatrix />` (`IntersectionObserver`, pause-aware).
- **Layer 3 (Pointer Physics):** `/scripts/landing-runtime.js` (`2,596 B` gz; total first-party landing JS `14.56 KiB <= 15 KiB` [V]) attaches one shared passive `pointermove` listener with `ResizeObserver`/scroll rect cache: `520px` hero cursor spotlight, `±6°` card spring tilt + diagonal sheen, hero ribbon depth shift, `<= 6px` magnetic CTA pull, and active Bento `-5px` lift. Touch devices run press feedback only (`scale(0.97)`). `requestAnimationFrame` shuts off completely before `1 s` pointer idle (`0` rAF calls measured after 1s) [V].

## 5. Security & CSP
- Zero inline scripts in JSX (no `dangerouslySetInnerHTML`, no inline `<script>` tags) [V].
- External scripts only: `/scripts/theme.js` and `/scripts/landing-runtime.js`. Zero analytics or third-party trackers [V].
- Every auth route (`/sign-in`, `/sign-up`, `/forgot-password`, `/reset-password`, `/verify-email`) pairs cleanly with live `/api/auth/**` endpoints, maps rate limits (`429`), validation (`400`/`422`), invalid credentials (`401`), email-unverified (`403`), conflicts (`409`), and transport failures (`500`) without fabricating backend behaviour (`docs/handoffs/frontend-needs.md` documents local email-transport & limiter gaps) [V].
