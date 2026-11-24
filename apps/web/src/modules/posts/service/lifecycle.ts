import { sql } from "drizzle-orm";
import { conflict, notFound, validation, type Actor } from "@/modules/publications";
import type { PostStatus } from "../ports";
import { loadPostOwner } from "./drafts";
import {
  rows,
  runInTransaction,
  toDate,
  toNumber,
  type Executor,
  type Queryable,
} from "./executor";
import { assertOwner } from "./ownership";

/**
 * Shared machinery for the post lifecycle (ADR-007).
 *
 * Every transition follows the same shape, and the shape is the guarantee:
 *
 * 1. Load the owner and refuse a stranger before reading anything else.
 * 2. Lock the post row `FOR UPDATE`. A publish, a rename and a delete of the
 *    same post then serialise instead of interleaving.
 * 3. Answer a retried `requestId` from its own audit row, so a client that
 *    retries after a timeout does not publish twice.
 * 4. Compare-and-set on `draft_state.version` (A7): a stale token is a
 *    CONFLICT carrying the current draft, never a silent overwrite.
 * 5. Write the state change and its audit row in the same transaction, so a
 *    failure after the audit insert rolls everything back (A10).
 */

export type LifecycleInput = {
  readonly actor: Actor;
  readonly postId: string;
  readonly expectedVersion: number;
  readonly requestId: string;
};

export type LifecycleResult = {
  readonly id: string;
  readonly status: PostStatus;
  /** The draft version after the transition. */
  readonly version: number;
  /** `true` when the publish found no change (version already matched). */
  readonly noOp?: boolean;
  /** The new revision id if a revision was appended, otherwise the existing one. */
  readonly revisionId?: string | null;
  /** The `published_at` timestamp, preserved across republishes. */
  readonly publishedAt?: Date;
};

/**
 * A publish always leaves the post published, so its status and timestamp are
 * narrower than the shared result. The timestamp is required, not optional:
 * `posts_published_at_check` guarantees the column is populated, and callers
 * (and the tests) should not need a non-null assertion to read it.
 */
export type PublishResult = Omit<LifecycleResult, "status" | "publishedAt"> & {
  readonly status: "published";
  readonly publishedAt: Date;
};

/** A post row as the lifecycle reads it, after the ownership check. */
export type LockedPost = {
  readonly id: string;
  readonly status: PostStatus;
  readonly published_revision_id: string | null;
  readonly published_at: unknown;
};

export type DraftSnapshot = {
  readonly version: number;
  readonly title: string;
  readonly bodyMarkdown: string;
};

/** Action names are durable audit data; they match `audit_events_action_check`. */
export const AUDIT_PUBLISHED = "post.published";
export const AUDIT_UNPUBLISHED = "post.unpublished";
export const AUDIT_DELETED = "post.deleted";
export const AUDIT_RESTORED = "post.restored";

const REQUEST_ID_MAX = 64;

/** A request id is the idempotency key, so it must be present and bounded by
 * the column's CHECK rather than failing later as an INTERNAL error. */
export function parseRequestId(requestId: string): string {
  if (typeof requestId !== "string" || requestId.length < 1 || requestId.length > REQUEST_ID_MAX) {
    throw validation(`requestId must be 1 to ${REQUEST_ID_MAX} characters`);
  }
  return requestId;
}

export function parseExpectedVersion(expectedVersion: number): number {
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
    throw validation("expectedVersion must be a non-negative integer");
  }
  return expectedVersion;
}

/** The owner of the post, refusing a stranger before any state is read. */
export async function lockOwnedPost(
  q: Queryable,
  input: LifecycleInput,
): Promise<{ readonly post: LockedPost; readonly actorId: string }> {
  const ownerId = await loadPostOwner(q, input.postId);
  const actor = assertOwner(input.actor, ownerId);

  const found = await rows<LockedPost>(
    q,
    sql`
      SELECT id, status, published_revision_id, published_at
        FROM posts
       WHERE id = ${input.postId}
       FOR UPDATE
    `,
  );
  const post = found[0];
  if (post === undefined) throw notFound();
  return { post, actorId: actor.userId };
}

export async function readDraft(
  q: Queryable,
  postId: string,
): Promise<DraftSnapshot | undefined> {
  const found = await rows<{ version: unknown; title: string; body_markdown: string }>(
    q,
    sql`
      SELECT version, title, body_markdown
        FROM draft_state
       WHERE post_id = ${postId}
    `,
  );
  const draft = found[0];
  if (draft === undefined) return undefined;
  return {
    version: toNumber(draft.version),
    title: draft.title,
    bodyMarkdown: draft.body_markdown,
  };
}

/** The CONFLICT body A7 promises: the current draft, so the editor can reload. */
export function staleDraft(draft: DraftSnapshot | undefined): ReturnType<typeof conflict> {
  return conflict("The draft changed since it was loaded", {
    currentVersion: draft?.version ?? 0,
    currentTitle: draft?.title ?? "",
    currentBodyMarkdown: draft?.bodyMarkdown ?? "",
    updatedAt: null,
  });
}

/**
 * Compare-and-set on `draft_state.version`, returning the new version.
 *
 * `publish` needs a draft row: there is no text to publish without one. A
 * lifecycle transition (unpublish, delete, restore) does not touch draft text,
 * so a post that never had a draft row stays at version 0 and the transition is
 * still allowed.
 */
export async function claimVersion(
  q: Queryable,
  postId: string,
  expectedVersion: number,
  mode: "publish" | "transition",
): Promise<number> {
  const updated = await rows<{ version: unknown }>(
    q,
    sql`
      UPDATE draft_state
         SET version = version + 1,
             updated_at = now()
       WHERE post_id = ${postId} AND version = ${expectedVersion}
      RETURNING version
    `,
  );
  const claimed = updated[0];
  if (claimed !== undefined) return toNumber(claimed.version);

  const draft = await readDraft(q, postId);
  if (draft === undefined) {
    if (expectedVersion !== 0) throw staleDraft(undefined);
    if (mode === "publish") throw validation("There is nothing to publish");
    return 0;
  }
  throw staleDraft(draft);
}

/** True when this request already produced this action for this post. */
export async function wasAlreadyApplied(
  q: Queryable,
  requestId: string,
  postId: string,
  action: string,
): Promise<boolean> {
  const found = await rows<{ id: string }>(
    q,
    sql`
      SELECT id
        FROM audit_events
       WHERE request_id = ${requestId}
         AND target_id = ${postId}
         AND action = ${action}
       LIMIT 1
    `,
  );
  return found.length > 0;
}

/** The durable record, written inside the caller's transaction (A10). */
export async function writeAudit(
  q: Queryable,
  input: {
    readonly action: string;
    readonly actorId: string;
    readonly postId: string;
    readonly requestId: string;
    readonly metadata: Record<string, unknown>;
  },
): Promise<void> {
  await rows(
    q,
    sql`
      INSERT INTO audit_events
        (action, outcome, actor_kind, actor_user_id, target_type, target_id, request_id, metadata)
      VALUES (
        ${input.action},
        'ok',
        'user',
        ${input.actorId},
        'post',
        ${input.postId},
        ${input.requestId},
        ${JSON.stringify(input.metadata)}::jsonb
      )
    `,
  );
}

/**
 * The published revision's text, so a republish of identical content can be
 * recognised as a no-op rather than appending a duplicate revision.
 */
async function readPublishedRevision(
  q: Queryable,
  postId: string,
  revisionId: string | null,
): Promise<{ title: string; body_markdown: string } | undefined> {
  if (revisionId === null) return undefined;
  const found = await rows<{ title: string; body_markdown: string }>(
    q,
    sql`
      SELECT title, body_markdown
        FROM post_revisions
       WHERE id = ${revisionId} AND post_id = ${postId}
    `,
  );
  return found[0];
}

export async function publishPost(
  executor: Executor,
  input: LifecycleInput,
): Promise<PublishResult> {
  const requestId = parseRequestId(input.requestId);
  const expectedVersion = parseExpectedVersion(input.expectedVersion);
  const key = { ...input, expectedVersion, requestId };

  return runInTransaction(executor, async (q) => {
    const { post, actorId } = await lockOwnedPost(q, key);

    const done = await alreadyDone(q, key, post, AUDIT_PUBLISHED);
    if (done !== undefined) {
      return {
        ...done,
        status: "published",
        publishedAt: requirePublishedAt(post.published_at),
      };
    }

    // ADR-007: `deleted -> published` is the only illegal transition. The post
    // must be restored first, so a deleted address never silently comes back.
    if (post.status === "deleted") {
      throw conflict("Restore the post before publishing it");
    }

    const draft = await readDraft(q, input.postId);

    // Already published: identical text is a no-op, but a stale token is still
    // a CONFLICT. That is what makes a concurrent publish lose rather than
    // silently return success.
    if (post.status === "published") {
      const published = await readPublishedRevision(
        q,
        input.postId,
        post.published_revision_id,
      );
      const unchanged =
        draft === undefined ||
        (published !== undefined &&
          published.title === draft.title &&
          published.body_markdown === draft.bodyMarkdown);

      if (unchanged) {
        if (draft !== undefined && draft.version !== expectedVersion) throw staleDraft(draft);
        return {
          id: input.postId,
          status: "published",
          version: draft?.version ?? 0,
          noOp: true,
          revisionId: post.published_revision_id,
          publishedAt: requirePublishedAt(post.published_at),
        };
      }
    }

    if (draft === undefined) throw validation("There is nothing to publish");

    const version = await claimVersion(q, input.postId, expectedVersion, "publish");

    // A publish appends the revision it makes public (A2). The pointer is the
    // revision's own id; a draft version is a compare-and-set token, not an id.
    const inserted = await rows<{ id: string }>(
      q,
      sql`
        INSERT INTO post_revisions (post_id, title, body_markdown)
        VALUES (${input.postId}, ${draft.title}, ${draft.bodyMarkdown})
        RETURNING id
      `,
    );
    const revisionId = inserted[0]!.id;

    // The draft's base is now the published revision, exactly as an explicit
    // save records it, so a later save diffs against what readers can see.
    await rows(
      q,
      sql`UPDATE draft_state SET base_revision_id = ${revisionId} WHERE post_id = ${input.postId}`,
    );

    // `published_at` is written once: COALESCE keeps the first publish time
    // across a republish, an unpublish and a restore.
    const updated = await rows<{ published_at: unknown }>(
      q,
      sql`
        UPDATE posts
           SET status = 'published',
               published_revision_id = ${revisionId},
               published_at = COALESCE(published_at, now()),
               updated_at = now()
         WHERE id = ${input.postId}
        RETURNING published_at
      `,
    );

    await writeAudit(q, {
      action: AUDIT_PUBLISHED,
      actorId,
      postId: input.postId,
      requestId,
      metadata: { previousStatus: post.status, revisionId },
    });

    return {
      id: input.postId,
      status: "published",
      version,
      noOp: false,
      revisionId,
      publishedAt: requirePublishedAt(updated[0]?.published_at),
    };
  });
}

/** The audit row is the idempotency record, so a retry needs no extra table. */
export async function alreadyDone(
  q: Queryable,
  input: LifecycleInput,
  post: LockedPost,
  action: string,
): Promise<LifecycleResult | undefined> {
  if (!(await wasAlreadyApplied(q, input.requestId, input.postId, action))) return undefined;
  const draftVersion = (await readDraft(q, input.postId))?.version ?? 0;
  return {
    id: input.postId,
    status: post.status,
    version: draftVersion,
    noOp: true,
    revisionId: post.published_revision_id as string | null,
    publishedAt: toDate(post.published_at) ?? undefined,
  };
}

/**
 * `published` -> `draft`. The pointer is cleared, so the public URL 404s;
 * `published_at` is deliberately kept, because a republish must not move it.
 */
export async function unpublishPost(
  executor: Executor,
  input: LifecycleInput,
): Promise<LifecycleResult> {
  const requestId = parseRequestId(input.requestId);
  const expectedVersion = parseExpectedVersion(input.expectedVersion);
  const key = { ...input, expectedVersion, requestId };

  return runInTransaction(executor, async (q) => {
    const { post, actorId } = await lockOwnedPost(q, key);

    const done = await alreadyDone(q, key, post, AUDIT_UNPUBLISHED);
    if (done !== undefined) return done;

    if (post.status === "deleted") throw conflict("A deleted post cannot be unpublished");
    if (post.status === "draft") {
      const draft = await readDraft(q, input.postId);
      return { id: input.postId, status: "draft", version: draft?.version ?? 0, noOp: true, revisionId: post.published_revision_id };
    }

    const version = await claimVersion(q, input.postId, expectedVersion, "transition");
    await rows(
      q,
      sql`
        UPDATE posts
           SET status = 'draft',
               published_revision_id = NULL,
               updated_at = now()
         WHERE id = ${input.postId}
      `,
    );
    await writeAudit(q, {
      action: AUDIT_UNPUBLISHED,
      actorId,
      postId: input.postId,
      requestId,
      metadata: { previousStatus: post.status },
    });
    return { id: input.postId, status: "draft", version, noOp: false, revisionId: post.published_revision_id };
  });
}

/**
 * `draft` or `published` -> `deleted`. Soft: rows and revisions survive, the
 * pointer is cleared, and `deleted_at` marks the state.
 */
export async function deletePost(
  executor: Executor,
  input: LifecycleInput,
): Promise<LifecycleResult> {
  const requestId = parseRequestId(input.requestId);
  const expectedVersion = parseExpectedVersion(input.expectedVersion);
  const key = { ...input, expectedVersion, requestId };

  return runInTransaction(executor, async (q) => {
    const { post, actorId } = await lockOwnedPost(q, key);

    const done = await alreadyDone(q, key, post, AUDIT_DELETED);
    if (done !== undefined) return done;

    if (post.status === "deleted") {
      const draft = await readDraft(q, input.postId);
      return { id: input.postId, status: "deleted", version: draft?.version ?? 0, noOp: true, revisionId: post.published_revision_id };
    }

    const version = await claimVersion(q, input.postId, expectedVersion, "transition");
    await rows(
      q,
      sql`
        UPDATE posts
           SET status = 'deleted',
               published_revision_id = NULL,
               deleted_at = now(),
               updated_at = now()
         WHERE id = ${input.postId}
      `,
    );
    await writeAudit(q, {
      action: AUDIT_DELETED,
      actorId,
      postId: input.postId,
      requestId,
      metadata: { previousStatus: post.status },
    });
    return { id: input.postId, status: "deleted", version, noOp: false, revisionId: post.published_revision_id };
  });
}

/** `deleted` -> `draft`. The only way back: restore first, then publish. */
export async function restorePost(
  executor: Executor,
  input: LifecycleInput,
): Promise<LifecycleResult> {
  const requestId = parseRequestId(input.requestId);
  const expectedVersion = parseExpectedVersion(input.expectedVersion);
  const key = { ...input, expectedVersion, requestId };

  return runInTransaction(executor, async (q) => {
    const { post, actorId } = await lockOwnedPost(q, key);

    const done = await alreadyDone(q, key, post, AUDIT_RESTORED);
    if (done !== undefined) return done;

    if (post.status !== "deleted") {
      const draft = await readDraft(q, input.postId);
      return { id: input.postId, status: post.status, version: draft?.version ?? 0, noOp: true, revisionId: post.published_revision_id };
    }

    const version = await claimVersion(q, input.postId, expectedVersion, "transition");
    await rows(
      q,
      sql`
        UPDATE posts
           SET status = 'draft',
               deleted_at = NULL,
               updated_at = now()
         WHERE id = ${input.postId}
      `,
    );
    await writeAudit(q, {
      action: AUDIT_RESTORED,
      actorId,
      postId: input.postId,
      requestId,
      metadata: { previousStatus: post.status },
    });
    return { id: input.postId, status: "draft", version, noOp: false, revisionId: post.published_revision_id };
  });
}

/** A published row always has a timestamp (`posts_published_at_check`). */
export function requirePublishedAt(value: unknown): Date {
  const parsed = toDate(value);
  if (parsed === null) throw new Error("A published post has no published_at");
  return parsed;
}
