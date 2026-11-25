import { Suspense } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
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
  paddingBlock: "3rem",
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
        className={`hover:text-[var(--text-primary)] hover:underline ${FOCUS_RING}`}
      >
        Home
      </Link>
      <span aria-hidden="true">/</span>
      <Link
        href="/topics"
        prefetch={false}
        className={`hover:text-[var(--text-primary)] hover:underline ${FOCUS_RING}`}
      >
        Topics
      </Link>
      <span aria-hidden="true">/</span>
      <span aria-current="page">Search</span>
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
    <main className="mx-auto max-w-2xl px-6 py-12" style={PAGE_STYLE}>
      <Breadcrumb />
      <header className="mb-8 border-b border-zinc-200 pb-4 dark:border-zinc-800">
        <h1 className="text-3xl font-semibold tracking-tight">Search</h1>
        <form method="GET" action="/search" className="mt-4 flex gap-2">
          <input
            type="search"
            name="q"
            defaultValue={rawQuery}
            maxLength={SEARCH_QUERY_MAX_LENGTH}
            placeholder="Search published posts..."
            aria-label="Search published posts"
            className="min-h-11 flex-1 rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
          />
          {topicSlug ? <input type="hidden" name="topic" value={topicSlug} /> : null}
          <button
            type="submit"
            className={`min-h-11 rounded border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900 ${FOCUS_RING}`}
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
                className="border-b border-zinc-200 pb-4 dark:border-zinc-800"
              >
                <Link
                  href={`/@${encodeURIComponent(item.publicationSlug)}/${encodeURIComponent(item.slug)}`}
                  prefetch={false}
                  className={`text-xl font-medium hover:text-[var(--text-primary)] hover:underline ${FOCUS_RING}`}
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
                className={`text-sm font-medium hover:text-[var(--text-primary)] hover:underline ${FOCUS_RING}`}
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
    <Suspense
      fallback={
        <main className="mx-auto max-w-2xl px-6 py-12" style={PAGE_STYLE}>
          <p>Loading search...</p>
        </main>
      }
    >
      <SearchResultsView searchParams={searchParams} />
    </Suspense>
  );
}
