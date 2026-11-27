# Design Principles: Inkwellio

Inkwellio is a calm place to write and read football. The design is judged by the reader and the writer, not by visual effects. Every interface decision follows these seven principles:

## 1. Clear in five seconds
A visitor should understand within five seconds what Inkwellio is, who it is for, and what to click next. Headings use plain everyday words, actions carry unambiguous labels, and navigation uses a single sticky top bar without competing pills or insider jargon.

## 2. Typography first
Interface controls and chrome use **Geist** (`--font-geist-sans`) and **Geist Mono** (`--font-geist-mono`); long-form reading uses **Newsreader** serif (`--font-newsreader`). Desktop reading measures hold between `62ch` and `68ch` (`65ch` default), with desktop body prose at `17px–18px` (`1.0625rem` default, `1.1875rem` in the reading sample) and mobile body at `>= 16px`.

## 3. Speed is design
Nothing jumps or lags on a mid-range phone. Cumulative Layout Shift stays under `0.1` (`0.0006` measured on `/` desktop, `0` on mobile), first-party landing JavaScript stays within its `<= 15 KiB` gzipped budget (`14.56 KiB` measured), active pointer and scroll handlers produce `0 ms` long tasks (initial unthrottled React hydration on load measures `72–90 ms` on desktop and `681 ms` under 4x CPU throttling), pointer `requestAnimationFrame` loops settle to `0` calls within `1 s` of idle, and canvases plus footers honour `Pause motion` and `prefers-reduced-motion: reduce`.

## 4. Restraint and consistency
Surfaces are strictly monochrome (`#000000` true black dark hero / `#0a0b0e`–`#191b22` elevated layers with `rgba(255,255,255,0.08)` hairlines; `#f1f3f5` cool slate archival light canvas with `#ffffff` elevated cards, `#e7eaee` recessed wells, and `rgba(15,23,42,0.10)` hairlines). Both themes are intentionally designed rather than inverted. Emerald (`#10b981` dark / `#0f766e` light) is reserved strictly for `<= 6px` status dots, the nib breather dot in `<InkwellioLogo />`, and `:focus-visible` outlines (`#0a84ff` / `#0066cc`) — never larger washes, borders, or surface fills. Every form input and action defines its hover, focus, empty, loading, error, and autofill states.

## 5. Honesty
Nothing is invented — no fabricated writers, match stats, handles, dates, or customer quotes. Every capability described on public pages must correspond to real working functionality in the product, and preview widgets or roadmap notes are labeled as illustrations or draft samples.

## 6. Accessible by default
All color pairs meet WCAG AA/AAA contrast ratios verified programmatically from `packages/ui/src/tokens.ts`. Pages share a unified `<SiteHeader />` / `<SiteFooter />` shell with a skip link (`#main-content`), sticky anchor offsets (`scroll-margin-top`), visible `:focus-visible` rings, `>= 44px` minimum interactive touch targets (including password show/hide toggles), `.sr-only` alternatives for visual sequences, and complete disablement of ambient/scroll motion under `prefers-reduced-motion: reduce` or the persisted `"Pause motion"` control.

## 7. One earned moment of delight
Motion serves comprehension rather than filling every viewport. The landing page earns one signature pinned horizontal-dwell sequence (`#post-life`, `350vh`, "A post's life") and subtle spring restraint elsewhere, keeping `<= 3` simultaneous animations running at rest in the hero viewport (`2` measured), limiting touch devices to press feedback only (`scale(0.97)`), and banning scroll-jacking completely.
