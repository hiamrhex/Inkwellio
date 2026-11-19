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
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <main style={{ maxWidth: "32rem", padding: "1.5rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.5rem" }}>Something went wrong</h1>
          <p>The site could not be loaded. Please try again in a moment.</p>
          {typeof error.digest === "string" && error.digest !== "" ? (
            <p style={{ fontFamily: "monospace", fontSize: "0.875rem" }}>
              Reference: <span>{error.digest}</span>
            </p>
          ) : null}
          <button type="button" onClick={reset}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
