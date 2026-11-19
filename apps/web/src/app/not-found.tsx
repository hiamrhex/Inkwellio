import type { Metadata } from "next";

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
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold">Not found</h1>
      <p className="text-zinc-600 dark:text-zinc-400">
        There is nothing at this address.
      </p>
    </main>
  );
}
