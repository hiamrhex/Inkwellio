import { validation } from "./errors";

/**
 * Input limits from A8, enforced in the service as well as the database.
 *
 * Counted the way Postgres counts: code points for `char_length`, UTF-8 bytes
 * for `octet_length`. JavaScript's `.length` counts UTF-16 units, so an emoji
 * would be two characters here and one in the CHECK.
 */

const encoder = new TextEncoder();

export const TITLE_MAX = 200;
export const BODY_MAX_BYTES = 102_400;

function codePoints(value: string): number {
  return [...value].length;
}

export function byteLength(value: string): number {
  return encoder.encode(value).length;
}

export function parseTitle(value: string): string {
  const length = codePoints(value);
  if (length < 1 || length > TITLE_MAX) {
    throw validation(`A title is 1-${TITLE_MAX} characters`);
  }
  if (value.includes("\n") || value.includes("\r")) {
    throw validation("A title cannot contain line breaks");
  }
  return value;
}

export function parseBodyMarkdown(value: string): string {
  const bytes = byteLength(value);
  if (bytes < 1 || bytes > BODY_MAX_BYTES) {
    throw validation("A body is 1-102,400 bytes");
  }
  return value;
}
