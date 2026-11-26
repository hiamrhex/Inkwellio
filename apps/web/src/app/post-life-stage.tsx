import { Chip } from "@inkwellio/ui";

/**
 * PostLifeStage — Pure CSS scroll-driven signature stage ("A post's life").
 * Server Component (zero client JS in / bundle): uses @supports (animation-timeline: view())
 * over a <= 200vh sticky track and degrades statically to an ordered 4-panel stack
 * when unsupported or under prefers-reduced-motion: reduce.
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
              How an article moves from draft notes to a permanent address via{" "}
              <code className="post-life-inline-code">/p/@handle/slug</code>.
            </p>
          </header>

          <p className="sr-only">
            Illustration of the publishing flow in four steps: Step 1 writes a draft in monospace with autosave status and word count; Step 2 assigns curated football topics and a URL slug; Step 3 publishes the draft and opens the Newsreader serif article page at inkwellio.example/@handle/city-away-leg; Step 4 places the live post into a three-entry publication feed.
          </p>

          <div className="post-life-layout">
            {/* Step Legend / Progress Rail */}
            <ol className="post-life-steps" aria-label="Post lifecycle stages">
              <li className="post-life-step post-life-step-1">
                <span className="post-life-step-index">01</span>
                <div>
                  <strong>Write draft</strong>
                  <span>Monospace draft saves with word count and amber status dot.</span>
                </div>
              </li>
              <li className="post-life-step post-life-step-2">
                <span className="post-life-step-index">02</span>
                <div>
                  <strong>Choose topics &amp; slug</strong>
                  <span>Assign up to three channels and check the article path.</span>
                </div>
              </li>
              <li className="post-life-step post-life-step-3">
                <span className="post-life-step-index">03</span>
                <div>
                  <strong>Publish</strong>
                  <span>Confirm publish, flip to serif view, and lock the live URL.</span>
                </div>
              </li>
              <li className="post-life-step post-life-step-4">
                <span className="post-life-step-index">04</span>
                <div>
                  <strong>Live publication feed</strong>
                  <span>Settled cleanly at the top of your reader-facing publication.</span>
                </div>
              </li>
            </ol>

            {/* 3D Pinned Visual Stage (responds subtly to fine pointer via data-tilt-stage) */}
            <div className="post-life-stage" data-tilt-stage="true">
              {/* Panel 1 (0–25%): Monospace draft typing */}
              <article className="post-life-panel post-life-panel-1" aria-label="Step 1: Write draft illustration">
                <div className="post-life-card-head">
                  <span className="post-life-badge-row">
                    <span className="status-dot status-dot-amber" aria-hidden="true" />
                    <span>Draft saved</span>
                  </span>
                  <span className="post-life-meta">32 words</span>
                </div>
                <p className="post-life-card-title">Draft: City away leg</p>
                <div className="post-life-draft-lines" aria-hidden="true">
                  <span className="post-life-type-line post-life-type-line-1">
                    In the 64th minute, City inverted their right-back
                  </span>
                  <span className="post-life-type-line post-life-type-line-2">
                    to overload the inside midfield pivot.
                    <span className="blinking-caret post-life-caret" />
                  </span>
                </div>
                <p className="post-life-card-foot">Illustration — Studio Markdown editor</p>
              </article>

              {/* Panel 2 (25–45%): Choose topics & slug 3D stack (real Studio controls, no revisions) */}
              <article className="post-life-panel post-life-panel-2" aria-label="Step 2: Choose topics and slug illustration">
                <div className="post-life-card-head">
                  <span className="post-life-badge-row">
                    <span className="status-dot status-dot-amber" aria-hidden="true" />
                    <span>Ready to publish</span>
                  </span>
                  <span className="post-life-meta">Illustration</span>
                </div>
                <div className="post-life-prep-stack">
                  <div className="post-life-prep-card post-life-prep-1">
                    <span className="post-life-prep-label">Topics (2 / 3)</span>
                    <strong>Tactics, Match Reports</strong>
                  </div>
                  <div className="post-life-prep-card post-life-prep-2">
                    <span className="post-life-prep-label">URL slug</span>
                    <strong>/@handle/city-away-leg</strong>
                  </div>
                  <div className="post-life-prep-card post-life-prep-3">
                    <span className="post-life-prep-label">Reading room preview</span>
                    <strong>65ch archival measure ready</strong>
                  </div>
                </div>
              </article>

              {/* Panel 3 (45–70%): Publish button press + 3D card flip -> green dot + typed link */}
              <article className="post-life-panel post-life-panel-3" aria-label="Step 3: Publish and live link illustration">
                <div className="post-life-flip-wrap">
                  <div className="post-life-flip-inner">
                    <div className="post-life-flip-face post-life-flip-front">
                      <span className="post-life-meta">Final check</span>
                      <p className="post-life-card-title">City away leg</p>
                      <p className="post-life-meta">/@handle/city-away-leg</p>
                      <span className="post-life-publish-pill" aria-hidden="true">
                        Publish post
                      </span>
                    </div>
                    <div className="post-life-flip-face post-life-flip-back">
                      <div className="post-life-card-head">
                        <span className="post-life-badge-row">
                          <span className="status-dot status-dot-live" aria-hidden="true" />
                          <span>Published</span>
                        </span>
                        <span className="post-life-meta">Illustration</span>
                      </div>
                      <p className="post-life-serif-heading">City away leg</p>
                      <p className="post-life-serif-sample">
                        In the 64th minute, City inverted their right-back into the inside channel...
                      </p>
                      <p className="post-life-address-bar" aria-hidden="true">
                        <span className="post-life-address-type">inkwellio.example/@handle/city-away-leg</span>
                      </p>
                    </div>
                  </div>
                </div>
              </article>

              {/* Panel 4 (70–100%): Settles cleanly into 3-card feed */}
              <article className="post-life-panel post-life-panel-4" aria-label="Step 4: Publication feed illustration">
                <div className="post-life-card-head">
                  <span className="post-life-badge-row">
                    <span className="status-dot status-dot-live" aria-hidden="true" />
                    <span>Live feed</span>
                  </span>
                  <span className="post-life-meta">Illustration</span>
                </div>
                <ul className="post-life-feed-list">
                  <li className="post-life-feed-item post-life-feed-lead">
                    <strong>City away leg</strong>
                    <span>/@handle/city-away-leg · Served via /p/@handle/slug</span>
                  </li>
                  <li className="post-life-feed-item">
                    <strong>Placeholder entry: Matchday notebook</strong>
                    <span>/@handle/matchday-notebook</span>
                  </li>
                  <li className="post-life-feed-item">
                    <strong>Placeholder entry: Club history notes</strong>
                    <span>/@handle/club-history-notes</span>
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
