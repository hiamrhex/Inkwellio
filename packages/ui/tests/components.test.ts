/**
 * components.test.ts — @inkwellio/ui component test suite (WP7).
 *
 * Tests:
 *  U1. tokens export: dark and light keys exist.
 *  U2. Dark palette: bgCanvas is true black.
 *  U3. Light palette: bgCanvas is pure white.
 *  U4. Dark: textPrimary contrast on bgCanvas >= 7:1.
 *  U5. Light: textPrimary contrast on bgCanvas >= 7:1.
 *  U6. Dark: textMuted contrast on bgCanvas >= 4.5:1.
 *  U7. Light: textMuted contrast on bgCanvas >= 4.5:1.
 *  U8. Chip renders with chip class.
 *  U9. SectionHeader renders heading text.
 * U10. IconTile renders with icon-tile class.
 * U11. SquircleClipDef id attribute present.
 * U12. ThemeToggle has single button with data-theme-toggle.
 * U13. useSpring & useSpring2D physics exports and initial state math.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  tokens,
  Chip,
  SectionHeader,
  IconTile,
  InkwellioLogo,
  SquircleClipDef,
  ThemeToggle,
} from "@inkwellio/ui";
import { useSpring, useSpring2D } from "../src/client";

/* ── WCAG contrast helper (duplicated from landing.test.ts for isolation) ── */
function linearise(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const n = parseInt(h, 16);
  const [r, g, b] = [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
  return 0.2126 * linearise(r) + 0.7152 * linearise(g) + 0.0722 * linearise(b);
}
function contrastRatio(fg: string, bg: string): number {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/* ════════════════════════════════════════════════════════════════
   U1–U7: Token structure and contrast
   ════════════════════════════════════════════════════════════════ */
describe("tokens", () => {
  it("U1: exports dark and light palettes", () => {
    expect(tokens).toHaveProperty("dark");
    expect(tokens).toHaveProperty("light");
  });

  it("U2: dark.bgCanvas is true black #000000 and dark.bgSurface1 is #0a0b0e", () => {
    expect(tokens.dark.bgCanvas).toBe("#000000");
    expect(tokens.dark.bgSurface1).toBe("#0a0b0e");
    expect(contrastRatio(tokens.dark.textPrimary, tokens.dark.bgSurface1)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(tokens.dark.textMuted, tokens.dark.bgSurface1)).toBeGreaterThanOrEqual(4.5);
  });

  it("U3: light.bgCanvas is crisp archival slate #f1f3f5 with accessible contrast", () => {
    expect(tokens.light.bgCanvas).toBe("#f1f3f5");
    expect(contrastRatio(tokens.light.textFaint, tokens.light.bgCanvas)).toBeGreaterThanOrEqual(4.5);
  });

  it("mutation proof: degraded faint ink below 4.5:1 fails contrast threshold on #f1f3f5", () => {
    expect(contrastRatio("#8a8f98", tokens.light.bgCanvas)).toBeLessThan(4.5);
  });

  it("U4: dark textPrimary on bgCanvas >= 7:1", () => {
    expect(contrastRatio(tokens.dark.textPrimary, tokens.dark.bgCanvas)).toBeGreaterThanOrEqual(7);
  });

  it("U5: light textPrimary on bgCanvas >= 7:1", () => {
    expect(contrastRatio(tokens.light.textPrimary, tokens.light.bgCanvas)).toBeGreaterThanOrEqual(7);
  });

  it("U6: dark textMuted on bgCanvas >= 4.5:1", () => {
    expect(contrastRatio(tokens.dark.textMuted, tokens.dark.bgCanvas)).toBeGreaterThanOrEqual(4.5);
  });

  it("U7: light textMuted on bgCanvas >= 4.5:1", () => {
    expect(contrastRatio(tokens.light.textMuted, tokens.light.bgCanvas)).toBeGreaterThanOrEqual(4.5);
  });
});

/* ════════════════════════════════════════════════════════════════
   U8: Chip
   ════════════════════════════════════════════════════════════════ */
describe("Chip", () => {
  it("U8: renders children with chip class", () => {
    const html = renderToStaticMarkup(createElement(Chip, {}, "Three things"));
    expect(html).toContain("chip");
    expect(html).toContain("Three things");
  });
});

/* ════════════════════════════════════════════════════════════════
   U9: SectionHeader
   ════════════════════════════════════════════════════════════════ */
describe("SectionHeader", () => {
  it("U9: renders heading text", () => {
    const html = renderToStaticMarkup(
      createElement(SectionHeader, { heading: "Write. Publish. Keep it yours." })
    );
    expect(html).toContain("Write. Publish. Keep it yours.");
  });
});

/* ════════════════════════════════════════════════════════════════
   U10: IconTile
   ════════════════════════════════════════════════════════════════ */
describe("IconTile", () => {
  it("U10: renders with icon-tile class", () => {
    const html = renderToStaticMarkup(
      createElement(IconTile, { size: 48 }, "✓")
    );
    expect(html).toContain("icon-tile");
  });
});

/* ════════════════════════════════════════════════════════════════
   U11: SquircleClipDef
   ════════════════════════════════════════════════════════════════ */
describe("SquircleClipDef", () => {
  it("U11: contains inkwellio-squircle-clip id", () => {
    const html = renderToStaticMarkup(createElement(SquircleClipDef));
    expect(html).toContain("inkwellio-squircle-clip");
  });
});

/* ════════════════════════════════════════════════════════════════
   U12: ThemeToggle
   ════════════════════════════════════════════════════════════════ */
describe("ThemeToggle", () => {
  it("U12: renders a single button with data-theme-toggle", () => {
    const html = renderToStaticMarkup(createElement(ThemeToggle));
    const buttonMatches = html.match(/<button/g);
    expect(buttonMatches?.length).toBe(1);
    expect(html).toContain("data-theme-toggle");
  });
});

/* ════════════════════════════════════════════════════════════════
   U13: useSpring & useSpring2D physics
   ════════════════════════════════════════════════════════════════ */
describe("useSpring & useSpring2D physics (G1)", () => {
  it("exports useSpring and useSpring2D functions", () => {
    expect(typeof useSpring).toBe("function");
    expect(typeof useSpring2D).toBe("function");
  });

  it("useSpring renders initial target value in static markup", () => {
    function SpringTestComponent() {
      const val = useSpring(42);
      return createElement("div", { "data-testid": "spring-val" }, String(val));
    }
    const html = renderToStaticMarkup(createElement(SpringTestComponent));
    expect(html).toContain("42");
  });

  it("useSpring2D renders initial target coordinates in static markup", () => {
    function Spring2DTestComponent() {
      const val = useSpring2D({ x: 10, y: -5 });
      return createElement("div", {}, `${val.x},${val.y}`);
    }
    const html = renderToStaticMarkup(createElement(Spring2DTestComponent));
    expect(html).toContain("10,-5");
  });
});

/* ════════════════════════════════════════════════════════════════
   U14: InkwellioLogo nib mark (< 0.6 KiB)
   ════════════════════════════════════════════════════════════════ */
describe("InkwellioLogo", () => {
  it("U14: renders concise nib SVG (<= 614 B), zero outer circle, single emerald breather dot", () => {
    const svg = renderToStaticMarkup(createElement(InkwellioLogo, { size: 20 }));
    expect(Buffer.byteLength(svg, "utf8")).toBeLessThanOrEqual(614);
    expect(svg).toContain("<svg");
    expect(svg).toContain("<path");
    expect(svg.match(/<circle/g)?.length).toBe(1);
    expect(svg).toContain("#10b981");
  });
});
