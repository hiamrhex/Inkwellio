import type { Metadata } from "next";
import Link from "next/link";
import { Chip } from "@inkwellio/ui";
import { SiteShell } from "@/components/site-shell";

export const metadata: Metadata = {
  title: "Privacy Policy — Inkwellio",
  description: "How Inkwellio stores writer and publication data, retention windows, export, and deletion.",
};

export default function PrivacyPage() {
  return (
    <SiteShell>
      <main id="main-content" className="legal-main">
        <article className="legal-article" aria-labelledby="privacy-heading">
          <header className="legal-header">
            <div className="legal-status-row">
              <Chip>Draft, pending review</Chip>
              <span className="legal-note-tag">Not legal advice</span>
            </div>
            <h1 id="privacy-heading" className="legal-title">
              Privacy Policy
            </h1>
            <p className="legal-lead">
              This draft summarises how Inkwellio currently handles writer accounts, sessions, published articles, data exports, and permanent deletion. Formal controller details are pending legal review prior to public launch.
            </p>
          </header>

          <section className="legal-section">
            <h2>1. What data we collect and why</h2>
            <p>
              Inkwellio collects only the data required to run accounts, drafts, and publications:
            </p>
            <ul>
              <li>
                <strong>Account &amp; authentication data:</strong> your display name, email address, verification status, password hash (when registering with email/password), and active session records protected with{" "}
                <code>HttpOnly</code> and <code>SameSite=Lax</code> cookies.
              </li>
              <li>
                <strong>Publication &amp; writing data:</strong> your publication handle and description, post titles, Markdown content, URL slugs, curated football topic assignments, and publication timestamps.
              </li>
              <li>
                <strong>Transactional emails:</strong> we use transactional SMTP solely for email verification links, 15-minute password reset links, and 15-minute account erasure confirmations.
              </li>
            </ul>
          </section>

          <section className="legal-section">
            <h2>2. Zero advertising or third-party trackers</h2>
            <p>
              Public pages and reading routes include zero third-party analytics, behavioural profiling, pixel trackers, or advertising scripts.
            </p>
          </section>

          <section className="legal-section">
            <h2>3. Retention schedules</h2>
            <ul>
              <li>
                <strong>Sessions:</strong> short-lived session records default to a 1-hour expiry window and are revoked immediately on password reset or sign-out.
              </li>
              <li>
                <strong>Security &amp; abuse protection:</strong> authentication and write rate-limit counters expire after 24 hours; security audit logs are retained for 90 days.
              </li>
              <li>
                <strong>Infrastructure &amp; backups:</strong> server runtime logs rotate after approximately 1 hour, cached public reads invalidate within 1 hour, and underlying database point-in-time recovery (PITR) snapshots roll off within 7 days.
              </li>
            </ul>
          </section>

          <section className="legal-section">
            <h2>4. Export &amp; permanent deletion</h2>
            <p>
              Signed-in writers can request a full machine-readable JSON export of their profile, publication, and articles at any time (capped at 25 MB per export), or trigger permanent account deletion confirmed within 15 minutes. Confirming erasure permanently deletes your user record, active sessions, publications, and posts from the live database.
            </p>
          </section>

          <nav className="legal-footer-nav" aria-label="Related legal and public pages">
            <Link href="/terms" className="btn-ghost">
              Read Terms of Service
            </Link>
            <Link href="/" className="btn-ghost">
              Back to Inkwellio
            </Link>
          </nav>
        </article>
      </main>
    </SiteShell>
  );
}
