import { readFileSync, statSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * What the browser actually downloads.
 *
 * `pnpm check` builds before it tests (tools/gate.mjs), so a missing build is a
 * failure with an instruction, not a skip. A skipped disclosure test is a
 * disclosure test that cannot fail.
 */

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const staticDir = path.join(repoRoot, "apps", "web", ".next", "static");

type Asset = { file: string; size: number };

async function assets(dir: string): Promise<Asset[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const found: Asset[] = [];

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await assets(full)));
      continue;
    }
    found.push({
      file: path.relative(staticDir, full).split(path.sep).join("/"),
      size: statSync(full).size,
    });
  }
  return found;
}

const assetsExist = (() => {
  try {
    return statSync(staticDir).isDirectory();
  } catch {
    return false;
  }
})();

describe.skipIf(!assetsExist)("production client bundle", () => {
  it("ships no source map", async () => {
    const files = await assets(staticDir);
    expect(files.length).toBeGreaterThan(0);
    expect(
      files.filter((asset) => asset.file.endsWith(".map")).map((asset) => asset.file),
      "productionBrowserSourceMaps must stay false; a source map serves the original TypeScript",
    ).toEqual([]);
  });

  it("contains no connection string, secret or build-machine path", async () => {
    const files = (await assets(staticDir)).filter((asset) =>
      /\.(js|css|json|txt)$/.test(asset.file),
    );
    expect(files.length).toBeGreaterThan(0);

    const patterns: Array<[string, RegExp]> = [
      ["postgres url with credentials", /postgres(ql)?:\/\/[^\s"'`:@/]+:[^\s"'`@/]+@/],
      ["DATABASE_URL assignment", /DATABASE_URL\s*[:=]\s*["'`]postgres/],
      ["Better Auth secret", /BETTER_AUTH_SECRET/],
      ["private key block", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
      ["AWS access key id", /\bAKIA[0-9A-Z]{16}\b/],
      ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{20,}\b/],
      ["this machine's home", /[A-Za-z]:[\\/]Users[\\/]|\/home\/runner\//],
      ["application source path", /\bapps[\\/]web[\\/]src\b/],
    ];

    const findings: string[] = [];
    for (const asset of files) {
      const text = readFileSync(path.join(staticDir, asset.file), "utf8");
      for (const [name, pattern] of patterns) {
        const match = pattern.exec(text);
        if (match !== null) {
          findings.push(`${asset.file}: ${name} -> ${match[0].slice(0, 60)}`);
        }
      }
    }

    expect(findings).toEqual([]);
  });

  it("names no secret-shaped environment variable that the server owns", async () => {
    const serverOnly = [
      "BETTER_AUTH_SECRET",
      "DATABASE_URL",
      "SMTP_PASSWORD",
      "GITHUB_TOKEN",
    ];
    const files = (await assets(staticDir)).filter((asset) => asset.file.endsWith(".js"));

    const findings: string[] = [];
    for (const asset of files) {
      const text = readFileSync(path.join(staticDir, asset.file), "utf8");
      for (const name of serverOnly) {
        if (text.includes(name)) {
          findings.push(`${asset.file}: ${name}`);
        }
      }
    }

    expect(findings).toEqual([]);
  });
});

if (!assetsExist) {
  // A visible failure rather than a silent skip.
  describe("production client bundle", () => {
    it("has a build to inspect", () => {
      throw new Error(
        "apps/web/.next/static is missing. The gate builds before it tests; run `pnpm check`, not `vitest` alone.",
      );
    });
  });
}
