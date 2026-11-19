import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Inkwellio",
  description: "A writing platform for independent publications.",
};

/**
 * A placeholder, deliberately. The product pages arrive in later work packages;
 * what matters here is that the home page does not ship the framework's starter
 * template — a logo, a "deployed on" mark and a version banner are three ways to
 * announce the stack without being asked (docs/DISCLOSURE.md).
 */
export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Inkwellio</h1>
      <p className="max-w-md text-zinc-600 dark:text-zinc-400">
        A writing platform for independent publications. The site is being
        built; there is nothing to read here yet.
      </p>
    </main>
  );
}
