import { Chip } from "@inkwellio/ui";

/**
 * PostLifeStage — Zero-client-JS horizontal scroll-driven signature stage ("A post's life").
 * Uses a generous 300vh desktop sticky runway gliding 4 editorial cards right-to-left
 * via CSS scroll-driven animation / passive scroll var with overflow-x: clip.
 * Stacks statically in order on < 768px, prefers-reduced-motion: reduce, or [data-motion="paused"].
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
              Follow an article from first Markdown draft notes to a permanent publication address via{" "}
              <code className="post-life-inline-code">/p/@handle/slug</code>.
            </p>
          </header>

          <p className="sr-only">
            Illustration of the publishing flow in four horizontal steps: Step 1 writes a Markdown draft with version-checked save indicator and live word count; Step 2 assigns up to three curated football topics and sets a clean slug; Step 3 publishes the draft into Newsreader serif reading mode at inkwellio.example/@handle/city-away-leg; Step 4 places the live post into the reader-facing publication feed.
          </p>

          <ol className="post-life-steps" aria-label="Post lifecycle stages">
            <li className="post-life-step post-life-step-1">
              <span className="post-life-step-index">01</span>
              <div>
                <strong>Write draft</strong>
                <span>Monospace draft saves with version check.</span>
              </div>
            </li>
            <li className="post-life-step post-life-step-2">
              <span className="post-life-step-index">02</span>
              <div>
                <strong>Choose topics &amp; slug</strong>
                <span>Up to three channels and clean path.</span>
              </div>
            </li>
            <li className="post-life-step post-life-step-3">
              <span className="post-life-step-index">03</span>
              <div>
                <strong>Publish</strong>
                <span>Lock live link and switch to serif view.</span>
              </div>
            </li>
            <li className="post-life-step post-life-step-4">
              <span className="post-life-step-index">04</span>
              <div>
                <strong>Live /p/@handle/slug link</strong>
                <span>Instant public reading feed entry.</span>
              </div>
            </li>
          </ol>

          <div className="post-life-viewport">
            <div className="post-life-reel" data-tilt-stage="true">
              {/* Card 1: Write draft */}
              <article
                className="post-life-panel post-life-panel-1 spotlight-card bento-specular-card"
                data-spotlight="true"
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
                    ## Half-space overloads on the far wing
                  </span>
                  <span className="post-life-type-line post-life-type-line-2">
                    In the 64th minute, City inverted their right-back into the inside lane.
                    <span className="blinking-caret post-life-caret" />
                  </span>
                </div>
                <p className="post-life-card-foot">Illustration — Studio Markdown editor</p>
              </article>

              {/* Card 2: Choose topics & slug */}
              <article
                className="post-life-panel post-life-panel-2 spotlight-card bento-specular-card"
                data-spotlight="true"
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
                    <span className="post-life-prep-label">Permanent slug</span>
                    <strong>/@handle/city-away-leg</strong>
                  </div>
                  <div className="post-life-prep-card">
                    <span className="post-life-prep-label">Reading measure</span>
                    <strong>65ch Newsreader serif</strong>
                  </div>
                </div>
                <p className="post-life-card-foot">Real topic channels &amp; slug validation</p>
              </article>

              {/* Card 3: Publish */}
              <article
                className="post-life-panel post-life-panel-3 spotlight-card bento-specular-card"
                data-spotlight="true"
                aria-label="Step 3: Publish and live link illustration"
              >
                <div className="post-life-flip-wrap">
                  <div className="post-life-flip-inner">
                    <div className="post-life-flip-face post-life-flip-front">
                      <span className="post-life-meta">03 · Publish confirmation · v3</span>
                      <p className="post-life-card-title">City away leg — How the inside pivot broke the press</p>
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
                      <p className="post-life-serif-heading">City away leg — How the inside pivot broke the press</p>
                      <p className="post-life-serif-sample">
                        In the 64th minute, City inverted their right-back into the inside channel, forcing the touchline winger to track inward...
                      </p>
                      <p className="post-life-address-bar" aria-hidden="true">
                        <span className="post-life-address-type">inkwellio.example/@handle/city-away-leg</span>
                      </p>
                    </div>
                  </div>
                </div>
              </article>

              {/* Card 4: Live /p/@handle/slug link */}
              <article
                className="post-life-panel post-life-panel-4 spotlight-card bento-specular-card"
                data-spotlight="true"
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
                    <strong>City away leg — Inside pivot analysis</strong>
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
        </div>
      </div>
    </section>
  );
}
