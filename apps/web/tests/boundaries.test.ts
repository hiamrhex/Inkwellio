import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const depcruiseBin = path.join(
  repoRoot,
  "node_modules",
  "dependency-cruiser",
  "bin",
  "dependency-cruiser.mjs",
);
const fixtureDir = path.join(
  repoRoot,
  "apps",
  "web",
  "tests",
  "fixtures",
  "boundaries",
);

describe("boundary rules", () => {
  it("rejects an app import that bypasses a module's index.ts", () => {
    expect(existsSync(depcruiseBin)).toBe(true);

    const result = spawnSync(
      process.execPath,
      [
        depcruiseBin,
        fixtureDir,
        "--config",
        path.join(repoRoot, ".dependency-cruiser.fixture.cjs"),
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );

    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;

    expect(result.status).not.toBe(0);
    expect(output).toContain("app-only-imports-module-public-api");
  });
});
