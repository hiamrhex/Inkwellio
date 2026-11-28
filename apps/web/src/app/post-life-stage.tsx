import { Chip } from "@inkwellio/ui";

const STAGE_DOTS = [
  "Write draft",
  "Choose topics and link",
  "Publish story",
  "Live publication page",
] as const;

/**
 * PostLifeStage — Pure Server Component horizontal scroll-driven signature stage ("A post's life").
 * Desktop (>= 768px) uses a 360vh pinned runway with 4 dwell plateaus across >= 1,100px horizontal
 * travel, clickable step dots, and active center focus (scale 1 + emerald highlight vs 0.94 neighbours).
 * Stacks statically below 768px, under reduced motion, or when paused.
 */
export function PostLifeStage() {
  return (
    <section
      id="post-life"
      className="post-life-section page-section"
      aria-labelledby="post-life-heading"
    >
      <div className="post-life-track">
        <div className="post-life-sticky">
          <header className="post-life-header">
            <Chip>Illustration</Chip>
            <h2 id="post-life-heading" className="post-life-title ink-reveal-heading">
              A post&apos;s life
            </h2>
            <p className="post-life-sub">
              Follow a post from quick draft notes to your permanent{" "}
              <code className="post-life-inline-code">/p/@handle/slug</code> link.
            </p>
          </header>

          <p className="sr-only">
            Four horizontal steps of a post: Step 1 writes a Markdown draft with a live word count and autosave; Step 2 picks up to three topics and sets your link; Step 3 publishes in Newsreader serif view at @handle/city-away-leg; Step 4 places the story on your reader page.
          </p>

          <ol className="post-life-steps" aria-label="Post lifecycle stages">
            <li className="post-life-step post-life-step-1" data-stage-active="true">
              <span className="post-life-step-index">01</span>
              <div>
                <strong>Write draft</strong>
                <span>Write cleanly with a live word count and autosave.</span>
              </div>
            </li>
            <li className="post-life-step post-life-step-2">
              <span className="post-life-step-index">02</span>
              <div>
                <strong>Choose topics &amp; slug</strong>
                <span>Pick up to three topics and set your link.</span>
              </div>
            </li>
            <li className="post-life-step post-life-step-3">
              <span className="post-life-step-index">03</span>
              <div>
                <strong>Publish</strong>
                <span>Switch to serif reading view and go live.</span>
              </div>
            </li>
            <li className="post-life-step post-life-step-4">
              <span className="post-life-step-index">04</span>
              <div>
                <strong>Live /p/@handle/slug link</strong>
                <span>Opens right on your publication page.</span>
              </div>
            </li>
          </ol>

          <div className="post-life-viewport">
            <div className="post-life-reel" data-tilt-stage="true">
              {/* Card 1: Write draft */}
              <article
                className="post-life-panel post-life-panel-1 spotlight-card bento-specular-card"
                data-spotlight="true"
                data-post-life-panel="0"
                data-stage-active="true"
                tabIndex={0}
                aria-label="Step 1: Write draft illustration"
              >
                <div className="post-life-card-head">
                  <span className="post-life-badge-row">
                    <span className="status-dot status-dot-amber" aria-hidden="true" />
                    <span>01 · Draft saved · v3</span>
                  </span>
                  <span className="post-life-meta">218 words · 2 min</span>
                </div>
                <p className="post-life-card-title">Draft: City away leg — 64th-minute switch</p>
                <div className="post-life-draft-lines" aria-hidden="true">
                  <span className="post-life-type-line post-life-type-line-1">
                    ## Fullback tucking inside late
                  </span>
                  <span className="post-life-type-line post-life-type-line-2">
                    In the 64th minute, City tucked their right-back inside.
                    <span className="blinking-caret post-life-caret" />
                  </span>
                </div>
                <p className="post-life-card-foot">Illustration — Studio Markdown editor</p>
              </article>

              {/* Card 2: Choose topics & slug */}
              <article
                className="post-life-panel post-life-panel-2 spotlight-card bento-specular-card"
                data-spotlight="true"
                data-post-life-panel="1"
                tabIndex={0}
                aria-label="Step 2: Choose topics and slug illustration"
              >
                <div className="post-life-card-head">
                  <span className="post-life-badge-row">
                    <span className="status-dot status-dot-amber" aria-hidden="true" />
                    <span>02 · Ready to publish</span>
                  </span>
                  <span className="post-life-meta">Illustration</span>
                </div>
                <div className="post-life-prep-stack">
                  <div className="post-life-prep-card">
                    <span className="post-life-prep-label">Topics (2 / 3)</span>
                    <strong>Tactics, Match Reports</strong>
                  </div>
                  <div className="post-life-prep-card">
                    <span className="post-life-prep-label">Permanent link</span>
                    <strong>/@handle/city-away-leg</strong>
                  </div>
                  <div className="post-life-prep-card">
                    <span className="post-life-prep-label">Reading width</span>
                    <strong>65ch Newsreader serif</strong>
                  </div>
                </div>
                <p className="post-life-card-foot">Football topics and clean link checks</p>
              </article>

              {/* Card 3: Publish */}
              <article
                className="post-life-panel post-life-panel-3 spotlight-card bento-specular-card"
                data-spotlight="true"
                data-post-life-panel="2"
                tabIndex={0}
                aria-label="Step 3: Publish and live link illustration"
              >
                <div className="post-life-flip-wrap">
                  <div className="post-life-flip-inner">
                    <div className="post-life-flip-face post-life-flip-front">
                      <span className="post-life-meta">03 · Ready to publish · v3</span>
                      <p className="post-life-card-title">City away leg — How the inside run broke the press</p>
                      <p className="post-life-meta">/@handle/city-away-leg · 2 topics</p>
                      <span className="post-life-publish-pill" aria-hidden="true">
                        Publish post
                      </span>
                    </div>
                    <div className="post-life-flip-face post-life-flip-back">
                      <div className="post-life-card-head">
                        <span className="post-life-badge-row">
                          <span className="status-dot status-dot-live" aria-hidden="true" />
                          <span>03 · Published</span>
                        </span>
                        <span className="post-life-meta">Newsreader serif</span>
                      </div>
                      <p className="post-life-serif-heading">City away leg — How the inside run broke the press</p>
                      <p className="post-life-serif-sample">
                        In the 64th minute, City tucked their right-back inside, forcing the winger inward...
                      </p>
                      <p className="post-life-address-bar" aria-hidden="true">
                        <span className="post-life-address-type">@handle/city-away-leg</span>
                      </p>
                    </div>
                  </div>
                </div>
              </article>

              {/* Card 4: Live /p/@handle/slug link */}
              <article
                className="post-life-panel post-life-panel-4 spotlight-card bento-specular-card"
                data-spotlight="true"
                data-post-life-panel="3"
                tabIndex={0}
                aria-label="Step 4: Live publication feed illustration"
              >
                <div className="post-life-card-head">
                  <span className="post-life-badge-row">
                    <span className="status-dot status-dot-live" aria-hidden="true" />
                    <span>04 · Live feed</span>
                  </span>
                  <span className="post-life-meta">Illustration</span>
                </div>
                <ul className="post-life-feed-list">
                  <li className="post-life-feed-item post-life-feed-lead">
                    <strong>City away leg — Second-half change</strong>
                    <span>/p/@handle/city-away-leg · 6 min read</span>
                  </li>
                  <li className="post-life-feed-item">
                    <strong>Placeholder entry: Matchday notebook</strong>
                    <span>/p/@handle/matchday-notebook · 4 min</span>
                  </li>
                  <li className="post-life-feed-item">
                    <strong>Placeholder entry: Club history notes</strong>
                    <span>/p/@handle/club-history-notes · 7 min</span>
                  </li>
                </ul>
              </article>
            </div>
          </div>

          <div className="post-life-dots" role="group" aria-label="Jump to stage">
            {STAGE_DOTS.map((label, idx) => (
              <button
                key={label}
                type="button"
                className="post-life-dot"
                data-post-life-dot={idx}
                aria-pressed={idx === 0 ? "true" : "false"}
                aria-label={`Stage ${idx + 1}: ${label}`}
                title={`Stage ${idx + 1}: ${label}`}
              >
                <span className="post-life-dot-pip" aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
