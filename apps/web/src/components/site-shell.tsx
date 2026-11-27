import type { ReactNode } from "react";
import Link from "next/link";
import { InkwellioLogo, MotionToggle, SquircleClipDef, ThemeToggle } from "@inkwellio/ui";
import { SessionNavActions } from "./session-nav-actions";

interface SiteHeaderProps {
  /** When true, anchor links target in-page sections directly (`#essentials`); otherwise prefix `/`. */
  readonly isHome?: boolean;
  /** When true (auth routes), render a distraction-free single bar with brand + theme/motion toggles. */
  readonly minimalHeader?: boolean;
  /** When true (authenticated writer workspace), render Dashboard / Topics / Settings links. */
  readonly workspaceNav?: boolean;
  /** Current workspace path used to mark the active workspace nav link. */
  readonly activePath?: "/dashboard" | "/studio" | "/settings/privacy";
}

const NAV_ITEMS = [
  { label: "Principles", anchor: "#essentials" },
  { label: "Editor", anchor: "#post-life" },
  { label: "Reading", anchor: "#reading-room" },
  { label: "Publishing", anchor: "#publishing" },
] as const;

const WORKSPACE_NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Topics", href: "/topics" },
  { label: "Settings", href: "/settings/privacy" },
] as const;

export function SiteHeader({
  isHome = false,
  minimalHeader = false,
  workspaceNav = false,
  activePath,
}: SiteHeaderProps) {
  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <header
        className={minimalHeader ? "site-header-bar site-header-bar-minimal" : "site-header-bar"}
        aria-label="Main navigation"
      >
        <div
          className={minimalHeader ? "site-header-inner site-header-inner-minimal" : "site-header-inner"}
        >
          <div className="nav-zone-left">
            <Link href="/" className="nav-logo" aria-label="Inkwellio home">
              <InkwellioLogo size={20} />
              <span>Inkwellio</span>
            </Link>
          </div>

          {minimalHeader ? null : workspaceNav ? (
            <nav className="site-nav" aria-label="Workspace navigation">
              <ul className="nav-links">
                {WORKSPACE_NAV_ITEMS.map((item) => {
                  const isActive =
                    activePath === item.href ||
                    (item.href === "/dashboard" && activePath === "/studio");
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        data-active={isActive ? "true" : undefined}
                        aria-current={isActive ? "page" : undefined}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          ) : (
            <nav className="site-nav" aria-label="Primary sections">
              <ul className="nav-links">
                {NAV_ITEMS.map((item) => (
                  <li key={item.anchor}>
                    <Link href={isHome ? item.anchor : `/${item.anchor}`}>
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}

          <div className="nav-zone-right">
            <div className="nav-utilities">
              <ThemeToggle />
              <MotionToggle />
              {minimalHeader ? null : (
                <SessionNavActions
                  initialSignedIn={workspaceNav}
                  inWorkspace={workspaceNav}
                />
              )}
            </div>
          </div>
        </div>
        {isHome ? (
          <div className="site-scroll-progress" aria-hidden="true">
            <div className="site-scroll-progress-bar" />
          </div>
        ) : null}
      </header>

      {workspaceNav && !minimalHeader ? (
        <nav className="workspace-mobile-nav" aria-label="Workspace sections">
          {WORKSPACE_NAV_ITEMS.map((item) => {
            const isActive =
              activePath === item.href ||
              (item.href === "/dashboard" && activePath === "/studio");
            return (
              <Link
                key={item.href}
                href={item.href}
                className="workspace-mobile-link"
                data-active={isActive ? "true" : undefined}
                aria-current={isActive ? "page" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      ) : null}
    </>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <span className="site-footer-brand">
          <InkwellioLogo size={16} />
          <span>Inkwellio — 2026 — Independent football publishing</span>
        </span>
        <nav aria-label="Footer navigation" className="site-footer-links">
          <Link href="/topics" className="site-footer-link">
            Topics
          </Link>
          <Link href="/search" className="site-footer-link">
            Search
          </Link>
          <Link href="/privacy" className="site-footer-link">
            Privacy
          </Link>
          <Link href="/terms" className="site-footer-link">
            Terms
          </Link>
          <button
            type="button"
            data-motion-toggle="true"
            aria-pressed="false"
            className="site-footer-link site-motion-toggle"
          >
            <span className="motion-label-pause">Pause motion</span>
            <span className="motion-label-resume">Motion paused — Resume</span>
          </button>
        </nav>
      </div>
    </footer>
  );
}

export function SiteShell({
  children,
  isHome = false,
  minimalHeader = false,
  workspaceNav = false,
  activePath,
}: {
  readonly children?: ReactNode;
  readonly isHome?: boolean;
  readonly minimalHeader?: boolean;
  readonly workspaceNav?: boolean;
  readonly activePath?: "/dashboard" | "/studio" | "/settings/privacy";
}) {
  return (
    <>
      <SquircleClipDef />
      <SiteHeader
        isHome={isHome}
        minimalHeader={minimalHeader}
        workspaceNav={workspaceNav}
        activePath={activePath}
      />
      {children}
      <SiteFooter />
    </>
  );
}
