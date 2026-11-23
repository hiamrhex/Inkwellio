import { forbidden, notFound } from "./errors";

/**
 * The identity boundary, declared rather than imported.
 *
 * The service layer must not reach into `modules/identity`: the route layer
 * (WP3b) binds this port to the real session and the real policy, and the tests
 * bind it to a fake. The types below are a transcription of
 * `docs/handoffs/identity-api.md` v1.0.0 (WP2a -> WP3a), section 2.
 *
 * Two actor types exist on purpose and must not be confused:
 *
 * - `Actor` here is the *identity* actor at the boundary, the one
 *   `authorize()` understands: `{ type: "anonymous" } | { type: "user"; ... }`.
 * - The service's own `Actor` (`./errors`) is the row-scoped shape the write
 *   and read paths use: `{ userId } | null`. It carries no policy.
 *
 * The WP3b adapter is the only place that converts one into the other. The
 * conversion is total: `null -> { type: "anonymous" }`, and
 * `{ userId } -> { type: "user", id: userId, role }` with the role read from the
 * session at that boundary.
 *
 * Denials are reported with the domain error the caller already has: reads use
 * `notFound()` and writes use `forbidden()`, which is exactly the contract's
 * NOT_FOUND / FORBIDDEN split. The kernel has neither a FORBIDDEN public code
 * nor a `ForbiddenError` class on this branch, so the mapping from these
 * ServiceErrors to HTTP is WP3b's job.
 */

export type Actor =
  | { type: "anonymous" }
  | { type: "user"; id: string; role: "user" | "admin" };

export type PostStatus = "draft" | "published" | "deleted";

export type Resource =
  | { type: "user"; id: string }
  | { type: "publication"; id: string; ownerId: string }
  | {
      type: "post";
      id: string;
      publicationId: string;
      ownerId: string;
      status: PostStatus;
    }
  | { type: "account"; action: "export" | "delete"; userId: string };

export type Action =
  | "sign_up"
  | "sign_in"
  | "sign_out"
  | "verify_email"
  | "reset_password"
  | "change_password"
  | "delete_account"
  | "export_data"
  | "create_publication"
  | "update_publication"
  | "delete_publication"
  | "create_post"
  | "update_post"
  | "delete_post"
  | "publish_post"
  | "autosave_post"
  | "read_publication"
  | "read_post";

/** Contract section 2.4. Pure, total, and falsy by default. */
export type Authorize = (actor: Actor, action: Action, resource: Resource) => boolean;

/** The post facts a decision needs, resolved from the row before the check. */
export type PostAccess = {
  readonly id: string;
  readonly publicationId: string;
  readonly ownerId: string;
  readonly status: PostStatus;
};

/** Contract section 5, verbatim in shape. */
export interface AuthorizationPort {
  /** Throws NOT_FOUND: a draft must be indistinguishable from a missing post. */
  assertCanReadPost(actor: Actor, post: PostAccess): void;
  /** Throws FORBIDDEN: the caller may know the post exists but may not change it. */
  assertCanWritePost(actor: Actor, post: PostAccess): void;
  /** Throws FORBIDDEN. */
  assertCanPublishPost(actor: Actor, post: PostAccess): void;
}

/**
 * Bind the port to any policy function. The WP3b adapter passes identity's
 * `authorize`; tests pass `fakeAuthorize` below or their own spy.
 */
export function createAuthorizationPort(authorize: Authorize): AuthorizationPort {
  return {
    assertCanReadPost(actor, post) {
      const allowed = authorize(actor, "read_post", {
        type: "post",
        id: post.id,
        publicationId: post.publicationId,
        ownerId: post.ownerId,
        status: post.status,
      });
      if (!allowed) throw notFound();
    },

    assertCanWritePost(actor, post) {
      const allowed = authorize(actor, "update_post", {
        type: "post",
        id: post.id,
        publicationId: post.publicationId,
        ownerId: post.ownerId,
        status: post.status,
      });
      if (!allowed) throw forbidden("Not permitted to modify this post");
    },

    assertCanPublishPost(actor, post) {
      const allowed = authorize(actor, "publish_post", {
        type: "post",
        id: post.id,
        publicationId: post.publicationId,
        ownerId: post.ownerId,
        status: post.status,
      });
      if (!allowed) throw forbidden("Not permitted to publish this post");
    },
  };
}

/** The decision matrix from contract section 3, limited to the post actions
 * this port performs. Everything not named is denied. */
export function fakeAuthorize(actor: Actor, action: Action, resource: Resource): boolean {
  if (resource.type !== "post") return false;

  const isAdmin = actor.type === "user" && actor.role === "admin";
  const isOwner = actor.type === "user" && actor.id === resource.ownerId;
  const isPublished = resource.status === "published";

  switch (action) {
    case "read_post":
      return isPublished || isOwner || isAdmin;
    case "update_post":
      return isOwner || isAdmin;
    case "delete_post":
      return isOwner || isAdmin;
    case "autosave_post":
      return (isOwner || isAdmin) && resource.status !== "deleted";
    case "publish_post":
      return (isOwner || isAdmin) && resource.status !== "deleted";
    default:
      return false;
  }
}

/** Test double with a real decision, so a test that wires it in cannot pass on
 * a no-op allow. The actor is supplied per call, exactly as in production. */
export function createFakeAuthorizationPort(): AuthorizationPort {
  return createAuthorizationPort(fakeAuthorize);
}

/**
 * `authorize()` is synchronous and pure, so a port built from it can be too.
 * Exported for the WP3b adapter and for seam tests; nothing in WP3a calls it.
 */
export const identityActorFromUserId = (
  userId: string | null,
  role: "user" | "admin" = "user",
): Actor => (userId === null ? { type: "anonymous" } : { type: "user", id: userId, role });
