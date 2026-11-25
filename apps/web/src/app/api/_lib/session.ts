import { getAuth } from "@/modules/identity";
import type { Actor } from "@/modules/publications";
import { UnauthorizedError } from "./respond";

/**
 * Resolve the acting user from the request's session, using identity's public
 * export only (`getAuth`). This is the single WP3b adapter that converts the
 * identity boundary into the service `Actor` (`{ userId } | null`):
 *
 *   no session          -> null           (anonymous)
 *   session with a user -> { userId }
 *
 * The role is deliberately not carried here: the WP3a services enforce
 * ownership on the row (`assertOwner`), not through identity's boolean, so the
 * service actor needs only the id. Admin override is a WP3b policy concern and
 * is not wired in Part 1.
 *
 * `requireUser` is the fail-closed variant the write/owner routes use: a
 * missing session becomes `UnauthorizedError`, which the mapper renders as 401
 * before any service call runs.
 */

export async function resolveActor(headers: Headers): Promise<Actor> {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers });
  const userId = session?.user?.id;
  if (typeof userId !== "string" || userId.length === 0) return null;
  return { userId };
}

export async function requireUser(headers: Headers): Promise<{ readonly userId: string }> {
  const actor = await resolveActor(headers);
  if (actor === null) throw new UnauthorizedError();
  return actor;
}