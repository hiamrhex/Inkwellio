import { Suspense } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace-shell";
import {
  loadStudioPostData,
  resolveStudioActor,
} from "@/components/studio/server-data";
import { StudioEditor } from "@/components/studio/studio-editor";

export const metadata: Metadata = {
  title: "Post Studio · Inkwellio",
};

async function StudioLoader({
  params,
}: {
  params: Promise<{ postId: string }>;
}) {
  const [{ postId }, actor] = await Promise.all([
    params,
    resolveStudioActor(await headers()),
  ]);
  if (actor === null) {
    redirect(`/sign-in?next=${encodeURIComponent(`/studio/${postId}`)}`);
  }

  const loaded = await loadStudioPostData(actor, postId);

  if (loaded.kind === "not_found") {
    notFound();
  }

  if (loaded.kind === "unavailable") {
    return (
      <main
        id="main-content"
        className="workspace-main flex flex-col items-center justify-center gap-4 px-4 py-16 text-center"
        style={{
          backgroundColor: "var(--bg-canvas)",
          color: "var(--text-primary)",
        }}
      >
        <h1 className="font-serif text-2xl font-semibold">
          Studio temporarily unavailable
        </h1>
        <p className="max-w-md text-sm" style={{ color: "var(--text-muted)" }}>
          We could not load this draft right now. Please try again shortly.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex min-h-[44px] items-center rounded-md border px-4 py-2 text-sm font-medium"
          style={{
            borderColor: "var(--border-hairline)",
            color: "var(--text-primary)",
          }}
        >
          Back to dashboard
        </Link>
      </main>
    );
  }

  return (
    <StudioEditor
      postId={loaded.postId}
      publicationSlug={loaded.publicationSlug}
      publicationName={loaded.publicationName}
      initialSlug={loaded.slug}
      initialStatus={loaded.status}
      initialVersion={loaded.version}
      initialTitle={loaded.title}
      initialBodyMarkdown={loaded.bodyMarkdown}
      initialTopics={loaded.assignedTopics}
      curatedTopics={loaded.allTopics}
    />
  );
}

export default function StudioPostPage({
  params,
}: {
  params: Promise<{ postId: string }>;
}) {
  return (
    <WorkspaceShell activePath="/studio">
      <Suspense
        fallback={
          <main
            id="main-content"
            className="workspace-main py-12"
            style={{
              backgroundColor: "var(--bg-canvas)",
              color: "var(--text-muted)",
            }}
          >
            <div className="mx-auto max-w-4xl text-sm">Loading studio...</div>
          </main>
        }
      >
        <StudioLoader params={params} />
      </Suspense>
    </WorkspaceShell>
  );
}
