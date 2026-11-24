import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MarkdownRenderer } from "@/modules/posts";
import { getCachedPost } from "@/modules/site";

async function PostArticleView({
  params,
}: {
  params: Promise<{ handle: string; slug: string }>;
}) {
  const { handle, slug } = await params;
  const result = await getCachedPost(handle, slug);

  if (result.kind === "not_found") {
    notFound();
  }
  if (result.kind === "redirect") {
    redirect(result.location);
  }

  const { publication, post } = result;
  return (
    <article className="mx-auto max-w-2xl px-6 py-12">
      <header className="mb-8 border-b border-zinc-200 pb-4 dark:border-zinc-800">
        <Link
          href={`/@${encodeURIComponent(publication.slug)}`}
          prefetch={false}
          className="text-sm text-zinc-500 hover:underline"
        >
          @{publication.slug} — {publication.name}
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          {post.title}
        </h1>
        <time
          dateTime={post.publishedAt.toISOString()}
          className="mt-2 block text-xs text-zinc-500"
        >
          {post.publishedAt.toISOString().slice(0, 10)}
        </time>
      </header>

      <MarkdownRenderer content={post.bodyMarkdown} />
    </article>
  );
}

export default function PostPage({
  params,
}: {
  params: Promise<{ handle: string; slug: string }>;
}) {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-2xl px-6 py-12">
          <p>Loading post...</p>
        </main>
      }
    >
      <PostArticleView params={params} />
    </Suspense>
  );
}
