import { describe, expect, it } from "vitest";
import { SEED_TOPICS } from "../src/modules/topics";
import {
  resolveSeedDatabaseUrl,
  runSeedTopics,
  sanitizeErrorMessage,
} from "../scripts/seed-topics";

describe("WP8: Idempotent topic seed runner (scripts/seed-topics.ts)", () => {
  it("prefers DATABASE_URL_UNPOOLED over DATABASE_URL", () => {
    const url = resolveSeedDatabaseUrl({
      DATABASE_URL_UNPOOLED: "postgres://user:unpooled_secret@ep-1.neon.tech/inkwellio",
      DATABASE_URL: "postgres://user:pooled_secret@ep-1-pooler.neon.tech/inkwellio",
    });

    expect(url).toBe("postgres://user:unpooled_secret@ep-1.neon.tech/inkwellio");
  });

  it("falls back to DATABASE_URL when DATABASE_URL_UNPOOLED is unset or blank", () => {
    const url = resolveSeedDatabaseUrl({
      DATABASE_URL_UNPOOLED: "   ",
      DATABASE_URL: "postgresql://user:pooled_secret@localhost:5432/inkwellio",
    });

    expect(url).toBe("postgresql://user:pooled_secret@localhost:5432/inkwellio");
  });

  it("fails closed without leaking secret values when URL is missing or invalid", () => {
    expect(() => resolveSeedDatabaseUrl({})).toThrow(
      "DATABASE_URL_UNPOOLED or DATABASE_URL must be set",
    );

    const bogusSecret = "mysql://leaked_user:super_secret_pw@127.0.0.1:3306/db";
    let caughtMessage = "";
    try {
      resolveSeedDatabaseUrl({ DATABASE_URL: bogusSecret });
    } catch (error) {
      caughtMessage = error instanceof Error ? error.message : String(error);
    }
    expect(caughtMessage).toContain("postgres:// or postgresql://");
    expect(caughtMessage).not.toContain("leaked_user");
    expect(caughtMessage).not.toContain("super_secret_pw");
  });

  it("runs seedTopics, logs only non-secret counts, and closes the pool cleanly", async () => {
    const logs: string[] = [];
    let closed = false;
    const secretUrl =
      "postgres://seed_user:top_secret_token@db.example.internal:5432/inkwellio";

    const count = await runSeedTopics({
      env: { DATABASE_URL_UNPOOLED: secretUrl },
      createPool: () => ({
        end: async () => {
          closed = true;
        },
      }),
      createDb: () => ({}) as never,
      seedFn: async () =>
        SEED_TOPICS.map((entry, idx) => ({
          id: `topic-${idx}`,
          slug: entry.slug,
          name: entry.name,
        })),
      log: (line) => logs.push(line),
    });

    expect(count).toBe(SEED_TOPICS.length);
    expect(closed).toBe(true);
    expect(logs).toEqual([`[seed-topics] ensured ${SEED_TOPICS.length} topics`]);
    const joined = logs.join("\n");
    expect(joined).not.toContain("seed_user");
    expect(joined).not.toContain("top_secret_token");
    expect(joined).not.toContain("db.example.internal");
  });

  it("closes the pool even on failure and redacts embedded credentials", async () => {
    let closed = false;
    const failingSecretUrl =
      "postgres://admin_writer:very_secret_pw@ep-host.neon.tech/inkwellio";

    await expect(
      runSeedTopics({
        env: { DATABASE_URL: failingSecretUrl },
        createPool: () => ({
          end: async () => {
            closed = true;
          },
        }),
        createDb: () => ({}) as never,
        seedFn: async () => {
          throw new Error(`connect ECONNREFUSED ${failingSecretUrl}`);
        },
        log: () => {},
      }),
    ).rejects.toThrow(/connect ECONNREFUSED \[REDACTED_URL\]/);

    expect(closed).toBe(true);
    expect(sanitizeErrorMessage(new Error(`failed ${failingSecretUrl}`))).not.toContain(
      "very_secret_pw",
    );
  });
});
