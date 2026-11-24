import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCachedPublicationFeed } from "@/modules/site";

async function PublicationFeedView({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const result = await getCachedPublicationFeed(handle);

  if (result.kind === "not_found") {
    notFound();
  }
  if (result.kind === "redirect") {
    redirect(result.location);
  }

  const { publication, feed } = result;
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <header className="mb-8 border-b border-zinc-200 pb-4 dark:border-zinc-800">
        <h1 className="text-3xl font-semibold tracking-tight">
          {publication.name}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">@{publication.slug}</p>
      </header>

      {feed.posts.length === 0 ? (
        <p className="text-zinc-600 dark:text-zinc-400">
          No published posts yet.
        </p>
      ) : (
        <ul className="space-y-6">
          {feed.posts.map((item) => (
            <li
              key={item.id}
              className="border-b border-zinc-200 pb-4 dark:border-zinc-800"
            >
              <Link
                href={`/@${encodeURIComponent(publication.slug)}/${encodeURIComponent(item.slug)}`}
                prefetch={false}
                className="text-xl font-medium hover:underline"
              >
                {item.title}
              </Link>
              <time
                dateTime={item.publishedAt.toISOString()}
                className="mt-1 block text-xs text-zinc-500"
              >
                {item.publishedAt.toISOString().slice(0, 10)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

export default function PublicationPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-2xl px-6 py-12">
          <p>Loading publication...</p>
        </main>
      }
    >
      <PublicationFeedView params={params} />
    </Suspense>
  );
}
