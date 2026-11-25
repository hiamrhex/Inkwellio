import { validation } from "./domain";

/**
 * Field limits from A8. Counted in code points, matching `char_length`, not in
 * UTF-16 units — an emoji is one character to Postgres and two to JavaScript.
 */

function codePoints(value: string): number {
  return [...value].length;
}

const PUB_CONTROL_CHARS = /[\x00-\x1f\x7f]/;

export function parsePublicationName(value: string): string {
  if (PUB_CONTROL_CHARS.test(value)) {
    throw validation("A publication name cannot contain control characters");
  }
  const length = codePoints(value);
  if (length < 1 || length > 80) {
    throw validation("A publication name is 1-80 characters");
  }
  return value;
}

export function parsePublicationBio(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  if (value.includes("\0")) {
    throw validation("A bio cannot contain NUL bytes");
  }
  if (codePoints(value) > 500) {
    throw validation("A bio is at most 500 characters");
  }
  return value;
}
