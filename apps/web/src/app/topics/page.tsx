import { Suspense } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { SiteShell } from "@/components/site-shell";
import { withPublicDbTimeout } from "@/modules/search";
import { listTopics } from "@/modules/topics";

/**
 * The root layout's `<body>` is a flex column. With `mx-auto` alone, a flex
 * item is shrink-wrapped instead of stretched, which collapsed this page to the
 * width of its longest word (~200px) on desktop. An explicit width restores a
 * full-width track that the 56rem directory measure then constrains.
 */
const PAGE_STYLE: CSSProperties = {
  width: "100%",
  maxWidth: "56rem", // 896px
  marginInline: "auto",
  paddingInline: "clamp(1rem, 3vw, 1.5rem)",
  paddingTop: "5.75rem",
  paddingBottom: "3.5rem",
  flex: 1,
};

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
      <main id="main-content" className="mx-auto px-6 py-12" style={PAGE_STYLE}>
        <header className="topics-header">
          <h1 className="topics-title">Topics</h1>
          <p className="topics-subtitle">Curated football writing channels</p>
        </header>
        <p className="topics-empty">
          Topics are temporarily unavailable. Please try again shortly.
        </p>
      </main>
    );
  }

  return (
    <main id="main-content" className="mx-auto px-6 py-12" style={PAGE_STYLE}>
      <header className="topics-header">
        <h1 className="topics-title">Topics</h1>
        <p className="topics-subtitle">Curated football writing channels</p>
      </header>

      {topics.length === 0 ? (
        <p className="topics-empty">No topics available yet.</p>
      ) : (
        <ul className="topics-grid">
          {topics.map((topic) => (
            <li key={topic.id}>
              <Link
                href={`/topics/${encodeURIComponent(topic.slug)}`}
                prefetch={false}
                className="topic-card"
              >
                <span className="topic-card-name">{topic.name}</span>
                <span className="topic-card-count">
                  {topic.publishedCount} {topic.publishedCount === 1 ? "story" : "stories"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

export default function TopicsPage() {
  return (
    <SiteShell activePath="/topics">
      <Suspense
        fallback={
          <main id="main-content" className="mx-auto px-6 py-12" style={PAGE_STYLE}>
            <p className="topics-empty">Loading topics...</p>
          </main>
        }
      >
        <TopicsDirectoryView />
      </Suspense>
    </SiteShell>
  );
}
