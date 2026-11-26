# Design Principles: Inkwellio

Inkwellio is a calm place to write and read football. The design is judged by the reader and the writer, not by visual effects. Every interface decision follows these seven principles:

## 1. Clear in five seconds
A visitor should understand within five seconds what Inkwellio is, who it is for, and what to click next. Headings use plain words, actions carry unambiguous labels, and navigation avoids unexplained icons or insider jargon.

## 2. Typography first
Interface controls and chrome use **Geist Sans** and **Geist Mono**; long-form reading uses **Newsreader** serif. Desktop reading measures hold between `62ch` and `68ch` (`65ch` default), with desktop body prose at `17px–18px` (`1.0625rem` default, `1.1875rem` in Reading Room) and mobile body at `>= 16px`.

## 3. Speed is design
Nothing jumps or lags on a mid-range phone. Cumulative Layout Shift stays under `0.1`, first-party landing JavaScript stays within its `<= 15 KiB` gzipped budget, interaction long tasks stay `<= 50 ms`, non-critical islands defer until after `load` and idle, and offscreen canvases pause automatically.

## 4. Restraint and consistency
Surfaces are monochrome (`#000000` true black dark canvas with `#0c0c0d` / `#141416` / `#1c1c1f` elevated layers and border hairlines; `#fafafa` archival light canvas with pure `#ffffff` elevated cards, a `1px` specular top rim, and soft layered shadows). Both themes are intentionally designed rather than inverted. Accent color is reserved for `<= 6px` status dots and `:focus-visible` outlines. Every interactive surface designs its hover, focus, empty, loading, and error states.

## 5. Honesty
Nothing is invented — no fabricated writers, match stats, handles, dates, or customer quotes. Every capability described on public pages must correspond to real working functionality in the product, and anything unfinished is marked clearly as planned or illustration.

## 6. Accessible by default
All color pairs meet WCAG contrast ratios verified programmatically from `packages/ui/src/tokens.ts`. Pages support full keyboard navigation with a skip link (`#main-content`), sticky anchor offsets (`scroll-margin-top`), visible `:focus-visible` rings, `>= 44px` minimum interactive touch targets, `.sr-only` alternatives for visual motion, and complete disablement of ambient/scroll motion under `prefers-reduced-motion: reduce`.

## 7. One earned moment of delight
Motion serves comprehension rather than filling every viewport. The landing page earns one signature sequence ("A post's life") and subtle physical restraint elsewhere, keeping at most three elements moving in any single viewport and banning scroll-jacking completely.
