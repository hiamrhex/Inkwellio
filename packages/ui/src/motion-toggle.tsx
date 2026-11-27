/**
 * MotionToggle — quiet 40px (min 44x44px hit box) header icon button mirroring ThemeToggle.
 * Allows keyboard/mouse users early in the DOM to pause all ambient, pointer, and scroll motion
 * or opt back in (`Motion paused — Resume`) when OS prefers-reduced-motion is enabled.
 */
export function MotionToggle() {
  return (
    <button
      type="button"
      data-motion-toggle="true"
      aria-pressed="false"
      aria-label="Pause motion"
      title="Pause motion"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 40,
        height: 40,
        minWidth: 44,
        minHeight: 44,
        borderRadius: "9999px",
        border: "1px solid var(--border-hairline)",
        background: "transparent",
        cursor: "pointer",
        color: "var(--text-muted)",
        lineHeight: 1,
        padding: 0,
        position: "relative",
      }}
    >
      {/* Active state: pause icon -> clicking pauses motion */}
      <svg
        className="motion-icon-pause"
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        aria-hidden="true"
      >
        <rect x="3" y="2.5" width="2.2" height="9" rx="0.7" fill="currentColor" />
        <rect x="8.8" y="2.5" width="2.2" height="9" rx="0.7" fill="currentColor" />
      </svg>
      {/* Paused state: play icon -> clicking resumes motion */}
      <svg
        className="motion-icon-resume"
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        aria-hidden="true"
      >
        <path d="M4 2.5L11.5 7L4 11.5V2.5Z" fill="currentColor" />
      </svg>
    </button>
  );
}
