import { Suspense } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { SiteShell } from "@/components/site-shell";
import type { FeedCursor } from "@/modules/posts";
import {
  SEARCH_QUERY_MAX_LENGTH,
  parseSearchQuery,
  searchPublishedPosts,
  withPublicDbTimeout,
  type SearchPage as SearchPageData,
} from "@/modules/search";

/** Same full-width constrained measure as /topics. */
const PAGE_STYLE: CSSProperties = {
  width: "100%",
  maxWidth: "44rem", // 704px
  marginInline: "auto",
  paddingInline: "clamp(1rem, 3vw, 1.5rem)",
  paddingTop: "5.75rem",
  paddingBottom: "3.5rem",
  flex: 1,
};

const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]";

function Breadcrumb() {
  return (
    <nav
      aria-label="Breadcrumb"
      className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--text-muted)]"
    >
      <Link
        href="/"
        prefetch={false}
        className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center px-2 hover:text-[var(--text-primary)] hover:underline ${FOCUS_RING}`}
      >
        Home
      </Link>
      <span aria-hidden="true">/</span>
      <Link
        href="/topics"
        prefetch={false}
        className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center px-2 hover:text-[var(--text-primary)] hover:underline ${FOCUS_RING}`}
      >
        Topics
      </Link>
      <span aria-hidden="true">/</span>
      <span aria-current="page" className="text-[var(--text-primary)]">
        Search
      </span>
    </nav>
  );
}

function parseCursor(after?: string, afterId?: string): FeedCursor | undefined {
  if (!after || !afterId) {
    return undefined;
  }
  const publishedAt = new Date(after);
  if (Number.isNaN(publishedAt.getTime())) {
    return undefined;
  }
  return { publishedAt, postId: afterId };
}

async function SearchResultsView({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    topic?: string;
    after?: string;
    afterId?: string;
  }>;
}) {
  const params = await searchParams;
  const rawQuery = params.q ?? "";
  const topicSlug = params.topic?.trim() || undefined;

  let results: SearchPageData | undefined;
  let errorMessage: string | undefined;

  if (rawQuery.trim() !== "") {
    try {
      const validated = parseSearchQuery(rawQuery);
      const cursor = parseCursor(params.after, params.afterId);
      results = await withPublicDbTimeout((executor) =>
        searchPublishedPosts(executor, {
          query: validated,
          topicSlug,
          cursor,
        }),
      );
    } catch {
      errorMessage = `Enter 1-${SEARCH_QUERY_MAX_LENGTH} valid characters to search published posts.`;
    }
  }

  return (
    <main id="main-content" className="mx-auto max-w-2xl px-6 py-12" style={PAGE_STYLE}>
      <Breadcrumb />
      <header
        className="mb-8 pb-6"
        style={{ borderBottom: "1px solid var(--border-hairline)" }}
      >
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--text-primary)]">Search</h1>
        <form method="GET" action="/search" className="mt-4 flex gap-2">
          <input
            type="search"
            name="q"
            defaultValue={rawQuery}
            maxLength={SEARCH_QUERY_MAX_LENGTH}
            placeholder="Search published posts..."
            aria-label="Search published posts"
            className={`min-h-[44px] flex-1 rounded-md px-3.5 py-2 text-sm ${FOCUS_RING}`}
            style={{
              backgroundColor: "var(--bg-surface1)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-hairline)",
            }}
          />
          {topicSlug ? <input type="hidden" name="topic" value={topicSlug} /> : null}
          <button
            type="submit"
            className={`min-h-[44px] min-w-[44px] cursor-pointer rounded-md px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90 ${FOCUS_RING}`}
            style={{
              backgroundColor: "var(--btn-primary-bg)",
              color: "var(--btn-primary-text)",
            }}
          >
            Search
          </button>
        </form>
      </header>

      {errorMessage ? (
        <p className="text-sm text-[var(--text-muted)]">{errorMessage}</p>
      ) : results === undefined ? (
        <p className="text-sm text-[var(--text-muted)]">
          Search across published articles by title or body.
        </p>
      ) : results.items.length === 0 ? (
        <p className="text-[var(--text-muted)]">
          No published posts matched &ldquo;{results.query}&rdquo;.
        </p>
      ) : (
        <>
          <ul className="space-y-6">
            {results.items.map((item) => (
              <li
                key={item.id}
                className="pb-4"
                style={{ borderBottom: "1px solid var(--border-hairline)" }}
              >
                <Link
                  href={`/@${encodeURIComponent(item.publicationSlug)}/${encodeURIComponent(item.slug)}`}
                  prefetch={false}
                  className={`inline-flex min-h-[44px] items-center text-xl font-medium text-[var(--text-primary)] hover:underline ${FOCUS_RING}`}
                >
                  {item.title}
                </Link>
                <p className="mt-1 text-sm text-[var(--text-muted)]">{item.excerpt}</p>
                <p className="mt-1 text-xs text-[var(--text-faint)]">
                  @{item.publicationSlug} — {item.publishedAt.toISOString().slice(0, 10)}
                </p>
              </li>
            ))}
          </ul>

          {results.nextCursor !== null ? (
            <div className="mt-8">
              <Link
                href={`/search?q=${encodeURIComponent(results.query)}${topicSlug ? `&topic=${encodeURIComponent(topicSlug)}` : ""}&after=${encodeURIComponent(results.nextCursor.publishedAt.toISOString())}&afterId=${encodeURIComponent(results.nextCursor.postId)}`}
                prefetch={false}
                className={`inline-flex min-h-[44px] items-center text-sm font-medium text-[var(--text-primary)] hover:underline ${FOCUS_RING}`}
              >
                Next results →
              </Link>
            </div>
          ) : null}
        </>
      )}
    </main>
  );
}

export default function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    topic?: string;
    after?: string;
    afterId?: string;
  }>;
}) {
  return (
    <SiteShell>
      <Suspense
        fallback={
          <main id="main-content" className="mx-auto max-w-2xl px-6 py-12" style={PAGE_STYLE}>
            <p className="text-[var(--text-muted)]">Loading search...</p>
          </main>
        }
      >
        <SearchResultsView searchParams={searchParams} />
      </Suspense>
    </SiteShell>
  );
}
