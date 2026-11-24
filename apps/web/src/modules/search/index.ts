/**
 * Public API of the search module.
 */
export {
  SEARCH_PAGE_SIZE_DEFAULT,
  SEARCH_PAGE_SIZE_MAX,
  SEARCH_QUERY_MAX_LENGTH,
  SEARCH_QUERY_MIN_LENGTH,
  escapeLikePattern,
  parseSearchPageSize,
  parseSearchQuery,
} from "./validation";
export {
  SEARCH_READ_TIMEOUT_MS,
  mapPublicReadError,
  searchPublishedPosts,
  withPublicDbTimeout,
  type SearchPage,
  type SearchPostInput,
  type SearchResultItem,
} from "./service";
