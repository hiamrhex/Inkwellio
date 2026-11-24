/**
 * Public API of the posts module.
 *
 * The identity-boundary types from `./ports` are exported under explicit names.
 * `Actor` is *not* among them: the module's actor is the row-scoped one from
 * `./errors`, and two different `Actor` exports would invite the wrong one.
 */
export { draftState, postRevisions, posts, postSlugHistory } from "./schema";
export {
  ServiceError,
  conflict,
  forbidden,
  isServiceError,
  notFound,
  validation,
  type Actor,
  type ServiceErrorCode,
} from "./errors";
export {
  createAuthorizationPort,
  createFakeAuthorizationPort,
  fakeAuthorize,
  identityActorFromUserId,
  type AuthorizationPort,
  type Authorize,
  type PostAccess,
  type PostStatus,
  type Resource as AuthorizationResource,
  type Action as AuthorizationAction,
} from "./ports";
export { BODY_MAX_BYTES, TITLE_MAX, byteLength, parseBodyMarkdown, parseTitle } from "./validation";
export {
  autosaveDraft,
  loadPostOwner,
  saveDraft,
  type DraftWrite,
  type DraftWriteResult,
} from "./service/drafts";
export { assertCanReadDraft, assertOwner, isOwner } from "./service/ownership";
export {
  renamePost,
  resolvePostSlug,
  type RenamePostInput,
  type RenameResult,
  type ResolvedPostSlug,
} from "./service/slugs";
export {
  deletePost,
  publishPost,
  restorePost,
  unpublishPost,
  type LifecycleInput,
  type LifecycleResult,
  type PublishResult,
} from "./service/lifecycle";
export { type Db, type Executor, type Queryable } from "./service/executor";
export {
  FEED_PAGE_SIZE_DEFAULT,
  FEED_PAGE_SIZE_MAX,
  fetchPublishedPage,
  getPostById,
  type FeedCursor,
  type FeedItem,
  type FeedPage,
  type Post,
} from "./reads";
