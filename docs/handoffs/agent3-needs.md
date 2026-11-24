# Agent 3 Handoff: Identity Divergences & Appendix-Only Revision Schema Gap

## Agent 1's 3 `authorize()` Divergences (as of PR #8 merge to `origin/main`)

The identity API contract ( `docs/handoffs/identity-api.md` v1.0.0) defines the `authorize(actor, action, resource): boolean` decision matrix. Three points diverge from the WP3a service layer's actual enforcement, documented here for WP3b bridge work.

### 1. Anonymous draft-read existence leak
- **Spec (identity-api.md §3, Decision Matrix):** `read_post` with `status: "draft"` → **DENY** for anonymous; anonymous must learn nothing about whether the post exists.
- **WP3a service reality:** `getPostById` / `resolvePostSlug` throw `NOT_FOUND` with **no details** for drafts/malformed ids/missing ids — all indistinguishable. This matches the spec's "deny by default" but the service goes further: it never reveals whether a post exists to a non-owner, even transiently via error messages or timing.
- **Gap:** The identity API returns `false` (boolean); the service throws `NOT_FOUND`. Both achieve "deny and hide," but the error type differs. WP3b maps `NOT_FOUND` → HTTP 404 and `FORBIDDEN` → HTTP 403 at the boundary.

### 2. Cross-tenant post write (User B writing User A's post)
- **Spec (identity-api.md §3, Decision Matrix):** `update_post` where resource is `post` and User B does NOT own it → **DENY** (`false`). `authorize(userB, "update_post", postA)` must return `false`.
- **WP3a service reality:** `assertOwner(actor, ownerId)` in `posts/service/ownership.ts` explicitly checks `user.userId !== ownerId` and throws `forbidden("You do not own this post")`. This maps to code `"FORBIDDEN"`. The identity API contract does not prescribe the error code — only the boolean `false` — so the service's typed `ServiceError` is an implementation detail for WP3b.
- **Gap:** Identity returns `boolean`; service throws `ServiceError.FORBIDDEN`. Both deny the action, but the service adds a detailed message. WP3b will map `FORBIDDEN` at the HTTP boundary.

### 3. Published-post readability for non-owner
- **Spec (identity-api.md §3, Decision Matrix):** `read_post` where resource is `post` with `status: "published"` → **ALLOW** for any actor (anonymous + userA + userB + admin all allow). Published content is universally readable.
- **WP3a service reality:** `getPostById` is owner-scoped: anonymous → `FORBIDDEN`; non-owner → `NOT_FOUND`; owner → the post (any status). `resolvePostSlug` is public: anyone can resolve a published slug. The identity API's "ALLOW for published" applies to the identity-boundary check, but the service adds owner-scope distinctions below that layer.
- **Gap:** Identity says "anyone can read published"; the service adds owner-distinction for `getPostById` (owner sees any state, everyone else sees only published). This is intentional — the service layer keeps its own `ServiceError` system, and WP3b maps the boundary.

## Appendix-Only Revision Schema Gap

- **Observation:** The `post_revisions` table has no database-level append-only enforcement (no `ROW SECURITY`, no trigger preventing `UPDATE`/`DELETE`). The append-only guarantee is purely conceptual: writes go through the service layer, which never updates a revision row, and deletions are only via account erasure (amendment A6).
- **Risk:** If a future script or migration adds `ON DELETE SET NULL` on the composite FK `posts_published_revision_fk`, the `id` column would also be nulled because the key is `(published_revision_id, id)`. This would break the pointer invariants without a migration.
- **Mitigation:** The service layer and the `posts_published_pointer_check` / `posts_deleted_at_check` CHK constraints enforce the invariants at the SQL level. The revision rows are append-only by construction (never updated, only inserted). Document this gap so a future amendment can add real DB enforcement if needed.
- **Reference:** ADR-007 § "Consequences" — "Revisions are never updated, and they are deleted only by account erasure (amendment A6). Post deletion is soft; storage grows with editorial events, so archival policy is a later decision."