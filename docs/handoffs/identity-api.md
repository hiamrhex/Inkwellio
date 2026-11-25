# Identity & Authorization API Contract (WP2a -> WP3a Handoff)

**Document Version:** 1.0.0  
**Authors:** Agent 1 (Identity & Kernel)  
**Consumer:** Agent 3 (Posts & Publications Services)  
**Target File:** `apps/web/src/modules/identity/authorize.ts` (re-exported by `apps/web/src/modules/identity/index.ts`)

---

## 1. Overview & Purpose

This contract defines the types, signatures, and decision semantics for authorization in Inkwellio.
Agent 3's post and publication services require authorization checks (`AuthorizationPort`).
This document guarantees the contract so Agent 3 can implement or bind its port without breaking changes when Agent 1's full identity core merges.

---

## 2. Types & Signatures

### 2.1 Actor

```typescript
export type Actor =
  | { type: "anonymous" }
  | { type: "user"; id: string; role: "user" | "admin" };
```

- An anonymous visitor has `{ type: "anonymous" }`.
- An authenticated user has `{ type: "user"; id: string; role: "user" | "admin" }`.

### 2.2 Resource

```typescript
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
```

### 2.3 Action

```typescript
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
```

### 2.4 Authorize Function Signature

```typescript
export function authorize(actor: Actor, action: Action, resource: Resource): boolean;
```

- **Pure function**: `authorize` has no network/DB side effects and does not throw.
- **Fail closed / Deny by default**: Any combination of actor, action, and resource not explicitly permitted returns `false`.

---

## 3. Decision Matrix

| Action | Resource Type & State | Anonymous | User A (Owns Resource) | User B (Does NOT Own) | Admin |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `read_post` | `post` (`status: "published"`) | **ALLOW** | **ALLOW** | **ALLOW** | **ALLOW** |
| `read_post` | `post` (`status: "draft"`) | **DENY** | **ALLOW** | **DENY** | **ALLOW** |
| `read_post` | `post` (`status: "deleted"`) | **DENY** | **ALLOW** | **DENY** | **ALLOW** |
| `create_post` | `publication` (target) | **DENY** | **ALLOW** | **DENY** | **ALLOW** |
| `update_post` | `post` (any status) | **DENY** | **ALLOW** | **DENY** | **ALLOW** |
| `autosave_post`| `post` (draft/published) | **DENY** | **ALLOW** | **DENY** | **ALLOW** |
| `publish_post` | `post` (draft/published) | **DENY** | **ALLOW** | **DENY** | **ALLOW** |
| `delete_post`  | `post` (any status) | **DENY** | **ALLOW** | **DENY** | **ALLOW** |
| `read_publication` | `publication` | **ALLOW** | **ALLOW** | **ALLOW** | **ALLOW** |
| `create_publication` | `user` | **DENY** | **ALLOW** | **DENY** | **ALLOW** |
| `update_publication` | `publication` | **DENY** | **ALLOW** | **DENY** | **ALLOW** |
| `delete_publication` | `publication` | **DENY** | **ALLOW** | **DENY** | **ALLOW** |
| `export_data` | `account` (`userId: A`) | **DENY** | **ALLOW** | **DENY** | **DENY**\* |
| `delete_account` | `account` (`userId: A`) | **DENY** | **ALLOW** | **DENY** | **DENY**\* |
| `sign_up` / `sign_in` | `user` | **ALLOW** | **ALLOW** | **ALLOW** | **ALLOW** |
| `sign_out` | any | **DENY** | **ALLOW** | **ALLOW** | **ALLOW** |

\* *Admin cannot export or self-delete another user's account through the user self-service actions (prevents data harvesting). Dedicated administrative audit/moderation actions are distinct.*

---

## 4. Denial & Error Reporting

`authorize()` returns a boolean. Higher layers (services and route handlers) report denials using standard domain errors:

1. **Information Leak Protection (Reads):**
   - When an unauthenticated actor or non-owner requests a resource that is not published (e.g. `status: "draft"` or `status: "deleted"`), services MUST NOT reveal its existence.
   - Return or throw `NotFoundError` (`NOT_FOUND` / HTTP 404).

2. **Modification / Mutation Denials (Writes):**
   - When an actor attempts to modify, publish, or delete a resource they do not have rights to modify (e.g. User B attempts to update or publish User A's post):
   - Throw `ForbiddenError` (`FORBIDDEN` / HTTP 403).
   - Note: The `FORBIDDEN` error code and `ForbiddenError` class are provided in `origin/kernel-forbidden` (cherry-picked from `1f80152`). Once PR is merged, it is imported from `@/kernel/errors`. Until then, Agent 3's domain error maps cleanly to code `"FORBIDDEN"`.

3. **Unauthenticated Access to Protected Mutation:**
   - If an anonymous actor attempts a mutation, route handlers or services report `UnauthorizedError` (`UNAUTHORIZED` / HTTP 401).

---

## 5. Agent 3 `AuthorizationPort` Compatibility

Agent 3 defines an `AuthorizationPort` in `modules/posts/ports.ts`. Here is how the adapter is constructed:

```typescript
import { authorize, type Actor, type Resource } from "@/modules/identity";
import { ForbiddenError, NotFoundError } from "@/kernel/errors";

export interface AuthorizationPort {
  assertCanReadPost(actor: Actor, post: { id: string; publicationId: string; ownerId: string; status: "draft" | "published" | "deleted" }): void;
  assertCanWritePost(actor: Actor, post: { id: string; publicationId: string; ownerId: string; status: "draft" | "published" | "deleted" }): void;
  assertCanPublishPost(actor: Actor, post: { id: string; publicationId: string; ownerId: string; status: "draft" | "published" | "deleted" }): void;
}

export const identityAuthorizationAdapter: AuthorizationPort = {
  assertCanReadPost(actor, post) {
    const allowed = authorize(actor, "read_post", {
      type: "post",
      id: post.id,
      publicationId: post.publicationId,
      ownerId: post.ownerId,
      status: post.status,
    });
    if (!allowed) {
      // Hide drafts from unauthorized callers to prevent existence enumeration
      throw new NotFoundError("Post not found");
    }
  },

  assertCanWritePost(actor, post) {
    const allowed = authorize(actor, "update_post", {
      type: "post",
      id: post.id,
      publicationId: post.publicationId,
      ownerId: post.ownerId,
      status: post.status,
    });
    if (!allowed) {
      throw new ForbiddenError("Not permitted to modify this post");
    }
  },

  assertCanPublishPost(actor, post) {
    const allowed = authorize(actor, "publish_post", {
      type: "post",
      id: post.id,
      publicationId: post.publicationId,
      ownerId: post.ownerId,
      status: post.status,
    });
    if (!allowed) {
      throw new ForbiddenError("Not permitted to publish this post");
    }
  },
};
```

### Disagreements or Open Items with Agent 3
None. Agent 3's test requirements in `WP3a-plan.md` ("B reading A's draft = NOT_FOUND, B writing A's post = FORBIDDEN") match this specification exactly.
