"use client";

import Link from "next/link";

/**
 * The route error boundary.
 *
 * In production Next.js replaces a Server Component error's message with a
 * generic one and passes `error.digest` instead. This page renders the digest
 * and nothing else: no message, no stack, no cause. The same digest is in the
 * server log, which is how the two halves are joined.
 *
 * See docs/DISCLOSURE.md rows 3 and 4.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main
      className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-16 text-center"
      style={{
        backgroundColor: "var(--bg, var(--bg-canvas))",
        color: "var(--fg, var(--text-primary))",
      }}
    >
      <h1 className="font-serif text-2xl font-medium tracking-tight">
        Something went wrong
      </h1>
      <p
        className="max-w-md text-sm leading-relaxed"
        style={{ color: "var(--text-muted, var(--fg, currentColor))" }}
      >
        The page could not be loaded. Nothing you wrote was lost.
      </p>
      {typeof error.digest === "string" && error.digest !== "" ? (
        <p
          className="font-mono text-xs"
          style={{ color: "var(--text-faint, var(--text-muted, currentColor))" }}
        >
          Reference: <span>{error.digest}</span>
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
        <button
          type="button"
          onClick={reset}
          className="rounded px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90"
          style={{
            backgroundColor: "var(--btn-primary-bg, var(--fg, currentColor))",
            color: "var(--btn-primary-text, var(--bg, #0d0d0c))",
          }}
        >
          Try again
        </button>
        <Link
          href="/"
          prefetch={false}
          className="rounded border px-4 py-2 text-sm font-medium transition-opacity hover:opacity-80"
          style={{
            borderColor: "var(--border, var(--border-hairline))",
            color: "var(--fg, var(--text-primary))",
          }}
        >
          Return home
        </Link>
      </div>
    </main>
  );
}
