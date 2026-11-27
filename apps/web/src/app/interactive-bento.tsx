import Link from "next/link";
import { IconTile } from "@inkwellio/ui";
import {
  BentoEditorWidget,
  BentoLinkWidget,
  BentoReadingWidget,
  BentoTopicsWidget,
} from "./bento-controls";

export function InteractiveBento() {
  return (
    <div
      className="bento-grid"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(12, 1fr)",
        gap: "1.5rem",
        marginTop: "2.25rem",
        width: "100%",
      }}
    >
      {/* ── Cell 1: Your Own Link (Span 7) ────────────────────────── */}
      <article
        className="spotlight-card bento-specular-card essential-card bento-cell-7 bento-cell-reveal"
        data-spotlight="true"
        aria-labelledby="bento-link-title"
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <IconTile size={40}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M10 3v10M6 9l4-6 4 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M4 15h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </IconTile>
            <span className="essential-num">01 / Your link</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <span className="status-dot status-dot-live" aria-hidden="true" />
            <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-geist-mono)", color: "var(--text-faint)" }}>
              Direct bookmark
            </span>
          </div>
        </div>

        <div>
          <h3 className="essential-title" id="bento-link-title">Publish under your own link</h3>
          <p className="essential-body" style={{ marginTop: "0.5rem" }}>
            Your stories live at a lasting web address. Readers open your page directly, without a feed in between.
          </p>
        </div>

        <BentoLinkWidget domainPrefix="inkwellio.example/@" />
      </article>

      {/* ── Cell 2: Distraction-Free Editor (Span 5) ───────────────── */}
      <article
        className="spotlight-card bento-specular-card essential-card bento-cell-5 bento-cell-reveal"
        data-spotlight="true"
        aria-labelledby="bento-editor-title"
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <IconTile size={40}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M3 14.5L14.5 3L17 5.5L5.5 17L3 17.5L3 14.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" fill="none" />
              </svg>
            </IconTile>
            <span className="essential-num">02 / Studio</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <span className="status-dot status-dot-amber" aria-hidden="true" />
            <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-geist-mono)", color: "var(--text-faint)" }}>
              Safe draft saves
            </span>
          </div>
        </div>

        <div>
          <h3 className="essential-title" id="bento-editor-title">Distraction-free Markdown editor</h3>
          <p className="essential-body" style={{ marginTop: "0.5rem" }}>
            Write in plain Markdown and check how it reads. Open browser tabs never overwrite each other.
          </p>
        </div>

        <BentoEditorWidget />
      </article>

      {/* ── Cell 3: Curated Topics (Real Built Feature — Span 5) ─── */}
      <article
        className="spotlight-card bento-specular-card essential-card bento-cell-5 bento-cell-reveal"
        data-spotlight="true"
        aria-labelledby="bento-topics-title"
      >
        <BentoTopicsWidget
          headerLeft={
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <IconTile size={40}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <rect x="3" y="4" width="14" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M6.5 8.5h7M6.5 11.5h4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </IconTile>
              <span className="essential-num">03 / Topics</span>
            </div>
          }
          description={
            <div>
              <h3 className="essential-title" id="bento-topics-title">Organise by football topics</h3>
              <p className="essential-body" style={{ marginTop: "0.5rem" }}>
                Pick up to three football topics before you publish. Download your full archive as JSON any time.
              </p>
            </div>
          }
          browseLink={
            <Link
              href="/topics"
              className="bento-pill-btn underline"
              style={{
                minHeight: "46px",
                minWidth: "46px",
                padding: "0 0.75rem",
                color: "var(--text-primary)",
              }}
            >
              Browse topics
            </Link>
          }
        />
      </article>

      {/* ── Cell 4: Editorial Reading Comfort (Span 7) ────────────── */}
      <article
        className="spotlight-card bento-specular-card essential-card bento-cell-7 bento-cell-reveal"
        data-spotlight="true"
        aria-labelledby="bento-reading-title"
      >
        <BentoReadingWidget
          headerLeft={
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <IconTile size={40}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M8 7h4M10 7v6M8 13h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </IconTile>
              <span className="essential-num">04 / Reading</span>
            </div>
          }
          headerCopy={
            <div>
              <h3 className="essential-title" id="bento-reading-title">Clean reading with no glare</h3>
              <p className="essential-body" style={{ marginTop: "0.5rem" }}>
                Easy on the eyes for long pieces. Switch typeface or text size to test the page.
              </p>
            </div>
          }
        />
      </article>
    </div>
  );
}
