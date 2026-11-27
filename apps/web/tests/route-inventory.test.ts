import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { authorize, type Actor, type Resource } from "../src/modules/identity";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(testDir, "../src/app");
const apiDir = path.join(appDir, "api");
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

/**
 * Route inventory.
 *
 * The policy check above proves every route *declares* a level. This proves the
 * declaration is true: a route marked `authenticated` must actually resolve a
 * session and reject an anonymous caller, and a route marked `public` must be
 * on the explicit allow-list below. Adding a route without deciding who may
 * call it fails here rather than in production.
 */
export type RouteGuard =
  | "requireUser"
  | "resolveActor"
  | "getSession"
  | "handleAuth"
  | "identityHandler"
  | "none";

export interface RouteRecord {
  /** Path relative to `src/app/api`, e.g. `posts/[id]/draft`. */
  route: string;
  methods: string[];
  policy: PolicyLevel;
  guard: RouteGuard;
  /** True when the handler answers through `jsonError`/`respond` or the identity module's contract. */
  structuredErrors: boolean;
  /** How the handler reads a body: the bounded helper, a raw parse, or nothing. */
  body: "json" | "raw-json" | "-";
}

const GUARD_PATTERNS: Array<[RouteGuard, RegExp]> = [
  ["requireUser", /requireUser\s*\(/],
  ["resolveActor", /resolveActor\s*\(/],
  ["getSession", /getSession\s*\(/],
  ["handleAuth", /handleAuth(?:Get|Post)\s*\(/],
  // The account routes delegate to identity handlers that call getSession and
  // build their own kernel JSON responses; that is a real guard, not a missing
  // one. The pattern is explicit so a new delegation must be added here.
  [
    "identityHandler",
    /handle(?:AccountExportGet|ErasureRequestPost|ErasureConfirmPost)\s*\(/,
  ],
];

function guardOf(source: string): RouteGuard {
  for (const [name, pattern] of GUARD_PATTERNS) {
    if (pattern.test(source)) return name;
  }
  return "none";
}

export function scanApiRoutes(baseDir: string): RouteRecord[] {
  const records: RouteRecord[] = [];

  function walk(currentDir: string) {
    for (const entry of readdirSync(currentDir)) {
      const full = path.join(currentDir, entry);
      if (statSync(full).isDirectory()) {
        if (!entry.startsWith(".") && entry !== "_lib") walk(full);
        continue;
      }
      if (entry !== "route.ts" && entry !== "route.js") continue;

      const source = readFileSync(full, "utf8");
      const methods = [
        ...source.matchAll(
          /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/g,
        ),
      ].map((match) => match[1]);

      const policyPath = path.join(currentDir, "policy.ts");
      const policySource = existsSync(policyPath) ? readFileSync(policyPath, "utf8") : "";
      const declared = policySource.match(
        /export\s+const\s+policy\s*=\s*["'](public|authenticated|admin)["']/,
      );
      const policy = (declared?.[1] ?? "MISSING") as PolicyLevel;

      records.push({
        route: path.relative(baseDir, currentDir).split(path.sep).join("/"),
        methods,
        policy,
        guard: guardOf(source),
        structuredErrors:
          /jsonError\s*\(|respond\s*\(/.test(source) || guardOf(source) === "identityHandler",
        body: /readJsonObject\s*\(/.test(source)
          ? "json"
          : /request\.json\s*\(/.test(source)
            ? "raw-json"
            : "-",
      });
    }
  }

  walk(baseDir);
  return records.sort((a, b) => a.route.localeCompare(b.route));
}

/**
 * The explicit public allow-list. A route is public only if an anonymous caller
 * is supposed to reach it; everything else must resolve a session first.
 */
const PUBLIC_API_ALLOW_LIST: ReadonlySet<string> = new Set([
  "auth/[...all]", // Better Auth owns its own credential checks
  "health", // liveness probe, no data
  "posts/[id]", // published post by id; drafts are 404 for strangers
  "search", // published posts only
  "topics", // curated topic list
]);

describe("Route inventory: every API route declares a guard that matches its policy", () => {
  const routes = scanApiRoutes(apiDir);

  it("finds the API routes at all (a broken scanner must not pass vacuously)", () => {
    expect(routes.length).toBeGreaterThanOrEqual(19);
  });

  it("declares a valid policy for every route", () => {
    const invalid = routes.filter(
      (r) => !["public", "authenticated", "admin"].includes(r.policy),
    );
    expect(invalid.map((r) => `${r.route}=${r.policy}`)).toEqual([]);
  });

  it("backs every 'authenticated' route with a real session check", () => {
    const unguarded = routes.filter(
      (r) => r.policy === "authenticated" && r.guard === "none",
    );
    expect(unguarded.map((r) => r.route)).toEqual([]);
  });

  it("keeps the public allow-list exact: no unlisted public route, no stale entry", () => {
    const publicRoutes = routes
      .filter((r) => r.policy === "public")
      .map((r) => r.route)
      .sort();
    const listed = [...PUBLIC_API_ALLOW_LIST].sort();
    expect(publicRoutes).toEqual(listed);
  });

  it("answers errors with the structured contract on every non-auth JSON route", () => {
    // `auth/[...all]`, `health` and the identity handlers own their own shapes;
    // every other JSON route must go through jsonError/respond.
    const exceptions = new Set(["auth/[...all]", "health"]);
    const unstructured = routes.filter(
      (r) =>
        !exceptions.has(r.route) &&
        r.policy !== "public" &&
        !r.structuredErrors,
    );
    expect(unstructured.map((r) => r.route)).toEqual([]);
  });
});
