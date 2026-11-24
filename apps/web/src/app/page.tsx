import type { Metadata } from "next";
import { Chip, IconTile, SectionHeader, SquircleClipDef, ThemeToggle } from "@inkwellio/ui";
import { LivingHeroArtifact } from "./living-hero-artifact";
import { MagneticButton } from "./magnetic-button";
import { InteractiveBento } from "./interactive-bento";

export const metadata: Metadata = {
  title: "Inkwellio — independent football writing at your own link",
  description:
    "A quiet home for match analysis, club history, and long-form football culture. Write at your own address. No sign-up required to read.",
};

export default function Home() {
  return (
    <>
      {/* SVG defs for squircle clip path — render once */}
      <SquircleClipDef />

      {/* ── Navigation ──────────────────────────────────────────── */}
      <nav className="site-nav" aria-label="Main navigation">
        <a href="/" className="nav-logo" aria-label="Inkwellio home">
          Inkwellio
        </a>
        <ul className="nav-links">
          <li>
            <a href="#essentials">Principles</a>
          </li>
          <li>
            <a href="#editor-preview">Editor</a>
          </li>
          <li>
            <a href="#reading-room">Reading</a>
          </li>
          <li>
            <a href="#publishing">Publishing</a>
          </li>
        </ul>
        <ThemeToggle />
      </nav>

      {/* ── Scroll progress rail ─────────────────────────────────── */}
      <div className="progress-rail" aria-hidden="true" role="presentation">
        <div className="progress-rail-fill" />
      </div>

      {/* ── Hero ────────────────────────────────────────────────── */}
      <section
        aria-label="Introduction"
        className="hero-section hero-stage"
        style={{ position: "relative" }}
      >
        {/* Left: copy */}
        <div className="hero-copy">
          <p className="hero-eyebrow">
            <span className="status-dot status-dot-live" aria-hidden="true" />
            <span>Public preview &middot; opening soon</span>
          </p>

          <h1 className="hero-headline">
            Independent football writing, at your own link.
          </h1>

          <p className="hero-sub">
            A quiet home for match analysis, club history, and long-form
            football culture. Your work. Your address.
          </p>

          <div className="hero-cta-row">
            <MagneticButton href="#editor-preview" className="btn-primary">
              See the planned editor
            </MagneticButton>
            <a href="#essentials" className="btn-ghost">
              Read the story
            </a>
          </div>

          <p className="hero-notice">
            Public preview. Sign-up opens soon.
          </p>
        </div>

        {/* Right: living focal centerpiece */}
        <div className="hero-artifact-wrap" style={{ width: "100%", display: "flex", justifyContent: "center" }}>
          <LivingHeroArtifact />
        </div>
      </section>

      {/* ── Essentials: Bento Feature Matrix ─────────────────────── */}
      <section
        id="essentials"
        className="section-entry"
        aria-labelledby="essentials-heading"
        style={{
          paddingTop: "clamp(5rem,10vw,9rem)",
          paddingBottom: "clamp(5rem,10vw,9rem)",
          maxWidth: "1200px",
          margin: "0 auto",
          width: "100%",
          paddingLeft: "clamp(1.25rem,4vw,3rem)",
          paddingRight: "clamp(1.25rem,4vw,3rem)",
        }}
      >
        <SectionHeader
          eyebrow="Core Architecture"
          heading={<span id="essentials-heading">Write. Publish. Keep it yours.</span>}
          body="Inkwellio is built around the work, not the platform. No recommendation algorithm. No engagement score. Just your writing at a web address you control."
        />

        <InteractiveBento />
      </section>

      {/* ── Editor preview ──────────────────────────────────────── */}
      <section
        id="editor-preview"
        className="section-entry"
        aria-labelledby="editor-heading"
        style={{
          paddingTop: "clamp(5rem,10vw,9rem)",
          paddingBottom: "clamp(5rem,10vw,9rem)",
          maxWidth: "1200px",
          margin: "0 auto",
          width: "100%",
          paddingLeft: "clamp(1.25rem,4vw,3rem)",
          paddingRight: "clamp(1.25rem,4vw,3rem)",
        }}
      >
        <SectionHeader
          align="left"
          heading={<span id="editor-heading">The planned editor</span>}
          body="A draft view of what the writing environment will look like. No finished product yet — this is an honest preview."
        />

        {/* Editor shell */}
        <div
          className="editor-preview-wrap"
          role="img"
          aria-label="Preview of the planned editor interface showing a draft list and writing area"
        >
          {/* Sidebar */}
          <aside className="editor-sidebar">
            <input
              className="editor-search"
              type="search"
              placeholder="Search drafts&hellip;"
              readOnly
              aria-label="Search drafts (read-only preview)"
            />
            <ul className="draft-list" aria-label="Draft list">
              <li>
                <div className="draft-item" aria-current="true">
                  <span className="draft-avatar" aria-hidden="true">A</span>
                  <span className="draft-name">City away leg</span>
                </div>
              </li>
              <li>
                <div className="draft-item">
                  <span className="draft-avatar" aria-hidden="true">B</span>
                  <span className="draft-name">Pressing shapes</span>
                </div>
              </li>
              <li>
                <div className="draft-item">
                  <span className="draft-avatar" aria-hidden="true">C</span>
                  <span className="draft-name">The long goodbye</span>
                </div>
              </li>
              <li>
                <div className="draft-item">
                  <span className="draft-avatar" aria-hidden="true">D</span>
                  <span className="draft-name">Cup final notes</span>
                </div>
              </li>
            </ul>
          </aside>

          {/* Main writing area */}
          <div className="editor-main">
            <p className="editor-doc-title" aria-label="Document title preview">
              City away leg
            </p>
            <div className="editor-doc-body" aria-hidden="true">
              <div className="editor-line" style={{ width: "90%" }} />
              <div className="editor-line" style={{ width: "75%" }} />
              <div className="editor-line" style={{ width: "85%" }} />
              <div className="editor-line" style={{ width: "60%" }} />
              <div className="editor-line" style={{ width: "80%" }} />
              <div className="editor-line" style={{ width: "70%" }} />
              <div className="editor-line" style={{ width: "55%" }} />
            </div>
            <p className="editor-label">
              Preview of the planned editor &mdash; not a finished product
            </p>
          </div>
        </div>
      </section>

      {/* ── Reading Room Showcase ─────────────────────────────────── */}
      <section
        id="reading-room"
        className="section-entry"
        aria-labelledby="reading-heading"
        style={{
          paddingTop: "clamp(5rem,10vw,9rem)",
          paddingBottom: "clamp(5rem,10vw,9rem)",
          maxWidth: "1200px",
          margin: "0 auto",
          width: "100%",
          paddingLeft: "clamp(1.25rem,4vw,3rem)",
          paddingRight: "clamp(1.25rem,4vw,3rem)",
        }}
      >
        <SectionHeader
          align="left"
          eyebrow="Reader Mode"
          heading={<span id="reading-heading">The Reading Room</span>}
          body="How your readers experience your writing. No banners, no pop-up overlays, no tracking scripts. Just print-grade typography on archival paper."
        />

        <div
          className="reading-card"
          style={{
            marginTop: "3rem",
            padding: "clamp(2rem, 5vw, 4rem)",
            background: "var(--bg-surface1)",
            border: "1px solid var(--border-hairline)",
            borderRadius: "1.25rem",
            boxShadow: "var(--shadow-card)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.5rem" }}>
            <span className="status-dot status-dot-live" aria-hidden="true" />
            <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-geist-mono)", color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Sample &middot; Tactical Culture &middot; 6 min read
            </span>
          </div>

          <h3
            style={{
              fontFamily: "var(--font-editorial)",
              fontSize: "clamp(1.75rem, 4vw, 2.75rem)",
              fontWeight: 600,
              letterSpacing: "-0.025em",
              lineHeight: 1.15,
              color: "var(--text-primary)",
              margin: "0 0 1rem",
            }}
          >
            Inverted Fullbacks &amp; The Quiet Death of The Touchline Winger
          </h3>

          <p
            style={{
              fontSize: "0.875rem",
              color: "var(--text-muted)",
              marginBottom: "2rem",
              fontFamily: "var(--font-geist-mono)",
            }}
          >
            Sample preview &middot; Match analysis &middot; 65ch reading measure
          </p>

          <div className="editorial-reading">
            <p style={{ margin: "0 0 1.25rem" }}>
              In the 64th minute, City inverted their right-back into the inside channel. It was a subtle structural adjustment, yet it instantly disrupted the defensive block, forcing the opposition winger to choose between tracking the overlapping runner or defending the interior passing lane.
            </p>
            <p style={{ margin: 0 }}>
              Football writing deserves the space to examine these tactical nuances in full. When you publish on Inkwellio, your readers enjoy clean typography calibrated specifically for long-form focus—free from algorithmic distractions.
            </p>
          </div>

          <div
            style={{
              marginTop: "2.5rem",
              paddingTop: "1.5rem",
              borderTop: "1px solid var(--border-hairline)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "1rem",
              fontSize: "0.75rem",
              fontFamily: "var(--font-geist-mono)",
              color: "var(--text-faint)",
            }}
          >
            <span>inkwellio.example/@sample/inverted-fullbacks</span>
            <span>Printed in Newsreader variable serif</span>
          </div>
        </div>
      </section>

      {/* ── Rhythm flip: Publishing / Principles ─────────────────── */}
      <section
        id="publishing"
        className="section-flip section-full section-entry"
        aria-labelledby="publishing-heading"
      >
        <div
          style={{
            maxWidth: "1200px",
            margin: "0 auto",
            padding: "clamp(5rem,10vw,9rem) clamp(1.25rem,4vw,3rem)",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "clamp(2rem,5vw,5rem)",
              alignItems: "center",
            }}
          >
            <div>
              <Chip>For football writers</Chip>
              <h2
                id="publishing-heading"
                style={{
                  fontSize: "clamp(2rem,4vw,3rem)",
                  fontWeight: 600,
                  letterSpacing: "-0.03em",
                  lineHeight: 1.1,
                  color: "var(--flip-text-primary)",
                  margin: "1rem 0 1.25rem",
                }}
              >
                Your words, your address, nothing else.
              </h2>
              <p
                style={{
                  fontSize: "1.0625rem",
                  lineHeight: 1.65,
                  color: "var(--flip-text-muted)",
                  maxWidth: "44ch",
                  margin: 0,
                }}
              >
                Match reports from non-league Saturdays. Long reads about
                tactics. Club histories that deserve more than a thread.
                Inkwellio gives each piece of writing a permanent home at a
                link with your name in it.
              </p>
              <p
                style={{
                  fontSize: "1.0625rem",
                  lineHeight: 1.65,
                  color: "var(--flip-text-muted)",
                  maxWidth: "44ch",
                  margin: "1rem 0 0",
                }}
              >
                No tracking scripts. No engagement metrics. No algorithm
                deciding who reads you. Just honest publishing for people
                who care about the game.
              </p>
            </div>

            {/* Right: principle list */}
            <ul
              style={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                display: "flex",
                flexDirection: "column",
                gap: "1.5rem",
              }}
            >
              {[
                {
                  title: "Your link",
                  body: "Every writer gets an address at inkwellio.example/@yourname. Readers bookmark you, not the platform.",
                },
                {
                  title: "Honest only",
                  body: "No invented numbers. No fake testimonials. The site will tell you exactly what exists and what is still being built.",
                },
                {
                  title: "Readable anywhere",
                  body: "Pages load quickly on a slow connection and work without JavaScript. Accessibility is not an afterthought.",
                },
              ].map((item) => (
                <li
                  key={item.title}
                  style={{
                    paddingLeft: "1rem",
                    borderLeft: `2px solid var(--flip-border)`,
                  }}
                >
                  <strong
                    style={{
                      display: "block",
                      fontSize: "0.9375rem",
                      fontWeight: 600,
                      color: "var(--flip-text-primary)",
                      marginBottom: "0.25rem",
                    }}
                  >
                    {item.title}
                  </strong>
                  <span
                    style={{
                      fontSize: "0.9375rem",
                      lineHeight: 1.6,
                      color: "var(--flip-text-muted)",
                    }}
                  >
                    {item.body}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── Closing ─────────────────────────────────────────────── */}
      <section
        className="closing-section section-entry"
        aria-labelledby="closing-heading"
      >
        <IconTile size={64}>
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <path d="M16 6C10.477 6 6 10.477 6 16s4.477 10 10 10 10-4.477 10-10S21.523 6 16 6Z" stroke="currentColor" strokeWidth="1.5" fill="none" />
            <path d="M12 16l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </IconTile>

        <h2
          id="closing-heading"
          style={{
            fontSize: "clamp(1.75rem,3.5vw,2.5rem)",
            fontWeight: 600,
            letterSpacing: "-0.03em",
            color: "var(--text-primary)",
            margin: 0,
            maxWidth: "24ch",
          }}
        >
          A calm platform for serious football writing.
        </h2>

        <p
          style={{
            fontSize: "1.0625rem",
            lineHeight: 1.65,
            color: "var(--text-muted)",
            maxWidth: "44ch",
            margin: 0,
          }}
        >
          We are building it carefully and honestly. Sign-up will open when
          the editor is ready for real use.
        </p>

        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", justifyContent: "center" }}>
          <MagneticButton href="#editor-preview" className="btn-primary">
            See the planned editor
          </MagneticButton>
        </div>

        <p
          style={{
            fontSize: "0.75rem",
            color: "var(--text-faint)",
          }}
        >
          Public preview. No sign-up yet.
        </p>
      </section>

      {/* ── Footer ──────────────────────────────────────────────── */}
      <footer className="site-footer">
        Inkwellio &middot; 2026 &middot; inkwellio.example
      </footer>

      {/* Layer 3 runtime — passive pointer island + theme toggle */}
      <script src="/scripts/landing-runtime.js" defer />
    </>
  );
}
