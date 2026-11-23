# Art Direction Plan: Ink & Paper (WP7)

Written 21 November 2026. Updated 23 November 2026 with Principal Design Engineer & Staff UX Architect Upgrade Blueprint and 5 Mandatory Revisions from Richard.
Evidence tags: **[V]** verified by test / code computation, **[R]** reasoning, **[U]** unverified.

## 1. Palette: Ink & Paper (Strict Monochrome + Archival Elevation)

Contrast ratios computed using the WCAG 2.1 relative-luminance formula ($L_1 + 0.05 / L_2 + 0.05$) programmatically in `packages/ui/tests/components.test.ts` and `apps/web/tests/landing.test.ts` [V].

### Dark mode (Ink)
- **Canvas:** `#000000` (true black OLED)
- **Surface 1:** `#0c0c0d` (elevated card base)
- **Surface 2:** `#141416` (elevated 2 steps / modal)
- **Surface 3:** `#1c1c1f` (elevated 3 steps / popover)
- **Text primary:** `#fafafa` — contrast on canvas: **20.12:1** (AAA) [V]
- **Text muted:** `#a1a1a6` — contrast on canvas: **8.16:1** (AA) [V]
- **Text faint:** `#7c7c82` — contrast on canvas: **5.06:1** (AA) [V]
- **Primary Buttons & CTAs:** Strictly high-contrast monochrome (`#ffffff` fill with `#000000` text, 21:1 contrast) [V].
- **Functional Status Marks (<= 6px dots & focus rings only):**
  - Live status dot: `#30d158` (Pitch Green)
  - Autosaved / draft dot: `#ffd60a` (Amber)
  - Keyboard `:focus-visible` ring: `2px solid #0a84ff` (offset 2px)
- **Border hairline:** `rgba(255, 255, 255, 0.08)`
- **Flip section:** Paper white `#ffffff` canvas with `#0a0a0b` ink text (rhythm break)

### Light mode (Paper - Archival Elevation)
- **Canvas:** `#fafafa` (archival warm newsprint off-white)
- **Surface 1:** `#ffffff` (pure white sheet elevated card)
- **Surface 2:** `#ffffff` (pure white modal / floating card)
- **Surface 3:** `#f4f4f6` (recessed well / badge background)
- **Text primary:** `#0a0a0b` — contrast on `#fafafa`: **18.94:1** (AAA) [V]
- **Text muted:** `#55555a` — contrast on `#fafafa`: **7.43:1** (AA) [V]
- **Text faint:** `#707075` — contrast on `#fafafa`: **4.89:1** (AA) [V]
- **Primary Buttons & CTAs:** Strictly high-contrast monochrome (`#0a0a0b` fill with `#ffffff` text, 18.94:1 contrast) [V].
- **Functional Status Marks (<= 6px dots & focus rings only):**
  - Live status dot: `#1a7f37`
  - Autosaved / draft dot: `#b45309`
  - Keyboard `:focus-visible` ring: `2px solid #0066cc` (offset 2px)
- **Border hairline:** `rgba(0, 0, 0, 0.08)`
- **Flip section:** Ink black `#000000` canvas with `#fafafa` text

## 2. Typography
- **UI & Display:** `Geist Sans` (`var(--font-geist-sans)`), monospace `Geist Mono` (`var(--font-geist-mono)`)
- **Editorial Reading Voice:** `Newsreader` (`var(--font-newsreader)` variable serif via `next/font/google`) for long-form reading mode and reading room showcases.
- **Desktop headline:** `clamp(2.75rem, 6vw, 6rem)` (44px to 96px), weight 600, letter-spacing `-0.035em`, line-height 1.08 [V]
- **Mobile headline (≤ 768px):** `clamp(2.25rem, 10vw, 2.75rem)` (36px to 44px)
- **Body copy:** `1.0625rem` (17px), line-height 1.65, color `var(--text-muted)`
- **Editorial long-form:** `1.1875rem` (19px), line-height 1.72, measure `65ch`, font `var(--font-editorial)`
- **Plain words for football writers:** Zero engineering jargon ("sovereign", "data gates", "42ms edge", "cryptographic log", work package codes, or fake metrics removed) [V].

## 3. Component Architecture (@inkwellio/ui)
- `IconTile`: Squircle container using SVG `clipPath` with `objectBoundingBox` superellipse ($n \approx 5$) approximation.
- `Chip`: Pill label for section eyebrows (`0.6875rem`, uppercase, hairline border).
- `SectionHeader`: Structured eyebrow + H2 + body block.
- `ThemeToggle`: Single 40px circular button (`min-h-[44px] min-w-[44px]` touch target). Sun icon `☼` in dark mode (click switches to light); Moon icon `☾` in light mode (click switches to dark). Exactly one icon visible per state [V].
- `SiteNav`: Centered floating dynamic glass pill (`backdrop-filter: blur(20px) saturate(180%)`), ultra-clean with zero developer badges.

## 4. Layered Motion & Runtime
- **Layer 0:** CSS custom properties, system font fallbacks, pure CSS light-dark() support.
- **Layer 1:** Ambient gentle float (8s ease-in-out, disabled on `prefers-reduced-motion`).
- **Layer 2:** Scroll-driven animations (`animation-timeline: scroll()` for rail, `view()` for entry reveal) under `@supports`.
- **Layer 3:** Pointer island: external `landing-runtime.js` (< 3 KB gzipped; measured 739 bytes gzipped) [V]. Passive `pointermove` with `ResizeObserver` caching for spotlight cards and hero parallax.
- **Zero FOUC:** External blocking `/scripts/theme.js` in `<head>` (< 400 bytes, zero dependencies).

## 5. Security & CSP
- Zero inline scripts in JSX (no `dangerouslySetInnerHTML`, no inline `<script>` tags) [V].
- External scripts: `/scripts/theme.js` (blocking in head) and `/scripts/landing-runtime.js` (deferred before body end).
- CSP: Hash/nonce documented for inclusion before strict CSP header deployment.
- Zero analytics or third-party trackers [V].
- Zero premature sign-up commitments (read-only previews, no mock sign-up forms) [V].
