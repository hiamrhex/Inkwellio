"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { InkwellioLogo, SquircleClipDef, ThemeToggle } from "@inkwellio/ui";
import { requestJson } from "./studio/api";
import { SessionNavActions } from "./session-nav-actions";

export type WorkspacePath =
  | "/dashboard"
  | "/studio"
  | "/settings/privacy";

interface WorkspacePublication {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
}

const PRIMARY_NAV = [
  { label: "Posts", href: "/dashboard" as const },
] as const;

/**
 * Signed-in publishing shell.
 *
 * Desktop: a 248px sticky sidebar plus a fluid workspace canvas. Mobile: a
 * sticky top bar with an Escape-dismissible drawer. Every destination is a real
 * route; the publication badge and "New story" action read live data from the
 * publications/posts APIs rather than inventing workspace state.
 */
export function WorkspaceShell({
  activePath,
  children,
}: {
  readonly activePath?: WorkspacePath;
  readonly children?: ReactNode;
}) {
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [publication, setPublication] = useState<WorkspacePublication | null>(null);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const drawerToggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    void requestJson<{ publications: WorkspacePublication[] }>("/api/publications").then(
      (res) => {
        if (cancelled || !res.ok) return;
        setPublication(res.data.publications?.[0] ?? null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDrawerOpen(false);
        drawerToggleRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen]);

  async function createStory() {
    if (creating) return;
    setCreating(true);
    setNotice(null);

    let target = publication;
    if (target === null) {
      const listed = await requestJson<{ publications: WorkspacePublication[] }>(
        "/api/publications",
      );
      if (listed.ok) {
        target = listed.data.publications?.[0] ?? null;
        setPublication(target);
      }
    }

    if (target === null) {
      setCreating(false);
      setDrawerOpen(false);
      router.push("/dashboard");
      return;
    }

    const created = await requestJson<{ id: string }>("/api/posts", {
      method: "POST",
      body: JSON.stringify({ publicationId: target.id }),
    });
    setCreating(false);

    if (!created.ok) {
      setNotice("Could not start a new story. Try again from Posts.");
      return;
    }

    setDrawerOpen(false);
    router.push(`/studio/${encodeURIComponent(created.data.id)}`);
  }

  const postsActive =
    activePath === "/dashboard" || activePath === "/studio";

  return (
    <>
      <SquircleClipDef />
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <div className="workspace-shell">
        <header className="workspace-topbar">
          <button
            ref={drawerToggleRef}
            type="button"
            className="workspace-icon-btn"
            aria-expanded={drawerOpen}
            aria-controls="workspace-sidebar"
            aria-label={drawerOpen ? "Close workspace menu" : "Open workspace menu"}
            onClick={() => setDrawerOpen((open) => !open)}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path
                d={drawerOpen ? "M4 4l10 10M14 4L4 14" : "M3 5h12M3 9h12M3 13h12"}
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>

          <Link href="/" className="workspace-topbar-brand" aria-label="Inkwellio home">
            <InkwellioLogo size={20} />
            <span>Inkwellio</span>
          </Link>

          <button
            type="button"
            className="workspace-topbar-new"
            onClick={() => void createStory()}
            disabled={creating}
          >
            {creating ? "Starting..." : "New story"}
          </button>
        </header>

        <div className="workspace-shell-body">
          <aside
            id="workspace-sidebar"
            className="workspace-sidebar"
            data-open={drawerOpen ? "true" : "false"}
            aria-label="Workspace"
          >
            <div className="workspace-sidebar-head">
              <Link href="/" className="workspace-brand" aria-label="Inkwellio home">
                <InkwellioLogo size={22} />
                <span>Inkwellio</span>
              </Link>
              {publication !== null ? (
                <div className="workspace-pub-badge">
                  <span className="workspace-pub-name">{publication.name}</span>
                  <span className="workspace-pub-handle">@{publication.slug}</span>
                </div>
              ) : (
                <div className="workspace-pub-badge">
                  <span className="workspace-pub-name">Your publication</span>
                  <span className="workspace-pub-handle">Not created yet</span>
                </div>
              )}
            </div>

            <nav className="workspace-nav" aria-label="Workspace navigation">
              <ul className="workspace-nav-list">
                {PRIMARY_NAV.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="workspace-nav-link"
                      data-active={postsActive ? "true" : undefined}
                      aria-current={postsActive ? "page" : undefined}
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                className="workspace-new-story"
                onClick={() => void createStory()}
                disabled={creating}
              >
                {creating ? "Starting..." : "New story"}
              </button>

              <ul className="workspace-nav-list">
                <li>
                  <Link
                    href="/settings/privacy"
                    className="workspace-nav-link"
                    data-active={activePath === "/settings/privacy" ? "true" : undefined}
                    aria-current={activePath === "/settings/privacy" ? "page" : undefined}
                  >
                    Settings
                  </Link>
                </li>
              </ul>

              <p className="workspace-nav-label">Public</p>
              <ul className="workspace-nav-list">
                {publication !== null ? (
                  <li>
                    <Link
                      href={`/@${encodeURIComponent(publication.slug)}`}
                      className="workspace-nav-link"
                    >
                      View publication
                    </Link>
                  </li>
                ) : (
                  <li>
                    <span className="workspace-nav-link workspace-nav-link-muted">
                      View publication
                    </span>
                  </li>
                )}
                <li>
                  <Link href="/topics" className="workspace-nav-link">
                    Browse topics
                  </Link>
                </li>
                <li>
                  <Link href="/search" className="workspace-nav-link">
                    Search
                  </Link>
                </li>
              </ul>
            </nav>

            {notice !== null ? (
              <p className="workspace-sidebar-notice" role="alert">
                {notice}
              </p>
            ) : null}

            <footer className="workspace-sidebar-footer">
              <div className="workspace-sidebar-utilities">
                <ThemeToggle />
              </div>
              <SessionNavActions initialSignedIn inWorkspace />
            </footer>
          </aside>

          {drawerOpen ? (
            <button
              type="button"
              className="workspace-drawer-scrim"
              aria-label="Close workspace menu"
              onClick={() => setDrawerOpen(false)}
            />
          ) : null}

          <div className="workspace-canvas">{children}</div>
        </div>
      </div>
    </>
  );
}
