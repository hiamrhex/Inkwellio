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
import type { PublicationSummary } from "./reads";

/**
 * The caller's own publications (WP3b).
 *
 * ADR-006 allows one publication per owner, so this is a zero-or-one list in
 * practice; it is a list because the editor asks "do I have a publication yet"
 * and a single optional row is the honest answer shape. The read is
 * owner-scoped: an anonymous caller is refused by `requireActor`, and the query
 * filters on the actor's id, so one owner can never enumerate another's.
 */

export async function listPublicationsForOwner(
  executor: Executor,
  actor: Actor,
): Promise<readonly PublicationSummary[]> {
  const user = requireActor(actor);
  const q: Queryable = queryable(executor);
  const found = await rows<Pick<PublicationSummary, "id" | "slug" | "name">>(
    q,
    sql`SELECT id, slug, name FROM publications WHERE owner_id = ${user.userId} ORDER BY created_at`,
  );
  return found.map((row) => ({ id: row.id, slug: row.slug, name: row.name }));
}

/**
 * Owner-scoped lookup by id, kept here beside the list so the editor's two
 * publication reads share one file. A missing id and a malformed id are the
 * same NOT_FOUND, and a publication owned by someone else is indistinguishable
 * from one that does not exist.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getOwnedPublication(
  executor: Executor,
  publicationId: string,
  actor: Actor,
): Promise<PublicationSummary> {
  const user = requireActor(actor);
  if (!UUID_PATTERN.test(publicationId)) throw notFound();

  const q: Queryable = queryable(executor);
  let found: Array<{ id: string; slug: string; name: string; owner_id: string }>;
  try {
    found = await rows<{ id: string; slug: string; name: string; owner_id: string }>(
      q,
      sql`SELECT id, slug, name, owner_id FROM publications WHERE id = ${publicationId}`,
    );
  } catch (error) {
    if (pgCode(error) === "22P02") throw notFound();
    throw error;
  }

  const hit = found[0];
  if (hit === undefined || hit.owner_id !== user.userId) throw notFound();
  return { id: hit.id, slug: hit.slug, name: hit.name };
}