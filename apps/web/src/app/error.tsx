"use client";

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
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="text-zinc-600 dark:text-zinc-400">
        The page could not be loaded. Nothing you wrote was lost.
      </p>
      {typeof error.digest === "string" && error.digest !== "" ? (
        <p className="font-mono text-sm text-zinc-500">
          Reference: <span>{error.digest}</span>
        </p>
      ) : null}
      <button
        type="button"
        onClick={reset}
        className="rounded border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
      >
        Try again
      </button>
    </main>
  );
}
