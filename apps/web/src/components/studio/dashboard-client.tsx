"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Chip } from "@inkwellio/ui";
import { requestJson } from "./api";
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

type FilterTab = "draft" | "published" | "deleted";

const TAB_LABELS: ReadonlyArray<{ readonly key: FilterTab; readonly label: string }> = [
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
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);

  async function handleCreatePublication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyAction !== null) return;

    const trimmedName = pubName.trim();
    const trimmedSlug = pubSlug.trim().toLowerCase();
    if (!trimmedName) {
      setBannerMessage("Enter a publication name (1-80 characters).");
      return;
    }

    setBusyAction("create-pub");
    setBannerMessage(null);

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
      setBannerMessage(res.message);
      return;
    }

    setPublication({
      id: res.data.id,
      slug: res.data.slug,
      name: trimmedName,
    });
    router.refresh();
  }

  async function handleNewDraft() {
    if (!publication || busyAction !== null) return;
    setBusyAction("create-post");
    setBannerMessage(null);

    const res = await requestJson<{ id: string; slug: string }>("/api/posts", {
      method: "POST",
      body: JSON.stringify({ publicationId: publication.id }),
    });

    setBusyAction(null);
    if (!res.ok) {
      setBannerMessage(res.message);
      return;
    }

    router.push(`/studio/${encodeURIComponent(res.data.id)}`);
  }

  async function handleDelete(post: DashboardPostSummary) {
    if (busyAction !== null) return;
    setBusyAction(`delete:${post.id}`);
    setBannerMessage(null);

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
      setBannerMessage(res.message);
      return;
    }

    setPosts((current) =>
      current.map((item) =>
        item.id === post.id
          ? { ...item, status: "deleted", version: res.data.version }
          : item,
      ),
    );
    router.refresh();
  }

  async function handleRestore(post: DashboardPostSummary) {
    if (busyAction !== null) return;
    setBusyAction(`restore:${post.id}`);
    setBannerMessage(null);

    const res = await requestJson<{ id: string; status: "draft"; version: number }>(
      `/api/posts/${encodeURIComponent(post.id)}/restore`,
      {
        method: "POST",
        body: JSON.stringify({ expectedVersion: post.version }),
      },
    );

    setBusyAction(null);
    if (!res.ok) {
      setBannerMessage(res.message);
      return;
    }

    setPosts((current) =>
      current.map((item) =>
        item.id === post.id
          ? { ...item, status: "draft", version: res.data.version }
          : item,
      ),
    );
    router.refresh();
  }

  const filteredPosts = posts.filter((post) => post.status === activeTab);

  return (
    <main
      className="min-h-screen px-4 py-10 sm:px-6 sm:py-12"
      style={{
        backgroundColor: "var(--bg-canvas)",
        color: "var(--text-primary)",
      }}
    >
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
        <nav
          aria-label="Workspace navigation"
          className="flex flex-wrap items-center justify-between gap-3 border-b pb-4"
          style={{ borderColor: "var(--border-hairline)" }}
        >
          <div className="flex items-center gap-3">
            <Chip>Writer Studio</Chip>
            <Link
              href="/"
              prefetch={false}
              className="inline-flex min-h-[44px] items-center px-2 text-sm hover:underline"
              style={{ color: "var(--text-muted)" }}
            >
              Home
            </Link>
            <Link
              href="/topics"
              prefetch={false}
              className="inline-flex min-h-[44px] items-center px-2 text-sm hover:underline"
              style={{ color: "var(--text-muted)" }}
            >
              Topics
            </Link>
          </div>
        </nav>

        {bannerMessage ? (
          <div
            role="alert"
            className="rounded-lg border px-4 py-3 text-sm"
            style={{
              backgroundColor: "var(--bg-surface2)",
              borderColor: "var(--border-hairline)",
              color: "var(--text-primary)",
            }}
          >
            {bannerMessage}
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
                  className="min-h-[44px] rounded-md border px-3.5 py-2 font-mono text-sm"
                  style={{
                    backgroundColor: "var(--bg-canvas)",
                    borderColor: "var(--border-hairline)",
                    color: "var(--text-primary)",
                  }}
                />
                <span className="text-xs" style={{ color: "var(--text-faint)" }}>
                  Lowercase letters, numbers, and hyphens. Defaults cleanly from your name if left blank.
                </span>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={busyAction !== null}
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
              className="flex flex-col justify-between gap-4 rounded-xl border p-6 sm:flex-row sm:items-center sm:p-8"
              style={{
                backgroundColor: "var(--bg-surface1)",
                borderColor: "var(--border-hairline)",
                boxShadow: "var(--shadow-card)",
              }}
            >
              <div>
                <h1 className="font-serif text-2xl font-semibold tracking-tight sm:text-3xl">
                  {publication.name}
                </h1>
                <div className="mt-1.5 flex flex-wrap items-center gap-3 text-sm">
                  <span
                    className="font-mono"
                    style={{ color: "var(--text-muted)" }}
                  >
                    @{publication.slug}
                  </span>
                  <Link
                    href={`/@${encodeURIComponent(publication.slug)}`}
                    prefetch={false}
                    className="inline-flex min-h-[44px] items-center underline underline-offset-4 hover:opacity-80"
                    style={{ color: "var(--text-primary)" }}
                  >
                    View public page
                  </Link>
                </div>
              </div>

              <button
                type="button"
                onClick={handleNewDraft}
                disabled={busyAction !== null}
                className="inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-md px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-60"
                style={{
                  backgroundColor: "var(--btn-primary-bg)",
                  color: "var(--btn-primary-text)",
                }}
              >
                {busyAction === "create-post" ? "Creating draft..." : "New draft"}
              </button>
            </header>

            <section aria-label="Posts by status" className="flex flex-col gap-5">
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
                      <span>{tab.label}</span>
                      <span className="font-mono text-xs opacity-80">
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {filteredPosts.length === 0 ? (
                <div
                  className="rounded-xl border p-8 text-center text-sm"
                  style={{
                    backgroundColor: "var(--bg-surface1)",
                    borderColor: "var(--border-hairline)",
                    color: "var(--text-muted)",
                  }}
                >
                  {activeTab === "draft"
                    ? "No drafts yet. Start with New draft above."
                    : activeTab === "published"
                      ? "No published posts yet."
                      : "Trash is empty."}
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
                      <li
                        key={post.id}
                        className="flex flex-col justify-between gap-4 rounded-xl border p-5 sm:flex-row sm:items-center"
                        style={{
                          backgroundColor: "var(--bg-surface1)",
                          borderColor: "var(--border-hairline)",
                        }}
                      >
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

                          <h2 className="mt-1.5 truncate font-serif text-lg font-medium">
                            {post.title.trim() !== "" ? post.title : "Untitled draft"}
                          </h2>

                          <p
                            className="mt-1 truncate font-mono text-xs"
                            style={{ color: "var(--text-faint)" }}
                          >
                            /@{publication.slug}/{post.slug}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/studio/${encodeURIComponent(post.id)}`}
                            prefetch={false}
                            className="inline-flex min-h-[44px] items-center justify-center rounded-md border px-4 py-2 text-sm font-medium transition-opacity hover:opacity-80"
                            style={{
                              borderColor: "var(--border-hairline)",
                              color: "var(--text-primary)",
                            }}
                          >
                            Edit
                          </Link>

                          {post.status === "published" ? (
                            <Link
                              href={`/@${encodeURIComponent(publication.slug)}/${encodeURIComponent(post.slug)}`}
                              prefetch={false}
                              className="inline-flex min-h-[44px] items-center justify-center rounded-md border px-4 py-2 text-sm font-medium transition-opacity hover:opacity-80"
                              style={{
                                borderColor: "var(--border-hairline)",
                                color: "var(--text-muted)",
                              }}
                            >
                              View
                            </Link>
                          ) : null}

                          {post.status !== "deleted" ? (
                            confirmDeleteId === post.id ? (
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  disabled={busyAction !== null}
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
                                onClick={() => setConfirmDeleteId(post.id)}
                                className="inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-md border px-4 py-2 text-sm font-medium transition-opacity hover:opacity-80"
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
                              disabled={busyAction !== null}
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
