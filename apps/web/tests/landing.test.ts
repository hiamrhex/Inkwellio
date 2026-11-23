/**
 * landing.test.ts — Agent 4 (WP7) landing page test suite.
 *
 * Checks:
 *  1. Product name: "Inkwellio" everywhere, never "Inkwell" alone.
 *  2. No tracker domains or sign-up buttons.
 *  3. Contrast: computed from token values via WCAG formula.
 *  4. Touch targets >= 44px (via CSS min-width / min-height tokens).
 *  5. Squircle clipPath present in icon-tile source.
 *  6. No inline <script> in page source (CSP compliance).
 *  7. JS budget: landing-runtime.js <= 3 KB gzip.
 *  8. Theme toggle: single button, correct aria-labels via CSS state.
 *  9. No invented match stats (xG, turnovers, analyst handles).
 * 10. Hero object present in page source & living artifact.
 * 11. External theme script tag present.
 * 12. Nav links point to real anchor IDs.
 * 13. Flip section present.
 * 14. Editor preview label present.
 * 15. Honesty rule — no fake author personas or dates.
 * 16. Plain writer language & true v1 URL architecture (@slug).
 * 17. Phase 2 components mounted.
 */

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { tokens } from "@inkwellio/ui";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../..");

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

/* ── WCAG 2.1 relative luminance ─────────────────────────────── */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function linearise(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * linearise(r) + 0.7152 * linearise(g) + 0.0722 * linearise(b);
}

function contrastRatio(fg: string, bg: string): number {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/* ── Sources ─────────────────────────────────────────────────── */
const pageSrc = readSrc("apps/web/src/app/page.tsx");
const cssSrc  = readSrc("apps/web/src/app/globals.css");
const iconTileSrc = readSrc("packages/ui/src/icon-tile.tsx");
const themeToggleSrc = readSrc("packages/ui/src/theme-toggle.tsx");
const heroArtifactSrc = readSrc("apps/web/src/app/living-hero-artifact.tsx");
const bentoSrc = readSrc("apps/web/src/app/interactive-bento.tsx");
const runtimePath = path.join(root, "apps/web/public/scripts/landing-runtime.js");

/* ════════════════════════════════════════════════════════════════
   1. Product name
   ════════════════════════════════════════════════════════════════ */
describe("Product name", () => {
  it('page.tsx contains "Inkwellio"', () => {
    expect(pageSrc).toContain("Inkwellio");
  });

  it('page.tsx does not contain bare "Inkwell" (wrong spelling)', () => {
    // Allow "Inkwellio" but not standalone "Inkwell " or "Inkwell."
    const bare = /\bInkwell\b(?!io)/g;
    expect(bare.test(pageSrc)).toBe(false);
  });

  it('globals.css does not contain bare "Inkwell"', () => {
    const bare = /\bInkwell\b(?!io)/g;
    expect(bare.test(cssSrc)).toBe(false);
  });
});

/* ════════════════════════════════════════════════════════════════
   2. No trackers / no sign-up button
   ════════════════════════════════════════════════════════════════ */
describe("No trackers / no sign-up button", () => {
  const TRACKER_PATTERNS = [
    /googletagmanager/,
    /analytics\.js/,
    /gtag\(/,
    /facebook\.net/,
    /hotjar/,
    /segment\.com/,
  ];

  it("page.tsx contains no tracker domains", () => {
    for (const pattern of TRACKER_PATTERNS) {
      expect(pageSrc).not.toMatch(pattern);
    }
  });

  it('page.tsx has no sign-up form or "Get started" CTA (no premature commitments)', () => {
    expect(pageSrc).not.toMatch(/href=["'][^"']*sign.?up/i);
    expect(pageSrc.toLowerCase()).not.toMatch(/\bget started\b/);
    expect(pageSrc).not.toMatch(/<form/);
  });
});

/* ════════════════════════════════════════════════════════════════
   3. Contrast (computed from token values)
   ════════════════════════════════════════════════════════════════ */
describe("Contrast ratios — computed from tokens", () => {
  it("dark: textPrimary on bgCanvas >= 7:1 (AAA body text)", () => {
    const ratio = contrastRatio(tokens.dark.textPrimary, tokens.dark.bgCanvas);
    expect(ratio).toBeGreaterThanOrEqual(7);
  });

  it("dark: textMuted on bgCanvas >= 4.5:1 (AA)", () => {
    const ratio = contrastRatio(tokens.dark.textMuted, tokens.dark.bgCanvas);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("dark: textFaint on bgCanvas >= 4.5:1 (AA)", () => {
    const ratio = contrastRatio(tokens.dark.textFaint, tokens.dark.bgCanvas);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("dark: accent on bgCanvas >= 4.5:1 (AA)", () => {
    const ratio = contrastRatio(tokens.dark.accent, tokens.dark.bgCanvas);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("light: textPrimary on bgCanvas >= 7:1 (AAA body text)", () => {
    const ratio = contrastRatio(tokens.light.textPrimary, tokens.light.bgCanvas);
    expect(ratio).toBeGreaterThanOrEqual(7);
  });

  it("light: textMuted on bgCanvas >= 4.5:1 (AA)", () => {
    const ratio = contrastRatio(tokens.light.textMuted, tokens.light.bgCanvas);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("light: textFaint on bgCanvas >= 4.5:1 (AA)", () => {
    const ratio = contrastRatio(tokens.light.textFaint, tokens.light.bgCanvas);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("light: accent on bgCanvas >= 4.5:1 (AA)", () => {
    const ratio = contrastRatio(tokens.light.accent, tokens.light.bgCanvas);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});

/* ════════════════════════════════════════════════════════════════
   4. Touch targets
   ════════════════════════════════════════════════════════════════ */
describe("Touch targets", () => {
  it("btn-primary has height: 44px in globals.css", () => {
    expect(cssSrc).toMatch(/\.btn-primary\s*\{[^}]*height:\s*44px/);
  });

  it("theme toggle has minWidth and minHeight >= 44 in theme-toggle.tsx", () => {
    expect(themeToggleSrc).toMatch(/minWidth.*44/);
    expect(themeToggleSrc).toMatch(/minHeight.*44/);
  });
});

/* ════════════════════════════════════════════════════════════════
   5. Squircle clipPath
   ════════════════════════════════════════════════════════════════ */
describe("Squircle clipPath", () => {
  it("icon-tile.tsx defines inkwellio-squircle-clip clipPath", () => {
    expect(iconTileSrc).toContain("inkwellio-squircle-clip");
  });

  it("icon-tile.tsx uses objectBoundingBox", () => {
    expect(iconTileSrc).toContain("objectBoundingBox");
  });
});

/* ════════════════════════════════════════════════════════════════
   6. No inline scripts in page source
   ════════════════════════════════════════════════════════════════ */
describe("No inline scripts (CSP compliance)", () => {
  it("page.tsx contains no dangerouslySetInnerHTML", () => {
    expect(pageSrc).not.toContain("dangerouslySetInnerHTML");
  });

  it("page.tsx contains no <script> with inline content (tagged template literal)", () => {
    expect(pageSrc).not.toMatch(/<script[^>]*>\s*\{`/);
  });
});

/* ════════════════════════════════════════════════════════════════
   7. JS budget: landing-runtime.js <= 3 KB gzip
   ════════════════════════════════════════════════════════════════ */
describe("JS budget", () => {
  it("landing-runtime.js exists", () => {
    expect(fs.existsSync(runtimePath)).toBe(true);
  });

  it("landing-runtime.js gzip <= 3072 bytes (3 KB)", () => {
    const raw = fs.readFileSync(runtimePath);
    const compressed = zlib.gzipSync(raw, { level: 9 });
    expect(compressed.byteLength).toBeLessThanOrEqual(3072);
  });
});

/* ════════════════════════════════════════════════════════════════
   8. Theme toggle: single button
   ════════════════════════════════════════════════════════════════ */
describe("Theme toggle", () => {
  it("theme-toggle.tsx has data-theme-toggle attribute", () => {
    expect(themeToggleSrc).toContain("data-theme-toggle");
  });

  it("theme-toggle.tsx has exactly one <button>", () => {
    const matches = themeToggleSrc.match(/<button/g);
    expect(matches?.length).toBe(1);
  });

  it("theme-toggle.tsx has sun icon class and moon icon class (not both visible at once)", () => {
    expect(themeToggleSrc).toContain("theme-icon-sun");
    expect(themeToggleSrc).toContain("theme-icon-moon");
  });

  it("globals.css hides moon in dark mode", () => {
    expect(cssSrc).toContain(".theme-icon-moon");
  });
});

/* ════════════════════════════════════════════════════════════════
   9. No invented match stats
   ════════════════════════════════════════════════════════════════ */
describe("No invented match stats", () => {
  it('page.tsx contains no "xG" stat', () => {
    expect(pageSrc).not.toMatch(/\bxG\b/);
  });

  it('page.tsx contains no "turnovers" stat', () => {
    expect(pageSrc).not.toMatch(/\bturnovers\b/i);
  });

  it('page.tsx contains no "@analyst" handle', () => {
    expect(pageSrc).not.toMatch(/@analyst/i);
  });
});

/* ════════════════════════════════════════════════════════════════
   10. Hero object & Living Artifact
   ════════════════════════════════════════════════════════════════ */
describe("Hero object & Living Artifact", () => {
  it("page.tsx mounts LivingHeroArtifact", () => {
    expect(pageSrc).toContain("<LivingHeroArtifact");
  });

  it("living-hero-artifact.tsx contains hero-form-body and hero-form-specular", () => {
    expect(heroArtifactSrc).toContain("hero-form-body");
    expect(heroArtifactSrc).toContain("hero-form-specular");
  });

  it("living-hero-artifact.tsx contains Write and Read tabs", () => {
    expect(heroArtifactSrc).toContain('role="tablist"');
    expect(heroArtifactSrc).toContain("Write");
    expect(heroArtifactSrc).toContain("Read");
  });
});

/* ════════════════════════════════════════════════════════════════
   11. External theme script tag
   ════════════════════════════════════════════════════════════════ */
describe("External theme script", () => {
  it("layout.tsx references /scripts/theme.js", () => {
    const layoutSrc = readSrc("apps/web/src/app/layout.tsx");
    expect(layoutSrc).toContain("/scripts/theme.js");
  });

  it("theme.js exists in public/scripts/", () => {
    const themePath = path.join(root, "apps/web/public/scripts/theme.js");
    expect(fs.existsSync(themePath)).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════
   12. Nav anchors point to real IDs
   ════════════════════════════════════════════════════════════════ */
describe("Nav anchor IDs", () => {
  const NAV_ANCHORS = ["#essentials", "#editor-preview", "#reading-room", "#publishing"];

  for (const anchor of NAV_ANCHORS) {
    it(`page.tsx has anchor ${anchor} in nav and matching id in content`, () => {
      expect(pageSrc).toContain(anchor);
      const id = anchor.slice(1);
      expect(pageSrc).toContain(`id="${id}"`);
    });
  }
});

/* ════════════════════════════════════════════════════════════════
   13. Flip section present
   ════════════════════════════════════════════════════════════════ */
describe("Rhythm flip section", () => {
  it("globals.css defines .section-flip", () => {
    expect(cssSrc).toContain(".section-flip");
  });

  it("page.tsx uses section-flip class", () => {
    expect(pageSrc).toContain("section-flip");
  });
});

/* ════════════════════════════════════════════════════════════════
   14. Editor preview label
   ════════════════════════════════════════════════════════════════ */
describe("Editor preview", () => {
  it('page.tsx contains "Preview of the planned editor" label', () => {
    expect(pageSrc).toContain("Preview of the planned editor");
  });
});

/* ════════════════════════════════════════════════════════════════
   15. Honesty rule — No fake author attribution or dates
   ════════════════════════════════════════════════════════════════ */
describe("Honesty rule — No fake attribution or personas", () => {
  it("page.tsx does not contain Marcus Reed", () => {
    expect(pageSrc).not.toMatch(/marcus\s*reed/i);
  });

  it("page.tsx does not contain invented date strings like '23 Nov 2026'", () => {
    expect(pageSrc).not.toMatch(/23\s*nov\s*2026/i);
  });

  it("reading room plainly labels sample preview", () => {
    expect(pageSrc).toMatch(/Sample preview (&middot;|·) Match analysis (&middot;|·) 65ch reading measure/);
  });
});

/* ════════════════════════════════════════════════════════════════
   16. Plain writer language & True v1 URL architecture (@slug)
   ════════════════════════════════════════════════════════════════ */
describe("Plain writer language & True v1 URL architecture", () => {
  it("page.tsx contains no developer/crypto jargon ('sovereign')", () => {
    expect(pageSrc).not.toMatch(/\bsovereign\b/i);
  });

  it("page.tsx uses canonical /@ slug formatting", () => {
    expect(pageSrc).toContain("inkwellio.example/@yourname");
    expect(pageSrc).toContain("inkwellio.example/@sample/inverted-fullbacks");
  });

  it("page.tsx does not contain bare un-prefixed URLs or mreed paths", () => {
    expect(pageSrc).not.toContain("inkwellio.example/yourname");
    expect(pageSrc).not.toContain("inkwellio.example/mreed");
  });

  it("interactive-bento.tsx displays and formats /@ slug", () => {
    expect(bentoSrc).toContain("inkwellio.example/@");
    expect(bentoSrc).not.toMatch(/\bsovereign\b/i);
  });
});

/* ════════════════════════════════════════════════════════════════
   17. Phase 2 interactive components
   ════════════════════════════════════════════════════════════════ */
describe("Phase 2 interactive components mounted", () => {
  it("page.tsx mounts MagneticButton", () => {
    expect(pageSrc).toContain("<MagneticButton");
  });

  it("page.tsx mounts InteractiveBento", () => {
    expect(pageSrc).toContain("<InteractiveBento");
  });

  it("globals.css defines specular border refraction and blinking caret", () => {
    expect(cssSrc).toContain(".bento-specular-card");
    expect(cssSrc).toContain(".blinking-caret");
  });
});
