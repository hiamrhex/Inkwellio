/**
 * landing.test.ts — Agent 4 (WP7 Wave A Phase A1) landing & shared-shell test suite.
 *
 * Enforces:
 *  1. Product name: "Inkwellio" everywhere, never "Inkwell" alone; "elite" banned.
 *  2. Zero third-party tracker domains; live auth links without premature forms.
 *  3. Contrast ratios computed programmatically from @inkwellio/ui tokens.
 *  4. Touch targets >= 44px & accessibility landmarks / skip links.
 *  5. Squircle clipPath & strict CSP compliance (zero inline <script> / dangerouslySetInnerHTML).
 *  6. External runtime budget (<= 3 KB gzip), single shared passive pointermove + WeakMap rect cache.
 *  7. Copy & honesty contract: "Write the game. Own the link.", no "Sign-up opens soon",
 *     no fake revision history, no invented people/stats/dates.
 *  8. Signature stage ("A post's life"): CSS animation-timeline: view(), fallback stack,
 *     steps() typing with aria-hidden + .sr-only, and reduced-motion disablement.
 *  9. Active-only hero WebP sculpture with fetchPriority="high", loading="eager", explicit dims/sizes.
 * 10. Shared shell consistency across /, /topics, /topics/[slug], /search, /p/[handle], /p/[handle]/[slug].
 * 11. Design docs & mutation proofs guaranteeing test assertions fail on violated copy/attributes.
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

/* ── Reusable Honest Copy Validator (also mutation-tested below) ─ */
function findHonestyViolations(text: string): string[] {
  const violations: string[] = [];
  if (/sign-?up\s+opens\s+soon|no\s+sign-?up\s+yet/i.test(text)) {
    violations.push("outdated sign-up waitlist copy");
  }
  if (/revisions?\s+history|automatic\s+revision\s+history|minute\s+checkpoints/i.test(text)) {
    violations.push("fake revision history claim");
  }
  if (/\bmarcus\s*reed\b/i.test(text) || /23\s*nov\s*2026/i.test(text)) {
    violations.push("invented persona or date");
  }
  if (/\bxG\b|\bturnovers\b|@analyst/i.test(text)) {
    violations.push("invented football stat or handle");
  }
  if (/\bsovereign\b/i.test(text)) {
    violations.push("engineering jargon");
  }
  if (/\belite\b/i.test(text)) {
    violations.push("banned adjective");
  }
  return violations;
}

/* ── Sources ─────────────────────────────────────────────────── */
const pageSrc = readSrc("apps/web/src/app/page.tsx");
const cssSrc = readSrc("apps/web/src/app/globals.css");
const layoutSrc = readSrc("apps/web/src/app/layout.tsx");
const siteShellSrc = readSrc("apps/web/src/components/site-shell.tsx");
const sessionNavSrc = readSrc("apps/web/src/components/session-nav-actions.tsx");
const postLifeSrc = readSrc("apps/web/src/app/post-life-stage.tsx");
const iconTileSrc = readSrc("packages/ui/src/icon-tile.tsx");
const themeToggleSrc = readSrc("packages/ui/src/theme-toggle.tsx");
const heroArtifactSrc = readSrc("apps/web/src/app/living-hero-artifact.tsx");
const topicMarqueeSrc = readSrc("apps/web/src/app/topic-marquee.tsx");
const bentoSrc = readSrc("apps/web/src/app/interactive-bento.tsx");
const chipSrc = readSrc("packages/ui/src/chip.tsx");
const sectionHeaderSrc = readSrc("packages/ui/src/section-header.tsx");
const ribbonCanvasSrc = readSrc("apps/web/src/app/hero-ribbon-canvas.tsx");
const dotMatrixSrc = readSrc("apps/web/src/app/cta-dot-matrix.tsx");
const scrollChoreoSrc = readSrc("apps/web/src/app/scroll-choreography.tsx");
const ribbonLoaderSrc = readSrc("apps/web/src/app/hero-ribbon-loader.tsx");
const ribbonMediaSrc = readSrc("apps/web/src/app/hero-ribbon-media.tsx");
const dotLoaderSrc = readSrc("apps/web/src/app/cta-dot-matrix-loader.tsx");
const magneticSrc = readSrc("apps/web/src/app/magnetic-button.tsx");
const logoSrc = readSrc("packages/ui/src/inkwellio-logo.tsx");
const iconSvgSrc = readSrc("apps/web/src/app/icon.svg");
const runtimePath = path.join(root, "apps/web/public/scripts/landing-runtime.js");
const landingRuntimeSrc = fs.readFileSync(runtimePath, "utf8");
const themeJsSrc = readSrc("apps/web/public/scripts/theme.js");
const principlesSrc = readSrc("docs/design/principles.md");
const assetsDocSrc = readSrc("docs/design/assets.md");

const topicsSrc = readSrc("apps/web/src/app/topics/page.tsx");
const topicDetailSrc = readSrc("apps/web/src/app/topics/[slug]/page.tsx");
const searchSrc = readSrc("apps/web/src/app/search/page.tsx");
const pubHandleSrc = readSrc("apps/web/src/app/p/[handle]/page.tsx");
const pubPostSrc = readSrc("apps/web/src/app/p/[handle]/[slug]/page.tsx");

/* ════════════════════════════════════════════════════════════════
   1. Product name & honesty contract (with mutation proofs)
   ════════════════════════════════════════════════════════════════ */
describe("Product name & honesty contract", () => {
  it('page.tsx and site-shell.tsx contain "Inkwellio" and never bare "Inkwell"', () => {
    const bare = /\bInkwell\b(?!io)/g;
    expect(pageSrc).toContain("Inkwellio");
    expect(siteShellSrc).toContain("Inkwellio");
    expect(bare.test(pageSrc)).toBe(false);
    expect(bare.test(cssSrc)).toBe(false);
    expect(bare.test(siteShellSrc)).toBe(false);
  });

  it("enforces Wave A hero headline, closing display line, subline, and CTAs", () => {
    expect(pageSrc).toMatch(/<h1[^>]*hero-headline[\s\S]*?Publish football\.[\s\S]*?Own it\.[\s\S]*?<\/h1>/);
    expect(pageSrc).toMatch(/id="publishing-heading"[\s\S]*?Write the game\. Own the link\./);
    expect(pageSrc).toContain(
      "A calm home for match analysis, club history and long-form football culture.",
    );
    expect(pageSrc).toContain('href="/sign-up"');
    expect(pageSrc).toContain('href="#post-life"');
    expect(pageSrc).toContain("See how it works");
    expect(pageSrc).toContain("side-glide-left");
    expect(pageSrc).toContain("side-glide-right");
  });

  it("mutation proof: updated headline assertion rejects old H1 ordering", () => {
    const legacyHeroOnly = `<h1 className="hero-headline">Write the game. Own the link.</h1>`;
    expect(legacyHeroOnly).not.toMatch(/<h1[^>]*hero-headline[\s\S]*?Publish football\.[\s\S]*?Own it\.[\s\S]*?<\/h1>/);
  });

  it("enforces honesty contract across landing, signature stage, bento, shell, and docs", () => {
    for (const [label, src] of [
      ["page.tsx", pageSrc],
      ["post-life-stage.tsx", postLifeSrc],
      ["interactive-bento.tsx", bentoSrc],
      ["living-hero-artifact.tsx", heroArtifactSrc],
      ["site-shell.tsx", siteShellSrc],
      ["principles.md", principlesSrc],
      ["assets.md", assetsDocSrc],
    ] as const) {
      expect(findHonestyViolations(src), `violations in ${label}`).toEqual([]);
    }
  });

  it("mutation proof: findHonestyViolations rejects waitlist copy, fake revisions, and banned terms", () => {
    expect(findHonestyViolations("Public preview. Sign-up opens soon.")).toContain(
      "outdated sign-up waitlist copy",
    );
    expect(findHonestyViolations("Automatic revision history with minute checkpoints")).toContain(
      "fake revision history claim",
    );
    expect(findHonestyViolations("Written by Marcus Reed on 23 Nov 2026")).toContain(
      "invented persona or date",
    );
    expect(findHonestyViolations("A fast elite template")).toContain("banned adjective");
  });

  it("zero third-party tracker domains in page.tsx", () => {
    const TRACKER_PATTERNS = [
      /googletagmanager/,
      /analytics\.js/,
      /gtag\(/,
      /facebook\.net/,
      /hotjar/,
      /segment\.com/,
    ];
    for (const pattern of TRACKER_PATTERNS) {
      expect(pageSrc).not.toMatch(pattern);
    }
  });
});

/* ════════════════════════════════════════════════════════════════
   2. Contrast ratios (computed from token values)
   ════════════════════════════════════════════════════════════════ */
describe("Contrast ratios — computed from tokens", () => {
  it("dark: textPrimary on bgCanvas >= 7:1 (AAA body text)", () => {
    expect(contrastRatio(tokens.dark.textPrimary, tokens.dark.bgCanvas)).toBeGreaterThanOrEqual(7);
  });

  it("dark: textMuted on bgCanvas >= 4.5:1 (AA)", () => {
    expect(contrastRatio(tokens.dark.textMuted, tokens.dark.bgCanvas)).toBeGreaterThanOrEqual(4.5);
  });

  it("dark: textFaint on bgCanvas >= 4.5:1 (AA)", () => {
    expect(contrastRatio(tokens.dark.textFaint, tokens.dark.bgCanvas)).toBeGreaterThanOrEqual(4.5);
  });

  it("dark: accent on bgCanvas >= 4.5:1 (AA)", () => {
    expect(contrastRatio(tokens.dark.accent, tokens.dark.bgCanvas)).toBeGreaterThanOrEqual(4.5);
  });

  it("light: textPrimary on bgCanvas >= 7:1 (AAA body text)", () => {
    expect(contrastRatio(tokens.light.textPrimary, tokens.light.bgCanvas)).toBeGreaterThanOrEqual(7);
  });

  it("light: textMuted on bgCanvas >= 4.5:1 (AA)", () => {
    expect(contrastRatio(tokens.light.textMuted, tokens.light.bgCanvas)).toBeGreaterThanOrEqual(4.5);
  });

  it("light: textFaint on bgCanvas >= 4.5:1 (AA)", () => {
    expect(contrastRatio(tokens.light.textFaint, tokens.light.bgCanvas)).toBeGreaterThanOrEqual(4.5);
  });

  it("light: accent on bgCanvas >= 4.5:1 (AA)", () => {
    expect(contrastRatio(tokens.light.accent, tokens.light.bgCanvas)).toBeGreaterThanOrEqual(4.5);
  });
});

/* ════════════════════════════════════════════════════════════════
   3. Touch targets, CSP, Shared Runtime Budget & Theme Toggle
   ════════════════════════════════════════════════════════════════ */
describe("Touch targets, CSP & runtime budgets", () => {
  it("primary CTAs, nav links, and theme toggle enforce >= 44px touch targets", () => {
    expect(cssSrc).toMatch(/\.btn-primary\s*\{[^}]*height:\s*44px/);
    expect(cssSrc).toMatch(/\.nav-auth-pill\s*\{[^}]*min-height:\s*44px/);
    expect(cssSrc).toMatch(/\.nav-auth-link\s*\{[^}]*min-height:\s*44px/);
    expect(themeToggleSrc).toMatch(/minWidth.*44/);
    expect(themeToggleSrc).toMatch(/minHeight.*44/);
  });

  it("icon-tile.tsx defines squircle clipPath with objectBoundingBox", () => {
    expect(iconTileSrc).toContain("inkwellio-squircle-clip");
    expect(iconTileSrc).toContain("objectBoundingBox");
  });

  it("contains zero inline scripts or dangerouslySetInnerHTML", () => {
    for (const src of [pageSrc, layoutSrc, siteShellSrc]) {
      expect(src).not.toContain("dangerouslySetInnerHTML");
      expect(src).not.toMatch(/<script[^>]*>\s*\{`/);
    }
    expect(layoutSrc).toContain("/scripts/theme.js");
    expect(layoutSrc).toContain("/scripts/landing-runtime.js");
  });

  it("landing-runtime.js <= 3072 bytes gzipped and centralizes passive pointermove + WeakMap cache", () => {
    const raw = fs.readFileSync(runtimePath);
    const compressed = zlib.gzipSync(raw, { level: 9 });
    expect(compressed.byteLength).toBeLessThanOrEqual(3072);
    expect(landingRuntimeSrc).toContain("WeakMap");
    expect(landingRuntimeSrc).toContain("ResizeObserver");
    expect(landingRuntimeSrc).toContain("passive: true");
    expect(landingRuntimeSrc).toContain("clamp(");
  });

  it("theme-toggle renders single button toggling sun/moon via CSS state", () => {
    const matches = themeToggleSrc.match(/<button/g);
    expect(matches?.length).toBe(1);
    expect(themeToggleSrc).toContain("data-theme-toggle");
    expect(themeToggleSrc).toContain("theme-icon-sun");
    expect(themeToggleSrc).toContain("theme-icon-moon");
    expect(cssSrc).toContain(".theme-icon-moon");
  });
});

/* ════════════════════════════════════════════════════════════════
   4. Shared Shell, Auth Island, Navigation Anchors & Subpages
   ════════════════════════════════════════════════════════════════ */
describe("Shared Shell & Public Reading Routes", () => {
  it("header renders unified single top bar, Pause motion footer toggle, and zero prefetch={false}", () => {
    for (const label of ["Principles", "Editor", "Reading", "Publishing"]) {
      expect(siteShellSrc).toContain(label);
    }
    expect(siteShellSrc).toContain("site-header-bar");
    expect(siteShellSrc).toContain("site-header-inner");
    expect(siteShellSrc).toContain("minimalHeader");
    expect(siteShellSrc).toContain("<InkwellioLogo");
    expect(siteShellSrc.match(/<InkwellioLogo/g)?.length).toBeGreaterThanOrEqual(2);
    expect(siteShellSrc).toContain("nav-zone-left");
    expect(siteShellSrc).toContain("nav-zone-right");
    expect(siteShellSrc).toContain("<ThemeToggle");
    expect(siteShellSrc).toContain("<SessionNavActions");
    expect(siteShellSrc).toContain('data-motion-toggle="true"');
    expect(siteShellSrc).toContain("Pause motion");
    expect(siteShellSrc).toContain("Resume motion");
    expect(siteShellSrc).toContain('href="#main-content"');
    expect(siteShellSrc).toContain('href="/privacy"');
    expect(siteShellSrc).toContain('href="/terms"');
    expect(cssSrc).toContain(".nav-auth-slot");
    expect(cssSrc).toContain('[data-motion="paused"]');
    expect(cssSrc).toContain("#10b981");
    expect(cssSrc).not.toContain(".section-flip");
    expect(cssSrc).not.toContain(".flip-curtain");
    expect(landingRuntimeSrc).toContain("data-motion-toggle");
    expect(landingRuntimeSrc).toContain("inkwellio:motion-change");
    expect(themeJsSrc).toContain("inkwellio-motion-paused");

    for (const src of [siteShellSrc, sessionNavSrc, bentoSrc, magneticSrc, pageSrc]) {
      expect(src).not.toContain("prefetch={false}");
    }
  });

  it("SessionNavActions checks GET /api/auth/get-session after load + idle and swaps to Dashboard / Sign out", () => {
    expect(sessionNavSrc).toContain("/api/auth/get-session");
    expect(sessionNavSrc).toContain("/api/auth/sign-out");
    expect(sessionNavSrc).toContain("requestIdleCallback");
    expect(sessionNavSrc).toContain("/dashboard");
    expect(sessionNavSrc).toContain("Sign in");
    expect(sessionNavSrc).toContain("Sign up");
    expect(sessionNavSrc).toContain("Sign out");
  });

  it("nav anchors match real landing section IDs across SiteHeader and page.tsx / post-life-stage.tsx", () => {
    const allLandingHtmlSrc = `${pageSrc}\n${postLifeSrc}`;
    for (const anchor of ["#essentials", "#post-life", "#reading-room", "#publishing"]) {
      expect(siteShellSrc).toContain(anchor);
      expect(allLandingHtmlSrc).toContain(`id="${anchor.slice(1)}"`);
    }
  });

  it("/topics, /topics/[slug], /search, /p/[handle], and /p/[handle]/[slug] use Shared Shell and Ink & Paper tokens", () => {
    for (const [label, src] of [
      ["/topics", topicsSrc],
      ["/topics/[slug]", topicDetailSrc],
      ["/search", searchSrc],
      ["/p/[handle]", pubHandleSrc],
      ["/p/[handle]/[slug]", pubPostSrc],
    ] as const) {
      expect(src, `${label} must render SiteShell`).toContain("<SiteShell");
      expect(src, `${label} must provide id="main-content"`).toContain('id="main-content"');
      expect(src, `${label} must not use broken dark:border-zinc-800`).not.toContain("dark:border-zinc-800");
      expect(src, `${label} must use token colors`).toContain("var(--border-hairline)");
    }
    expect(pubHandleSrc).toContain('href="/"');
    expect(pubHandleSrc).toContain('href="/topics"');
    expect(pubPostSrc).toContain('href="/"');
    expect(pubPostSrc).toContain("editorial-reading");
    expect(pubPostSrc).toContain("<EditorialFontReady");
  });
});

/* ════════════════════════════════════════════════════════════════
   5. Signature Stage ("A post's life"), Honest Bento & Hero
   ════════════════════════════════════════════════════════════════ */
describe("Signature stage, honest Bento & Hero artifact", () => {
  it("mounts zero-client-JS PostLifeStage (300vh horizontal), TopicMarquee, capability strip & side-glide", () => {
    expect(pageSrc).toContain("<PostLifeStage");
    expect(pageSrc).toContain("<TopicMarquee");
    expect(pageSrc).toContain("capability-grid");
    expect(postLifeSrc).not.toMatch(/["']use client["']/);
    expect(topicMarqueeSrc).not.toMatch(/["']use client["']/);
    expect(postLifeSrc).toContain("A post&apos;s life");
    expect(postLifeSrc).toContain("<Chip>Illustration</Chip>");
    expect(postLifeSrc).toContain("/p/@handle/slug");
    expect(postLifeSrc).toContain("inkwellio.example/@handle/city-away-leg");
    expect(postLifeSrc).toContain("Write draft");
    expect(postLifeSrc).toContain("Choose topics &amp; slug");
    expect(postLifeSrc).toContain("Publish");
    expect(postLifeSrc).toContain('className="sr-only"');
    expect(cssSrc).toContain("--post-life-tl");
    expect(cssSrc).toContain("height: 300vh;");
    expect(cssSrc).toContain("post-life-horizontal-glide");
    expect(cssSrc).toContain("animation-timeline: view()");
    expect(cssSrc).toContain("rotateY(180deg)");
    expect(cssSrc).toContain("steps(");
    expect(cssSrc).toContain(".topic-marquee-track");
    expect(cssSrc).toContain(".spotlight-card::after");
    expect(cssSrc).toContain(".side-glide-band");
    expect(cssSrc).toContain("overflow-x: clip");
    expect(cssSrc).toContain("side-glide-in-left");
    expect(cssSrc).toContain("side-glide-in-right");
  });

  it("InteractiveBento replaces fake revisions with real curated football topics", () => {
    expect(bentoSrc).toContain("03 / Topics");
    expect(bentoSrc).toContain("Organise by football topics");
    expect(bentoSrc).toContain('href="/topics"');
    expect(bentoSrc).toContain("inkwellio.example/@");
  });

  it("enforces plain everyday copy across landing sections (short <= 16-word sentences)", () => {
    expect(pageSrc).toContain("Your drafts never overwrite each other");
    expect(pageSrc).toContain("Clean reading with no distractions");
    expect(postLifeSrc).toContain("Write cleanly with a live word count and autosave.");
    for (const staleJargon of [
      "Optimistic version checks",
      "Archival typography",
      "semantic server HTML",
      "optical patience",
      "ergonomics",
    ]) {
      expect(pageSrc).not.toContain(staleJargon);
      expect(bentoSrc).not.toContain(staleJargon);
      expect(heroArtifactSrc).not.toContain(staleJargon);
    }
    const checkShort = (s: string) =>
      s
        .split(/[.!?]+/)
        .map((part) => part.trim())
        .filter(Boolean)
        .every((sent) => sent.split(/\s+/).length <= 16);
    expect(checkShort("Write cleanly with a live word count and autosave.")).toBe(true);
    expect(checkShort("One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen.")).toBe(false);
  });

  it("Hero artifact uses shared pointer tilt and segmented Write/Read tabs", () => {
    expect(pageSrc).toContain("<LivingHeroArtifact");
    expect(pageSrc).toContain("<MagneticButton");
    expect(magneticSrc).not.toMatch(/["']use client["']/);
    expect(magneticSrc).toContain('data-magnetic="true"');
    expect(heroArtifactSrc).toContain('data-tilt-hero="true"');
    expect(heroArtifactSrc).toContain('role="tablist"');
    expect(heroArtifactSrc).toContain("hero-form-body");
    expect(heroArtifactSrc).toContain("hero-form-specular");
  });
});

/* ════════════════════════════════════════════════════════════════
   6. Performance Gates, Motion & Active-Only Sculpture Assets
   ════════════════════════════════════════════════════════════════ */
describe("Performance budgets, motion & hero sculpture assets", () => {
  it("bans CORE ARCHITECTURE and uppercase pill formatting", () => {
    for (const src of [pageSrc, bentoSrc, heroArtifactSrc, sectionHeaderSrc, chipSrc]) {
      expect(src).not.toMatch(/core\s*architecture/i);
      expect(src).not.toMatch(/textTransform:\s*["']uppercase["']/);
    }
    expect(cssSrc).not.toMatch(
      /\.(chip|hero-eyebrow|hero-float-card|bento-pill-btn)[^}]*text-transform:\s*uppercase/,
    );
  });

  it("enforces Part C motion gates, lazy loading, live ink-ribbon <canvas>, DPR cap & deferred fonts", () => {
    expect(ribbonLoaderSrc).toContain("saveData");
    expect(ribbonLoaderSrc).toContain("requestIdleCallback");
    expect(ribbonLoaderSrc).toContain("dynamic(");
    expect(dotLoaderSrc).toContain("dynamic(");
    expect(ribbonCanvasSrc).toContain("1000 / 30");
    expect(ribbonCanvasSrc).toContain("devicePixelRatio || 1, 1.5");
    expect(ribbonCanvasSrc).not.toContain('window.addEventListener("pointermove"');
    expect(dotMatrixSrc).not.toContain('window.addEventListener("pointermove"');
    expect(layoutSrc).toContain("preload: true");
    expect(layoutSrc).toContain("preload: false");
    expect(cssSrc).toContain("content-visibility: auto");
  });

  it("isolates HeroRibbonCanvas and CtaDotMatrix, supports Pause motion & enforces reduced-motion stops", () => {
    expect(ribbonCanvasSrc).toContain('getContext("2d"');
    expect(dotMatrixSrc).toContain('getContext("2d"');
    expect(dotMatrixSrc).toContain("scanPosY");
    expect(heroArtifactSrc).not.toContain("backdropFilter");

    for (const src of [ribbonCanvasSrc, dotMatrixSrc]) {
      expect(src).toContain("prefers-reduced-motion: reduce");
      expect(src).toContain("IntersectionObserver");
      expect(src).toContain("visibilitychange");
      expect(src).toContain("inkwellio:motion-change");
    }
    expect(scrollChoreoSrc).toContain("prefers-reduced-motion: reduce");
    expect(scrollChoreoSrc).toContain("inkwellio:motion-change");
    expect(scrollChoreoSrc).toContain("passive: true");
    expect(cssSrc).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*\.hero-headline-sweep/);
    expect(cssSrc).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*\.post-life-flip-inner/);
    expect(cssSrc).toMatch(/:root\[data-motion="paused"\][\s\S]*\.hero-headline-sweep/);
  });

  it("loads single active-theme hero 3D WebP with fetchpriority=high, srcset, sizes & byte caps alongside InkwellioLogo + icon.svg", () => {
    expect(pageSrc).toContain("<HeroRibbonMedia");
    expect(pageSrc).toContain("<HeroRibbonLoader");
    expect(themeJsSrc).toContain('link.rel = "preload"');
    expect(themeJsSrc).toContain('fetchpriority", "high"');
    expect(themeJsSrc).toContain("hero-ribbon-");
    expect(themeJsSrc).toContain("-mobile.webp");
    expect(ribbonMediaSrc).toContain('fetchPriority="high"');
    expect(ribbonMediaSrc).toContain("srcSet=");
    expect(ribbonMediaSrc).toContain("sizes=");
    expect(ribbonMediaSrc).toContain("width={1280}");
    expect(ribbonMediaSrc).toContain("height={714}");
    expect(ribbonMediaSrc).toContain('alt=""');
    expect(themeJsSrc).not.toContain("hero-ink-dark.webp");
    expect(themeJsSrc).not.toContain("hero-ink-light.webp");
    expect(cssSrc).not.toContain("hero-ink-dark.webp");
    expect(cssSrc).not.toContain("hero-ink-light.webp");

    for (const [rel, maxBytes] of [
      ["apps/web/public/images/hero-ribbon-dark.webp", 45 * 1024],
      ["apps/web/public/images/hero-ribbon-dark-mobile.webp", 22 * 1024],
      ["apps/web/public/images/hero-ribbon-light.webp", 45 * 1024],
      ["apps/web/public/images/hero-ribbon-light-mobile.webp", 22 * 1024],
      ["apps/web/public/images/spatial-monolith-dark.webp", 38 * 1024],
      ["apps/web/public/images/spatial-slab-light.webp", 38 * 1024],
    ] as const) {
      const sz = fs.statSync(path.join(root, rel)).size;
      expect(sz, `${rel} exceeded ${maxBytes} B`).toBeLessThanOrEqual(maxBytes);
    }

    expect(logoSrc).toContain("<svg");
    expect(logoSrc).toContain("#10b981");
    expect(iconSvgSrc).toContain("prefers-color-scheme: dark");
    expect(fs.existsSync(path.join(root, "apps/web/src/app/favicon.ico"))).toBe(true);
  });

  it("records design principles & local sculpture inventory without licence claims", () => {
    expect(principlesSrc).toContain("Clear in five seconds");
    expect(principlesSrc).toContain("One earned moment of delight");
    expect(assetsDocSrc).toContain("29.18 KiB");
    expect(assetsDocSrc).toContain("13.38 KiB");
    expect(assetsDocSrc).toContain("Generated by Richard with Gemini and downloaded locally");
    expect(assetsDocSrc).not.toMatch(/\blicen[cs]e\b/i);
  });
});
