import { sql } from "drizzle-orm";
import {
  conflict,
  forbidden,
  notFound,
  pgCode,
  parseSlug,
  queryable,
  requireActor,
  rows,
  withNumericSuffix,
  type Actor,
  type Executor,
} from "@/modules/publications";

/**
 * Create a draft post inside a publication the caller owns (WP3b).
 *
 * WP3a owns the lifecycle (publish, unpublish, delete, restore) and the draft
 * compare-and-set; it deliberately has no "create the row" step, because the
 * WP3a suites insert the post row directly to isolate the transition under
 * test. The HTTP boundary needs that step, so it lives here as a thin,
 * additive service rather than inside the transition code.
 *
 * Two invariants, both enforced here rather than by convention:
 *
 * 1. A stranger cannot create a post in someone else's publication. The
 *    publication's owner is read first and compared, exactly as the draft and
 *    lifecycle paths compare the post owner. A missing publication and a
 *    malformed id are the same indistinguishable NOT_FOUND.
 * 2. The slug is unique per publication (the DB unique key is the backstop).
 *    A generated slug is suffixed until it is free, so a create never fails on
 *    a collision the caller did not choose.
 */

export type CreatePostInput = {
  readonly actor: Actor;
  readonly publicationId: string;
  /** Explicit address. When omitted, one is derived from `post`. */
  readonly slug?: string;
};

export type CreatePostResult = {
  readonly id: string;
  readonly slug: string;
};

/** How many numeric suffixes a generated slug will try before giving up. */
const MAX_SLUG_ATTEMPTS = 20;

export async function createPost(
  executor: Executor,
  input: CreatePostInput,
): Promise<CreatePostResult> {
  const user = requireActor(input.actor);
  const q = queryable(executor);

  // Ownership is decided on the row, not delegated to identity's boolean.
  let owner: string;
  try {
    const found = await rows<{ owner_id: string }>(
      q,
      sql`SELECT owner_id FROM publications WHERE id = ${input.publicationId}`,
    );
    if (found.length === 0) throw notFound();
    owner = found[0]!.owner_id;
  } catch (error) {
    // A malformed publication id is a 22P02 from the driver; it must read as a
    // missing publication, never a 500 that leaks the column type.
    if (pgCode(error) === "22P02") throw notFound();
    throw error;
  }
  if (owner !== user.userId) throw forbidden("You do not own this publication");

  const base = input.slug === undefined ? "post" : parseSlug(input.slug);

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
    const candidate = attempt === 0 ? base : withNumericSuffix(base, attempt + 1);

    // `ON CONFLICT DO NOTHING` without a target covers the per-publication
    // unique key without raising 23505, which would abort the transaction.
    const inserted = await rows<CreatePostResult>(
      q,
      sql`
        INSERT INTO posts (publication_id, slug, status)
        VALUES (${input.publicationId}, ${candidate}, 'draft')
        ON CONFLICT DO NOTHING
        RETURNING id, slug
      `,
    );
    if (inserted.length === 1) return inserted[0]!;

    if (input.slug !== undefined) throw conflict("That slug is already taken");
    // A generated slug collided: try the next suffix.
  }

  throw conflict("Could not find a free slug for that post");
}