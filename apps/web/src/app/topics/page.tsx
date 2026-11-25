import { Suspense } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { withPublicDbTimeout } from "@/modules/search";
import { listTopics } from "@/modules/topics";

/**
 * The root layout's `<body>` is a flex column. With `mx-auto` alone, a flex
 * item is shrink-wrapped instead of stretched, which collapsed this page to the
 * width of its longest word (~200px) on desktop. An explicit width restores a
 * full-width track that the 44rem reading measure then constrains.
 */
const PAGE_STYLE: CSSProperties = {
  width: "100%",
  maxWidth: "44rem", // 704px
  marginInline: "auto",
  paddingInline: "clamp(1rem, 3vw, 1.5rem)",
  paddingBlock: "3rem",
};

const TOPIC_ROW_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: "1rem",
};

const TOPIC_LINK_STYLE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 44,
  minWidth: 0,
};

const TOPIC_COUNT_STYLE: CSSProperties = {
  flexShrink: 0,
  whiteSpace: "nowrap",
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
        href="/search"
        prefetch={false}
        className={`hover:text-[var(--text-primary)] hover:underline ${FOCUS_RING}`}
      >
        Search
      </Link>
      <span aria-hidden="true">/</span>
      <span aria-current="page">Topics</span>
    </nav>
  );
}

async function TopicsDirectoryView() {
  let topics: Awaited<ReturnType<typeof listTopics>> = [];
  let unavailable = false;

  try {
    topics = await withPublicDbTimeout((executor) => listTopics(executor));
  } catch {
    unavailable = true;
  }

  if (unavailable) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-12" style={PAGE_STYLE}>
        <Breadcrumb />
        <h1 className="text-3xl font-semibold tracking-tight">Topics</h1>
        <p className="mt-4 text-[var(--text-muted)]">
          Topics are temporarily unavailable. Please try again shortly.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12" style={PAGE_STYLE}>
      <Breadcrumb />
      <header className="mb-8 border-b border-zinc-200 pb-4 dark:border-zinc-800">
        <h1 className="text-3xl font-semibold tracking-tight">Topics</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Curated football writing channels
        </p>
      </header>

      {topics.length === 0 ? (
        <p className="text-[var(--text-muted)]">No topics available yet.</p>
      ) : (
        <ul className="space-y-4">
          {topics.map((topic) => (
            <li
              key={topic.id}
              className="flex items-baseline justify-between border-b border-zinc-200 pb-3 dark:border-zinc-800"
              style={TOPIC_ROW_STYLE}
            >
              <Link
                href={`/topics/${encodeURIComponent(topic.slug)}`}
                prefetch={false}
                className={`text-lg font-medium hover:text-[var(--text-primary)] hover:underline ${FOCUS_RING}`}
                style={TOPIC_LINK_STYLE}
              >
                {topic.name}
              </Link>
              <span
                className="text-xs text-[var(--text-faint)]"
                style={TOPIC_COUNT_STYLE}
              >
                {topic.publishedCount} published
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

export default function TopicsPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-2xl px-6 py-12" style={PAGE_STYLE}>
          <p>Loading topics...</p>
        </main>
      }
    >
      <TopicsDirectoryView />
    </Suspense>
  );
}
