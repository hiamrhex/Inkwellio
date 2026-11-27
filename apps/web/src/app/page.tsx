import type { Metadata } from "next";
import Link from "next/link";
import { IconTile, SectionHeader } from "@inkwellio/ui";
import { SiteShell } from "@/components/site-shell";
import { AmbientOrbs } from "@/components/ambient-orbs";
import { LivingHeroArtifact } from "./living-hero-artifact";
import { MagneticButton } from "./magnetic-button";
import { InteractiveBento } from "./interactive-bento";
import { PostLifeStage } from "./post-life-stage";
import { TopicMarquee } from "./topic-marquee";
import { HeroRibbonMedia } from "./hero-ribbon-media";
import { HeroRibbonLoader } from "./hero-ribbon-loader";
import { CtaDotMatrixLoader } from "./cta-dot-matrix-loader";
import { ScrollChoreography } from "./scroll-choreography";

export const metadata: Metadata = {
  title: "Inkwellio — Publish football. Own it.",
  description:
    "A calm home for match analysis, club history and long-form football culture. Write in Markdown, organise by topics, and publish at your own address.",
};

const CAPABILITIES = [
  {
    title: "Plain Markdown",
    body: "Write cleanly with a live word count and simple formatting.",
    icon: "M4 6h12M4 10h8M4 14h10",
  },
  {
    title: "Safe drafts",
    body: "Open browser tabs never overwrite each other when saving.",
    icon: "M5 10l3 3 7-7",
  },
  {
    title: "Football topics",
    body: "Pick up to three topics so readers can find your work.",
    icon: "M4 6h5v5H4zM11 6h5v5h-5zM4 13h5v5H4z",
  },
  {
    title: "Full export",
    body: "Download all your posts and profile data as JSON any time.",
    icon: "M10 3v9M6 8l4 4 4-4M4 15h12",
  },
] as const;

export default function Home() {
  return (
    <SiteShell isHome>
      <main id="main-content">
        {/* ── Hero ────────────────────────────────────────────────── */}
        <div className="hero-stage-outer">
          <AmbientOrbs />
          <div className="hero-cursor-spotlight" aria-hidden="true" />
          <div className="hero-silk-backdrop" aria-hidden="true">
            <div className="hero-silk-fallback" />
            <HeroRibbonMedia />
          </div>
          <HeroRibbonLoader />
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

              <h1 className="hero-headline">
                <span className="hero-headline-line hero-headline-sweep">Publish football.</span>{" "}
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

            {/* Right (5/12): thick edge-lit living editor framed by flowing ink ribbons */}
            <div className="hero-artifact-wrap">
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
            body="Your writing comes first. No feed algorithms or scoreboards. Just clear words at your own web address."
          />

          <InteractiveBento />
        </section>

        {/* ── Curated Topics Marquee Strip ────────────────────────── */}
        <TopicMarquee />

        {/* ── Signature Stage: A post's life (300vh Horizontal Glide) ── */}
        <PostLifeStage />

        {/* ── Borderless 4-Column Capability Strip ─────────────────── */}
        <section
          id="capabilities"
          className="page-section below-fold-section capability-band"
          aria-labelledby="capabilities-heading"
        >
          <h2 id="capabilities-heading" className="sr-only">
            Core capabilities
          </h2>
          <ul className="capability-grid">
            {CAPABILITIES.map((cap) => (
              <li key={cap.title} className="capability-item">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="none"
                  aria-hidden="true"
                  className="capability-icon"
                >
                  <path
                    d={cap.icon}
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <h3 className="capability-title">{cap.title}</h3>
                <p className="capability-body">{cap.body}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* ── Horizontal Side-Entrance Band: Writer & Reader ─────── */}
        <section
          id="writer-reader"
          className="page-section below-fold-section side-glide-band"
          aria-labelledby="writer-reader-heading"
        >
          <SectionHeader
            eyebrow="Writer and reader"
            heading={<span id="writer-reader-heading" className="ink-reveal-heading">Calm to write. Calm to read.</span>}
            body="Simple tools to write your story. A clean page for your readers."
          />

          <div className="side-glide-grid">
            <article
              className="side-glide-card side-glide-left spotlight-card bento-specular-card"
              data-spotlight="true"
            >
              <div className="side-glide-card-head">
                <span className="chip">Clean editor</span>
                <span className="side-glide-mono">For writers</span>
              </div>
              <h3 className="side-glide-title">Focus on the story</h3>
              <p className="side-glide-copy">
                Write in a quiet space with a live word count. Pick your topics, set your link, and your drafts are saved as you go.
              </p>
              <div className="side-glide-foot">
                <span>Safe auto-save</span>
                <span>Download your work</span>
              </div>
            </article>

            <article
              className="side-glide-card side-glide-right spotlight-card bento-specular-card"
              data-spotlight="true"
            >
              <div className="side-glide-card-head">
                <span className="chip">Easy to read</span>
                <span className="side-glide-mono">For readers</span>
              </div>
              <h3 className="side-glide-title">Just the story, nothing else</h3>
              <p className="side-glide-copy">
                Pick dark or light mode and read without distractions. No ads, no pop-ups, and no trackers watching your readers.
              </p>
              <div className="side-glide-foot">
                <span>Dark or light mode</span>
                <span>No ads or trackers</span>
              </div>
            </article>
          </div>
        </section>

        {/* ── Reading Room Showcase (Melted Into Open Canvas) ─────── */}
        <section
          id="reading-room"
          className="page-section section-entry below-fold-section"
          aria-labelledby="reading-heading"
          style={{ position: "relative", zIndex: 2 }}
        >
          <SectionHeader
            align="left"
            eyebrow="Reader mode"
            heading={<span id="reading-heading" className="ink-reveal-heading">The Reading Room</span>}
            body="This is how your readers see your work. No banners, pop-ups, or trackers. Just clear words on a calm page."
          />

          <div className="reading-card reading-card-melted spotlight-card bento-specular-card" data-spotlight="true">
            <div className="reading-progress-track" aria-hidden="true">
              <div className="reading-progress-fill" />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "1.25rem" }}>
              <span className="status-dot status-dot-live" aria-hidden="true" />
              <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-geist-mono)", color: "var(--text-faint)" }}>
                Sample post — Match analysis, 6 min read
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
              Sample preview — Comfortable reading width
            </p>

            <div className="editorial-reading">
              <p style={{ margin: "0 0 1.25rem" }}>
                In the 64th minute, City tucked their right-back inside. That move forced the opposition winger to guard both the flank and the inside lane.
              </p>
              <p style={{ margin: 0 }}>
                Good football writing needs space to show why a match turned. Inkwellio gives readers clear words with no noisy feeds.
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
              <span>Newsreader serif</span>
            </div>
          </div>
        </section>

        {/* ── Publishing Showcase (Continuous Tonal World) ──────── */}
        <section
          id="publishing"
          className="page-section publishing-showcase below-fold-section"
          aria-labelledby="publishing-heading"
          style={{ position: "relative" }}
        >
          <AmbientOrbs />
          <div className="publishing-grid" style={{ position: "relative", zIndex: 1 }}>
            <div>
              <span className="chip">For football writers</span>
              <h2
                id="publishing-heading"
                className="ink-reveal-heading publishing-display-heading"
              >
                Write the game. Own the link.
              </h2>
              <p className="publishing-lead">
                Your words, your address, nothing else.
              </p>
              <p className="publishing-body">
                Saturday match reports. Deep looks at tactics. Club histories that deserve real space. Every story lives at a lasting link with your name in it.
              </p>
              <p className="publishing-body" style={{ marginTop: "1rem" }}>
                No tracking scripts. No engagement scores. No feed deciding who reads you. Just honest publishing for football writers.
              </p>
            </div>

            <ul className="publishing-points">
              {[
                {
                  title: "Your link",
                  body: "Your page lives at inkwellio.example/@yourname. Every article keeps a lasting /@handle/slug and /p/@handle/slug link.",
                },
                {
                  title: "Safe drafts and export",
                  body: "Open tabs never overwrite saved work. Export all your posts as JSON any time.",
                },
                {
                  title: "Easy to read anywhere",
                  body: "Pages load fast on slow phone links and work with a keyboard.",
                },
              ].map((item) => (
                <li key={item.title} className="publishing-point">
                  <strong className="publishing-point-title">{item.title}</strong>
                  <span className="publishing-point-body">{item.body}</span>
                </li>
              ))}
            </ul>
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
              A calm home for serious football writing.
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
              Write in plain Markdown, pick your topics, and publish at your own link.
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
              Safe drafts, football topics, and full JSON export are ready today.
            </p>
          </div>
        </section>
      </main>

      <ScrollChoreography />
    </SiteShell>
  );
}
