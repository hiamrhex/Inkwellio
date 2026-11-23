/**
 * Public API of the publications module.
 *
 * `publications` is the lower-level module of the two: the posts schema imports
 * this table, so the shared domain primitives live here and posts re-exports
 * them. No import here may reach into `modules/posts`.
 */
export { publications, publicationSlugHistory, RESERVED_SLUGS } from "./schema";
export {
  ServiceError,
  conflict,
  forbidden,
  isServiceError,
  notFound,
  pgCode,
  queryable,
  requireActor,
  row,
  rows,
  runInTransaction,
  toNumber,
  validation,
  type Actor,
  type Db,
  type Executor,
  type Queryable,
  type ServiceErrorCode,
} from "./domain";
export { MAX_SLUG_LENGTH, SLUG_PATTERN, isReservedSlug, parseSlug, slugify, withNumericSuffix } from "./slugs";
export { ensurePublication, type EnsurePublicationInput, type Publication } from "./service";
export { parsePublicationBio, parsePublicationName } from "./validation";
