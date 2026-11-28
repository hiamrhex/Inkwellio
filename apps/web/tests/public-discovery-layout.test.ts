import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Static regression guard for the public discovery pages.
 *
 * These pages are async Server Components backed by Postgres, so a plain
 * `renderToStaticMarkup` cannot exercise their final markup. The guard instead
 * reads the shipped source and asserts the layout contract that broke live:
 * a full-width constrained container, a two-column monochrome card grid with
 * >= 44px targets and a visible focus ring, and real navigation out of the
 * page through the shared reader shell.
 */

function source(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

const topics = source("../src/app/topics/page.tsx");
const topicDetail = source("../src/app/topics/[slug]/page.tsx");
const search = source("../src/app/search/page.tsx");
const css = source("../src/app/globals.css");
const shell = source("../src/components/site-shell.tsx");

describe("public discovery layout regression guard", () => {
  it("constrains /topics to a full-width container instead of a collapsed strip", () => {
    // A flex-column body with `mx-auto` alone shrink-wraps <main> to its
    // longest word (~200px). An explicit width: 100% is the fix.
    expect(topics).toContain('width: "100%"');
    expect(topics).toContain('maxWidth: "56rem"');
    expect(topics).toContain('marginInline: "auto"');
    expect(topics).toContain('paddingInline: "clamp(1rem, 3vw, 1.5rem)"');
  });

  it("renders /topics as a 2-column grid with 24px gaps and no colliding count row", () => {
    expect(topics).toContain('className="topics-grid"');
    expect(topics).toContain('className="topic-card"');
    expect(topics).not.toContain("TOPIC_ROW_STYLE");
    expect(topics).not.toContain("TOPIC_COUNT_STYLE");
    expect(topics).toContain('activePath="/topics"');

    const gridBlock = css.slice(css.indexOf(".topics-grid"), css.indexOf(".topic-card-name"));
    expect(gridBlock).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(gridBlock).toContain("gap: 24px");
    expect(gridBlock).toContain("padding: 24px");
    expect(gridBlock).toMatch(/\.topic-card:hover\s*\{[^}]*translateY\(-4px\)/);
  });

  it("gives each topic card a >= 44px target, visible focus ring and 32px desktop padding", () => {
    const cardBlock = css.slice(css.indexOf(".topic-card {" ), css.indexOf(".topic-card:hover"));
    expect(cardBlock).toContain("min-height: 120px");
    expect(cardBlock).toContain("background: var(--bg-surface1)");
    expect(cardBlock).toContain("box-shadow: var(--shadow-card)");
    expect(css).toMatch(/\.topic-card:focus-visible\s*\{[^}]*outline/);
    expect(css).toMatch(/@media \(min-width: 1024px\)\s*\{\s*\.topic-card\s*\{\s*padding: 32px/);
  });

  it("lets a reader navigate out of /topics through the shared reader shell", () => {
    // The bogus Home / Search / Topics breadcrumb is gone; navigation lives in
    // the single continuous reader top bar.
    expect(topics).not.toContain("Breadcrumb");
    expect(shell).toContain('href="/"');
    expect(shell).toContain('href="/topics"');
    expect(shell).toContain('href="/search"');
    expect(topics).toContain('href={`/topics/${encodeURIComponent(topic.slug)}`}');
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
