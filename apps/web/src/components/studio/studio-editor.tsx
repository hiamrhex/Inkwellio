"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Chip } from "@inkwellio/ui";
import {
  BODY_MAX_BYTES,
  MAX_TOPIC_SELECTIONS,
  TITLE_MAX_CHARS,
  codePointLength,
  formatApiFailure,
  normalizeHandleInput,
  requestJson,
  toggleTopicSelection,
  utf8ByteLength,
  type ApiFailure,
} from "./api";
import { SafeMarkdownPreview } from "./safe-preview";

export interface StudioTopicOption {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
}

export interface StudioEditorProps {
  readonly postId: string;
  readonly publicationSlug: string;
  readonly publicationName: string;
  readonly initialSlug: string;
  readonly initialStatus: "draft" | "published" | "deleted";
  readonly initialVersion: number;
  readonly initialTitle: string;
  readonly initialBodyMarkdown: string;
  readonly initialTopics: readonly StudioTopicOption[];
  readonly curatedTopics: readonly StudioTopicOption[];
}

type SaveIndicator =
  | "idle"
  | "dirty"
  | "saving"
  | "saved"
  | "conflict"
  | "failed";

/**
 * Counts whitespace-separated words in Markdown text without stripping code tokens unpredictably.
 */
export function countMarkdownWords(markdown: string): number {
  const trimmed = markdown.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/**
 * Builds the plain-text Markdown backup copied to clipboard during conflict/auth recovery.
 */
export function formatConflictClipboardText(title: string, bodyMarkdown: string): string {
  const cleanTitle = title.trim();
  return cleanTitle ? `# ${cleanTitle}\n\n${bodyMarkdown}` : bodyMarkdown;
}

export function StudioEditor({
  postId,
  publicationSlug,
  publicationName,
  initialSlug,
  initialStatus,
  initialVersion,
  initialTitle,
  initialBodyMarkdown,
  initialTopics,
  curatedTopics: initialCuratedTopics,
}: StudioEditorProps) {
  const router = useRouter();

  const [title, setTitle] = useState(initialTitle);
  const [bodyMarkdown, setBodyMarkdown] = useState(initialBodyMarkdown);
  const [version, setVersion] = useState(initialVersion);
  const [status, setStatus] = useState<"draft" | "published" | "deleted">(
    initialStatus,
  );
  const [currentSlug, setCurrentSlug] = useState(initialSlug);
  const [slugInput, setSlugInput] = useState(initialSlug);

  const [curatedTopics, setCuratedTopics] =
    useState<readonly StudioTopicOption[]>(initialCuratedTopics);
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>(() =>
    initialTopics.map((topic) => topic.slug),
  );
  const [topicLimitNotice, setTopicLimitNotice] = useState(false);

  const [editorMode, setEditorMode] = useState<"write" | "preview">("write");
  const [saveIndicator, setSaveIndicator] = useState<SaveIndicator>("idle");
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);
  const [bannerFailureStatus, setBannerFailureStatus] = useState<number | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState<number>(0);
  const [conflictSnapshot, setConflictSnapshot] = useState<{
    currentVersion: number;
    currentTitle: string;
    currentBodyMarkdown: string;
  } | null>(null);

  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const saveInFlightRef = useRef(false);
  const [lastSaved, setLastSaved] = useState({
    title: initialTitle,
    bodyMarkdown: initialBodyMarkdown,
  });
  const saveShortcutRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (initialCuratedTopics.length > 0) return;
    let active = true;
    void requestJson<{ topics: StudioTopicOption[] }>("/api/topics").then((res) => {
      if (active && res.ok && Array.isArray(res.data.topics)) {
        setCuratedTopics(res.data.topics);
      }
    });
    return () => {
      active = false;
    };
  }, [initialCuratedTopics.length]);

  useEffect(() => {
    if (cooldownSeconds <= 0) return undefined;
    const timer = setInterval(() => {
      setCooldownSeconds((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  const titleChars = codePointLength(title);
  const bodyBytes = utf8ByteLength(bodyMarkdown);
  const wordCount = countMarkdownWords(bodyMarkdown);
  const isDirty =
    status !== "deleted" &&
    (title !== lastSaved.title || bodyMarkdown !== lastSaved.bodyMarkdown);
  const validDraftInputs =
    status !== "deleted" &&
    titleChars >= 1 &&
    titleChars <= TITLE_MAX_CHARS &&
    !title.includes("\n") &&
    !title.includes("\r") &&
    bodyBytes >= 1 &&
    bodyBytes <= BODY_MAX_BYTES;

  function applyFailure(res: ApiFailure) {
    setBannerFailureStatus(res.status);
    if (res.status === 429) {
      setCooldownSeconds(res.retryAfterSeconds ?? 10);
    }
    if (
      res.status === 409 &&
      res.details &&
      typeof res.details.currentVersion === "number"
    ) {
      setSaveIndicator("conflict");
      setConflictSnapshot({
        currentVersion: res.details.currentVersion,
        currentTitle: res.details.currentTitle ?? title,
        currentBodyMarkdown: res.details.currentBodyMarkdown ?? bodyMarkdown,
      });
      setBannerMessage(
        `Draft conflict: server has version ${res.details.currentVersion}. Copy your local text or reload the latest saved draft.`,
      );
      return;
    }
    setBannerMessage(formatApiFailure(res));
  }

  async function saveDraftNow(mode: "manual" | "auto"): Promise<number | null> {
    if (status === "deleted" || cooldownSeconds > 0) return null;
    if (saveInFlightRef.current) return null;
    if (!validDraftInputs) {
      if (mode === "manual") {
        setBannerFailureStatus(400);
        setBannerMessage(
          `Title must be 1-${TITLE_MAX_CHARS} characters (single line) and body must be 1-${BODY_MAX_BYTES.toLocaleString()} UTF-8 bytes.`,
        );
      }
      return null;
    }

    saveInFlightRef.current = true;
    setSaveIndicator("saving");
    if (mode === "manual") {
      setBannerMessage(null);
      setBannerFailureStatus(null);
    }

    const res = await requestJson<{ version: number; updatedAt: string }>(
      `/api/posts/${encodeURIComponent(postId)}/draft`,
      {
        method: "PUT",
        body: JSON.stringify({
          expectedVersion: version,
          title,
          bodyMarkdown,
        }),
      },
    );

    saveInFlightRef.current = false;

    if (!res.ok) {
      setSaveIndicator(res.status === 409 ? "conflict" : "failed");
      applyFailure(res);
      return null;
    }

    setLastSaved({ title, bodyMarkdown });
    setVersion(res.data.version);
    setConflictSnapshot(null);
    setBannerMessage(null);
    setBannerFailureStatus(null);
    setSaveIndicator("saved");
    return res.data.version;
  }

  useEffect(() => {
    saveShortcutRef.current = () => {
      void saveDraftNow("manual");
    };
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        !event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === "s"
      ) {
        event.preventDefault();
        saveShortcutRef.current();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!isDirty) return undefined;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    if (status === "deleted" || cooldownSeconds > 0 || conflictSnapshot !== null) {
      return undefined;
    }
    if (!isDirty || !validDraftInputs) return undefined;

    const timer = setTimeout(() => {
      void saveDraftNow("auto");
    }, 1_500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, bodyMarkdown, version, status, isDirty, validDraftInputs, cooldownSeconds, conflictSnapshot]);

  async function handleCopyMyText() {
    const text = formatConflictClipboardText(title, bodyMarkdown);
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setStatusNotice("Copied your local draft text to the clipboard.");
        return;
      }
      setStatusNotice("Clipboard unavailable here — select and copy text directly from the editor.");
    } catch {
      setStatusNotice("Clipboard access was blocked — select and copy text directly from the editor.");
    }
  }

  function handleApplyConflictReload() {
    if (!conflictSnapshot) return;
    setVersion(conflictSnapshot.currentVersion);
    setTitle(conflictSnapshot.currentTitle);
    setBodyMarkdown(conflictSnapshot.currentBodyMarkdown);
    setLastSaved({
      title: conflictSnapshot.currentTitle,
      bodyMarkdown: conflictSnapshot.currentBodyMarkdown,
    });
    setConflictSnapshot(null);
    setBannerMessage(null);
    setBannerFailureStatus(null);
    setSaveIndicator("saved");
    setStatusNotice("Loaded the latest saved draft version.");
  }

  async function handleSaveTopics() {
    if (busyAction !== null || status === "deleted" || cooldownSeconds > 0) return;
    setBusyAction("topics");
    setBannerMessage(null);
    setBannerFailureStatus(null);
    setStatusNotice(null);

    const res = await requestJson<{ topics: StudioTopicOption[] }>(
      `/api/posts/${encodeURIComponent(postId)}/topics`,
      {
        method: "PUT",
        body: JSON.stringify({ topicSlugs: selectedSlugs }),
      },
    );

    setBusyAction(null);
    if (!res.ok) {
      applyFailure(res);
      return;
    }

    setSelectedSlugs(res.data.topics.map((topic) => topic.slug));
    setStatusNotice("Topics saved.");
    router.refresh();
  }

  async function handleRenameSlug() {
    if (busyAction !== null || cooldownSeconds > 0) return;
    const trimmed = slugInput.trim().toLowerCase();
    if (!trimmed) {
      setBannerFailureStatus(400);
      setBannerMessage("Enter a valid URL slug.");
      return;
    }

    setBusyAction("slug");
    setBannerMessage(null);
    setBannerFailureStatus(null);
    setStatusNotice(null);

    const res = await requestJson<{ id: string; slug: string; changed: boolean }>(
      `/api/posts/${encodeURIComponent(postId)}/slug`,
      {
        method: "POST",
        body: JSON.stringify({ slug: trimmed }),
      },
    );

    setBusyAction(null);
    if (!res.ok) {
      applyFailure(res);
      return;
    }

    setCurrentSlug(res.data.slug);
    setSlugInput(res.data.slug);
    setStatusNotice(
      res.data.changed
        ? "URL slug updated; previous links will redirect."
        : "Slug unchanged.",
    );
    router.refresh();
  }

  async function handleLifecycle(
    action: "publish" | "unpublish" | "delete" | "restore",
  ) {
    if (busyAction !== null || cooldownSeconds > 0) return;
    setBannerMessage(null);
    setBannerFailureStatus(null);
    setStatusNotice(null);

    let effectiveVersion = version;

    if (
      action === "publish" &&
      (isDirty || version === 0)
    ) {
      const savedVersion = await saveDraftNow("manual");
      if (savedVersion === null) return;
      effectiveVersion = savedVersion;
    }

    setBusyAction(action);
    const res = await requestJson<{
      id: string;
      status: "draft" | "published" | "deleted";
      version: number;
    }>(`/api/posts/${encodeURIComponent(postId)}/${action}`, {
      method: "POST",
      body: JSON.stringify({ expectedVersion: effectiveVersion }),
    });

    setBusyAction(null);
    setConfirmDelete(false);

    if (!res.ok) {
      applyFailure(res);
      return;
    }

    setStatus(res.data.status);
    setVersion(res.data.version);
    setStatusNotice(
      action === "publish"
        ? "Post published live."
        : action === "unpublish"
          ? "Post unpublished and returned to drafts."
          : action === "delete"
            ? "Post moved to trash."
            : "Post restored to drafts.",
    );
    router.refresh();
  }

  const livePostPath = `/@${encodeURIComponent(publicationSlug)}/${encodeURIComponent(currentSlug)}`;
  const slugPreview = normalizeHandleInput(slugInput) || currentSlug;

  const saveLabel =
    saveIndicator === "saving"
      ? "Saving..."
      : saveIndicator === "saved"
        ? `Saved · v${version}`
        : saveIndicator === "dirty"
          ? "Unsaved changes"
          : saveIndicator === "conflict"
            ? "Version conflict"
            : saveIndicator === "failed"
              ? "Save failed"
              : version === 0
                ? "New draft"
                : `Saved · v${version}`;

  const actionsLocked = busyAction !== null || cooldownSeconds > 0;
  const signInHref = `/sign-in?next=${encodeURIComponent(`/studio/${postId}`)}`;

  return (
    <main
      id="main-content"
      className="workspace-main px-4 pb-16 sm:px-6"
      style={{
        backgroundColor: "var(--bg-canvas)",
        color: "var(--text-primary)",
      }}
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <header
          className="flex flex-wrap items-center justify-between gap-3 border-b pb-4"
          style={{ borderColor: "var(--border-hairline)" }}
        >
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/dashboard"
              className="inline-flex min-h-[44px] items-center rounded-md border px-3.5 py-2 text-sm font-medium transition-opacity hover:opacity-80"
              style={{
                borderColor: "var(--border-hairline)",
                color: "var(--text-primary)",
              }}
            >
              Dashboard
            </Link>
            <Chip>{publicationName}</Chip>
            <span
              className="inline-flex items-center gap-1.5 font-mono text-xs uppercase"
              style={{ color: "var(--text-muted)" }}
            >
              <span
                aria-hidden="true"
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{
                  backgroundColor:
                    status === "published"
                      ? "var(--status-live)"
                      : status === "draft"
                        ? "var(--status-amber)"
                        : "var(--text-faint)",
                }}
              />
              {status}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span
              aria-live="polite"
              className="font-mono text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              {saveLabel}
            </span>

            {status === "published" ? (
              <Link
                href={livePostPath}
                className="inline-flex min-h-[44px] items-center rounded-md border px-3.5 py-2 text-sm font-medium underline underline-offset-4 hover:opacity-80"
                style={{
                  borderColor: "var(--border-hairline)",
                  color: "var(--text-primary)",
                }}
              >
                View live post
              </Link>
            ) : null}
          </div>
        </header>

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
            Write actions paused for {cooldownSeconds}s to respect rate limits. Your text stays safe in the editor.
          </div>
        ) : null}

        {bannerMessage ? (
          <div
            role="alert"
            aria-live="polite"
            className="flex flex-col gap-3 rounded-lg border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
            style={{
              backgroundColor: "var(--bg-surface2)",
              borderColor: "var(--status-amber)",
              color: "var(--text-primary)",
            }}
          >
            <span>{bannerMessage}</span>
            <div className="flex flex-wrap items-center gap-2">
              {conflictSnapshot || bannerFailureStatus === 401 ? (
                <button
                  type="button"
                  onClick={() => void handleCopyMyText()}
                  className="inline-flex min-h-[44px] cursor-pointer items-center rounded-md border px-3.5 py-2 text-xs font-medium"
                  style={{
                    borderColor: "var(--border-hairline)",
                    backgroundColor: "var(--bg-canvas)",
                    color: "var(--text-primary)",
                  }}
                >
                  Copy my text
                </button>
              ) : null}

              {conflictSnapshot ? (
                <button
                  type="button"
                  onClick={handleApplyConflictReload}
                  className="inline-flex min-h-[44px] cursor-pointer items-center rounded-md px-3.5 py-2 text-xs font-medium"
                  style={{
                    backgroundColor: "var(--btn-primary-bg)",
                    color: "var(--btn-primary-text)",
                  }}
                >
                  Reload latest draft
                </button>
              ) : null}

              {bannerFailureStatus === 401 ? (
                <Link
                  href={signInHref}
                  className="inline-flex min-h-[44px] items-center rounded-md px-3.5 py-2 text-xs font-medium"
                  style={{
                    backgroundColor: "var(--btn-primary-bg)",
                    color: "var(--btn-primary-text)",
                  }}
                >
                  Sign in again
                </Link>
              ) : null}

              {saveIndicator === "failed" &&
              (bannerFailureStatus === 0 || (bannerFailureStatus ?? 0) >= 500) &&
              cooldownSeconds === 0 ? (
                <button
                  type="button"
                  onClick={() => void saveDraftNow("manual")}
                  className="inline-flex min-h-[44px] cursor-pointer items-center rounded-md border px-3.5 py-2 text-xs font-medium"
                  style={{
                    borderColor: "var(--border-hairline)",
                    backgroundColor: "var(--bg-canvas)",
                    color: "var(--text-primary)",
                  }}
                >
                  Retry save
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {statusNotice ? (
          <p
            role="status"
            aria-live="polite"
            className="rounded-lg border px-4 py-3 text-sm"
            style={{
              backgroundColor: "var(--bg-surface1)",
              borderColor: "var(--status-live)",
              color: "var(--text-primary)",
            }}
          >
            {statusNotice}
          </p>
        ) : null}

        {status === "deleted" ? (
          <section
            aria-label="Deleted post notice"
            className="rounded-xl border p-6"
            style={{
              backgroundColor: "var(--bg-surface1)",
              borderColor: "var(--border-hairline)",
            }}
          >
            <h1 className="font-serif text-xl font-semibold">
              This post is in trash
            </h1>
            <p
              className="mt-2 text-sm"
              style={{ color: "var(--text-muted)" }}
            >
              Restore this post to drafts before editing, assigning topics, or republishing.
            </p>
            <div className="mt-4">
              <button
                type="button"
                disabled={actionsLocked}
                onClick={() => void handleLifecycle("restore")}
                className="inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-md px-5 py-2.5 text-sm font-medium"
                style={{
                  backgroundColor: "var(--btn-primary-bg)",
                  color: "var(--btn-primary-text)",
                }}
              >
                {busyAction === "restore" ? "Restoring..." : "Restore to drafts"}
              </button>
            </div>
          </section>
        ) : null}

        <section
          aria-label="Draft editor"
          className="flex flex-col gap-5 rounded-xl border p-5 sm:p-8"
          style={{
            backgroundColor: "var(--bg-surface1)",
            borderColor: "var(--border-hairline)",
            boxShadow: "var(--shadow-card)",
          }}
        >
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="post-title" className="text-sm font-medium">
                Title
              </label>
              <span
                className="font-mono text-xs"
                style={{ color: "var(--text-faint)" }}
              >
                {titleChars}/{TITLE_MAX_CHARS}
              </span>
            </div>
            <input
              id="post-title"
              name="title"
              type="text"
              maxLength={TITLE_MAX_CHARS}
              disabled={status === "deleted"}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setSaveIndicator("dirty");
              }}
              placeholder="Write a clear headline..."
              className="min-h-[44px] rounded-md border px-3.5 py-2 font-serif text-xl font-semibold sm:text-2xl"
              style={{
                backgroundColor: "var(--bg-canvas)",
                borderColor: "var(--border-hairline)",
                color: "var(--text-primary)",
              }}
            />
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label htmlFor="post-body" className="text-sm font-medium">
                Body (Markdown)
              </label>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-pressed={editorMode === "write"}
                  onClick={() => setEditorMode("write")}
                  className="inline-flex min-h-[44px] cursor-pointer items-center rounded-md border px-4 py-2 text-sm font-medium"
                  style={{
                    backgroundColor:
                      editorMode === "write"
                        ? "var(--btn-primary-bg)"
                        : "var(--bg-canvas)",
                    color:
                      editorMode === "write"
                        ? "var(--btn-primary-text)"
                        : "var(--text-primary)",
                    borderColor: "var(--border-hairline)",
                  }}
                >
                  Write
                </button>
                <button
                  type="button"
                  aria-pressed={editorMode === "preview"}
                  onClick={() => setEditorMode("preview")}
                  className="inline-flex min-h-[44px] cursor-pointer items-center rounded-md border px-4 py-2 text-sm font-medium"
                  style={{
                    backgroundColor:
                      editorMode === "preview"
                        ? "var(--btn-primary-bg)"
                        : "var(--bg-canvas)",
                    color:
                      editorMode === "preview"
                        ? "var(--btn-primary-text)"
                        : "var(--text-primary)",
                    borderColor: "var(--border-hairline)",
                  }}
                >
                  Preview
                </button>
              </div>
            </div>

            {editorMode === "write" ? (
              <textarea
                id="post-body"
                name="bodyMarkdown"
                rows={16}
                disabled={status === "deleted"}
                value={bodyMarkdown}
                onChange={(e) => {
                  setBodyMarkdown(e.target.value);
                  setSaveIndicator("dirty");
                }}
                placeholder="Write in Markdown..."
                className="w-full rounded-md border p-4 font-mono text-sm leading-relaxed"
                style={{
                  backgroundColor: "var(--bg-canvas)",
                  borderColor: "var(--border-hairline)",
                  color: "var(--text-primary)",
                }}
              />
            ) : (
              <div
                className="min-h-[320px] rounded-md border p-5 sm:p-8"
                style={{
                  backgroundColor: "var(--bg-canvas)",
                  borderColor: "var(--border-hairline)",
                }}
              >
                <div className="editorial-reading mx-auto max-w-[68ch]">
                  <SafeMarkdownPreview content={bodyMarkdown} />
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className="font-mono text-xs"
                  style={{ color: "var(--text-faint)" }}
                >
                  {wordCount.toLocaleString()} words · {bodyBytes.toLocaleString()} / {BODY_MAX_BYTES.toLocaleString()} bytes
                </span>
                <span
                  className="text-xs"
                  style={{ color: "var(--text-faint)" }}
                >
                  Ctrl+S to save
                </span>
              </div>

              <button
                type="button"
                disabled={status === "deleted" || saveIndicator === "saving" || cooldownSeconds > 0}
                onClick={() => void saveDraftNow("manual")}
                className="inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-md border px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-85 disabled:opacity-60"
                style={{
                  borderColor: "var(--border-hairline)",
                  backgroundColor: "var(--bg-surface2)",
                  color: "var(--text-primary)",
                }}
              >
                {saveIndicator === "saving" ? "Saving..." : "Save draft"}
              </button>
            </div>
          </div>
        </section>

        <section
          aria-labelledby="topics-heading"
          className="flex flex-col gap-4 rounded-xl border p-5 sm:p-6"
          style={{
            backgroundColor: "var(--bg-surface1)",
            borderColor: "var(--border-hairline)",
          }}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 id="topics-heading" className="text-base font-semibold">
                Curated topics
              </h2>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Select up to {MAX_TOPIC_SELECTIONS} football writing topics.
              </p>
            </div>
            <span
              className="font-mono text-xs"
              style={{ color: "var(--text-faint)" }}
            >
              {selectedSlugs.length}/{MAX_TOPIC_SELECTIONS} selected
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {curatedTopics.map((topic) => {
              const active = selectedSlugs.includes(topic.slug);
              return (
                <button
                  key={topic.slug}
                  type="button"
                  disabled={status === "deleted"}
                  aria-pressed={active}
                  onClick={() => {
                    const result = toggleTopicSelection(selectedSlugs, topic.slug);
                    setSelectedSlugs(result.next);
                    setTopicLimitNotice(result.atLimit);
                  }}
                  className="inline-flex min-h-[44px] cursor-pointer items-center rounded-full border px-4 py-2 text-xs font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{
                    backgroundColor: active
                      ? "var(--btn-primary-bg)"
                      : "var(--bg-canvas)",
                    color: active
                      ? "var(--btn-primary-text)"
                      : "var(--text-primary)",
                    borderColor: "var(--border-hairline)",
                  }}
                >
                  {topic.name}
                </button>
              );
            })}
          </div>

          {topicLimitNotice ? (
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Maximum {MAX_TOPIC_SELECTIONS} topics allowed per post. Deselect one before adding another.
            </p>
          ) : null}

          <div>
            <button
              type="button"
              disabled={status === "deleted" || actionsLocked}
              onClick={() => void handleSaveTopics()}
              className="inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-md border px-4 py-2 text-sm font-medium transition-opacity hover:opacity-85 disabled:opacity-60"
              style={{
                borderColor: "var(--border-hairline)",
                backgroundColor: "var(--bg-surface2)",
                color: "var(--text-primary)",
              }}
            >
              {busyAction === "topics" ? "Saving topics..." : "Save topics"}
            </button>
          </div>
        </section>

        <section
          aria-labelledby="publishing-controls-heading"
          className="flex flex-col gap-5 rounded-xl border p-5 sm:p-6"
          style={{
            backgroundColor: "var(--bg-surface1)",
            borderColor: "var(--border-hairline)",
          }}
        >
          <h2 id="publishing-controls-heading" className="text-base font-semibold">
            Publishing &amp; URL
          </h2>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex flex-1 flex-col gap-1.5">
              <label htmlFor="post-slug" className="text-sm font-medium">
                Post slug
              </label>
              <input
                id="post-slug"
                name="slug"
                type="text"
                disabled={status === "deleted"}
                value={slugInput}
                onChange={(e) => setSlugInput(e.target.value)}
                aria-describedby="post-slug-preview"
                className="min-h-[44px] rounded-md border px-3.5 py-2 font-mono text-sm"
                style={{
                  backgroundColor: "var(--bg-canvas)",
                  borderColor: "var(--border-hairline)",
                  color: "var(--text-primary)",
                }}
              />
            </div>
            <button
              type="button"
              disabled={status === "deleted" || actionsLocked}
              onClick={() => void handleRenameSlug()}
              className="inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-60"
              style={{
                borderColor: "var(--border-hairline)",
                backgroundColor: "var(--bg-surface2)",
                color: "var(--text-primary)",
              }}
            >
              {busyAction === "slug" ? "Renaming..." : "Rename URL"}
            </button>
          </div>

          <p
            id="post-slug-preview"
            className="font-mono text-xs"
            style={{ color: "var(--text-faint)" }}
          >
            Public address: /@{publicationSlug}/{slugPreview}
          </p>

          <div
            className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"
            style={{ borderColor: "var(--border-hairline)" }}
          >
            <div className="flex flex-wrap items-center gap-3">
              {status === "draft" ? (
                <button
                  type="button"
                  disabled={actionsLocked || !validDraftInputs}
                  onClick={() => void handleLifecycle("publish")}
                  className="inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-md px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{
                    backgroundColor: "var(--btn-primary-bg)",
                    color: "var(--btn-primary-text)",
                  }}
                >
                  {busyAction === "publish" ? "Publishing..." : "Publish post"}
                </button>
              ) : null}

              {status === "published" ? (
                <>
                  <button
                    type="button"
                    disabled={actionsLocked || !validDraftInputs}
                    onClick={() => void handleLifecycle("publish")}
                    className="inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-md px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
                    style={{
                      backgroundColor: "var(--btn-primary-bg)",
                      color: "var(--btn-primary-text)",
                    }}
                  >
                    {busyAction === "publish" ? "Publishing..." : "Publish updates"}
                  </button>
                  <button
                    type="button"
                    disabled={actionsLocked}
                    onClick={() => void handleLifecycle("unpublish")}
                    className="inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-md border px-4 py-2 text-sm font-medium"
                    style={{
                      borderColor: "var(--border-hairline)",
                      color: "var(--text-primary)",
                    }}
                  >
                    {busyAction === "unpublish" ? "Unpublishing..." : "Unpublish"}
                  </button>
                </>
              ) : null}
            </div>

            {status !== "deleted" ? (
              confirmDelete ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={actionsLocked}
                    onClick={() => void handleLifecycle("delete")}
                    className="inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-md px-4 py-2 text-sm font-medium"
                    style={{
                      backgroundColor: "var(--btn-primary-bg)",
                      color: "var(--btn-primary-text)",
                    }}
                  >
                    {busyAction === "delete" ? "Deleting..." : "Confirm delete"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-md border px-3.5 py-2 text-sm"
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
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-md border px-4 py-2 text-sm font-medium"
                  style={{
                    borderColor: "var(--border-hairline)",
                    color: "var(--text-muted)",
                  }}
                >
                  Move to trash
                </button>
              )
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
