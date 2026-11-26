import Link from "next/link";
import { SEED_TOPICS } from "@/modules/topics";

/**
 * TopicMarquee — Pure CSS zero-JS continuous marquee of curated football channels.
 * Pauses on hover/focus-within and freezes cleanly under prefers-reduced-motion or
 * [data-motion="paused"]. Links directly to public topic directories.
 */
export function TopicMarquee() {
  return (
    <section
      aria-label="Curated football topics"
      className="topic-marquee-band below-fold-section"
    >
      <div className="topic-marquee-viewport">
        <div className="topic-marquee-track">
          <ul className="topic-marquee-list">
            {SEED_TOPICS.map((topic) => (
              <li key={topic.slug} className="topic-marquee-item">
                <Link href={`/topics/${topic.slug}`} className="topic-marquee-link">
                  <span className="status-dot status-dot-live" aria-hidden="true" />
                  <span>{topic.name}</span>
                </Link>
              </li>
            ))}
          </ul>

          <ul className="topic-marquee-list" aria-hidden="true">
            {SEED_TOPICS.map((topic) => (
              <li key={`dup-${topic.slug}`} className="topic-marquee-item">
                <Link
                  href={`/topics/${topic.slug}`}
                  tabIndex={-1}
                  className="topic-marquee-link"
                >
                  <span className="status-dot status-dot-live" aria-hidden="true" />
                  <span>{topic.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
