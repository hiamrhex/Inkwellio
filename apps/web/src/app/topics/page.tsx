import { Suspense } from "react";
import Link from "next/link";
import { withPublicDbTimeout } from "@/modules/search";
import { listTopics } from "@/modules/topics";

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
      <main className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">Topics</h1>
        <p className="mt-4 text-zinc-600 dark:text-zinc-400">
          Topics are temporarily unavailable. Please try again shortly.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <header className="mb-8 border-b border-zinc-200 pb-4 dark:border-zinc-800">
        <h1 className="text-3xl font-semibold tracking-tight">Topics</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Curated football writing channels
        </p>
      </header>

      {topics.length === 0 ? (
        <p className="text-zinc-600 dark:text-zinc-400">
          No topics available yet.
        </p>
      ) : (
        <ul className="space-y-4">
          {topics.map((topic) => (
            <li
              key={topic.id}
              className="flex items-baseline justify-between border-b border-zinc-200 pb-3 dark:border-zinc-800"
            >
              <Link
                href={`/topics/${encodeURIComponent(topic.slug)}`}
                prefetch={false}
                className="text-lg font-medium hover:underline"
              >
                {topic.name}
              </Link>
              <span className="text-xs text-zinc-500">
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
        <main className="mx-auto max-w-2xl px-6 py-12">
          <p>Loading topics...</p>
        </main>
      }
    >
      <TopicsDirectoryView />
    </Suspense>
  );
}
