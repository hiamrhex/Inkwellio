import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Static regression guard for the public discovery pages.
 *
 * These pages are async Server Components backed by Postgres, so a plain
 * `renderToStaticMarkup` cannot exercise their final markup. The guard instead
 * reads the shipped source and asserts the layout contract that broke live:
 * a full-width constrained container, a non-overlapping flex row with a
 * nowrap count, a 44px touch target with a focus ring, and breadcrumb links
 * that let a reader leave the page.
 */

function source(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

const topics = source("../src/app/topics/page.tsx");
const topicDetail = source("../src/app/topics/[slug]/page.tsx");
const search = source("../src/app/search/page.tsx");

describe("public discovery layout regression guard", () => {
  it("constrains /topics to a full-width 44rem container instead of a collapsed strip", () => {
    // A flex-column body with `mx-auto` alone shrink-wraps <main> to its
    // longest word (~200px). An explicit width: 100% is the fix.
    expect(topics).toContain('width: "100%"');
    expect(topics).toContain('maxWidth: "44rem"');
    expect(topics).toContain('marginInline: "auto"');
    expect(topics).toContain('paddingInline: "clamp(1rem, 3vw, 1.5rem)"');
  });

  it("lays out /topics rows so long names cannot collide with the count", () => {
    expect(topics).toContain('display: "flex"');
    expect(topics).toContain('alignItems: "baseline"');
    expect(topics).toContain('justifyContent: "space-between"');
    expect(topics).toContain('gap: "1rem"');
    expect(topics).toContain("minWidth: 0");
    expect(topics).toContain("flexShrink: 0");
    expect(topics).toContain('whiteSpace: "nowrap"');
  });

  it("gives each topic link a 44px touch target and a visible focus ring", () => {
    expect(topics).toContain("minHeight: 44");
    expect(topics).toContain("focus-visible:outline-2");
    expect(topics).toContain("focus-visible:outline-offset-2");
  });

  it("lets a reader navigate out of /topics to Home and Search", () => {
    expect(topics).toContain('href="/"');
    expect(topics).toContain('href="/search"');
  });

  it("applies the same full-width container and navigation to sibling pages", () => {
    for (const [name, text] of [
      ["/topics/[slug]", topicDetail],
      ["/search", search],
    ] as const) {
      expect(text, `${name} needs width: 100%`).toContain('width: "100%"');
      expect(text, `${name} needs a home link`).toContain('href="/"');
    }
    expect(search, "/search needs a link back to /topics").toContain('href="/topics"');
    expect(topicDetail, "/topics/[slug] needs a link back to /topics").toContain('href="/topics"');
  });
});
