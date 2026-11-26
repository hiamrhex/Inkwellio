import type { Metadata } from "next";
import Link from "next/link";
import { IconTile, SectionHeader } from "@inkwellio/ui";
import { SiteShell } from "@/components/site-shell";
import { LivingHeroArtifact } from "./living-hero-artifact";
import { HeroSculpture } from "./hero-sculpture";
import { MagneticButton } from "./magnetic-button";
import { InteractiveBento } from "./interactive-bento";
import { PostLifeStage } from "./post-life-stage";
import { HeroSilkLoader } from "./hero-silk-loader";
import { CtaDotMatrixLoader } from "./cta-dot-matrix-loader";
import { ScrollChoreography } from "./scroll-choreography";

export const metadata: Metadata = {
  title: "Inkwellio — Publish football. Own it.",
  description:
    "A calm home for match analysis, club history and long-form football culture. Write in Markdown, organise by topics, and publish at your own address.",
};

export default function Home() {
  return (
    <SiteShell isHome>
      <main id="main-content">
        {/* ── Hero ────────────────────────────────────────────────── */}
        <div className="hero-stage-outer">
          <div className="hero-silk-backdrop" aria-hidden="true">
            <div className="hero-silk-fallback" />
          </div>
          <HeroSilkLoader />
          <section
            aria-label="Introduction"
            className="hero-section hero-stage"
            style={{ position: "relative", zIndex: 1 }}
          >
            {/* Left (7/12): copy */}
            <div className="hero-copy">
              <p className="hero-eyebrow">
                <span className="status-dot status-dot-live" aria-hidden="true" />
                <span>Independent football publishing</span>
              </p>

              <h1 className="hero-headline hero-headline-reveal">
                <span className="hero-headline-line">Publish football.</span>{" "}
                <span className="hero-headline-line hero-headline-sweep">Own it.</span>
              </h1>

              <p className="hero-sub">
                A calm home for match analysis, club history and long-form football culture.
              </p>

              <div className="hero-cta-row">
                <MagneticButton href="/sign-up" className="btn-primary">
                  Sign up
                </MagneticButton>
                <a href="#post-life" className="btn-ghost">
                  See how it works
                </a>
              </div>
            </div>

            {/* Right (5/12): 3D monochrome sculpture layered behind living artifact */}
            <div
              className="hero-artifact-wrap"
              style={{
                position: "relative",
                width: "100%",
                display: "flex",
                justifyContent: "center",
              }}
            >
              <HeroSculpture />
              <div
                style={{
                  position: "relative",
                  zIndex: 1,
                  width: "100%",
                  display: "flex",
                  justifyContent: "center",
                }}
              >
                <LivingHeroArtifact />
              </div>
            </div>
          </section>
        </div>

        {/* ── Principles: Bento Feature Matrix ─────────────────────── */}
        <section
          id="essentials"
          className="page-section section-entry below-fold-section"
          aria-labelledby="essentials-heading"
        >
          <SectionHeader
            heading={<span id="essentials-heading" className="ink-reveal-heading">Write. Publish. Keep it yours.</span>}
            body="Inkwellio is built around the work, not the platform. No recommendation algorithm. No engagement score. Just your writing at a web address you control."
          />

          <InteractiveBento />
        </section>

        {/* ── Signature Stage: A post's life ──────────────────────── */}
        <PostLifeStage />

        {/* ── Horizontal Side-Entrance Band: Writer & Reader ─────── */}
        <section
          id="writer-reader"
          className="page-section below-fold-section side-glide-band"
          aria-labelledby="writer-reader-heading"
        >
          <SectionHeader
            eyebrow="Two crafts, one home"
            heading={<span id="writer-reader-heading" className="ink-reveal-heading">Calm to write. Calm to read.</span>}
            body="Every feature exists either to protect the writer at the keyboard or keep the reader immersed in prose."
          />

          <div className="side-glide-grid">
            <article className="side-glide-card side-glide-left spotlight-card bento-specular-card">
              <div className="side-glide-card-head">
                <span className="chip">For the writer</span>
                <span className="side-glide-mono">Markdown · Studio</span>
              </div>
              <h3 className="side-glide-title">Drafts guarded against stale overwrites</h3>
              <p className="side-glide-copy">
                Write in clean Markdown with live word count, assign up to three curated football topics, choose your slug, and publish with version-checked saves so open tabs never collide.
              </p>
              <div className="side-glide-foot">
                <span>JSON export available any time</span>
                <span>0% clutter</span>
              </div>
            </article>

            <article className="side-glide-card side-glide-right spotlight-card bento-specular-card">
              <div className="side-glide-card-head">
                <span className="chip">For the reader</span>
                <span className="side-glide-mono">Newsreader · 65ch</span>
              </div>
              <h3 className="side-glide-title">Archival typography without noise</h3>
              <p className="side-glide-copy">
                Public articles arrive as fast, semantic server HTML with dark obsidian or archival paper surfaces, crisp keyboard focus rings, and zero third-party ad or analytics scripts.
              </p>
              <div className="side-glide-foot">
                <span>/@handle/slug &amp; /topics</span>
                <span>0 trackers</span>
              </div>
            </article>
          </div>
        </section>

        {/* ── Reading Room Showcase ───────────────────────────────── */}
        <section
          id="reading-room"
          className="page-section section-entry below-fold-section"
          aria-labelledby="reading-heading"
          style={{ paddingBottom: 0, position: "relative", zIndex: 2 }}
        >
          <SectionHeader
            align="left"
            eyebrow="Reader mode"
            heading={<span id="reading-heading" className="ink-reveal-heading">The Reading Room</span>}
            body="How your readers experience your writing. No banners, no pop-up overlays, no tracking scripts. Just print-grade typography on archival paper."
          />

          <div
            className="reading-card"
            style={{
              position: "relative",
              overflow: "hidden",
              marginTop: "2rem",
              padding: "clamp(2rem, 5vw, 3.5rem)",
              background: "var(--bg-surface1)",
              border: "1px solid var(--border-hairline)",
              borderRadius: "1.25rem",
              boxShadow: "var(--shadow-card)",
            }}
          >
            <div className="reading-progress-track" aria-hidden="true">
              <div className="reading-progress-fill" />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "1.25rem" }}>
              <span className="status-dot status-dot-live" aria-hidden="true" />
              <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-geist-mono)", color: "var(--text-faint)" }}>
                Sample post — Tactical culture, 6 min read
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
              Sample preview — Match analysis, 65ch reading measure
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
                marginTop: "2.25rem",
                paddingTop: "1.25rem",
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
              <span>Set in Newsreader serif</span>
            </div>
          </div>
        </section>

        {/* ── Scroll-scrubbed gradient curtain transition (280px) ───── */}
        <div className="flip-curtain" aria-hidden="true" />

        {/* ── Rhythm flip: Publishing / Principles ─────────────────── */}
        <section
          id="publishing"
          className="section-flip section-full below-fold-section"
          aria-labelledby="publishing-heading"
        >
          <div
            style={{
              maxWidth: "1200px",
              margin: "0 auto",
              padding: "calc(var(--section-y) * 0.7) clamp(1.25rem, 4vw, 3rem)",
            }}
          >
            <div className="publishing-grid">
              <div>
                <span className="chip flip-chip">For football writers</span>
                <h2
                  id="publishing-heading"
                  className="ink-reveal-heading"
                  style={{
                    fontSize: "clamp(2rem,4vw,3rem)",
                    fontWeight: 600,
                    letterSpacing: "-0.03em",
                    lineHeight: 1.1,
                    color: "var(--flip-text-primary)",
                    margin: "1rem 0 1rem",
                  }}
                >
                  Write the game. Own the link.
                </h2>
                <p
                  style={{
                    fontSize: "1.125rem",
                    fontWeight: 500,
                    lineHeight: 1.5,
                    color: "var(--flip-text-primary)",
                    maxWidth: "44ch",
                    margin: "0 0 0.75rem",
                  }}
                >
                  Your words, your address, nothing else.
                </p>
                <p
                  style={{
                    fontSize: "1.0625rem",
                    lineHeight: 1.65,
                    color: "var(--flip-text-muted)",
                    maxWidth: "44ch",
                    margin: 0,
                  }}
                >
                  Match reports from non-league Saturdays. Long reads about tactics. Club histories that deserve more than a thread. Inkwellio gives each piece of writing a permanent home at a link with your handle in it.
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
                  No tracking scripts. No engagement metrics. No algorithm deciding who reads you. Just honest publishing for people who care about the game.
                </p>
              </div>

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
                    body: "Every writer owns a publication at inkwellio.example/@yourname. Articles resolve permanently at /@handle/slug and /p/@handle/slug.",
                  },
                  {
                    title: "Draft safety & full export",
                    body: "Every draft write checks its version number to stop stale tabs colliding, and you can export all your writing as JSON at any time.",
                  },
                  {
                    title: "Readable anywhere",
                    body: "Public publication and topic pages serve clean server HTML quickly on slow connections and work with keyboard navigation.",
                  },
                ].map((item) => (
                  <li
                    key={item.title}
                    style={{
                      paddingLeft: "1rem",
                      borderLeft: "2px solid var(--flip-border)",
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
          className="closing-section below-fold-section"
          aria-labelledby="closing-heading"
          style={{ position: "relative", overflow: "hidden" }}
        >
          <CtaDotMatrixLoader />

          <div
            style={{
              position: "relative",
              zIndex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "1.5rem",
            }}
          >
            <IconTile size={64}>
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                <path d="M16 6C10.477 6 6 10.477 6 16s4.477 10 10 10 10-4.477 10-10S21.523 6 16 6Z" stroke="currentColor" strokeWidth="1.5" fill="none" />
                <path d="M12 16l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </IconTile>

            <h2
              id="closing-heading"
              className="ink-reveal-heading"
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
                maxWidth: "46ch",
                margin: 0,
              }}
            >
              Write in plain Markdown, organise under football topics, and publish cleanly at your own link.
            </p>

            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", justifyContent: "center" }}>
              <MagneticButton href="/sign-up" className="btn-primary">
                Sign up
              </MagneticButton>
              <Link href="/topics" className="btn-ghost">
                Browse topics
              </Link>
            </div>

            <p
              style={{
                fontSize: "0.75rem",
                color: "var(--text-faint)",
                margin: 0,
              }}
            >
              Version-checked studio drafts, curated topics, and JSON account export are live.
            </p>
          </div>
        </section>
      </main>

      <ScrollChoreography />
    </SiteShell>
  );
}
