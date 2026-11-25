/**
 * Account privacy workflows: Data Export and Account Erasure (ADR-014, A6).
 *
 * Uses `@/kernel/db` queries directly for cross-module read/delete graphs so
 * `modules/identity` never creates circular dependencies on `modules/publications`,
 * `modules/posts`, or `modules/topics`.
 */

import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { verifyPassword } from "better-auth/crypto";
import { getPool } from "@/kernel/db";
import { ForbiddenError, NotFoundError, ValidationError } from "@/kernel/errors";
import { sendErasureConfirmationEmail } from "./email";
import { hashIp, normalizeRateLimitEmail } from "./limiter-helpers";

export const MAX_EXPORT_BYTES = 25 * 1024 * 1024; // 25 MB (ADR-014, A6)
const ERASURE_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes
const ERASURE_IDENTIFIER_PREFIX = "account-erasure:";

export class ErasureTokenExpiredError extends Error {
  readonly status = 410;
  readonly code = "ERASURE_TOKEN_EXPIRED";

  constructor(message = "Erasure confirmation token has expired") {
    super(message);
    this.name = "ErasureTokenExpiredError";
  }
}

export interface ExportedAccountPayload {
  exportedAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    image: string | null;
    createdAt: string;
    updatedAt: string;
  };
  publications: Array<{
    id: string;
    slug: string;
    name: string;
    bio: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  publicationSlugHistory: Array<{
    id: string;
    publicationId: string;
    slug: string;
    createdAt: string;
  }>;
  posts: Array<{
    id: string;
    publicationId: string;
    slug: string;
    status: string;
    publishedRevisionId: string | null;
    publishedAt: string | null;
    deletedAt: string | null;
    createdAt: string;
    updatedAt: string;
    topics: Array<{ slug: string; name: string }>;
  }>;
  postSlugHistory: Array<{
    id: string;
    postId: string;
    slug: string;
    createdAt: string;
  }>;
  drafts: Array<{
    postId: string;
    baseRevisionId: string | null;
    title: string;
    bodyMarkdown: string;
    version: number;
    updatedAt: string;
  }>;
  revisions: Array<{
    id: string;
    postId: string;
    title: string;
    bodyMarkdown: string;
    createdAt: string;
  }>;
  auditEvents: Array<{
    id: string;
    occurredAt: string;
    action: string;
    outcome: string;
    actorKind: string;
    targetType: string | null;
    targetId: string | null;
    requestId: string;
    metadata: Record<string, unknown>;
  }>;
}

export interface DeletedAccountCounts {
  users: number;
  sessions: number;
  accounts: number;
  verifications: number;
  publications: number;
  publicationSlugHistory: number;
  posts: number;
  postRevisions: number;
  draftState: number;
  postSlugHistory: number;
  postTopics: number;
  rateLimits: number;
  rateLimitCounters: number;
}

export interface ErasedAccountCacheTargets {
  publicationSlugs: string[];
  publishedPosts: Array<{
    postId: string;
    publicationSlug: string;
    postSlug: string;
  }>;
}

export function hashErasureToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function verifyErasureTokenHash(storedHex: string, candidateRawToken: string): boolean {
  const candidateHex = hashErasureToken(candidateRawToken);
  const a = Buffer.from(storedHex, "hex");
  const b = Buffer.from(candidateHex, "hex");
  if (a.length === 0 || a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toNullableIso(value: Date | string | null | undefined): string | null {
  return value ? toIso(value) : null;
}

/**
 * Exports all account data strictly owned by `userId` and records an audit event.
 */
export async function exportUserAccountData(
  userId: string,
  context: { requestId: string; ip?: string | null },
): Promise<ExportedAccountPayload> {
  const pool = getPool();

  const userRes = await pool.query<{
    id: string;
    name: string;
    email: string;
    email_verified: boolean;
    image: string | null;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT id, name, email, email_verified, image, created_at, updated_at
     FROM users WHERE id = $1`,
    [userId],
  );
  const userRow = userRes.rows[0];
  if (!userRow) {
    throw new NotFoundError("Account not found");
  }

  const pubRes = await pool.query<{
    id: string;
    slug: string;
    name: string;
    bio: string | null;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT id, slug, name, bio, created_at, updated_at
     FROM publications WHERE owner_id = $1 ORDER BY created_at ASC`,
    [userId],
  );
  const pubIds = pubRes.rows.map((r) => r.id);

  const pubSlugRes =
    pubIds.length > 0
      ? await pool.query<{
          id: string;
          publication_id: string;
          slug: string;
          created_at: Date;
        }>(
          `SELECT id, publication_id, slug, created_at
           FROM publication_slug_history
           WHERE publication_id = ANY($1::uuid[])
           ORDER BY created_at ASC`,
          [pubIds],
        )
      : { rows: [] };

  const postRes =
    pubIds.length > 0
      ? await pool.query<{
          id: string;
          publication_id: string;
          slug: string;
          status: string;
          published_revision_id: string | null;
          published_at: Date | null;
          deleted_at: Date | null;
          created_at: Date;
          updated_at: Date;
        }>(
          `SELECT id, publication_id, slug, status, published_revision_id, published_at, deleted_at, created_at, updated_at
           FROM posts
           WHERE publication_id = ANY($1::uuid[])
           ORDER BY created_at ASC`,
          [pubIds],
        )
      : { rows: [] };
  const postIds = postRes.rows.map((r) => r.id);

  const topicRes =
    postIds.length > 0
      ? await pool.query<{ post_id: string; slug: string; name: string }>(
          `SELECT pt.post_id, t.slug, t.name
           FROM post_topics pt
           JOIN topics t ON t.id = pt.topic_id
           WHERE pt.post_id = ANY($1::uuid[])
           ORDER BY t.slug ASC`,
          [postIds],
        )
      : { rows: [] };

  const topicsByPost = new Map<string, Array<{ slug: string; name: string }>>();
  for (const row of topicRes.rows) {
    const existing = topicsByPost.get(row.post_id) ?? [];
    existing.push({ slug: row.slug, name: row.name });
    topicsByPost.set(row.post_id, existing);
  }

  const postSlugRes =
    postIds.length > 0
      ? await pool.query<{ id: string; post_id: string; slug: string; created_at: Date }>(
          `SELECT id, post_id, slug, created_at
           FROM post_slug_history
           WHERE post_id = ANY($1::uuid[])
           ORDER BY created_at ASC`,
          [postIds],
        )
      : { rows: [] };

  const draftRes =
    postIds.length > 0
      ? await pool.query<{
          post_id: string;
          base_revision_id: string | null;
          title: string;
          body_markdown: string;
          version: number;
          updated_at: Date;
        }>(
          `SELECT post_id, base_revision_id, title, body_markdown, version, updated_at
           FROM draft_state
           WHERE post_id = ANY($1::uuid[])
           ORDER BY updated_at ASC`,
          [postIds],
        )
      : { rows: [] };

  const revRes =
    postIds.length > 0
      ? await pool.query<{
          id: string;
          post_id: string;
          title: string;
          body_markdown: string;
          created_at: Date;
        }>(
          `SELECT id, post_id, title, body_markdown, created_at
           FROM post_revisions
           WHERE post_id = ANY($1::uuid[])
           ORDER BY created_at ASC`,
          [postIds],
        )
      : { rows: [] };

  // Record export audit row before reading audit history so this export is included
  const ipHash = context.ip ? hashIp(context.ip) : null;
  await pool.query(
    `INSERT INTO audit_events (id, action, outcome, actor_kind, actor_user_id, subject_user_id, target_type, target_id, request_id, ip_hash, metadata)
     VALUES ($1, 'account.exported', 'ok', 'user', $2, $2, 'account', $3, $4, $5, $6::jsonb)`,
    [randomUUID(), userId, userId, context.requestId.slice(0, 64), ipHash, "{}"],
  );

  const auditRes = await pool.query<{
    id: string;
    occurred_at: Date;
    action: string;
    outcome: string;
    actor_kind: string;
    target_type: string | null;
    target_id: string | null;
    request_id: string;
    metadata: Record<string, unknown>;
  }>(
    `SELECT id, occurred_at, action, outcome, actor_kind, target_type, target_id, request_id, metadata
     FROM audit_events
     WHERE actor_user_id = $1 OR subject_user_id = $1
     ORDER BY occurred_at ASC`,
    [userId],
  );

  return {
    exportedAt: new Date().toISOString(),
    user: {
      id: userRow.id,
      name: userRow.name,
      email: userRow.email,
      emailVerified: userRow.email_verified,
      image: userRow.image,
      createdAt: toIso(userRow.created_at),
      updatedAt: toIso(userRow.updated_at),
    },
    publications: pubRes.rows.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      bio: p.bio,
      createdAt: toIso(p.created_at),
      updatedAt: toIso(p.updated_at),
    })),
    publicationSlugHistory: pubSlugRes.rows.map((h) => ({
      id: h.id,
      publicationId: h.publication_id,
      slug: h.slug,
      createdAt: toIso(h.created_at),
    })),
    posts: postRes.rows.map((p) => ({
      id: p.id,
      publicationId: p.publication_id,
      slug: p.slug,
      status: p.status,
      publishedRevisionId: p.published_revision_id,
      publishedAt: toNullableIso(p.published_at),
      deletedAt: toNullableIso(p.deleted_at),
      createdAt: toIso(p.created_at),
      updatedAt: toIso(p.updated_at),
      topics: topicsByPost.get(p.id) ?? [],
    })),
    postSlugHistory: postSlugRes.rows.map((h) => ({
      id: h.id,
      postId: h.post_id,
      slug: h.slug,
      createdAt: toIso(h.created_at),
    })),
    drafts: draftRes.rows.map((d) => ({
      postId: d.post_id,
      baseRevisionId: d.base_revision_id,
      title: d.title,
      bodyMarkdown: d.body_markdown,
      version: d.version,
      updatedAt: toIso(d.updated_at),
    })),
    revisions: revRes.rows.map((r) => ({
      id: r.id,
      postId: r.post_id,
      title: r.title,
      bodyMarkdown: r.body_markdown,
      createdAt: toIso(r.created_at),
    })),
    auditEvents: auditRes.rows.map((a) => ({
      id: a.id,
      occurredAt: toIso(a.occurred_at),
      action: a.action,
      outcome: a.outcome,
      actorKind: a.actor_kind,
      targetType: a.target_type,
      targetId: a.target_id,
      requestId: a.request_id,
      metadata: a.metadata ?? {},
    })),
  };
}

/**
 * Generates a single-use, 15-minute SHA-256-hashed erasure confirmation token,
 * stores only its hash in `verifications`, and dispatches the raw token via EmailTransport.
 */
export async function requestAccountErasure(input: {
  userId: string;
  password?: string;
  requestId: string;
  ip?: string | null;
}): Promise<{ expiresInSeconds: number }> {
  const pool = getPool();
  const userRes = await pool.query<{ id: string; email: string; name: string }>(
    "SELECT id, email, name FROM users WHERE id = $1",
    [input.userId],
  );
  const userRow = userRes.rows[0];
  if (!userRow) {
    throw new NotFoundError("Account not found");
  }

  // Verify credential password (required per ADR-014 §A6 whenever the account has a credential password)
  const accountRes = await pool.query<{ password: string | null }>(
    `SELECT password FROM accounts
     WHERE user_id = $1 AND provider_id = 'credential' LIMIT 1`,
    [input.userId],
  );
  const storedHash = accountRes.rows[0]?.password;
  if (storedHash) {
    const ipHashForDeny = input.ip ? hashIp(input.ip) : null;
    if (!input.password) {
      await pool.query(
        `INSERT INTO audit_events (id, action, outcome, actor_kind, actor_user_id, subject_user_id, target_type, target_id, request_id, ip_hash, metadata)
         VALUES ($1, 'account.erasure_requested', 'denied', 'user', $2, $2, 'account', $3, $4, $5, $6::jsonb)`,
        [randomUUID(), input.userId, input.userId, input.requestId.slice(0, 64), ipHashForDeny, "{}"],
      );
      throw new ValidationError("Password is required to request account erasure");
    }
    const ok = await verifyPassword({ hash: storedHash, password: input.password });
    if (!ok) {
      await pool.query(
        `INSERT INTO audit_events (id, action, outcome, actor_kind, actor_user_id, subject_user_id, target_type, target_id, request_id, ip_hash, metadata)
         VALUES ($1, 'account.erasure_requested', 'denied', 'user', $2, $2, 'account', $3, $4, $5, $6::jsonb)`,
        [randomUUID(), input.userId, input.userId, input.requestId.slice(0, 64), ipHashForDeny, "{}"],
      );
      throw new ForbiddenError("Invalid credentials");
    }
  }

  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = hashErasureToken(rawToken);
  const identifier = `${ERASURE_IDENTIFIER_PREFIX}${input.userId}`;
  const expiresAt = new Date(Date.now() + ERASURE_TOKEN_TTL_MS);
  const ipHash = input.ip ? hashIp(input.ip) : null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM verifications WHERE identifier = $1", [identifier]);
    await client.query(
      `INSERT INTO verifications (id, identifier, value, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [randomUUID(), identifier, tokenHash, expiresAt],
    );
    await client.query(
      `INSERT INTO audit_events (id, action, outcome, actor_kind, actor_user_id, subject_user_id, target_type, target_id, request_id, ip_hash, metadata)
       VALUES ($1, 'account.erasure_requested', 'ok', 'user', $2, $2, 'account', $3, $4, $5, $6::jsonb)`,
      [randomUUID(), input.userId, input.userId, input.requestId.slice(0, 64), ipHash, "{}"],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  await sendErasureConfirmationEmail({
    user: { id: userRow.id, email: userRow.email, name: userRow.name },
    token: rawToken,
  });

  return { expiresInSeconds: Math.floor(ERASURE_TOKEN_TTL_MS / 1000) };
}

/**
 * Verifies the single-use hashed token with timing-safe comparison and executes
 * full account hard-deletion in ONE database transaction, returning deleted row counts.
 */
export async function confirmAccountErasure(input: {
  userId: string;
  token: string;
  requestId: string;
  ip?: string | null;
  invalidateCache?: (targets: ErasedAccountCacheTargets) => Promise<void> | void;
}): Promise<DeletedAccountCounts> {
  const pool = getPool();
  const identifier = `${ERASURE_IDENTIFIER_PREFIX}${input.userId}`;
  const ipHash = input.ip ? hashIp(input.ip) : null;

  let cacheTargets: ErasedAccountCacheTargets = {
    publicationSlugs: [],
    publishedPosts: [],
  };
  let deletedCounts: DeletedAccountCounts;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const verRes = await client.query<{ id: string; value: string; expires_at: Date }>(
      `SELECT id, value, expires_at
       FROM verifications
       WHERE identifier = $1
       FOR UPDATE`,
      [identifier],
    );
    const tokenRow = verRes.rows[0];
    if (!tokenRow || !verifyErasureTokenHash(tokenRow.value, input.token)) {
      await client.query("ROLLBACK");
      throw new ForbiddenError("Invalid erasure confirmation token");
    }

    if (new Date(tokenRow.expires_at).getTime() <= Date.now()) {
      await client.query("DELETE FROM verifications WHERE id = $1", [tokenRow.id]);
      await client.query("COMMIT");
      throw new ErasureTokenExpiredError();
    }

    const userRes = await client.query<{ email: string }>(
      "SELECT email FROM users WHERE id = $1 FOR UPDATE",
      [input.userId],
    );
    const userRow = userRes.rows[0];
    if (!userRow) {
      await client.query("ROLLBACK");
      throw new NotFoundError("Account not found");
    }
    const normalizedEmail = normalizeRateLimitEmail(userRow.email);

    // Count cascading rows before deleting user
    const countQuery = async (sqlText: string, params: unknown[]): Promise<number> => {
      const r = await client.query<{ c: number }>(sqlText, params);
      return Number(r.rows[0]?.c ?? 0);
    };

    const sessionsCount = await countQuery(
      "SELECT count(*)::int AS c FROM sessions WHERE user_id = $1",
      [input.userId],
    );
    const accountsCount = await countQuery(
      "SELECT count(*)::int AS c FROM accounts WHERE user_id = $1",
      [input.userId],
    );
    const publicationsCount = await countQuery(
      "SELECT count(*)::int AS c FROM publications WHERE owner_id = $1",
      [input.userId],
    );
    const pubSlugCount = await countQuery(
      `SELECT count(*)::int AS c FROM publication_slug_history psh
       JOIN publications p ON p.id = psh.publication_id
       WHERE p.owner_id = $1`,
      [input.userId],
    );
    const postsCount = await countQuery(
      `SELECT count(*)::int AS c FROM posts po
       JOIN publications p ON p.id = po.publication_id
       WHERE p.owner_id = $1`,
      [input.userId],
    );
    const postRevisionsCount = await countQuery(
      `SELECT count(*)::int AS c FROM post_revisions pr
       JOIN posts po ON po.id = pr.post_id
       JOIN publications p ON p.id = po.publication_id
       WHERE p.owner_id = $1`,
      [input.userId],
    );
    const draftStateCount = await countQuery(
      `SELECT count(*)::int AS c FROM draft_state ds
       JOIN posts po ON po.id = ds.post_id
       JOIN publications p ON p.id = po.publication_id
       WHERE p.owner_id = $1`,
      [input.userId],
    );
    const postSlugCount = await countQuery(
      `SELECT count(*)::int AS c FROM post_slug_history psh
       JOIN posts po ON po.id = psh.post_id
       JOIN publications p ON p.id = po.publication_id
       WHERE p.owner_id = $1`,
      [input.userId],
    );
    const postTopicsCount = await countQuery(
      `SELECT count(*)::int AS c FROM post_topics pt
       JOIN posts po ON po.id = pt.post_id
       JOIN publications p ON p.id = po.publication_id
       WHERE p.owner_id = $1`,
      [input.userId],
    );

    // Delete verification tokens (erasure token + any email verification tokens)
    const verDeleteRes = await client.query(
      "DELETE FROM verifications WHERE identifier = $1 OR identifier = $2",
      [identifier, normalizedEmail],
    );

    // Delete email-keyed rate limits (per A6: IP-keyed rows are retained up to 24h)
    const rlDeleteRes = await client.query(
      "DELETE FROM rate_limits WHERE key LIKE $1",
      [`%${normalizedEmail}%`],
    );
    const rlcDeleteRes = await client.query(
      "DELETE FROM rate_limit_counters WHERE key LIKE $1",
      [`email:${normalizedEmail}:%`],
    );

    // Strip user identifiers from audit_events while retaining the security record (A6, A10)
    await client.query(
      `UPDATE audit_events
       SET actor_user_id = NULL, subject_user_id = NULL
       WHERE actor_user_id = $1 OR subject_user_id = $1`,
      [input.userId],
    );
    await client.query(
      `INSERT INTO audit_events (id, action, outcome, actor_kind, actor_user_id, subject_user_id, target_type, target_id, request_id, ip_hash, metadata)
       VALUES ($1, 'account.erased', 'ok', 'user', NULL, NULL, 'account', NULL, $2, $3, $4::jsonb)`,
      [
        randomUUID(),
        input.requestId.slice(0, 64),
        ipHash,
        JSON.stringify({ deletedUsers: 1 }),
      ],
    );

    // Capture public cache targets before cascading deletes remove them
    const pubSlugsRes = await client.query<{ slug: string }>(
      "SELECT slug FROM publications WHERE owner_id = $1",
      [input.userId],
    );
    const publishedPostsRes = await client.query<{
      post_id: string;
      publication_slug: string;
      post_slug: string;
    }>(
      `SELECT po.id AS post_id, p.slug AS publication_slug, po.slug AS post_slug
       FROM posts po
       JOIN publications p ON p.id = po.publication_id
       WHERE p.owner_id = $1 AND po.status = 'published'`,
      [input.userId],
    );
    cacheTargets = {
      publicationSlugs: pubSlugsRes.rows.map((r) => r.slug),
      publishedPosts: publishedPostsRes.rows.map((r) => ({
        postId: r.post_id,
        publicationSlug: r.publication_slug,
        postSlug: r.post_slug,
      })),
    };

    // Hard-delete user (ON DELETE CASCADE removes sessions, accounts, publications, posts, revisions, drafts, slug history, post_topics)
    const userDeleteRes = await client.query("DELETE FROM users WHERE id = $1", [input.userId]);

    await client.query("COMMIT");

    deletedCounts = {
      users: userDeleteRes.rowCount ?? 0,
      sessions: sessionsCount,
      accounts: accountsCount,
      verifications: verDeleteRes.rowCount ?? 0,
      publications: publicationsCount,
      publicationSlugHistory: pubSlugCount,
      posts: postsCount,
      postRevisions: postRevisionsCount,
      draftState: draftStateCount,
      postSlugHistory: postSlugCount,
      postTopics: postTopicsCount,
      rateLimits: rlDeleteRes.rowCount ?? 0,
      rateLimitCounters: rlcDeleteRes.rowCount ?? 0,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  if (input.invalidateCache) {
    await input.invalidateCache(cacheTargets);
  }

  return deletedCounts;
}
