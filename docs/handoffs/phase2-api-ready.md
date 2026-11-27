# Phase 2 API readiness (verified contracts)

**Unverified.** This note reports contracts read from source and exercised by
the tests named below. No deployed environment was used. It is written for the
Phase 2 frontend agent so endpoints can be consumed without guessing shapes.

## Screen → endpoint map

| Screen | Data source | Verified contract |
| --- | --- | --- |
| `/dashboard` | **Not an HTTP API.** `apps/web/src/app/dashboard/page.tsx:8-10,22` calls `loadDashboardData(actor)` from `@/components/studio/server-data`. | RSC loader returns `{kind:"unavailable"}` or `{publication, posts}`. No fetch contract to implement. |
| `/studio/[postId]` | `PUT /api/posts/:id/draft`, `PUT /api/posts/:id/topics`, `POST /api/posts/:id/{publish,unpublish,delete,restore,slug}`; create via `POST /api/posts`. | See below. The editor's save call is at `apps/web/src/components/studio/studio-editor.tsx:137-147`. |
| `/history` (revisions/trash/restore) | **No screen and no revisions/trash API route exist on this branch.** `apps/web/src/app` has no `history` directory; `apps/web/src/app/api` has no `revisions` or `trash` route. The only recovery endpoint is `POST /api/posts/:id/restore` (`deleted -> draft`). | A Phase 2 history screen needs a new list endpoint; the backend contract for it is `Unverified` because nothing exists to call. |
| `/settings/privacy` | `GET /api/account/export`, `POST /api/account/erasure/request`, `POST /api/account/erasure/confirm`, `DELETE /api/account`. | See below. |

## Verified endpoint contracts

### Draft save (autosave and manual)

`PUT /api/posts/:id/draft` — body
`{expectedVersion: integer >= 0, title: string 1..200 single-line, bodyMarkdown: string 1..102400 UTF-8 bytes}`.
- `200` → `{version, updatedAt}`. The studio updates its local version from this (`studio-editor.tsx:173-177`).
- `409` → kernel error with `details.currentVersion`, `details.currentTitle`, `details.currentBodyMarkdown`; the editor applies these through `handleApplyConflictReload` (`studio-editor.tsx:194-204`).
- `400` → `VALIDATION_ERROR` for a malformed body or a bad field (`readJsonObject`, `requireVersion`, `requireString` in `apps/web/src/app/api/_lib/body.ts`).
- `401` missing session, `403` stranger, `404` missing post.
- `429` → `{code:"RATE_LIMITED",status:429,message,requestId}` plus `Retry-After`; 120/min per user (`wp8-write-limits.test.ts`).
- `503` → `{code:"UNAVAILABLE",status:503,message,requestId}` when the counter store is unreachable; no `Retry-After`.

Other lifecycle routes return `200` with the post snapshot, `409` with current
draft details on a stale `expectedVersion`, `403` for a stranger, `404` for a
missing row, and the same 429/503 shapes after 30 structural writes/minute.
A `POST /api/posts` success is `201`; `POST /api/publications` is `201` when
created and `200` when the publication already existed (ADR-006, max one).

### List and pagination shapes

- `GET /api/publications` → `{publications: [...]}` (0 or 1 row by ADR-006).
- `GET /api/posts/:id` → a single post; published posts are public, drafts and deleted posts are `404` for strangers.
- `GET /api/search?q=&topic=&limit=&after=&afterId=` → `{query, items, nextCursor}`; `q` 1..100, `limit` 1..50, cursor must include both `after` and `afterId`. Errors are `{error: PublicError}`.
- There is **no** revisions/trash list endpoint; do not design a history screen around one without a backend change.

### Privacy endpoints

- `GET /api/account/export` → `200` JSON export with `content-disposition: attachment`; `413` with code `PAYLOAD_TOO_LARGE` above 25 MB; `429` after 1 request/hour with `Retry-After`.
- `POST /api/account/erasure/request` → body `{password}`; `202` `{requested:true,expiresInSeconds}`. Malformed JSON is now `400 VALIDATION_ERROR` with message "A JSON object body is required" (`apps/web/tests/wp8-identity-body.test.ts`), instead of being silently treated as an empty object.
- `POST /api/account/erasure/confirm` → body `{token}`; `200` `{erased:true,deletedCounts}`; `400` when the token is missing or the body is malformed; `410` when expired; `403`/`404` for owner/missing-row failures.
- `DELETE /api/account` delegates to the same confirm handler with cache invalidation.

Every error body in these routes carries `requestId` (reused from
`x-request-id` when supplied) and a code from the closed kernel vocabulary; a
stack trace, SQL text or SMTP detail is never rendered.

## Tests backing this note

- `apps/web/tests/wp8-write-limits.test.ts` — 7 tests, autosave burst, flood, outage, route wiring.
- `apps/web/tests/wp8-identity-body.test.ts` — 6 tests, strict JSON body contract.
- `apps/web/tests/db/full-backend-e2e.test.ts` — full multi-user lifecycle and erasure with zero residue.
- `apps/web/tests/db/wp3b-routes.test.ts`, `wp3b-cache.test.ts`, `wp3b-post-topics.test.ts` — route-level lifecycle and cache seams on real Postgres.
