import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The ops runner must be safe before it touches a database:
 *
 *   - no `DATABASE_URL_UNPOOLED` -> fail closed, say so, print no URL;
 *   - a pooled Neon host (`-pooler`) -> reject before `drizzle-kit` runs.
 *
 * Both are proven by spawning the real script, not by importing its helpers,
 * so the exit code and the bytes written to the console are what Richard sees.
 */

const script = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../scripts/migrate-and-verify.mjs",
);

function run(overrides: Record<string, string | undefined>) {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.DATABASE_URL_UNPOOLED;
  delete env.HEALTH_URL;
  delete env.SKIP_HEALTH;
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete env[key];
    } else {
      env[key] = value;
    }
  }

  return spawnSync(process.execPath, [script], {
    env,
    encoding: "utf8",
    timeout: 30_000,
  });
}

function outputOf(result: ReturnType<typeof run>): string {
  return `${result.stdout ?? ""}${result.stderr ?? ""}`;
}

describe("migrate-and-verify runner", () => {
  it("fails closed when DATABASE_URL_UNPOOLED is missing, without echoing a URL", () => {
    const result = run({});
    const output = outputOf(result);

    expect(result.status).not.toBe(0);
    expect(output).toContain("DATABASE_URL_UNPOOLED is not set");
    expect(output).not.toContain("postgresql://");
    expect(output).not.toContain("applying migrations");
  });

  it("rejects a pooled Neon URL before starting drizzle-kit, without leaking the secret", () => {
    const sentinel = "SENTINEL_DO_NOT_PRINT_4f8a2c";
    const pooled = `postgresql://runner:${sentinel}@ep-example-pooler.us-east-1.aws.neon.tech/inkwellio`;

    const result = run({ DATABASE_URL_UNPOOLED: pooled });
    const output = outputOf(result);

    expect(result.status).not.toBe(0);
    expect(output).toContain("-pooler");
    expect(output).toContain("direct Neon endpoint");
    expect(output).not.toContain(sentinel);
    expect(output).not.toContain("applying migrations");
    expect(output).not.toContain("migrations applied successfully");
  });
});
