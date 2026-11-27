/**
 * components.test.ts — @inkwellio/ui component test suite (WP7 Phase 1C).
 *
 * Verifies 60/35/5 tokens, worst-case wash-composited WCAG contrast guards,
 * motion-config multipliers, and InkwellioLogo + UI primitives.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  tokens,
  motionConfig,
  getMotionCssVars,
  Chip,
  SectionHeader,
  IconTile,
  InkwellioLogo,
  SquircleClipDef,
  ThemeToggle,
} from "@inkwellio/ui";
import { useSpring, useSpring2D } from "../src/client";

type Rgb = readonly [number, number, number];

function parseHex(hex: string): Rgb {
  const h = hex.replace("#", "");
  const n = parseInt(h, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function linearise(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function luminance(rgb: Rgb): number {
  return 0.2126 * linearise(rgb[0]) + 0.7152 * linearise(rgb[1]) + 0.0722 * linearise(rgb[2]);
}

function contrastRgb(fg: Rgb, bg: Rgb): number {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function contrastRatio(fgHex: string, bgHex: string): number {
  return contrastRgb(parseHex(fgHex), parseHex(bgHex));
}

function compositeOver(bg: Rgb, overlay: Rgb, alpha: number): Rgb {
  return [
    overlay[0] * alpha + bg[0] * (1 - alpha),
    overlay[1] * alpha + bg[1] * (1 - alpha),
    overlay[2] * alpha + bg[2] * (1 - alpha),
  ];
}

function worstCaseWashBg(
  baseHex: string,
  spec: { silverRgb: Rgb; silverMaxAlpha: number; emeraldRgb: Rgb; emeraldMaxAlpha: number },
  gain = 1,
): Rgb {
  const step1 = compositeOver(parseHex(baseHex), spec.silverRgb, Math.min(1, spec.silverMaxAlpha * gain));
  return compositeOver(step1, spec.emeraldRgb, Math.min(1, spec.emeraldMaxAlpha * gain));
}

describe("60/35/5 tokens & worst-case wash contrast guard", () => {
  it("U1: exports dark and light palettes", () => {
    expect(tokens).toHaveProperty("dark");
    expect(tokens).toHaveProperty("light");
  });

  it("U2: dark 60% #000000 canvas, 35% #08090c card & #ffffff ink", () => {
    expect(tokens.dark.bgCanvas).toBe("#000000");
    expect(tokens.dark.bgSurface1).toBe("#08090c");
    expect(tokens.dark.textPrimary).toBe("#ffffff");
    expect(contrastRatio(tokens.dark.textPrimary, tokens.dark.bgSurface1)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(tokens.dark.textMuted, tokens.dark.bgSurface1)).toBeGreaterThanOrEqual(4.5);
  });

  it("U3: light 60% #fafafa crisp white canvas, #ffffff card & #050608 primary ink", () => {
    expect(tokens.light.bgCanvas).toBe("#fafafa");
    expect(tokens.light.bgSurface1).toBe("#ffffff");
    expect(tokens.light.textPrimary).toBe("#050608");
    expect(contrastRatio(tokens.light.textFaint, tokens.light.bgCanvas)).toBeGreaterThanOrEqual(4.5);
  });

  it("U4–U7: worst-case brightest silver + emerald wash still yields >= 4.5:1 body/muted/link text & >= 3:1 display", () => {
    const darkWorstCanvas = worstCaseWashBg(tokens.dark.bgCanvas, tokens.dark.washSpec);
    const darkWorstCard = worstCaseWashBg(tokens.dark.bgSurface1, tokens.dark.washSpec);
    const lightWorstCanvas = worstCaseWashBg(tokens.light.bgCanvas, tokens.light.washSpec);
    const lightWorstCard = worstCaseWashBg(tokens.light.bgSurface1, tokens.light.washSpec);

    for (const worst of [darkWorstCanvas, darkWorstCard]) {
      expect(contrastRgb(parseHex(tokens.dark.textPrimary), worst)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRgb(parseHex(tokens.dark.textMuted), worst)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRgb(parseHex(tokens.dark.textFaint), worst)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRgb(parseHex(tokens.dark.accent), worst)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRgb(parseHex(tokens.dark.textPrimary), worst)).toBeGreaterThanOrEqual(3);
    }

    for (const worst of [lightWorstCanvas, lightWorstCard]) {
      expect(contrastRgb(parseHex(tokens.light.textPrimary), worst)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRgb(parseHex(tokens.light.textMuted), worst)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRgb(parseHex(tokens.light.textFaint), worst)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRgb(parseHex(tokens.light.accent), worst)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRgb(parseHex(tokens.light.textPrimary), worst)).toBeGreaterThanOrEqual(3);
    }
  });

  it("mutation proof: over-saturated wash alpha breaks worst-case contrast guard", () => {
    const blownOutDark = worstCaseWashBg(tokens.dark.bgCanvas, {
      silverRgb: [226, 232, 240],
      silverMaxAlpha: 0.65,
      emeraldRgb: [16, 185, 129],
      emeraldMaxAlpha: 0.55,
    });
    expect(contrastRgb(parseHex(tokens.dark.textFaint), blownOutDark)).toBeLessThan(4.5);
    expect(contrastRatio("#9ea4b0", tokens.light.bgCanvas)).toBeLessThan(4.5);
  });

  it("U8: motionConfig provides global motionGain = 1.0 & accentGain = 1.0 plus CSS vars", () => {
    expect(motionConfig.motionGain).toBe(1.0);
    expect(motionConfig.accentGain).toBe(1.0);
    const half = getMotionCssVars({ ...motionConfig, motionGain: 0.5, accentGain: 0.5 });
    expect(half["--motion-gain"]).toBe("0.5");
    expect(half["--accent-gain"]).toBe("0.5");
    expect(half["--hero-ribbon-shift"]).toBe("19");
  });
});

describe("Chip", () => {
  it("U9: renders children with chip class", () => {
    const html = renderToStaticMarkup(createElement(Chip, {}, "Three things"));
    expect(html).toContain("chip");
    expect(html).toContain("Three things");
  });
});

describe("SectionHeader", () => {
  it("U10: renders heading text", () => {
    const html = renderToStaticMarkup(
      createElement(SectionHeader, { heading: "Write. Publish. Keep it yours." }),
    );
    expect(html).toContain("Write. Publish. Keep it yours.");
  });
});

describe("IconTile", () => {
  it("U11: renders with icon-tile class", () => {
    const html = renderToStaticMarkup(createElement(IconTile, { size: 48 }, "✓"));
    expect(html).toContain("icon-tile");
  });
});

describe("SquircleClipDef", () => {
  it("U12: contains inkwellio-squircle-clip id", () => {
    const html = renderToStaticMarkup(createElement(SquircleClipDef));
    expect(html).toContain("inkwellio-squircle-clip");
  });
});

describe("ThemeToggle", () => {
  it("U13: renders a single button with data-theme-toggle", () => {
    const html = renderToStaticMarkup(createElement(ThemeToggle));
    expect(html.match(/<button/g)?.length).toBe(1);
    expect(html).toContain("data-theme-toggle");
  });
});

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
    expect(renderToStaticMarkup(createElement(SpringTestComponent))).toContain("42");
  });

  it("useSpring2D renders initial target coordinates in static markup", () => {
    function Spring2DTestComponent() {
      const val = useSpring2D({ x: 10, y: -5 });
      return createElement("div", {}, `${val.x},${val.y}`);
    }
    expect(renderToStaticMarkup(createElement(Spring2DTestComponent))).toContain("10,-5");
  });
});

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
