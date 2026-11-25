import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { FeedCursor } from "@/modules/posts";
import { withPublicDbTimeout } from "@/modules/search";
import {
  fetchTopicPublishedPage,
  normalizeTopicSlug,
} from "@/modules/topics";

function parseCursor(
  after?: string,
  afterId?: string,
): FeedCursor | undefined {
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
      <main className="mx-auto max-w-2xl px-6 py-12">
        <p className="text-zinc-600 dark:text-zinc-400">
          Topic feed is temporarily unavailable.
        </p>
      </main>
    );
  }

  if (page === undefined) {
    notFound();
  }

  const { topic, posts, nextCursor } = page;
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <header className="mb-8 border-b border-zinc-200 pb-4 dark:border-zinc-800">
        <Link
          href="/topics"
          prefetch={false}
          className="text-sm text-zinc-500 hover:underline"
        >
          All topics
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          {topic.name}
        </h1>
      </header>

      {posts.length === 0 ? (
        <p className="text-zinc-600 dark:text-zinc-400">
          No published posts in this topic yet.
        </p>
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
                className="text-xl font-medium hover:underline"
              >
                {post.title}
              </Link>
              <p className="mt-1 text-xs text-zinc-500">
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
            className="text-sm font-medium hover:underline"
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
        <main className="mx-auto max-w-2xl px-6 py-12">
          <p>Loading topic...</p>
        </main>
      }
    >
      <TopicFeedView params={params} searchParams={searchParams} />
    </Suspense>
  );
}
