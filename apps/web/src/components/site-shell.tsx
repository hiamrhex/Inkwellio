import type { ReactNode } from "react";
import Link from "next/link";
import { SquircleClipDef, ThemeToggle } from "@inkwellio/ui";
import { SessionNavActions } from "./session-nav-actions";

interface SiteHeaderProps {
  /** When true, anchor links target in-page sections directly (`#essentials`); otherwise prefix `/`. */
  readonly isHome?: boolean;
}

const NAV_ITEMS = [
  { label: "Principles", anchor: "#essentials" },
  { label: "Editor", anchor: "#post-life" },
  { label: "Reading", anchor: "#reading-room" },
  { label: "Publishing", anchor: "#publishing" },
] as const;

export function SiteHeader({ isHome = false }: SiteHeaderProps) {
  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <nav className="site-nav" aria-label="Main navigation">
        <Link href="/" prefetch={false} className="nav-logo" aria-label="Inkwellio home">
          Inkwellio
        </Link>

        <ul className="nav-links">
          {NAV_ITEMS.map((item) => (
            <li key={item.anchor}>
              <Link href={isHome ? item.anchor : `/${item.anchor}`} prefetch={false}>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="nav-utilities">
          <ThemeToggle />
          <SessionNavActions />
        </div>
      </nav>
    </>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <span>Inkwellio — 2026 — inkwellio.example</span>
        <nav aria-label="Footer navigation" className="site-footer-links">
          <Link href="/topics" prefetch={false} className="site-footer-link">
            Topics
          </Link>
          <Link href="/search" prefetch={false} className="site-footer-link">
            Search
          </Link>
          <Link href="/privacy" prefetch={false} className="site-footer-link">
            Privacy
          </Link>
          <Link href="/terms" prefetch={false} className="site-footer-link">
            Terms
          </Link>
        </nav>
      </div>
    </footer>
  );
}

export function SiteShell({
  children,
  isHome = false,
}: {
  readonly children: ReactNode;
  readonly isHome?: boolean;
}) {
  return (
    <>
      <SquircleClipDef />
      <SiteHeader isHome={isHome} />
      {children}
      <SiteFooter />
    </>
  );
}
