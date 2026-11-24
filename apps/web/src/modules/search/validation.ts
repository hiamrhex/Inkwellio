import { FEED_PAGE_SIZE_DEFAULT, FEED_PAGE_SIZE_MAX } from "@/modules/posts";
import { validation } from "@/modules/publications";

export const SEARCH_QUERY_MIN_LENGTH = 1;
export const SEARCH_QUERY_MAX_LENGTH = 100;
export const SEARCH_PAGE_SIZE_DEFAULT = FEED_PAGE_SIZE_DEFAULT;
export const SEARCH_PAGE_SIZE_MAX = FEED_PAGE_SIZE_MAX;

const CONTROL_CHAR_PATTERN = /[\x00-\x1f\x7f]/;

/**
 * Validates and normalizes a search query string.
 *
 * Enforces non-empty trimmed text, rejects ASCII control characters,
 * and caps length at `SEARCH_QUERY_MAX_LENGTH` code points (100).
 */
export function parseSearchQuery(rawQuery: string): string {
  if (typeof rawQuery !== "string") {
    throw validation("Search query must be a string");
  }
  if (CONTROL_CHAR_PATTERN.test(rawQuery)) {
    throw validation("Search query cannot contain control characters");
  }

  const trimmed = rawQuery.trim();
  const length = [...trimmed].length;
  if (length < SEARCH_QUERY_MIN_LENGTH || length > SEARCH_QUERY_MAX_LENGTH) {
    throw validation(
      `Search query must be ${SEARCH_QUERY_MIN_LENGTH}-${SEARCH_QUERY_MAX_LENGTH} characters`,
    );
  }
  return trimmed;
}

/** Validates bounded page size (`1..50`, default `20`). */
export function parseSearchPageSize(pageSize?: number): number {
  if (pageSize === undefined) {
    return SEARCH_PAGE_SIZE_DEFAULT;
  }
  if (
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > SEARCH_PAGE_SIZE_MAX
  ) {
    throw validation(
      `pageSize must be an integer between 1 and ${SEARCH_PAGE_SIZE_MAX}`,
    );
  }
  return pageSize;
}

/**
 * Escapes `\`, `%`, and `_` so user-supplied strings act strictly as
 * literal characters inside SQL `ILIKE ... ESCAPE '\'`.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}
