import type { Metadata } from "next";
import Link from "next/link";
import { Chip } from "@inkwellio/ui";
import { SiteShell } from "@/components/site-shell";

export const metadata: Metadata = {
  title: "Terms of Service — Inkwellio",
  description: "Draft terms governing writing, content ownership, and reading on Inkwellio.",
};

export default function TermsPage() {
  return (
    <SiteShell>
      <main id="main-content" className="legal-main">
        <article className="legal-article" aria-labelledby="terms-heading">
          <header className="legal-header">
            <div className="legal-status-row">
              <Chip>Draft, pending review</Chip>
              <span className="legal-note-tag">Not legal advice</span>
            </div>
            <h1 id="terms-heading" className="legal-title">
              Terms of Service
            </h1>
            <p className="legal-lead">
              These draft terms describe how Inkwellio operates for writers and readers during pre-launch development. They are provided for review clarity and are not legal advice.
            </p>
          </header>

          <section className="legal-section">
            <h2>1. Eligibility</h2>
            <p>
              Inkwellio writer accounts are intended for individuals aged 18 and over. You must provide an accurate email address you control and verify it before accessing publishing tools.
            </p>
          </section>

          <section className="legal-section">
            <h2>2. Your writing remains yours</h2>
            <p>
              You retain copyright and editorial ownership in everything you write on Inkwellio. When you choose to publish a post, you grant Inkwellio a non-exclusive licence solely to store, render, index, and display that work at your publication address (<code>/@handle/slug</code> and <code>/p/@handle/slug</code>), in topic directories, and in site search until you unpublish it or delete your account.
            </p>
          </section>

          <section className="legal-section">
            <h2>3. Acceptable use</h2>
            <p>
              Do not publish unlawful content, impersonate other writers or clubs misleadingly, bypass rate limits, scrape or probe private endpoints, or disrupt service availability. Accounts that breach these rules may have sessions revoked or content removed.
            </p>
          </section>

          <section className="legal-section">
            <h2>4. Portability &amp; leaving Inkwellio</h2>
            <p>
              You may export your account data and posts in JSON format at any time without lock-in, and you may permanently delete your account using the verified erasure flow.
            </p>
          </section>

          <nav className="legal-footer-nav" aria-label="Related legal and public pages">
            <Link href="/privacy" className="btn-ghost">
              Read Privacy Policy
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
