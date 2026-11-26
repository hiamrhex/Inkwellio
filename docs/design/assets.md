# Hero & Landing Assets Inventory (`apps/web/public/images/`)

Source & licence confirmation required from Richard before final launch. Both source JPEGs were inspected visually and contain zero visible watermarks or brand overlays.

| Deployed Asset | Source File (Richard's `Downloads`) | Source Dimensions / Size | Deployed Format & Dimensions | Deployed Size | Ground & Blend Method | Source & Licence Status |
|---|---|---|---|---|---|---|
| [hero-ink-dark.webp](../../../apps/web/public/images/hero-ink-dark.webp) | `C:\Users\HP\Downloads\Gemini_Generated_Image_vt2pghvt2pghvt2p.jpg` | `2048 × 2048` JPEG (`1,540,898 B`) | WebP (`768 × 768`) | `29,880 B` (`29.18 KiB`) | Opaque black backdrop (`lum < 12` clamped `#000000`) blended into `#000000` canvas via `mix-blend-mode: screen` + radial edge fade mask | **[PENDING RICHARD CONFIRMATION]** (AI-generated Gemini studio render; verify licence before production publish) |
| [hero-ink-light.webp](../../../apps/web/public/images/hero-ink-light.webp) | `C:\Users\HP\Downloads\Gemini_Generated_Image_vt2pghvt2pghvt2p (1).jpg` | `2048 × 2048` JPEG (`1,860,883 B`) | WebP (`768 × 768`) | `13,696 B` (`13.38 KiB`) | Opaque white backdrop (`lum > 246` clamped `#ffffff`) blended into `#fafafa` canvas via `mix-blend-mode: multiply` + radial edge fade mask | **[PENDING RICHARD CONFIRMATION]** (AI-generated Gemini studio render; verify licence before production publish) |

## Rendering & LCP Guarantees
- Rendered via `<HeroSculpture />` behind `LivingHeroArtifact` (`alt=""`, `aria-hidden="true"`, explicit `width={768}`, `height={768}`, zero `priority` flag).
- Only the active theme's `.webp` is mounted/downloaded on initial paint (`hero-ink-dark.webp` in dark mode; `hero-ink-light.webp` in light mode); switching themes loads the alternate image on demand.
- Headline `<h1>` stays the Largest Contentful Paint (LCP) candidate.
