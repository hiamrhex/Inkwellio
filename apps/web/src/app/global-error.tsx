"use client";

/**
 * The last boundary: a failure in the root layout itself. It replaces the whole
 * document, so it carries its own `<html>` and `<body>`.
 *
 * Same rule as `app/error.tsx` — the digest is shown, nothing else is.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "var(--bg, var(--bg-canvas, #0d0d0c))",
          color: "var(--fg, var(--text-primary, #e8e6e0))",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <main style={{ maxWidth: "32rem", padding: "1.5rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 500, margin: "0 0 0.75rem" }}>
            Something went wrong
          </h1>
          <p
            style={{
              margin: "0 0 1rem",
              color: "var(--text-muted, #9e9d97)",
              lineHeight: 1.6,
            }}
          >
            The site could not be loaded. Please try again in a moment.
          </p>
          {typeof error.digest === "string" && error.digest !== "" ? (
            <p
              style={{
                fontFamily: "monospace",
                fontSize: "0.875rem",
                color: "var(--text-faint, #8a8882)",
                margin: "0 0 1.25rem",
              }}
            >
              Reference: <span>{error.digest}</span>
            </p>
          ) : null}
          <div
            style={{
              display: "flex",
              gap: "0.75rem",
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={reset}
              style={{
                padding: "0.5rem 1rem",
                borderRadius: "0.25rem",
                border: "none",
                backgroundColor: "var(--btn-primary-bg, #e8e6e0)",
                color: "var(--btn-primary-text, #0d0d0c)",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{
                padding: "0.5rem 1rem",
                borderRadius: "0.25rem",
                border: "1px solid var(--border, var(--border-hairline, #2a2a26))",
                color: "var(--fg, var(--text-primary, #e8e6e0))",
                textDecoration: "none",
                fontWeight: 500,
              }}
            >
              Return home
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
