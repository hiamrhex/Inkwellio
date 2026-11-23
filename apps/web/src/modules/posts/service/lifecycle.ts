import { sql } from "drizzle-orm";
import { conflict, forbidden, notFound, pgCode, requireActor, validation, type Actor } from "@/modules/publications";
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

/** A post row as the lifecycle reads it, after the ownership check. */
export type LockedPost = {
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
      SELECT status, published_revision_id, published_at
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

export async function publishPost(
  executor: Executor,
  input: LifecycleInput,
): Promise<LifecycleResult> {
  const requestId = parseRequestId(input.requestId);
  const expectedVersion = parseExpectedVersion(input.expectedVersion);

  return runInTransaction(executor, async (q) => {
    const { post: post, actorId } = await lockOwnedPost(q, { ...input, expectedVersion });
    const requiredActor = requireActor({ userId: actorId } as Actor);

    const done = await alreadyDone(q, { ...input, expectedVersion, requestId }, post, AUDIT_PUBLISHED);
    if (done !== undefined) return done;

    if (post.status === "published") {
      const draft = await readDraft(q, input.postId);
      return { id: input.postId, status: "published", version: draft?.version ?? 0, noOp: true, revisionId: post.published_revision_id };
    }

    const version = await claimVersion(q, input.postId, expectedVersion, "publish");
    await rows(
      q,
      sql`
        UPDATE posts
           SET status = 'published',
               published_revision_id = ${version},
               published_at = now(),
               updated_at = now()
         WHERE id = ${input.postId}
      `,
    );
    await writeAudit(q, {
      action: AUDIT_PUBLISHED,
      actorId: actorId,
      postId: input.postId,
      requestId,
      metadata: { previousStatus: post.status, publishedAt: post.published_at },
    });
    return { id: input.postId, status: "published", version, noOp: false, revisionId: String(version) };
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
    const draftAfter = await readDraft(q, input.postId);
    return { id: input.postId, status: "deleted", version: draftAfter?.version ?? 0, noOp: false, revisionId: post.published_revision_id };
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
    const draftAfter = await readDraft(q, input.postId);
    return { id: input.postId, status: "draft", version: draftAfter?.version ?? 0, noOp: false, revisionId: post.published_revision_id };
  });
}

/** A published row always has a timestamp (`posts_published_at_check`). */
export function requirePublishedAt(value: unknown): Date {
  const parsed = toDate(value);
  if (parsed === null) throw new Error("A published post has no published_at");
  return parsed;
}
