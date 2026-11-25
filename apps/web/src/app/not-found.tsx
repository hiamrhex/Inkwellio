import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Not found",
};

/**
 * A 404 says what happened and nothing else — not whether a publication, a
 * post or a person exists, and not which lookup failed. That restraint is a
 * privacy control (docs/DISCLOSURE.md), and it is also the reason this page has
 * no search box: a search box on a 404 page answers "does this exist?".
 */
export default function NotFound() {
  return (
    <main
      className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-16 text-center"
      style={{
        backgroundColor: "var(--bg, var(--bg-canvas))",
        color: "var(--fg, var(--text-primary))",
      }}
    >
      <h1 className="font-serif text-2xl font-medium tracking-tight">
        Not found
      </h1>
      <p
        className="max-w-md text-sm leading-relaxed"
        style={{ color: "var(--text-muted, var(--fg, currentColor))" }}
      >
        There is nothing at this address.
      </p>
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
    </main>
  );
}
