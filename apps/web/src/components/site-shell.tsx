import type { ReactNode } from "react";
import Link from "next/link";
import { SquircleClipDef, ThemeToggle } from "@inkwellio/ui";
import { SessionNavActions } from "./session-nav-actions";

interface SiteHeaderProps {
  /** When true, anchor links target in-page sections directly (`#essentials`); otherwise prefix `/`. */
  readonly isHome?: boolean;
  /** When true (auth routes), render a distraction-free single bar with brand + theme toggle only. */
  readonly minimalHeader?: boolean;
}

const NAV_ITEMS = [
  { label: "Principles", anchor: "#essentials" },
  { label: "Editor", anchor: "#post-life" },
  { label: "Reading", anchor: "#reading-room" },
  { label: "Publishing", anchor: "#publishing" },
] as const;

export function SiteHeader({ isHome = false, minimalHeader = false }: SiteHeaderProps) {
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
              <span className="status-dot status-dot-live" aria-hidden="true" />
              <span>Inkwellio</span>
            </Link>
          </div>

          {minimalHeader ? null : (
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
              {minimalHeader ? null : <SessionNavActions />}
            </div>
          </div>
        </div>
      </header>
    </>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <span>Inkwellio — 2026 — inkwellio.example</span>
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
}: {
  readonly children: ReactNode;
  readonly isHome?: boolean;
  readonly minimalHeader?: boolean;
}) {
  return (
    <>
      <SquircleClipDef />
      <SiteHeader isHome={isHome} minimalHeader={minimalHeader} />
      {children}
      <SiteFooter />
    </>
  );
}
