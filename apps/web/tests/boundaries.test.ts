import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cruise, type ICruiseResult } from "dependency-cruiser";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const fixturePrefix = "apps/web/tests/fixtures/boundaries";

type SeamRule = {
  name: string;
  severity: "error";
  comment: string;
  from: { path?: string };
  to: { path?: string; pathNot?: string; circular?: boolean };
};

const require = createRequire(import.meta.url);
const { createSeamRules } = require(
  path.join(repoRoot, "tools", "seam-rules.cjs"),
) as { createSeamRules: (root?: string) => SeamRule[] };
const shippedConfig = require(
  path.join(repoRoot, ".dependency-cruiser.cjs"),
) as { forbidden: SeamRule[] };

/**
 * One failing fixture per rule. The test asserts this map and the shipped
 * rule names are the same set, so a new rule without a fixture fails here.
 */
const failingFixtures: Record<string, string> = {
  "app-only-imports-module-public-api": "bad-app-import",
  "modules-import-only-other-module-public-api": "bad-module-import",
  "kernel-independent-of-modules": "bad-kernel-import",
  "no-circular": "bad-cycle",
};

async function violatedRules(fixture: string): Promise<string[]> {
  const root = `${fixturePrefix}/${fixture}/src`;

  const result = await cruise(
    [root],
    {
      validate: true,
      ruleSet: { forbidden: createSeamRules(root) },
      doNotFollow: { path: "node_modules" },
      exclude: { path: "node_modules" },
      tsPreCompilationDeps: true,
    },
  );

  if (typeof result.output === "string") {
    throw new Error(`Expected a cruise result object, got: ${result.output}`);
  }

  const cruiseResult: ICruiseResult = result.output;

  expect(cruiseResult.modules.length).toBeGreaterThan(0);
  expect(
    cruiseResult.modules.flatMap((module) =>
      module.dependencies
        .filter((dependency) => dependency.couldNotResolve)
        .map((dependency) => `${module.source} -> ${dependency.module}`),
    ),
    "every fixture import must resolve, or the test proves nothing",
  ).toEqual([]);

  return [
    ...new Set(cruiseResult.summary.violations.map((v) => v.rule.name)),
  ].sort();
}

describe("boundary rules", () => {
  it("ships exactly the shared seam rules", () => {
    expect(shippedConfig.forbidden).toEqual(createSeamRules());
  });

  it("has a failing fixture for every shipped rule", () => {
    expect(Object.keys(failingFixtures).sort()).toEqual(
      shippedConfig.forbidden.map((rule) => rule.name).sort(),
    );
  });

  it("accepts valid imports through public entry points", async () => {
    expect(await violatedRules("clean")).toEqual([]);
  });

  for (const [rule, fixture] of Object.entries(failingFixtures)) {
    it(`rejects a ${rule} violation`, async () => {
      expect(await violatedRules(fixture)).toEqual([rule]);
    });
  }
});
