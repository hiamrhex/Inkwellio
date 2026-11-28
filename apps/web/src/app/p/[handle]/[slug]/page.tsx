import { Suspense } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EditorialFontReady } from "@/components/editorial-font-ready";
import { SiteShell } from "@/components/site-shell";
import { MarkdownRenderer } from "@/modules/posts";
import { getCachedPost } from "@/modules/site";

/** Same full-width constrained measure as /topics, /search, and /p/[handle]. */
const PAGE_STYLE: CSSProperties = {
  width: "100%",
  maxWidth: "44rem", // 704px — ~65ch editorial reading measure
  marginInline: "auto",
  paddingInline: "clamp(1rem, 3vw, 1.5rem)",
  paddingTop: "5.75rem",
  paddingBottom: "3.5rem",
  flex: 1,
};

const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]";

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
    <main id="main-content" style={PAGE_STYLE}>
      <EditorialFontReady />
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
          href={`/@${encodeURIComponent(publication.slug)}`}
          prefetch={false}
          className={`inline-flex min-h-[44px] items-center px-2 text-[var(--text-primary)] hover:underline ${FOCUS_RING}`}
        >
          @{publication.slug}
        </Link>
      </nav>

      <article>
        <header
          className="mb-8 pb-4"
          style={{ borderBottom: "1px solid var(--border-hairline)" }}
        >
          <h1
            className="text-3xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-4xl"
            style={{ fontFamily: "var(--font-editorial)", lineHeight: 1.15 }}
          >
            {post.title}
          </h1>
          <time
            dateTime={post.publishedAt.toISOString()}
            className="mt-2 block font-mono text-xs text-[var(--text-faint)]"
          >
            {post.publishedAt.toISOString().slice(0, 10)}
          </time>
        </header>

        <div className="editorial-reading">
          <MarkdownRenderer content={post.bodyMarkdown} />
        </div>
      </article>
    </main>
  );
}

export default function PostPage({
  params,
}: {
  params: Promise<{ handle: string; slug: string }>;
}) {
  return (
    <SiteShell>
      <Suspense
        fallback={
          <main id="main-content" className="mx-auto max-w-2xl px-6 py-12" style={PAGE_STYLE}>
            <p className="text-[var(--text-muted)]">Loading post...</p>
          </main>
        }
      >
        <PostArticleView params={params} />
      </Suspense>
    </SiteShell>
  );
}
