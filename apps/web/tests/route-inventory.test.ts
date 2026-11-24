import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { authorize, type Actor, type Resource } from "../src/modules/identity";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(testDir, "../src/app");
const fixturesDir = path.resolve(testDir, "fixtures/routes");

export type PolicyLevel = "public" | "authenticated" | "admin";

export interface PolicyCheckResult {
  routeDir: string;
  hasEntry: boolean;
  hasPolicy: boolean;
  policyValue?: string;
  error?: string;
}

/**
 * Scan a directory tree for route folders (folders with page.tsx or route.ts)
 * and verify each has a sibling policy.ts declaring a valid policy level.
 */
export function scanRoutePolicies(baseDir: string): PolicyCheckResult[] {
  const results: PolicyCheckResult[] = [];

  function walk(currentDir: string) {
    const entries = readdirSync(currentDir);
    const hasPage = entries.includes("page.tsx") || entries.includes("page.js");
    const hasRoute = entries.includes("route.ts") || entries.includes("route.js");

    if (hasPage || hasRoute) {
      const policyPath = path.join(currentDir, "policy.ts");
      const hasPolicy = existsSync(policyPath);
      let policyValue: string | undefined;
      let error: string | undefined;

      if (!hasPolicy) {
        error = `Missing sibling policy.ts in ${path.relative(baseDir, currentDir) || "."}`;
      } else {
        const content = readFileSync(policyPath, "utf8");
        const match = content.match(/export\s+const\s+policy\s*=\s*["'](public|authenticated|admin)["']/);
        if (match) {
          policyValue = match[1];
        } else {
          error = `policy.ts in ${path.relative(baseDir, currentDir) || "."} does not export valid policy ('public' | 'authenticated' | 'admin')`;
        }
      }

      results.push({
        routeDir: path.relative(baseDir, currentDir) || ".",
        hasEntry: true,
        hasPolicy,
        policyValue,
        error,
      });
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry);
      if (statSync(fullPath).isDirectory() && !entry.startsWith(".")) {
        walk(fullPath);
      }
    }
  }

  walk(baseDir);
  return results;
}

describe("Gate G3: Route inventory & policy.ts enforcement", () => {
  it("fixture with missing policy.ts fails with explicit error", () => {
    const missingFixture = path.join(fixturesDir, "missing-policy");
    const results = scanRoutePolicies(missingFixture);

    expect(results).toHaveLength(1);
    expect(results[0]?.hasPolicy).toBe(false);
    expect(results[0]?.error).toContain("Missing sibling policy.ts");
  });

  it("fixture with valid sibling policy.ts passes", () => {
    const validFixture = path.join(fixturesDir, "with-policy");
    const results = scanRoutePolicies(validFixture);

    expect(results).toHaveLength(1);
    expect(results[0]?.hasPolicy).toBe(true);
    expect(results[0]?.policyValue).toBe("public");
    expect(results[0]?.error).toBeUndefined();
  });

  it("every route folder under apps/web/src/app has a valid sibling policy.ts", () => {
    const results = scanRoutePolicies(appDir);

    expect(results.length).toBeGreaterThan(0);
    const violations = results.filter((r) => r.error !== undefined);
    expect(violations).toEqual([]);

    for (const r of results) {
      expect(["public", "authenticated", "admin"]).toContain(r.policyValue);
    }
  });

  it("protected handlers and actions reject anonymous callers", () => {
    const anon: Actor = { type: "anonymous" };

    // Exporting or deleting an account must deny anonymous
    const accountExportResource: Resource = { type: "account", action: "export", userId: "user-123" };
    expect(authorize(anon, "export_data", accountExportResource)).toBe(false);

    const accountDeleteResource: Resource = { type: "account", action: "delete", userId: "user-123" };
    expect(authorize(anon, "delete_account", accountDeleteResource)).toBe(false);

    // Publication updates must deny anonymous
    const pubResource: Resource = { type: "publication", id: "pub-1", ownerId: "user-123" };
    expect(authorize(anon, "update_publication", pubResource)).toBe(false);
    expect(authorize(anon, "delete_publication", pubResource)).toBe(false);
  });
});
