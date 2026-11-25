import { Suspense } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { FeedCursor } from "@/modules/posts";
import { withPublicDbTimeout } from "@/modules/search";
import { fetchTopicPublishedPage, normalizeTopicSlug } from "@/modules/topics";

/** Same full-width constrained measure as /topics and /search. */
const PAGE_STYLE: CSSProperties = {
  width: "100%",
  maxWidth: "44rem", // 704px
  marginInline: "auto",
  paddingInline: "clamp(1rem, 3vw, 1.5rem)",
  paddingBlock: "3rem",
};

const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]";

function Breadcrumb({ topicName }: { topicName?: string }) {
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
      <Link
        href="/search"
        prefetch={false}
        className={`hover:text-[var(--text-primary)] hover:underline ${FOCUS_RING}`}
      >
        Search
      </Link>
      {topicName ? (
        <>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{topicName}</span>
        </>
      ) : null}
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

async function TopicFeedView({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ after?: string; afterId?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const normalized = normalizeTopicSlug(slug);
  if (normalized === undefined) {
    notFound();
  }
  if (slug !== normalized) {
    redirect(`/topics/${encodeURIComponent(normalized)}`);
  }

  let page: Awaited<ReturnType<typeof fetchTopicPublishedPage>>;
  try {
    const cursor = parseCursor(query.after, query.afterId);
    page = await withPublicDbTimeout((executor) =>
      fetchTopicPublishedPage(executor, normalized, cursor),
    );
  } catch {
    return (
      <main className="mx-auto max-w-2xl px-6 py-12" style={PAGE_STYLE}>
        <Breadcrumb />
        <p className="text-[var(--text-muted)]">Topic feed is temporarily unavailable.</p>
      </main>
    );
  }

  if (page === undefined) {
    notFound();
  }

  const { topic, posts, nextCursor } = page;
  return (
    <main className="mx-auto max-w-2xl px-6 py-12" style={PAGE_STYLE}>
      <Breadcrumb topicName={topic.name} />
      <header className="mb-8 border-b border-zinc-200 pb-4 dark:border-zinc-800">
        <h1 className="text-3xl font-semibold tracking-tight">{topic.name}</h1>
      </header>

      {posts.length === 0 ? (
        <p className="text-[var(--text-muted)]">No published posts in this topic yet.</p>
      ) : (
        <ul className="space-y-6">
          {posts.map((post) => (
            <li
              key={post.id}
              className="border-b border-zinc-200 pb-4 dark:border-zinc-800"
            >
              <Link
                href={`/@${encodeURIComponent(post.publicationSlug)}/${encodeURIComponent(post.slug)}`}
                prefetch={false}
                className={`text-xl font-medium hover:text-[var(--text-primary)] hover:underline ${FOCUS_RING}`}
              >
                {post.title}
              </Link>
              <p className="mt-1 text-xs text-[var(--text-faint)]">
                @{post.publicationSlug} — {post.publishedAt.toISOString().slice(0, 10)}
              </p>
            </li>
          ))}
        </ul>
      )}

      {nextCursor !== null ? (
        <div className="mt-8">
          <Link
            href={`/topics/${encodeURIComponent(topic.slug)}?after=${encodeURIComponent(nextCursor.publishedAt.toISOString())}&afterId=${encodeURIComponent(nextCursor.postId)}`}
            prefetch={false}
            className={`text-sm font-medium hover:text-[var(--text-primary)] hover:underline ${FOCUS_RING}`}
          >
            Older posts →
          </Link>
        </div>
      ) : null}
    </main>
  );
}

export default function TopicDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ after?: string; afterId?: string }>;
}) {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-2xl px-6 py-12" style={PAGE_STYLE}>
          <p>Loading topic...</p>
        </main>
      }
    >
      <TopicFeedView params={params} searchParams={searchParams} />
    </Suspense>
  );
}
