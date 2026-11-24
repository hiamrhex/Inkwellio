import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getPool } from "../../src/kernel/db";

/**
 * The WP1 acceptance suite. It needs a real Postgres 17: CHECK constraints,
 * composite foreign keys, partial indexes, cascade behaviour, and concurrent
 * uniqueness are exactly the things a mock cannot prove.
 *
 * The suite applies the generated migration to an empty schema, so it also
 * proves the SQL in `apps/web/drizzle/` is what the schema files claim.
 */

const DATABASE_URL = process.env.DATABASE_URL?.trim() || undefined;
const REQUIRED = process.env.REQUIRE_DB === "1" || process.env.CI === "true" || process.env.REQUIRE_DATABASE === "1";

const DRIZZLE_DIR = fileURLToPath(new URL("../../drizzle/", import.meta.url));

type Journal = { entries: Array<{ tag: string }> };

function migrationStatements(): string[] {
  const journal = JSON.parse(
    readFileSync(join(DRIZZLE_DIR, "meta", "_journal.json"), "utf8"),
  ) as Journal;
  return journal.entries.flatMap((entry) =>
    readFileSync(join(DRIZZLE_DIR, `${entry.tag}.sql`), "utf8")
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0),
  );
}

async function applyMigrations(pool: Pool): Promise<void> {
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
  await pool.query("CREATE SCHEMA public");
  for (const statement of migrationStatements()) {
    await pool.query(statement);
  }
}

async function expectPgError(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code });
}

async function createUser(pool: Pool, email = "fixture@example.com"): Promise<string> {
  const result = await pool.query<{ id: string }>(
    "INSERT INTO users (email) VALUES ($1) RETURNING id",
    [email],
  );
  return result.rows[0]!.id;
}

async function createPublication(
  pool: Pool,
  ownerId: string,
  slug = "fixture-pub",
): Promise<string> {
  const result = await pool.query<{ id: string }>(
    "INSERT INTO publications (owner_id, slug, name) VALUES ($1, $2, $3) RETURNING id",
    [ownerId, slug, "Fixture publication"],
  );
  return result.rows[0]!.id;
}

async function createPost(pool: Pool, publicationId: string, slug = "first-post"): Promise<string> {
  const result = await pool.query<{ id: string }>(
    "INSERT INTO posts (publication_id, slug) VALUES ($1, $2) RETURNING id",
    [publicationId, slug],
  );
  return result.rows[0]!.id;
}

async function createRevision(
  pool: Pool,
  postId: string,
  title = "First",
  body = "hello",
): Promise<string> {
  const result = await pool.query<{ id: string }>(
    "INSERT INTO post_revisions (post_id, title, body_markdown) VALUES ($1, $2, $3) RETURNING id",
    [postId, title, body],
  );
  return result.rows[0]!.id;
}

async function count(pool: Pool, table: string, where = "", params: unknown[] = []): Promise<number> {
  const result = await pool.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM "${table}" ${where}`,
    params,
  );
  return Number(result.rows[0]!.n);
}

describe("database suite environment", () => {
  it("fails instead of skipping when CI claims to run it", () => {
    if (!REQUIRED) {
      return;
    }
    expect(DATABASE_URL, "CI must provide DATABASE_URL for the WP1 suite").toBeTruthy();
    expect(DATABASE_URL).toMatch(/^postgres(ql)?:\/\//);
  });
});

describe.skipIf(!DATABASE_URL)("WP1 schema on a real Postgres", () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = getPool();
    await applyMigrations(pool);
  }, 120_000);

  afterAll(async () => {
    await closeDb();
  });

  describe("migration", () => {
    it("creates every table the schema files declare", async () => {
      const result = await pool.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
         ORDER BY table_name`,
      );
      expect(result.rows.map((row) => row.table_name)).toEqual([
        "audit_events",
        "draft_state",
        "post_revisions",
        "post_slug_history",
        "post_topics",
        "posts",
        "publication_slug_history",
        "publications",
        "rate_limit_counters",
        "topics",
        "users",
      ]);
    });

    it("carries every named constraint, so a silent drop fails here", async () => {
      const expected = [
        "users_email_unique",
        "users_email_lowercase_check",
        "users_email_shape_check",
        "publications_owner_unique",
        "publications_slug_unique",
        "publications_slug_format_check",
        "publications_slug_reserved_check",
        "publications_name_length_check",
        "publications_bio_length_check",
        "publication_slug_history_publication_slug_unique",
        "publication_slug_history_slug_format_check",
        "posts_status_check",
        "posts_slug_format_check",
        "posts_publication_slug_unique",
        "posts_published_pointer_check",
        "posts_deleted_at_check",
        "posts_published_at_check",
        "posts_published_revision_fk",
        "post_revisions_id_post_unique",
        "post_revisions_title_check",
        "post_revisions_body_length_check",
        "post_revisions_post_id_posts_id_fk",
        "draft_state_base_revision_fk",
        "draft_state_version_check",
        "draft_state_title_check",
        "draft_state_body_length_check",
        "post_slug_history_post_slug_unique",
        "post_slug_history_slug_format_check",
        "topics_slug_unique",
        "topics_slug_format_check",
        "topics_name_length_check",
        "post_topics_pk",
        "audit_events_outcome_check",
        "audit_events_actor_kind_check",
        "audit_events_action_check",
        "audit_events_request_id_check",
        "audit_events_metadata_size_check",
        "rate_limit_counters_pk",
        "rate_limit_counters_count_check",
      ];
      const result = await pool.query<{ conname: string }>(
        "SELECT conname FROM pg_constraint ORDER BY conname",
      );
      const names = new Set(result.rows.map((row) => row.conname));
      expect(expected.filter((name) => !names.has(name))).toEqual([]);
    });

    it("is not silently re-runnable: applying it twice fails loudly", async () => {
      const statements = migrationStatements();
      await expectPgError(pool.query(statements[0]!), "42P07");
    });

    it("keeps the feed index partial and ordered by (published_at, id)", async () => {
      const result = await pool.query<{ indpred: string | null; indexdef: string }>(
        `SELECT indpred::text, pg_get_indexdef(indexrelid) AS indexdef
         FROM pg_index WHERE indexrelid = 'posts_feed_idx'::regclass`,
      );
      expect(result.rows[0]!.indpred).not.toBeNull();
      expect(result.rows[0]!.indexdef).toContain("(published_at, id)");
      expect(result.rows[0]!.indexdef).toContain("WHERE");
    });
  });

  describe("slug and identifier rules", () => {
    it("accepts lowercase, hyphen-separated identifiers", async () => {
      const slugs = ["a", "alice", "alice-2", "a".repeat(64)];
      for (const [index, slug] of slugs.entries()) {
        const owner = await createUser(pool, `slug-${index}@example.com`);
        await expect(createPublication(pool, owner, slug)).resolves.toBeTruthy();
      }
      expect(await count(pool, "publications", "WHERE slug = ANY($1::text[])", [slugs])).toBe(
        slugs.length,
      );
    });

    it("rejects uppercase, misplaced hyphens, over-length and reserved slugs", async () => {
      const owner = await createUser(pool, "reject@example.com");
      for (const slug of ["Alice", "-alice", "alice-", "alice--b", "al ice", "a".repeat(65)]) {
        await expectPgError(createPublication(pool, owner, slug), "23514");
      }
      for (const slug of ["admin", "api", "_next", "p"]) {
        await expectPgError(createPublication(pool, owner, slug), "23514");
      }
    });

    it("stores email lowercased by CHECK, not by trust", async () => {
      await expectPgError(createUser(pool, "MiXeD@Example.com"), "23514");
      await expectPgError(createUser(pool, "not-an-email"), "23514");
      await expectPgError(createUser(pool, `${"a".repeat(250)}@example.com`), "23514");
    });
  });

  describe("one publication per user under concurrency", () => {
    it("turns 50 parallel creations into one row", async () => {
      const owner = await createUser(pool, "parallel@example.com");
      const attempts = Array.from({ length: 50 }, (_, index) =>
        createPublication(pool, owner, `pub-${index}`),
      );
      const results = await Promise.allSettled(attempts);
      const fulfilled = results.filter((result) => result.status === "fulfilled");
      const rejected = results.filter(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(49);
      for (const failure of rejected) {
        expect(failure.reason).toMatchObject({ code: "23505" });
      }
      expect(await count(pool, "publications", "WHERE owner_id = $1", [owner])).toBe(1);
    }, 30_000);
  });

  describe("draft_state: one row, append-only history, compare-and-set", () => {
    it("absorbs 200 autosaves without growing a revision", async () => {
      const owner = await createUser(pool, "autosave@example.com");
      const publication = await createPublication(pool, owner, "autosave-pub");
      const post = await createPost(pool, publication);

      await pool.query(
        "INSERT INTO draft_state (post_id, title, body_markdown, version) VALUES ($1, $2, $3, 0)",
        [post, "Draft", "body"],
      );

      for (let version = 0; version < 200; version += 1) {
        const updated = await pool.query(
          `UPDATE draft_state SET title = $1, version = version + 1
           WHERE post_id = $2 AND version = $3`,
          [`Draft ${version}`, post, version],
        );
        expect(updated.rowCount).toBe(1);
      }

      expect(await count(pool, "draft_state", "WHERE post_id = $1", [post])).toBe(1);
      expect(await count(pool, "post_revisions", "WHERE post_id = $1", [post])).toBe(0);
      const row = await pool.query<{ version: number }>(
        "SELECT version FROM draft_state WHERE post_id = $1",
        [post],
      );
      expect(row.rows[0]!.version).toBe(200);
    }, 60_000);

    it("lets exactly one of two writers win the same expected version", async () => {
      const owner = await createUser(pool, "cas@example.com");
      const publication = await createPublication(pool, owner, "cas-pub");
      const post = await createPost(pool, publication);
      await pool.query(
        "INSERT INTO draft_state (post_id, title, body_markdown, version) VALUES ($1, $2, $3, 7)",
        [post, "Draft", "body"],
      );

      const save = (title: string) =>
        pool.query(
          `UPDATE draft_state SET title = $1, version = version + 1
           WHERE post_id = $2 AND version = 7`,
          [title, post],
        );

      const [first, second] = await Promise.all([save("Tab A"), save("Tab B")]);
      const rowCounts = [first.rowCount, second.rowCount].sort();
      expect(rowCounts).toEqual([0, 1]);

      const row = await pool.query<{ version: number }>(
        "SELECT version FROM draft_state WHERE post_id = $1",
        [post],
      );
      expect(row.rows[0]!.version).toBe(8);
    });

    it("rejects multi-line titles and oversized bodies", async () => {
      const owner = await createUser(pool, "checks@example.com");
      const publication = await createPublication(pool, owner, "checks-pub");
      const post = await createPost(pool, publication);
      await expectPgError(
        pool.query("INSERT INTO draft_state (post_id, title, body_markdown) VALUES ($1, $2, $3)", [
          post,
          "two\nlines",
          "body",
        ]),
        "23514",
      );
      await expectPgError(
        pool.query("INSERT INTO draft_state (post_id, title, body_markdown) VALUES ($1, $2, $3)", [
          post,
          "ok",
          "x".repeat(102_401),
        ]),
        "23514",
      );
    });
  });

  describe("post lifecycle", () => {
    it("rejects every illegal pointer state", async () => {
      const owner = await createUser(pool, "lifecycle@example.com");
      const publication = await createPublication(pool, owner, "lifecycle-pub");
      const post = await createPost(pool, publication);
      const revision = await createRevision(pool, post);

      // Published without a revision pointer.
      await expectPgError(
        pool.query("UPDATE posts SET status = 'published' WHERE id = $1", [post]),
        "23514",
      );
      // Published without a timestamp.
      await expectPgError(
        pool.query(
          "UPDATE posts SET status = 'published', published_revision_id = $2 WHERE id = $1",
          [post, revision],
        ),
        "23514",
      );
      // A draft holding a published pointer.
      await expectPgError(
        pool.query("UPDATE posts SET published_revision_id = $2 WHERE id = $1", [post, revision]),
        "23514",
      );
      // Deleted without a deletion timestamp.
      await expectPgError(
        pool.query("UPDATE posts SET status = 'deleted' WHERE id = $1", [post]),
        "23514",
      );
      // A revision belonging to a different post.
      const other = await createPost(pool, publication, "other-post");
      const foreignRevision = await createRevision(pool, other);
      await expectPgError(
        pool.query(
          `UPDATE posts SET status = 'published', published_revision_id = $2, published_at = now()
           WHERE id = $1`,
          [post, foreignRevision],
        ),
        "23503",
      );

      await pool.query(
        `UPDATE posts SET status = 'published', published_revision_id = $2, published_at = now()
         WHERE id = $1`,
        [post, revision],
      );
      const published = await pool.query<{ status: string }>(
        "SELECT status FROM posts WHERE id = $1",
        [post],
      );
      expect(published.rows[0]!.status).toBe("published");
    });

    it("keeps a published revision from being deleted out from under the post", async () => {
      const owner = await createUser(pool, "appendonly@example.com");
      const publication = await createPublication(pool, owner, "append-only-pub");
      const post = await createPost(pool, publication);
      const revision = await createRevision(pool, post);
      await pool.query(
        `UPDATE posts SET status = 'published', published_revision_id = $2, published_at = now()
         WHERE id = $1`,
        [post, revision],
      );

      await expectPgError(
        pool.query("DELETE FROM post_revisions WHERE id = $1", [revision]),
        "23503",
      );
    });

    it("keeps post slugs unique per publication, including deleted posts", async () => {
      const owner = await createUser(pool, "postslug@example.com");
      const publication = await createPublication(pool, owner, "post-slug-pub");
      await createPost(pool, publication, "same-slug");
      await expectPgError(createPost(pool, publication, "same-slug"), "23505");
      await expectPgError(createPost(pool, publication, "Same-Slug"), "23514");
    });
  });

  describe("audit events", () => {
    it("rejects outcomes, actors, actions and metadata outside the vocabulary", async () => {
      const insert = (overrides: Record<string, unknown>) => {
        const row = {
          action: "auth.sign_in",
          outcome: "failed",
          actor_kind: "anonymous",
          request_id: "req_1",
          metadata: {},
          ...overrides,
        };
        return pool.query(
          `INSERT INTO audit_events (action, outcome, actor_kind, request_id, metadata)
           VALUES ($1, $2, $3, $4, $5)`,
          [row.action, row.outcome, row.actor_kind, row.request_id, row.metadata],
        );
      };

      await expectPgError(insert({ outcome: "maybe" }), "23514");
      await expectPgError(insert({ actor_kind: "bot" }), "23514");
      await expectPgError(insert({ action: "Auth Sign In" }), "23514");
      await expectPgError(insert({ request_id: "" }), "23514");
      await expectPgError(insert({ metadata: { padding: "x".repeat(1_100) } }), "23514");
    });

    it("has no column that could hold a plaintext email", async () => {
      const result = await pool.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'audit_events'`,
      );
      expect(result.rows.map((row) => row.column_name).filter((name) => /email/i.test(name))).toEqual(
        [],
      );
    });
  });

  describe("erasure leaves no residue", () => {
    it("only cascades from users, with no other delete rule", async () => {
      const result = await pool.query<{ child: string; rule: string }>(
        `SELECT conrelid::regclass::text AS child, confdeltype::text AS rule
         FROM pg_constraint
         WHERE contype = 'f' AND confrelid = 'users'::regclass`,
      );
      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.rows.filter((row) => row.rule !== "c")).toEqual([]);
    });

    it("documents every user-shaped column as either cascading or exempt", async () => {
      const result = await pool.query<{ table_name: string; column_name: string; cascades: boolean }>(
        `SELECT c.table_name, c.column_name,
                EXISTS (
                  SELECT 1
                  FROM pg_constraint con
                  JOIN pg_attribute att
                    ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
                  WHERE con.contype = 'f'
                    AND con.confrelid = 'users'::regclass
                    AND con.conrelid = (quote_ident(c.table_name))::regclass
                    AND att.attname = c.column_name
                ) AS cascades
         FROM information_schema.columns c
         WHERE c.table_schema = 'public'
           AND c.data_type = 'uuid'
           AND (c.column_name LIKE '%user_id' OR c.column_name = 'owner_id')`,
      );
      const exempt = new Set(["audit_events.actor_user_id", "audit_events.subject_user_id"]);
      const uncovered = result.rows
        .filter((row) => !row.cascades)
        .map((row) => `${row.table_name}.${row.column_name}`)
        .filter((name) => !exempt.has(name));
      expect(uncovered).toEqual([]);
    });

    it("removes the whole graph for a deleted account and leaves only the audit row", async () => {
      const owner = await createUser(pool, "erase-me@example.com");
      const publication = await createPublication(pool, owner, "erase-me");
      const post = await createPost(pool, publication, "erase-me-post");
      const revision = await createRevision(pool, post);
      await pool.query(
        `UPDATE posts SET status = 'published', published_revision_id = $2, published_at = now()
         WHERE id = $1`,
        [post, revision],
      );
      await pool.query(
        "INSERT INTO draft_state (post_id, base_revision_id, title, body_markdown) VALUES ($1, $2, $3, $4)",
        [post, revision, "Draft", "body"],
      );
      await pool.query("INSERT INTO post_slug_history (post_id, slug) VALUES ($1, $2)", [
        post,
        "old-slug",
      ]);
      await pool.query("INSERT INTO publication_slug_history (publication_id, slug) VALUES ($1, $2)", [
        publication,
        "old-pub",
      ]);
      const topic = await pool.query<{ id: string }>(
        "INSERT INTO topics (slug, name) VALUES ($1, $2) RETURNING id",
        ["testing", "Testing"],
      );
      await pool.query("INSERT INTO post_topics (post_id, topic_id) VALUES ($1, $2)", [
        post,
        topic.rows[0]!.id,
      ]);
      await pool.query(
        `INSERT INTO audit_events (action, outcome, actor_kind, actor_user_id, subject_user_id, request_id)
         VALUES ('account.erasure_requested', 'ok', 'user', $1, $1, 'req_erase')`,
        [owner],
      );

      // The erasure sequence WP2 wraps in its endpoint: null the audit actor,
      // then delete the account and let the cascades do the rest.
      await pool.query(
        `UPDATE audit_events
         SET actor_user_id = NULL, subject_user_id = NULL
         WHERE actor_user_id = $1 OR subject_user_id = $1`,
        [owner],
      );
      await pool.query("DELETE FROM users WHERE id = $1", [owner]);

      const uuidColumns = await pool.query<{ table_name: string; column_name: string }>(
        `SELECT table_name, column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND data_type = 'uuid'
           AND NOT (table_name = 'audit_events' AND column_name IN ('actor_user_id', 'subject_user_id'))
         ORDER BY table_name, column_name`,
      );

      const residue: string[] = [];
      for (const column of uuidColumns.rows) {
        const rows = await count(
          pool,
          column.table_name,
          `WHERE "${column.column_name}" = $1`,
          [owner],
        );
        if (rows > 0) {
          residue.push(`${column.table_name}.${column.column_name}: ${rows}`);
        }
      }
      expect(residue).toEqual([]);

      const audit = await pool.query<{ actor_user_id: string | null; subject_user_id: string | null }>(
        `SELECT actor_user_id, subject_user_id FROM audit_events
         WHERE action = 'account.erasure_requested'`,
      );
      expect(audit.rows).toHaveLength(1);
      expect(audit.rows[0]).toEqual({ actor_user_id: null, subject_user_id: null });
    }, 30_000);
  });
});
