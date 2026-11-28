import { Suspense } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EditorialFontReady } from "@/components/editorial-font-ready";
import { SiteShell } from "@/components/site-shell";
import { getCachedPublicationFeed } from "@/modules/site";

/** Same full-width constrained measure as /topics and /search. */
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

function PublicationBreadcrumb({ handle }: { handle: string }) {
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
        @{handle}
      </span>
    </nav>
  );
}

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
    <main id="main-content" className="mx-auto max-w-2xl px-6 py-12" style={PAGE_STYLE}>
      <EditorialFontReady />
      <PublicationBreadcrumb handle={publication.slug} />
      <header
        className="mb-8 pb-4"
        style={{ borderBottom: "1px solid var(--border-hairline)" }}
      >
        <h1
          className="text-3xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-4xl"
          style={{ fontFamily: "var(--font-editorial)", lineHeight: 1.15 }}
        >
          {publication.name}
        </h1>
        <p className="mt-1 font-mono text-sm text-[var(--text-faint)]">@{publication.slug}</p>
      </header>

      {feed.posts.length === 0 ? (
        <p className="text-[var(--text-muted)]">
          No published posts yet.
        </p>
      ) : (
        <ul className="space-y-6">
          {feed.posts.map((item) => (
            <li
              key={item.id}
              className="pb-4"
              style={{ borderBottom: "1px solid var(--border-hairline)" }}
            >
              <Link
                href={`/@${encodeURIComponent(publication.slug)}/${encodeURIComponent(item.slug)}`}
                prefetch={false}
                className={`inline-flex min-h-[44px] items-center font-serif text-xl font-medium text-[var(--text-primary)] hover:underline ${FOCUS_RING}`}
                style={{ fontFamily: "var(--font-editorial)" }}
              >
                {item.title}
              </Link>
              <time
                dateTime={item.publishedAt.toISOString()}
                className="mt-1 block font-mono text-xs text-[var(--text-faint)]"
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
    <SiteShell>
      <Suspense
        fallback={
          <main id="main-content" className="mx-auto max-w-2xl px-6 py-12" style={PAGE_STYLE}>
            <p className="text-[var(--text-muted)]">Loading publication...</p>
          </main>
        }
      >
        <PublicationFeedView params={params} />
      </Suspense>
    </SiteShell>
  );
}
