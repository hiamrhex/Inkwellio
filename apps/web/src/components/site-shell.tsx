import type { ReactNode } from "react";
import Link from "next/link";
import { InkwellioLogo, SquircleClipDef, ThemeToggle } from "@inkwellio/ui";
import { SessionNavActions } from "./session-nav-actions";

type ReaderPath = "/topics" | "/search";

interface SiteHeaderProps {
  /** When true, the centre zone renders the in-page marketing anchors for `/`. */
  readonly isHome?: boolean;
  /** When true (auth routes), render a distraction-free single bar with brand + theme toggle. */
  readonly minimalHeader?: boolean;
  /** Current reader path used to mark Topics / Search as active. */
  readonly activePath?: ReaderPath;
}

/**
 * Marketing anchors. These are the only navigation links allowed on `/`;
 * they never render on reader, legal, auth or workspace routes.
 */
const HOME_ANCHORS = [
  { label: "Principles", anchor: "#essentials" },
  { label: "Editor", anchor: "#post-life" },
  { label: "Reading", anchor: "#reading-room" },
  { label: "Publishing", anchor: "#publishing" },
] as const;

/** Reader centre zone: two real destinations with an active underline. */
const READER_NAV = [
  { label: "Topics", href: "/topics" },
  { label: "Search", href: "/search" },
] as const;

export function SiteHeader({ isHome = false, minimalHeader = false, activePath }: SiteHeaderProps) {
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

          {minimalHeader ? null : isHome ? (
            <nav className="site-nav" aria-label="Primary sections">
              <ul className="nav-links">
                {HOME_ANCHORS.map((item) => (
                  <li key={item.anchor}>
                    <Link href={item.anchor}>{item.label}</Link>
                  </li>
                ))}
              </ul>
            </nav>
          ) : (
            <nav className="site-nav" aria-label="Reader sections">
              <ul className="nav-links">
                {READER_NAV.map((item) => {
                  const isActive = activePath === item.href;
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
          )}

          <div className="nav-zone-right">
            <div className="nav-utilities">
              <ThemeToggle />
              {minimalHeader ? null : <SessionNavActions />}
            </div>
          </div>
        </div>
        {isHome ? (
          <div className="site-scroll-progress" aria-hidden="true">
            <div className="site-scroll-progress-bar" />
          </div>
        ) : null}
      </header>
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
            aria-label="Pause motion"
            title="Pause motion"
            suppressHydrationWarning
            className="site-footer-link site-motion-toggle"
          >
            <span className="motion-label-pause">Pause motion</span>
            <span className="motion-label-resume">Resume motion</span>
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
  activePath,
}: {
  readonly children?: ReactNode;
  readonly isHome?: boolean;
  readonly minimalHeader?: boolean;
  readonly activePath?: ReaderPath;
}) {
  return (
    <>
      <SquircleClipDef />
      <SiteHeader isHome={isHome} minimalHeader={minimalHeader} activePath={activePath} />
      {children}
      <SiteFooter />
    </>
  );
}
