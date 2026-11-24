import { sql } from "drizzle-orm";
import {
  conflict,
  requireActor,
  rows,
  type Actor,
  type Executor,
} from "./domain";
import { queryable } from "./domain";
import { parseSlug, slugify, withNumericSuffix } from "./slugs";
import { parsePublicationName } from "./validation";

/**
 * A publication is created once per owner (ADR-006). The service owns the
 * ownership rule rather than delegating it: identity's `authorize()` lets an
 * anonymous reader through today, and this path must not depend on that.
 */

export type Publication = { readonly id: string; readonly slug: string; readonly created: boolean };

export type EnsurePublicationInput = {
  readonly actor: Actor;
  readonly name: string;
  /** Explicit address. When omitted, one is derived from `name`. */
  readonly slug?: string;
};

/** How many numeric suffixes a generated slug will try before giving up. */
const MAX_SLUG_ATTEMPTS = 20;

export async function ensurePublication(
  executor: Executor,
  input: EnsurePublicationInput,
): Promise<Publication> {
  const actor = requireActor(input.actor);
  const name = parsePublicationName(input.name);
  const explicit = input.slug === undefined ? undefined : parseSlug(input.slug);
  const base = explicit ?? slugify(name, { fallback: "publication", reserved: true });
  const q = queryable(executor);

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
    const candidate = attempt === 0 ? base : withNumericSuffix(base, attempt + 1);

    // `ON CONFLICT DO NOTHING` without a target covers both unique keys
    // (owner_id and slug). Using the owner key alone would let a slug collision
    // raise 23505, which aborts the surrounding transaction in Postgres.
    const inserted = await rows<{ id: string; slug: string }>(
      q,
      sql`
        INSERT INTO publications (owner_id, slug, name)
        VALUES (${actor.userId}, ${candidate}, ${name})
        ON CONFLICT DO NOTHING
        RETURNING id, slug
      `,
    );
    if (inserted.length === 1) {
      return { ...inserted[0]!, created: true };
    }

    // Either this owner already has a publication, or the slug belongs to
    // someone else. The owner lookup distinguishes the two.
    const existing = await rows<{ id: string; slug: string }>(
      q,
      sql`SELECT id, slug FROM publications WHERE owner_id = ${actor.userId}`,
    );
    if (existing.length === 1) {
      return { ...existing[0]!, created: false };
    }

    if (explicit !== undefined) {
      throw conflict("That slug is already taken");
    }
    // A generated slug collided: try the next suffix.
  }

  throw conflict("Could not find a free slug for that name");
}
