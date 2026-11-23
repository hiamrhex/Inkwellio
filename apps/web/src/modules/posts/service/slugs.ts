import { sql } from "drizzle-orm";
import { parseSlug } from "@/modules/publications";
import { conflict, notFound, pgCode, type Actor } from "../errors";
import { rows, queryable, runInTransaction, type Executor, type Queryable } from "./executor";
import { assertOwner } from "./ownership";
import { loadPostOwner } from "./drafts";

/**
 * Rename and public slug resolution.
 *
 * Two invariants, both enforced here rather than by convention:
 *
 * 1. The retired address is written to `post_slug_history` *before* `posts.slug`
 *    moves, in the same transaction. A crash between the two statements then
 *    leaves a history row for an address that is still live (harmless) instead
 *    of a live address nobody can resolve (a 404 on a published link).
 * 2. An address is never reused by a different post. A deleted post keeps its
 *    live slug because the unique key includes deleted rows; an address retired
 *    by a rename is checked against history. A post may return to its own old
 *    address, which is why the history lookup excludes its own id.
 */

export type RenamePostInput = {
  readonly actor: Actor;
  readonly postId: string;
  readonly slug: string;
};

export type RenameResult = {
  readonly id: string;
  readonly slug: string;
  /** `false` when the post already had that address; no history is written. */
  readonly changed: boolean;
};

export type ResolvedPostSlug = {
  readonly postId: string;
  /** The post's current address; differs from the requested slug on a redirect. */
  readonly slug: string;
  readonly redirect: boolean;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function renamePost(
  executor: Executor,
  input: RenamePostInput,
): Promise<RenameResult> {
  const target = parseSlug(input.slug);

  return runInTransaction(executor, async (q) => {
    const ownerId = await loadPostOwner(q, input.postId);
    assertOwner(input.actor, ownerId);

    // The row lock serialises a rename against a concurrent publish or rename.
    // Everything below reads the version that won the lock.
    const locked = await rows<{ slug: string; status: string; publication_id: string }>(
      q,
      sql`SELECT slug, status, publication_id FROM posts WHERE id = ${input.postId} FOR UPDATE`,
    );
    const post = locked[0];
    if (post === undefined) throw notFound();

    // A deleted post keeps its address: releasing it would let a new post take
    // a URL that old links still point at.
    if (post.status === "deleted") {
      throw conflict("A deleted post keeps its address");
    }

    if (post.slug === target) {
      return { id: input.postId, slug: target, changed: false };
    }

    // Old addresses belong to the post that retired them, within one
    // publication. Returning to your own old address is allowed.
    const taken = await rows<{ post_id: string }>(
      q,
      sql`
        SELECT h.post_id
          FROM post_slug_history h
          JOIN posts p ON p.id = h.post_id
         WHERE p.publication_id = ${post.publication_id}
           AND h.slug = ${target}
           AND h.post_id <> ${input.postId}
         LIMIT 1
      `,
    );
    if (taken.length > 0) throw conflict("That address belonged to another post");

    // History first, pointer second. `ON CONFLICT DO NOTHING` makes a return to
    // a previously used address idempotent.
    await rows(
      q,
      sql`
        INSERT INTO post_slug_history (post_id, slug)
        VALUES (${input.postId}, ${post.slug})
        ON CONFLICT (post_id, slug) DO NOTHING
      `,
    );

    try {
      await rows(
        q,
        sql`UPDATE posts SET slug = ${target}, updated_at = now() WHERE id = ${input.postId}`,
      );
    } catch (error) {
      // A live post (including a deleted one) already holds this address.
      if (pgCode(error) === "23505") throw conflict("That slug is already taken");
      throw error;
    }

    return { id: input.postId, slug: target, changed: true };
  });
}

/**
 * Resolve a public address inside one publication.
 *
 * The live slug wins over history: a post that has moved back to an old address
 * resolves without a redirect. Drafts and deleted posts do not resolve at all,
 * and a slug is never matched across publications.
 */
export async function resolvePostSlug(
  executor: Executor,
  publicationId: string,
  slug: string,
): Promise<ResolvedPostSlug | undefined> {
  if (!UUID_PATTERN.test(publicationId)) return undefined;

  const q: Queryable = queryable(executor);

  const live = await rows<{ id: string }>(
    q,
    sql`
      SELECT id
        FROM posts
       WHERE publication_id = ${publicationId}
         AND slug = ${slug}
         AND status = 'published'
         AND deleted_at IS NULL
       LIMIT 1
    `,
  );
  const current = live[0];
  if (current !== undefined) return { postId: current.id, slug, redirect: false };

  const historical = await rows<{ id: string; slug: string }>(
    q,
    sql`
      SELECT p.id, p.slug
        FROM post_slug_history h
        JOIN posts p ON p.id = h.post_id
       WHERE h.slug = ${slug}
         AND p.publication_id = ${publicationId}
         AND p.status = 'published'
         AND p.deleted_at IS NULL
       ORDER BY h.created_at DESC
       LIMIT 1
    `,
  );
  const old = historical[0];
  if (old === undefined) return undefined;

  return { postId: old.id, slug: old.slug, redirect: true };
}
