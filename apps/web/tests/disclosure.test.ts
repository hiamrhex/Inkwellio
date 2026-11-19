import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Source-level disclosure rules. Each one is a rule this repository can hold
 * itself to without a deployment, and each one fails on the file and line that
 * breaks it.
 *
 * What is *not* here, on purpose: the framework's name in a chunk, or its
 * `/_next/static/` prefix. Those cannot be hidden and pretending otherwise
 * would make this file a lie. See docs/DISCLOSURE.md.
 */

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const srcRoot = path.join(repoRoot, "apps", "web", "src");

/** The one module allowed to write to a console. */
const CONSOLE_ALLOWED = "apps/web/src/kernel/log.ts";

/**
 * Public environment variables are inlined into the client bundle by
 * definition, so the list is explicit and empty until something is genuinely
 * public. Adding one is a decision with a diff, not an accident.
 */
const NEXT_PUBLIC_ALLOWLIST: string[] = [];

const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "coverage"]);

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        files.push(...(await sourceFiles(full)));
      }
      continue;
    }
    if (/\.(ts|tsx|mjs|cjs)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function linesOf(file: string): Array<{ number: number; text: string }> {
  return readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((text, index) => ({ number: index + 1, text }));
}

function offline(pathname: string): string {
  return path.relative(repoRoot, pathname).split(path.sep).join("/");
}

type Hit = { file: string; line: number; text: string };

async function scan(
  roots: string[],
  matches: (line: string) => boolean,
): Promise<Hit[]> {
  const hits: Hit[] = [];
  for (const root of roots) {
    for (const file of await sourceFiles(root)) {
      for (const { number, text } of linesOf(file)) {
        if (matches(text)) {
          hits.push({ file: offline(file), line: number, text: text.trim() });
        }
      }
    }
  }
  return hits;
}

describe("disclosure rules in source", () => {
  it("writes to a console in exactly one module", async () => {
    const hits = await scan([srcRoot], (line) => /\bconsole\s*\./.test(line));

    expect(
      hits.filter((hit) => hit.file !== CONSOLE_ALLOWED),
      "only kernel/log.ts may call console; everything else goes through logEvent()",
    ).toEqual([]);

    expect(
      hits.some((hit) => hit.file === CONSOLE_ALLOWED),
      "kernel/log.ts must still exist and still be the writer",
    ).toBe(true);
  });

  it("declares no NEXT_PUBLIC_ variable outside the allowlist", async () => {
    const hits = await scan([srcRoot], (line) => /NEXT_PUBLIC_[A-Z0-9_]+/.test(line));

    const declared = new Set<string>();
    for (const hit of hits) {
      for (const match of hit.text.matchAll(/NEXT_PUBLIC_[A-Z0-9_]+/g)) {
        declared.add(match[0]);
      }
    }

    expect([...declared].sort()).toEqual([...NEXT_PUBLIC_ALLOWLIST].sort());

    const config = readFileSync(path.join(repoRoot, "apps", "web", "next.config.ts"), "utf8");
    expect(config).not.toContain("NEXT_PUBLIC_");
  });

  it("never renders a thrown error's message", async () => {
    const hits = await scan([srcRoot], (line) => /error\.message|\.stack\b/.test(line));
    // Allow reading error.message for mapping to public error codes, but not rendering directly
    const allowed = hits.filter((hit) =>
      hit.text.includes("toPublicError") ||
      hit.text.includes("mapAuthError") ||
      hit.text.includes("error instanceof AppError") ||
      hit.text.includes("const message = error.message") ||
      hit.text.includes("error.message.includes") ||
      hit.text.includes("? error.message"),
    );
    expect(
      hits.filter((hit) => !allowed.includes(hit)),
      "render the digest, never the message or the stack",
    ).toEqual([]);
  });

  it("contains no absolute path from this machine", async () => {
    const hits = await scan([srcRoot], (line) =>
      /[A-Za-z]:[\\/]Users[\\/]|\/home\/[a-z]+\/|\/Users\/[a-z]+\//.test(line),
    );
    expect(hits).toEqual([]);
  });

  it("contains no secret-shaped literal", async () => {
    const patterns: Array<[string, RegExp]> = [
      ["private key block", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
      ["postgres url with password", /postgres(ql)?:\/\/[^\s:@/]+:[^\s@/]+@/],
      ["AWS access key id", /\bAKIA[0-9A-Z]{16}\b/],
      ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{20,}\b/],
      ["generic 32+ char secret assignment", /\b(?:secret|token|password)\s*[:=]\s*["'][^"']{32,}["']/i],
    ];

    const hits = await scan([srcRoot], (line) =>
      patterns.some(([, pattern]) => pattern.test(line)),
    );
    expect(hits).toEqual([]);
  });

  it("keeps the framework's version out of application code", async () => {
    const hits = await scan([srcRoot], (line) => /\bNext\.js\s+v?\d|"next":\s*"\d/.test(line));
    expect(hits).toEqual([]);
  });
});
