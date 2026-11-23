import type { Actor } from "@/modules/publications";

/**
 * Identity is a port, not an import.
 *
 * `docs/handoffs/identity-api.md` did not exist when this layer was built, and
 * the kernel has no FORBIDDEN code yet. The route layer will implement this
 * port with the real session; tests use the fake below. Nothing in the service
 * layer calls `authorize()` — ownership is enforced here, on the row.
 */
export type { Actor };

export interface AuthorizationPort {
  /** The acting user for this request, or `null` when anonymous. Must not throw. */
  currentActor(): Promise<Actor>;
}

/** Test double. Deliberately boring: the point is that the service never sees
 * a session object, only an actor. */
export function createFakeAuthorizationPort(actor: Actor): AuthorizationPort {
  return {
    async currentActor() {
      return actor;
    },
  };
}
