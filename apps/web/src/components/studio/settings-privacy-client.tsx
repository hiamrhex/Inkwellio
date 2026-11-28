"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  formatApiFailure,
  requestAccountExportDownload,
  requestJson,
  type ApiFailure,
} from "./api";
import type { StudioSession } from "./server-data";

export interface SettingsPublicationSummary {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
}

export interface SettingsPrivacyClientProps {
  readonly session: StudioSession;
  readonly publication: SettingsPublicationSummary | null;
  readonly postCounts: {
    readonly draft: number;
    readonly published: number;
    readonly deleted: number;
  };
}

interface NoticeState {
  readonly kind: "error" | "success";
  readonly message: string;
}

export function SettingsPrivacyClient({
  session,
  publication,
  postCounts,
}: SettingsPrivacyClientProps) {
  const router = useRouter();
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState<number>(0);
  const [notice, setNotice] = useState<NoticeState | null>(null);

  const [erasureStep, setErasureStep] = useState<"request" | "confirm" | "erased">("request");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [confirmPhrase, setConfirmPhrase] = useState("");
  const [erasureExpiresInSeconds, setErasureExpiresInSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (cooldownSeconds <= 0) return undefined;
    const timer = setInterval(() => {
      setCooldownSeconds((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  function reportFailure(res: ApiFailure) {
    if (res.status === 429) {
      setCooldownSeconds(res.retryAfterSeconds ?? 15);
    }
    setNotice({ kind: "error", message: formatApiFailure(res) });
  }

  async function handleSignOut() {
    if (busyAction !== null) return;
    setBusyAction("sign-out");
    setNotice(null);
    try {
      await fetch("/api/auth/sign-out", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
    } catch {
      // Navigate away even if session cleanup request hits a transient network error.
    } finally {
      setBusyAction(null);
      router.push("/");
      router.refresh();
    }
  }

  async function handleExportData() {
    if (busyAction !== null || cooldownSeconds > 0) return;
    setBusyAction("export");
    setNotice(null);

    const res = await requestAccountExportDownload();
    setBusyAction(null);

    if (!res.ok) {
      reportFailure(res);
      return;
    }

    try {
      const blob = new Blob([res.jsonText], { type: "application/json;charset=utf-8" });
      const blobUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.download = res.filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

      setNotice({
        kind: "success",
        message: `Downloaded ${res.filename}. Exports are rate limited to once per hour.`,
      });
    } catch {
      setNotice({
        kind: "error",
        message: "Export finished, but the browser could not save the file automatically.",
      });
    }
  }

  async function handleRequestErasure(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyAction !== null || cooldownSeconds > 0) return;
    setBusyAction("erasure-request");
    setNotice(null);

    const res = await requestJson<{ requested: boolean; expiresInSeconds: number }>(
      "/api/account/erasure/request",
      {
        method: "POST",
        body: JSON.stringify({ password }),
      },
    );

    setBusyAction(null);
    if (!res.ok) {
      reportFailure(res);
      return;
    }

    setPassword("");
    setErasureExpiresInSeconds(res.data.expiresInSeconds);
    setErasureStep("confirm");
    setNotice({
      kind: "success",
      message: `Sent deletion confirmation code to ${session.email}. Enter it below within ${Math.max(1, Math.round(res.data.expiresInSeconds / 60))} minutes.`,
    });
  }

  async function handleConfirmErasure(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyAction !== null || cooldownSeconds > 0) return;

    const cleanToken = token.trim();
    if (!cleanToken) {
      setNotice({ kind: "error", message: "Enter the confirmation token from your email." });
      return;
    }
    if (confirmPhrase.trim() !== "DELETE") {
      setNotice({ kind: "error", message: 'Type DELETE in the confirmation box to continue.' });
      return;
    }

    setBusyAction("erasure-confirm");
    setNotice(null);

    const res = await requestJson<{ erased: boolean }>(
      "/api/account/erasure/confirm",
      {
        method: "POST",
        body: JSON.stringify({ token: cleanToken }),
      },
    );

    setBusyAction(null);
    if (!res.ok) {
      if (res.status === 410) {
        setErasureStep("request");
        setToken("");
        setConfirmPhrase("");
      }
      reportFailure(res);
      return;
    }

    try {
      await fetch("/api/auth/sign-out", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
    } catch {
      // Account and sessions were already deleted on the server.
    }

    setErasureStep("erased");
    setNotice({
      kind: "success",
      message: "Your account and all associated content have been permanently deleted.",
    });
    router.refresh();
  }

  const actionsLocked = busyAction !== null || cooldownSeconds > 0;

  if (erasureStep === "erased") {
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
          <section
            aria-labelledby="account-erased-heading"
            className="rounded-xl border p-6 sm:p-8"
            style={{
              backgroundColor: "var(--bg-surface1)",
              borderColor: "var(--status-live)",
              boxShadow: "var(--shadow-card)",
            }}
          >
            <h1 id="account-erased-heading" className="font-serif text-2xl font-semibold sm:text-3xl">
              Account deleted
            </h1>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
              Your writer account, active sessions, publication, drafts, and published articles have been removed from the live database.
            </p>
            <div className="mt-6">
              <Link
                href="/"
                className="inline-flex min-h-[44px] items-center justify-center rounded-md px-5 py-2.5 text-sm font-medium"
                style={{
                  backgroundColor: "var(--btn-primary-bg)",
                  color: "var(--btn-primary-text)",
                }}
              >
                Return home
              </Link>
            </div>
          </section>
        </div>
      </main>
    );
  }

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
        <header className="flex flex-col gap-1.5 border-b pb-5" style={{ borderColor: "var(--border-hairline)" }}>
          <h1 className="font-serif text-2xl font-semibold tracking-tight sm:text-3xl">
            Account &amp; Privacy Settings
          </h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Inspect your signed-in account, download a complete JSON archive, or permanently delete your data.
          </p>
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
            Rate limit active: retry in {cooldownSeconds}s.
          </div>
        ) : null}

        {notice ? (
          <div
            role={notice.kind === "error" ? "alert" : "status"}
            aria-live="polite"
            className="rounded-lg border px-4 py-3 text-sm"
            style={{
              backgroundColor: "var(--bg-surface2)",
              borderColor:
                notice.kind === "success"
                  ? "var(--status-live)"
                  : "var(--status-amber)",
              color: "var(--text-primary)",
            }}
          >
            {notice.message}
          </div>
        ) : null}

        <section
          aria-labelledby="account-overview-heading"
          className="flex flex-col gap-5 rounded-xl border p-6"
          style={{
            backgroundColor: "var(--bg-surface1)",
            borderColor: "var(--border-hairline)",
            boxShadow: "var(--shadow-card)",
          }}
        >
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div>
              <h2 id="account-overview-heading" className="text-base font-semibold">
                Account &amp; Publication
              </h2>
              <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
                Signed in as{" "}
                <span className="font-mono" style={{ color: "var(--text-primary)" }}>
                  {session.email}
                </span>
                {session.name ? ` (${session.name})` : ""}
              </p>
            </div>

            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() => void handleSignOut()}
              className="inline-flex min-h-[44px] shrink-0 cursor-pointer items-center justify-center rounded-md border px-4 py-2 text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-60"
              style={{
                borderColor: "var(--border-hairline)",
                color: "var(--text-primary)",
              }}
            >
              {busyAction === "sign-out" ? "Signing out..." : "Sign out"}
            </button>
          </div>

          <div
            className="rounded-lg border p-4 text-sm"
            style={{
              backgroundColor: "var(--bg-canvas)",
              borderColor: "var(--border-hairline)",
            }}
          >
            {publication ? (
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-serif text-lg font-medium">{publication.name}</p>
                    <p className="font-mono text-xs" style={{ color: "var(--text-faint)" }}>
                      /@{publication.slug}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href="/dashboard"
                      className="inline-flex min-h-[44px] items-center rounded-md border px-3.5 py-2 text-xs font-medium hover:opacity-85"
                      style={{
                        borderColor: "var(--border-hairline)",
                        color: "var(--text-primary)",
                      }}
                    >
                      Open dashboard
                    </Link>
                    <Link
                      href={`/@${encodeURIComponent(publication.slug)}`}
                      className="inline-flex min-h-[44px] items-center rounded-md border px-3.5 py-2 text-xs font-medium hover:opacity-85"
                      style={{
                        borderColor: "var(--border-hairline)",
                        color: "var(--text-muted)",
                      }}
                    >
                      Public page
                    </Link>
                  </div>
                </div>
                <p className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>
                  {postCounts.published} published · {postCounts.draft} drafts · {postCounts.deleted} in trash
                </p>
                <p className="text-xs" style={{ color: "var(--text-faint)" }}>
                  Publication names and handles are permanent once created.
                </p>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span style={{ color: "var(--text-muted)" }}>
                  No publication created yet for this account.
                </span>
                <Link
                  href="/dashboard"
                  className="inline-flex min-h-[44px] items-center rounded-md border px-3.5 py-2 text-xs font-medium"
                  style={{
                    borderColor: "var(--border-hairline)",
                    color: "var(--text-primary)",
                  }}
                >
                  Create publication
                </Link>
              </div>
            )}
          </div>
        </section>

        <section
          aria-labelledby="data-export-heading"
          className="flex flex-col gap-4 rounded-xl border p-6"
          style={{
            backgroundColor: "var(--bg-surface1)",
            borderColor: "var(--border-hairline)",
            boxShadow: "var(--shadow-card)",
          }}
        >
          <div>
            <h2 id="data-export-heading" className="text-base font-semibold">
              Export your data
            </h2>
            <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
              Download a machine-readable JSON copy of your profile, publication, slug history, drafts, revisions, and security audit log. Direct browser downloads are capped at 25 MB and limited to one export per hour.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={actionsLocked}
              onClick={() => void handleExportData()}
              className="inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-md border px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-85 disabled:opacity-60"
              style={{
                borderColor: "var(--border-hairline)",
                backgroundColor: "var(--bg-surface2)",
                color: "var(--text-primary)",
              }}
            >
              {busyAction === "export" ? "Preparing JSON..." : "Export JSON"}
            </button>
            <Link
              href="/privacy"
              className="inline-flex min-h-[44px] items-center text-sm underline underline-offset-4 hover:opacity-80"
              style={{ color: "var(--text-muted)" }}
            >
              Read Privacy Policy
            </Link>
          </div>
        </section>

        <section
          aria-labelledby="delete-account-heading"
          className="flex flex-col gap-5 rounded-xl border p-6"
          style={{
            backgroundColor: "var(--bg-surface1)",
            borderColor: "var(--border-hairline)",
            boxShadow: "var(--shadow-card)",
          }}
        >
          <div>
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: "var(--status-amber)" }}
              />
              <h2 id="delete-account-heading" className="text-base font-semibold">
                Delete account
              </h2>
            </div>
            <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
              Account deletion is permanent and removes your profile, sessions, publication, drafts, published posts, and revisions. For verification, a single-use 15-minute confirmation code is emailed to{" "}
              <span className="font-mono" style={{ color: "var(--text-primary)" }}>
                {session.email}
              </span>
              .
            </p>
          </div>

          {erasureStep === "request" ? (
            <form onSubmit={handleRequestErasure} className="flex max-w-md flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="erasure-password" className="text-sm font-medium">
                  Current password
                </label>
                <input
                  id="erasure-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="min-h-[44px] rounded-md border px-3.5 py-2 text-sm"
                  style={{
                    backgroundColor: "var(--bg-canvas)",
                    borderColor: "var(--border-hairline)",
                    color: "var(--text-primary)",
                  }}
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={actionsLocked}
                  className="inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-md px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-60"
                  style={{
                    backgroundColor: "var(--btn-primary-bg)",
                    color: "var(--btn-primary-text)",
                  }}
                >
                  {busyAction === "erasure-request"
                    ? "Sending code..."
                    : "Send confirmation code"}
                </button>
                <button
                  type="button"
                  onClick={() => setErasureStep("confirm")}
                  className="inline-flex min-h-[44px] cursor-pointer items-center px-2 text-xs underline underline-offset-4"
                  style={{ color: "var(--text-muted)" }}
                >
                  I already have a confirmation code
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleConfirmErasure} className="flex max-w-md flex-col gap-4">
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                {erasureExpiresInSeconds
                  ? `Confirmation code active for ${Math.max(1, Math.round(erasureExpiresInSeconds / 60))} minutes.`
                  : "Enter the single-use confirmation token sent to your email."}
              </p>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="erasure-token" className="text-sm font-medium">
                  Confirmation code
                </label>
                <input
                  id="erasure-token"
                  name="token"
                  type="text"
                  autoComplete="one-time-code"
                  required
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Paste confirmation token"
                  className="min-h-[44px] rounded-md border px-3.5 py-2 font-mono text-sm"
                  style={{
                    backgroundColor: "var(--bg-canvas)",
                    borderColor: "var(--border-hairline)",
                    color: "var(--text-primary)",
                  }}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="erasure-confirm-phrase" className="text-sm font-medium">
                  Type DELETE to confirm
                </label>
                <input
                  id="erasure-confirm-phrase"
                  name="confirmPhrase"
                  type="text"
                  autoComplete="off"
                  required
                  value={confirmPhrase}
                  onChange={(e) => setConfirmPhrase(e.target.value)}
                  placeholder="DELETE"
                  className="min-h-[44px] rounded-md border px-3.5 py-2 font-mono text-sm"
                  style={{
                    backgroundColor: "var(--bg-canvas)",
                    borderColor: "var(--border-hairline)",
                    color: "var(--text-primary)",
                  }}
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={actionsLocked || confirmPhrase.trim() !== "DELETE"}
                  className="inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-md px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{
                    backgroundColor: "var(--btn-primary-bg)",
                    color: "var(--btn-primary-text)",
                  }}
                >
                  {busyAction === "erasure-confirm"
                    ? "Deleting account..."
                    : "Permanently delete account"}
                </button>
                <button
                  type="button"
                  disabled={actionsLocked}
                  onClick={() => {
                    setErasureStep("request");
                    setToken("");
                    setConfirmPhrase("");
                  }}
                  className="inline-flex min-h-[44px] cursor-pointer items-center rounded-md border px-3.5 py-2 text-sm"
                  style={{
                    borderColor: "var(--border-hairline)",
                    color: "var(--text-muted)",
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
