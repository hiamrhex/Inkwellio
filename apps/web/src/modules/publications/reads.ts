import { sql } from "drizzle-orm";
import {
  notFound,
  pgCode,
  queryable,
  requireActor,
  rows,
  type Actor,
  type Executor,
  type Queryable,
} from "./domain";

/**
 * Publication reads.
 *
 * There are two audiences and they are not the same query:
 *
 * - The public page resolves `/@slug`, so `getPublicationBySlug` is open to
 *   anyone and returns `undefined` for a slug that does not exist.
 * - The editor loads its own publication by id. That read is owner-scoped:
 *   anonymous is refused, and an authenticated non-owner gets the same
 *   `notFound()` as a publication that does not exist, so the id cannot be
 *   probed for someone else's publication.
 */

export type PublicationSummary = {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
};

type PublicationRow = {
  id: string;
  slug: string;
  name: string;
  owner_id: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Public lookup by the `/@slug` address. Case folding is a DB CHECK, so a
 * mixed-case slug simply does not match; no `lower()` here. */
export async function getPublicationBySlug(
  executor: Executor,
  slug: string,
): Promise<PublicationSummary | undefined> {
  const q: Queryable = queryable(executor);
  const found = await rows<Pick<PublicationRow, "id" | "slug" | "name">>(
    q,
    sql`SELECT id, slug, name FROM publications WHERE slug = ${slug}`,
  );
  const hit = found[0];
  if (hit === undefined) return undefined;
  return { id: hit.id, slug: hit.slug, name: hit.name };
}

/** Owner-scoped lookup by id, for the editor. */
export async function getPublicationById(
  executor: Executor,
  publicationId: string,
  actor: Actor,
): Promise<PublicationSummary> {
  const user = requireActor(actor);
  if (!UUID_PATTERN.test(publicationId)) throw notFound();

  const q: Queryable = queryable(executor);

  let found: PublicationRow[];
  try {
    found = await rows<PublicationRow>(
      q,
      sql`SELECT id, slug, name, owner_id FROM publications WHERE id = ${publicationId}`,
    );
  } catch (error) {
    if (pgCode(error) === "22P02") throw notFound();
    throw error;
  }

  const hit = found[0];
  // Missing and not-yours collapse into one indistinguishable failure.
  if (hit === undefined || hit.owner_id !== user.userId) throw notFound();

  return { id: hit.id, slug: hit.slug, name: hit.name };
}
