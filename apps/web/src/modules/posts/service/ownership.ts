import { forbidden, notFound, requireActor, type Actor } from "@/modules/publications";

/**
 * Ownership is decided here, on the row, not delegated to identity.
 *
 * A write by a stranger is FORBIDDEN. A read of a draft by a stranger must be
 * indistinguishable from a read of a post that does not exist, so that path
 * throws `notFound()` with no details.
 */

export function assertOwner(actor: Actor, ownerId: string): { readonly userId: string } {
  const user = requireActor(actor);
  if (user.userId !== ownerId) throw forbidden("You do not own this post");
  return user;
}

export function isOwner(actor: Actor, ownerId: string): boolean {
  return actor !== null && actor.userId === ownerId;
}

/** Used by draft reads: the caller learns nothing about whether the row exists. */
export function assertCanReadDraft(actor: Actor, ownerId: string): void {
  if (!isOwner(actor, ownerId)) throw notFound();
}
