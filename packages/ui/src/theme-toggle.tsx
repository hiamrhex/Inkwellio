/**
 * ThemeToggle — single 40px button.
 * Shows ☼ sun icon when theme is dark (click → light).
 * Shows ☾ moon icon when theme is light (click → dark).
 *
 * This is a pure server component; click behaviour is handled
 * by /scripts/landing-runtime.js via data-theme-toggle attribute.
 * CSS [:data-theme="dark"] selectors show/hide the correct icon.
 */
export function ThemeToggle() {
  return (
    <button
      type="button"
      data-theme-toggle="true"
      aria-label="Switch theme"
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
        fontSize: "1rem",
        lineHeight: 1,
        padding: 0,
        position: "relative",
      }}
    >
      {/* Sun — shown when dark mode active */}
      <span className="theme-icon-sun" aria-hidden="true" style={{ fontSize: "1.1rem" }}>
        ☼
      </span>
      {/* Moon — shown when light mode active */}
      <span className="theme-icon-moon" aria-hidden="true" style={{ fontSize: "1.1rem" }}>
        ☾
      </span>
    </button>
  );
}
