"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  formatApiFailure,
  normalizeHandleInput,
  requestJson,
  slugifyHandlePreview,
  type ApiFailure,
} from "./api";
import type { DashboardPostSummary } from "./server-data";

export interface DashboardPublication {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
}

export interface DashboardClientProps {
  readonly publication: DashboardPublication | null;
  readonly initialPosts: readonly DashboardPostSummary[];
}

type FilterTab = "all" | "draft" | "published" | "deleted";

interface FeedbackNotice {
  readonly kind: "error" | "success";
  readonly message: string;
  readonly linkHref?: string;
  readonly linkLabel?: string;
}

const TAB_LABELS: ReadonlyArray<{ readonly key: FilterTab; readonly label: string }> = [
  { key: "all", label: "All" },
  { key: "draft", label: "Drafts" },
  { key: "published", label: "Published" },
  { key: "deleted", label: "Trash" },
];

export function DashboardClient({
  publication: initialPublication,
  initialPosts,
}: DashboardClientProps) {
  const router = useRouter();
  const [publication, setPublication] = useState<DashboardPublication | null>(
    initialPublication,
  );
  const [posts, setPosts] = useState<readonly DashboardPostSummary[]>(initialPosts);
  const [activeTab, setActiveTab] = useState<FilterTab>("draft");
  const [pubName, setPubName] = useState("");
  const [pubSlug, setPubSlug] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState<number>(0);
  const [notice, setNotice] = useState<FeedbackNotice | null>(null);
  const [titleQuery, setTitleQuery] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (cooldownSeconds <= 0) return undefined;
    const timer = setInterval(() => {
      setCooldownSeconds((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  function reportFailure(res: ApiFailure) {
    if (res.status === 429) {
      setCooldownSeconds(res.retryAfterSeconds ?? 10);
    }
    setNotice({ kind: "error", message: formatApiFailure(res) });
  }

  function applyConflictVersion(postId: string, res: ApiFailure) {
    if (res.status !== 409) {
      reportFailure(res);
      return;
    }
    if (typeof res.details?.currentVersion === "number") {
      const nextVersion = res.details.currentVersion;
      const nextTitle = res.details.currentTitle;
      setPosts((current) =>
        current.map((item) =>
          item.id === postId
            ? {
                ...item,
                version: nextVersion,
                title: nextTitle ?? item.title,
              }
            : item,
        ),
      );
      setNotice({
        kind: "error",
        message: "This post changed in another session. Synced the latest version — try again.",
      });
      router.refresh();
      return;
    }
    reportFailure(res);
  }

  const previewHandle =
    normalizeHandleInput(pubSlug) ||
    slugifyHandlePreview(pubName.trim()) ||
    "your-handle";

  async function handleCreatePublication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyAction !== null || cooldownSeconds > 0) return;

    const trimmedName = pubName.trim();
    const trimmedSlug = pubSlug.trim().toLowerCase();
    if (!trimmedName) {
      setNotice({
        kind: "error",
        message: "Enter a publication name (1-80 characters).",
      });
      return;
    }

    setBusyAction("create-pub");
    setNotice(null);

    const payload: { name: string; slug?: string } = { name: trimmedName };
    if (trimmedSlug !== "") {
      payload.slug = trimmedSlug;
    }

    const res = await requestJson<{ id: string; slug: string; created: boolean }>(
      "/api/publications",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );

    setBusyAction(null);
    if (!res.ok) {
      reportFailure(res);
      return;
    }

    setPublication({
      id: res.data.id,
      slug: res.data.slug,
      name: trimmedName,
    });
    setNotice({
      kind: "success",
      message: `Created publication @${res.data.slug}.`,
    });
    router.refresh();
  }

  async function handleNewDraft() {
    if (!publication || busyAction !== null || cooldownSeconds > 0) return;
    setBusyAction("create-post");
    setNotice(null);

    const res = await requestJson<{ id: string; slug: string }>("/api/posts", {
      method: "POST",
      body: JSON.stringify({ publicationId: publication.id }),
    });

    setBusyAction(null);
    if (!res.ok) {
      reportFailure(res);
      return;
    }

    router.push(`/studio/${encodeURIComponent(res.data.id)}`);
  }

  async function handlePublish(post: DashboardPostSummary) {
    if (busyAction !== null || cooldownSeconds > 0) return;
    if (post.version === 0 && post.title.trim() === "") {
      setNotice({
        kind: "error",
        message: "Open this draft in the studio to save a title and body before publishing.",
      });
      return;
    }
    setBusyAction(`publish:${post.id}`);
    setNotice(null);

    const res = await requestJson<{ id: string; status: "published"; version: number }>(
      `/api/posts/${encodeURIComponent(post.id)}/publish`,
      {
        method: "POST",
        body: JSON.stringify({ expectedVersion: post.version }),
      },
    );

    setBusyAction(null);
    if (!res.ok) {
      applyConflictVersion(post.id, res);
      return;
    }

    setPosts((current) =>
      current.map((item) =>
        item.id === post.id
          ? {
              ...item,
              status: "published",
              version: res.data.version,
              publishedAt: item.publishedAt ?? new Date().toISOString(),
            }
          : item,
      ),
    );
    setActiveTab("published");
    setNotice({
      kind: "success",
      message: `Published "${post.title.trim() || post.slug}".`,
    });
    router.refresh();
  }

  async function handleUnpublish(post: DashboardPostSummary) {
    if (busyAction !== null || cooldownSeconds > 0) return;
    setBusyAction(`unpublish:${post.id}`);
    setNotice(null);

    const res = await requestJson<{ id: string; status: "draft"; version: number }>(
      `/api/posts/${encodeURIComponent(post.id)}/unpublish`,
      {
        method: "POST",
        body: JSON.stringify({ expectedVersion: post.version }),
      },
    );

    setBusyAction(null);
    if (!res.ok) {
      applyConflictVersion(post.id, res);
      return;
    }

    setPosts((current) =>
      current.map((item) =>
        item.id === post.id
          ? { ...item, status: "draft", version: res.data.version }
          : item,
      ),
    );
    setActiveTab("draft");
    setNotice({
      kind: "success",
      message: `Moved "${post.title.trim() || post.slug}" back to drafts.`,
    });
    router.refresh();
  }

  async function handleDelete(post: DashboardPostSummary) {
    if (busyAction !== null || cooldownSeconds > 0) return;
    setBusyAction(`delete:${post.id}`);
    setNotice(null);

    const res = await requestJson<{ id: string; status: "deleted"; version: number }>(
      `/api/posts/${encodeURIComponent(post.id)}/delete`,
      {
        method: "POST",
        body: JSON.stringify({ expectedVersion: post.version }),
      },
    );

    setBusyAction(null);
    setConfirmDeleteId(null);
    if (!res.ok) {
      applyConflictVersion(post.id, res);
      return;
    }

    setPosts((current) =>
      current.map((item) =>
        item.id === post.id
          ? { ...item, status: "deleted", version: res.data.version }
          : item,
      ),
    );
    setNotice({
      kind: "success",
      message: `Moved "${post.title.trim() || post.slug}" to trash.`,
    });
    router.refresh();
  }

  async function handleRestore(post: DashboardPostSummary) {
    if (busyAction !== null || cooldownSeconds > 0) return;
    setBusyAction(`restore:${post.id}`);
    setNotice(null);

    const res = await requestJson<{ id: string; status: "draft"; version: number }>(
      `/api/posts/${encodeURIComponent(post.id)}/restore`,
      {
        method: "POST",
        body: JSON.stringify({ expectedVersion: post.version }),
      },
    );

    setBusyAction(null);
    if (!res.ok) {
      applyConflictVersion(post.id, res);
      return;
    }

    setPosts((current) =>
      current.map((item) =>
        item.id === post.id
          ? { ...item, status: "draft", version: res.data.version }
          : item,
      ),
    );
    setActiveTab("draft");
    setNotice({
      kind: "success",
      message: `Restored "${post.title.trim() || post.slug}" to drafts.`,
      linkHref: `/studio/${encodeURIComponent(post.id)}`,
      linkLabel: "Open in studio",
    });
    router.refresh();
  }

  const filteredPosts = posts.filter((post) => {
    const matchesTab = activeTab === "all" || post.status === activeTab;
    const query = titleQuery.trim().toLowerCase();
    return matchesTab && (query === "" || post.title.toLowerCase().includes(query));
  });
  const actionsLocked = busyAction !== null || cooldownSeconds > 0;

  async function copyPublicationLink() {
    if (publication === null) return;
    const link = `${window.location.origin}/@${encodeURIComponent(publication.slug)}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setNotice({ kind: "error", message: "Could not copy the link. Select the address manually." });
    }
  }

  const statusCounts = {
    draft: posts.filter((post) => post.status === "draft").length,
    published: posts.filter((post) => post.status === "published").length,
    deleted: posts.filter((post) => post.status === "deleted").length,
  };

  return (
    <main
      id="main-content"
      className="workspace-main"
      style={{
        backgroundColor: "var(--bg-canvas)",
        color: "var(--text-primary)",
      }}
    >
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        {cooldownSeconds > 0 ? (
          <div
            role="status"
            aria-live="polite"
            className="rounded-lg border px-4 py-3 text-sm"
            style={{
              backgroundColor: "var(--bg-surface2)",
              borderColor: "var(--status-amber)",
              color: "var(--text-primary)",
            }}
          >
            Write actions paused for {cooldownSeconds}s to respect rate limits.
          </div>
        ) : null}

        {notice ? (
          <div
            role={notice.kind === "error" ? "alert" : "status"}
            aria-live="polite"
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm"
            style={{
              backgroundColor: "var(--bg-surface2)",
              borderColor:
                notice.kind === "success"
                  ? "var(--status-live)"
                  : "var(--status-amber)",
              color: "var(--text-primary)",
            }}
          >
            <span>{notice.message}</span>
            {notice.linkHref && notice.linkLabel ? (
              <Link
                href={notice.linkHref}
                className="inline-flex min-h-[44px] items-center rounded-md border px-3 py-1.5 text-xs font-medium underline underline-offset-4 hover:opacity-85"
                style={{
                  borderColor: "var(--border-hairline)",
                  color: "var(--text-primary)",
                }}
              >
                {notice.linkLabel}
              </Link>
            ) : null}
          </div>
        ) : null}

        {publication === null ? (
          <section
            aria-labelledby="create-publication-heading"
            className="rounded-xl border p-6 sm:p-8"
            style={{
              backgroundColor: "var(--bg-surface1)",
              borderColor: "var(--border-hairline)",
              boxShadow: "var(--shadow-card)",
            }}
          >
            <h1
              id="create-publication-heading"
              className="font-serif text-2xl font-semibold tracking-tight sm:text-3xl"
            >
              Create publication
            </h1>
            <p
              className="mt-2 max-w-xl text-sm leading-relaxed"
              style={{ color: "var(--text-muted)" }}
            >
              Every writer owns one independent publication on Inkwellio with a calm, permanent URL.
            </p>

            <form
              onSubmit={handleCreatePublication}
              className="mt-6 flex max-w-lg flex-col gap-5"
            >
              <div className="flex flex-col gap-1.5">
                <label htmlFor="pub-name" className="text-sm font-medium">
                  Publication name
                </label>
                <input
                  id="pub-name"
                  name="name"
                  type="text"
                  required
                  maxLength={80}
                  value={pubName}
                  onChange={(e) => setPubName(e.target.value)}
                  placeholder="Half-Space Notebook"
                  className="min-h-[44px] rounded-md border px-3.5 py-2 text-sm"
                  style={{
                    backgroundColor: "var(--bg-canvas)",
                    borderColor: "var(--border-hairline)",
                    color: "var(--text-primary)",
                  }}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="pub-slug" className="text-sm font-medium">
                  Handle / slug (optional)
                </label>
                <input
                  id="pub-slug"
                  name="slug"
                  type="text"
                  maxLength={64}
                  value={pubSlug}
                  onChange={(e) => setPubSlug(e.target.value)}
                  placeholder="half-space-notebook"
                  aria-describedby="pub-slug-preview"
                  className="min-h-[44px] rounded-md border px-3.5 py-2 font-mono text-sm"
                  style={{
                    backgroundColor: "var(--bg-canvas)",
                    borderColor: "var(--border-hairline)",
                    color: "var(--text-primary)",
                  }}
                />
                <div
                  id="pub-slug-preview"
                  className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-xs"
                  style={{
                    backgroundColor: "var(--bg-surface2)",
                    borderColor: "var(--border-hairline)",
                    color: "var(--text-muted)",
                  }}
                >
                  <span>Public URL preview:</span>
                  <code className="font-mono" style={{ color: "var(--text-primary)" }}>
                    /@{previewHandle}
                  </code>
                </div>
                <span className="text-xs" style={{ color: "var(--text-faint)" }}>
                  Lowercase letters, numbers, and hyphens. Defaults cleanly from your name if left blank.
                </span>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={actionsLocked}
                  className="inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-md px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-60"
                  style={{
                    backgroundColor: "var(--btn-primary-bg)",
                    color: "var(--btn-primary-text)",
                  }}
                >
                  {busyAction === "create-pub"
                    ? "Creating..."
                    : "Create publication"}
                </button>
              </div>
            </form>
          </section>
        ) : (
          <>
            <header
              className="workspace-overview-header"
              style={{
                backgroundColor: "var(--bg-surface1)",
                borderColor: "var(--border-hairline)",
                boxShadow: "var(--shadow-card)",
              }}
            >
              <div className="min-w-0">
                <h1 className="workspace-page-title">{publication.name}</h1>
                <div className="workspace-pub-meta">
                  <span className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>
                    @{publication.slug}
                  </span>
                  <button
                    type="button"
                    onClick={() => void copyPublicationLink()}
                    className="workspace-quiet-action"
                    aria-live="polite"
                  >
                    {copied ? "Copied" : "Copy link"}
                  </button>
                  <Link
                    href={`/@${encodeURIComponent(publication.slug)}`}
                    className="workspace-quiet-action"
                  >
                    View live
                  </Link>
                  <Link href="/settings/privacy" className="workspace-quiet-action">
                    Privacy &amp; export
                  </Link>
                </div>
              </div>

              <button
                type="button"
                onClick={handleNewDraft}
                disabled={actionsLocked}
                className="workspace-header-new"
              >
                {busyAction === "create-post" ? "Creating draft..." : "New draft"}
              </button>
            </header>

            <section aria-label="Publication overview" className="workspace-metrics">
              {(
                [
                  { key: "draft", label: "Drafts", count: statusCounts.draft },
                  { key: "published", label: "Published", count: statusCounts.published },
                  { key: "deleted", label: "Trash", count: statusCounts.deleted },
                ] as const
              ).map((metric) => (
                <button
                  key={metric.key}
                  type="button"
                  onClick={() => setActiveTab(metric.key)}
                  className="workspace-metric-card"
                  data-active={activeTab === metric.key ? "true" : undefined}
                  style={{
                    backgroundColor: "var(--bg-surface1)",
                    borderColor: "var(--border-hairline)",
                    boxShadow: "var(--shadow-card)",
                  }}
                >
                  <span className="workspace-metric-count font-mono">{metric.count}</span>
                  <span className="workspace-metric-label">{metric.label}</span>
                </button>
              ))}
            </section>

            <section aria-label="Posts by status" className="workspace-posts-section">
              <div
                role="tablist"
                aria-label="Filter posts by lifecycle state"
                className="flex flex-wrap gap-2 border-b pb-3"
                style={{ borderColor: "var(--border-hairline)" }}
              >
                {TAB_LABELS.map((tab) => {
                  const count = posts.filter((p) => p.status === tab.key).length;
                  const selected = activeTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      role="tab"
                      data-tab={tab.key}
                      aria-selected={selected}
                      onClick={() => setActiveTab(tab.key)}
                      className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90"
                      style={{
                        backgroundColor: selected
                          ? "var(--btn-primary-bg)"
                          : "var(--bg-surface1)",
                        color: selected
                          ? "var(--btn-primary-text)"
                          : "var(--text-primary)",
                        borderColor: "var(--border-hairline)",
                      }}
                    >
                      <span>{tab.label}</span>{" "}
                      <span className="font-mono text-xs opacity-80">
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="workspace-search-row">
                <label htmlFor="post-search" className="sr-only">
                  Search stories by title
                </label>
                <input
                  id="post-search"
                  type="search"
                  value={titleQuery}
                  onChange={(event) => setTitleQuery(event.target.value)}
                  placeholder="Search your stories"
                  className="workspace-search-input"
                  style={{
                    backgroundColor: "var(--bg-surface1)",
                    borderColor: "var(--border-hairline)",
                    color: "var(--text-primary)",
                  }}
                />
              </div>

              {filteredPosts.length === 0 ? (
                <div
                  className="workspace-empty-state"
                  style={{
                    backgroundColor: "var(--bg-surface1)",
                    borderColor: "var(--border-hairline)",
                    color: "var(--text-muted)",
                  }}
                >
                  <h2 className="workspace-empty-title">
                    {titleQuery.trim() !== ""
                      ? "No matching stories"
                      : activeTab === "draft"
                        ? "Your next story starts here"
                        : activeTab === "published"
                          ? "Nothing published yet"
                          : activeTab === "deleted"
                            ? "Trash is empty"
                            : "No stories yet"}
                  </h2>
                  <p className="workspace-empty-copy">
                    {titleQuery.trim() !== ""
                      ? "Try a different title or clear the search."
                      : activeTab === "deleted"
                        ? "Deleted drafts and stories appear here until you restore them."
                        : "Write at your own pace. Your draft saves as you go."}
                  </p>
                  {titleQuery.trim() === "" ? (
                    <button
                      type="button"
                      onClick={handleNewDraft}
                      disabled={actionsLocked}
                      className="workspace-header-new"
                    >
                      Start writing
                    </button>
                  ) : null}
                </div>
              ) : (
                <ul className="flex flex-col gap-3">
                  {filteredPosts.map((post) => {
                    const statusDotColor =
                      post.status === "published"
                        ? "var(--status-live)"
                        : post.status === "draft"
                          ? "var(--status-amber)"
                          : "var(--text-faint)";

                    return (
                      <li key={post.id} className="workspace-story-row">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2.5">
                            <span
                              aria-hidden="true"
                              className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                              style={{ backgroundColor: statusDotColor }}
                            />
                            <span
                              className="text-xs font-medium uppercase tracking-wider"
                              style={{ color: "var(--text-muted)" }}
                            >
                              {post.status}
                            </span>
                            <time
                              dateTime={post.updatedAt}
                              className="font-mono text-xs"
                              style={{ color: "var(--text-faint)" }}
                            >
                              {post.updatedAt.slice(0, 10)}
                            </time>
                          </div>

                          <h2 className="workspace-story-title">
                            {post.title.trim() !== "" ? post.title : "Untitled draft"}
                          </h2>

                          <p className="workspace-story-path font-mono">
                            /@{publication.slug}/{post.slug}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/studio/${encodeURIComponent(post.id)}`}
                            className="inline-flex min-h-[44px] items-center justify-center rounded-md border px-4 py-2 text-sm font-medium transition-opacity hover:opacity-80"
                            style={{
                              borderColor: "var(--border-hairline)",
                              color: "var(--text-primary)",
                            }}
                          >
                            Edit
                          </Link>

                          {post.status === "draft" ? (
                            <button
                              type="button"
                              disabled={actionsLocked}
                              onClick={() => handlePublish(post)}
                              className="inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-md border px-4 py-2 text-sm font-medium transition-opacity hover:opacity-85 disabled:opacity-60"
                              style={{
                                borderColor: "var(--border-hairline)",
                                color: "var(--text-primary)",
                              }}
                            >
                              {busyAction === `publish:${post.id}` ? "Publishing..." : "Publish"}
                            </button>
                          ) : null}

                          {post.status === "published" ? (
                            <>
                              <Link
                                href={`/@${encodeURIComponent(publication.slug)}/${encodeURIComponent(post.slug)}`}
                                className="inline-flex min-h-[44px] items-center justify-center rounded-md border px-4 py-2 text-sm font-medium transition-opacity hover:opacity-80"
                                style={{
                                  borderColor: "var(--border-hairline)",
                                  color: "var(--text-muted)",
                                }}
                              >
                                View
                              </Link>
                              <button
                                type="button"
                                disabled={actionsLocked}
                                onClick={() => handleUnpublish(post)}
                                className="inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-md border px-4 py-2 text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-60"
                                style={{
                                  borderColor: "var(--border-hairline)",
                                  color: "var(--text-muted)",
                                }}
                              >
                                {busyAction === `unpublish:${post.id}`
                                  ? "Updating..."
                                  : "Unpublish"}
                              </button>
                            </>
                          ) : null}

                          {post.status !== "deleted" ? (
                            confirmDeleteId === post.id ? (
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  disabled={actionsLocked}
                                  onClick={() => handleDelete(post)}
                                  className="inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-md px-3.5 py-2 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-60"
                                  style={{
                                    backgroundColor: "var(--btn-primary-bg)",
                                    color: "var(--btn-primary-text)",
                                  }}
                                >
                                  {busyAction === `delete:${post.id}`
                                    ? "Deleting..."
                                    : "Confirm delete"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-md border px-3 py-2 text-sm"
                                  style={{
                                    borderColor: "var(--border-hairline)",
                                    color: "var(--text-muted)",
                                  }}
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                disabled={actionsLocked}
                                onClick={() => setConfirmDeleteId(post.id)}
                                className="inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-md border px-4 py-2 text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-60"
                                style={{
                                  borderColor: "var(--border-hairline)",
                                  color: "var(--text-muted)",
                                }}
                              >
                                Move to trash
                              </button>
                            )
                          ) : (
                            <button
                              type="button"
                              disabled={actionsLocked}
                              onClick={() => handleRestore(post)}
                              className="inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-md border px-4 py-2 text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-60"
                              style={{
                                borderColor: "var(--border-hairline)",
                                color: "var(--text-primary)",
                              }}
                            >
                              {busyAction === `restore:${post.id}`
                                ? "Restoring..."
                                : "Restore"}
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
