import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  RESERVED_SLUGS,
  ensurePublication,
  slugify,
} from "../../src/modules/publications";
import {
  DATABASE_URL,
  REQUIRED,
  barrier,
  count,
  createTestDatabase,
  type TestDatabase,
} from "./wp3a/harness";

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

describe("wp3a database suite environment", () => {
  it("fails instead of skipping when CI claims to run it", () => {
    if (!REQUIRED) return;
    expect(DATABASE_URL, "CI must provide DATABASE_URL for the WP3a suites").toBeTruthy();
  });
});

describe.skipIf(!DATABASE_URL)("WP3a publications on a real Postgres", () => {
  let testDb: TestDatabase;
  let pool: Pool;
  let userSeq = 0;

  beforeAll(async () => {
    testDb = await createTestDatabase("publications");
    pool = testDb.pool;
  }, 120_000);

  afterAll(async () => {
    await testDb.close();
  });

  async function createUser(): Promise<string> {
    userSeq += 1;
    const email = `wp3a-pub-${userSeq}@example.com`;
    const result = await pool.query<{ id: string }>(
      "INSERT INTO users (email) VALUES ($1) RETURNING id",
      [email],
    );
    return result.rows[0]!.id;
  }

  function actor(id: string) {
    return { userId: id };
  }

  it("turns 50 parallel calls into exactly one publication row", async () => {
    const ownerId = await createUser();
    const start = barrier(50);
    const results = await Promise.all(
      Array.from({ length: 50 }, async () => {
        await start();
        return ensurePublication(
          { kind: "db", db: testDb.db },
          { actor: actor(ownerId), name: "Parallel Publication" },
        );
      }),
    );

    expect(results).toHaveLength(50);
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(await count(pool, "publications", "WHERE owner_id = $1", [ownerId])).toBe(1);
  });

  it("is idempotent: a repeat call returns the same publication", async () => {
    const ownerId = await createUser();
    const first = await ensurePublication(
      { kind: "db", db: testDb.db },
      { actor: actor(ownerId), name: "Repeat Call" },
    );
    const second = await ensurePublication(
      { kind: "db", db: testDb.db },
      { actor: actor(ownerId), name: "Repeat Call", slug: "something-else" },
    );

    expect(second.id).toBe(first.id);
    expect(second.created).toBe(false);
    expect(await count(pool, "publications", "WHERE owner_id = $1", [ownerId])).toBe(1);
  });

  it.each([...RESERVED_SLUGS])("rejects the reserved slug %s", async (slug) => {
    const ownerId = await createUser();
    await expect(
      ensurePublication({ kind: "db", db: testDb.db }, { actor: actor(ownerId), name: "X", slug }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await count(pool, "publications", "WHERE owner_id = $1", [ownerId])).toBe(0);
  });

  it.each([
    ["uppercase", "Not-Allowed"],
    ["underscore", "not_allowed"],
    ["double hyphen", "not--allowed"],
    ["leading hyphen", "-notallowed"],
    ["trailing hyphen", "notallowed-"],
    ["empty", ""],
    ["too long", "a".repeat(65)],
    ["symbols", "!!!"],
  ])("rejects an invalid slug (%s)", async (_label, slug) => {
    const ownerId = await createUser();
    await expect(
      ensurePublication({ kind: "db", db: testDb.db }, { actor: actor(ownerId), name: "X", slug }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("rejects a slug another publication already owns", async () => {
    const first = await createUser();
    const second = await createUser();
    const taken = await ensurePublication(
      { kind: "db", db: testDb.db },
      { actor: actor(first), name: "Owner One", slug: "taken-slug" },
    );
    expect(taken.slug).toBe("taken-slug");

    await expect(
      ensurePublication(
        { kind: "db", db: testDb.db },
        { actor: actor(second), name: "Owner Two", slug: "taken-slug" },
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await count(pool, "publications", "WHERE slug = $1", ["taken-slug"])).toBe(1);
  });

  it("generates a slug that satisfies the database check", async () => {
    const ownerId = await createUser();
    const publication = await ensurePublication(
      { kind: "db", db: testDb.db },
      { actor: actor(ownerId), name: "Müller's Notes" },
    );

    expect(publication.slug).toBe("muller-s-notes");
    expect(publication.slug).toMatch(SLUG_PATTERN);
    expect(publication.slug.length).toBeLessThanOrEqual(64);
  });

  it("gives a generated slug that would be reserved a safe suffix", async () => {
    const ownerId = await createUser();
    const publication = await ensurePublication(
      { kind: "db", db: testDb.db },
      { actor: actor(ownerId), name: "API" },
    );

    expect(RESERVED_SLUGS).not.toContain(publication.slug);
    expect(publication.slug).toBe("api-pub");
  });

  it("resolves concurrent same-name creation with unique suffixes", async () => {
    const owners = await Promise.all(Array.from({ length: 8 }, () => createUser()));
    const start = barrier(owners.length);
    const results = await Promise.all(
      owners.map(async (ownerId) => {
        await start();
        return ensurePublication(
          { kind: "db", db: testDb.db },
          { actor: actor(ownerId), name: "Same Name" },
        );
      }),
    );

    const slugs = results.map((r) => r.slug);
    expect(new Set(slugs).size).toBe(owners.length);
    for (const slug of slugs) {
      expect(slug).toMatch(SLUG_PATTERN);
      expect(slug.length).toBeLessThanOrEqual(64);
    }
    expect(await count(pool, "publications", "WHERE slug LIKE $1", ["same-name%"])).toBe(
      owners.length,
    );
  });

  it("refuses an anonymous caller", async () => {
    await expect(
      ensurePublication({ kind: "db", db: testDb.db }, { actor: null, name: "Anon" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("slugify is total: every output passes the CHECK", () => {
    const inputs = [
      "Müller",
      "Ødegaard",
      "Mbappé",
      "İstanbul",
      "ıI",
      "🎉🎉🎉",
      "!!!",
      "   ",
      "A".repeat(200),
      "Trailing   spaces   ",
      "a--b__c",
    ];
    for (const input of inputs) {
      const slug = slugify(input, { fallback: "post" });
      expect(slug, `slug for ${JSON.stringify(input)}`).toMatch(SLUG_PATTERN);
      expect(slug.length).toBeLessThanOrEqual(64);
    }
  });
});
