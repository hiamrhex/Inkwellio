# Art Direction Plan: Ink & Paper (WP7)

Written 21 November 2026. Compliant with Agent 4 Elite Landing Page prompt and "Ink and Paper" addendum from Richard.
Evidence tags: **[V]** verified by test / code computation, **[R]** reasoning, **[U]** unverified.

## 1. Palette: Ink & Paper

Contrast ratios computed using the WCAG 2.1 relative-luminance formula ($L_1 + 0.05 / L_2 + 0.05$) programmatically in `packages/ui/tests/components.test.ts` and `apps/web/tests/landing.test.ts` [V].

### Dark mode (Ink)
- **Canvas:** `#000000` (true black)
- **Surface 1:** `#0c0c0d` (elevated 1 step)
- **Surface 2:** `#141415` (elevated 2 steps)
- **Surface 3:** `#1c1c1e` (elevated 3 steps)
- **Text primary:** `#fafafa` — contrast on canvas: **20.12:1** (AAA) [V]
- **Text muted:** `#a1a1a6` — contrast on canvas: **8.16:1** (AA) [V]
- **Text faint:** `#7c7c82` — contrast on canvas: **5.06:1** (AA) [V]
- **Accent (System Blue):** `#0a84ff` — contrast on canvas: **5.76:1** (AA) [V]; black text on accent: **5.76:1** (AA) [V]
- **Accent swatches for review:** Studio Indigo `#8b9bff` (8.23:1 on canvas), Pitch Green `#30d158` (9.57:1 on canvas)
- **Border hairline:** `rgba(255, 255, 255, 0.10)`
- **Flip section:** Paper white `#ffffff` canvas with `#0a0a0b` ink text (rhythm break)

### Light mode (Paper)
- **Canvas:** `#ffffff` (pure white)
- **Surface 1:** `#f5f5f7`
- **Surface 2:** `#ececef`
- **Surface 3:** `#e3e3e7`
- **Text primary:** `#0a0a0b` — contrast on canvas: **19.79:1** (AAA) [V]
- **Text muted:** `#55555a` — contrast on canvas: **7.41:1** (AA) [V]
- **Text faint:** `#707075` — contrast on canvas: **4.93:1** (AA) [V]
- **Accent (System Blue):** `#0066cc` — contrast on canvas: **5.57:1** (AA) [V]; white text on accent: **5.57:1** (AA) [V]
- **Border hairline:** `rgba(0, 0, 0, 0.08)`
- **Flip section:** Ink black `#000000` canvas with `#fafafa` text

## 2. Typography
- **Font family:** `Geist Sans` (`var(--font-geist-sans)`), monospace `Geist Mono` (`var(--font-geist-mono)`)
- **Desktop headline:** `clamp(2.75rem, 6vw, 6rem)` (44px to 96px), weight 600, letter-spacing `-0.035em`, line-height 1.08 [V]
- **Mobile headline (≤ 768px):** `clamp(2.25rem, 10vw, 2.75rem)` (36px to 44px)
- **Body copy:** `1.0625rem` (17px), line-height 1.65, color `var(--text-muted)`
- **Plain words for football writers:** Zero engineering jargon ("sovereign", "data gates", work package codes, or fake metrics removed) [V].

## 3. Component Architecture (@inkwellio/ui)
- `IconTile`: Squircle container using SVG `clipPath` with `objectBoundingBox` superellipse ($n \approx 5$) approximation.
- `Chip`: Pill label for section eyebrows (`0.6875rem`, uppercase, hairline border).
- `SectionHeader`: Structured eyebrow + H2 + body block.
- `ThemeToggle`: Single 40px circular button (`min-h-[44px] min-w-[44px]` touch target). Sun icon `☼` in dark mode (click switches to light); Moon icon `☾` in light mode (click switches to dark). Exactly one icon visible per state [V].

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
