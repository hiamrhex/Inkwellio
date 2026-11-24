import { RESERVED_SLUGS } from "./schema";
import { validation } from "./domain";

/**
 * Slug generation, owned by this repository (A8).
 *
 * No dependency: the rules are small and the failure modes are exactly the ones
 * the database CHECK rejects, so a wrong transliteration must fail a test here
 * rather than be trusted to a library.
 */

const RESERVED = new Set<string>(RESERVED_SLUGS);
export const MAX_SLUG_LENGTH = 64;
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Letters that NFKD does not decompose into an ASCII base. Order matters: they
 * are replaced before combining marks are stripped.
 */
const TRANSLITERATE: Record<string, string> = {
  ß: "ss",
  æ: "ae",
  Æ: "ae",
  œ: "oe",
  Œ: "oe",
  ø: "o",
  Ø: "o",
  ł: "l",
  Ł: "l",
  đ: "d",
  Đ: "d",
  ð: "d",
  Ð: "d",
  þ: "th",
  Þ: "th",
  ı: "i",
  ħ: "h",
  ŋ: "n",
  ſ: "s",
  ƒ: "f",
};

/**
 * Deterministic, total: every input produces a string the database accepts.
 * `fallback` covers titles made only of symbols or emoji.
 */
export function slugify(
  input: string,
  options: { fallback?: string; reserved?: boolean } = {},
): string {
  const fallback = options.fallback ?? "post";

  let slug = input.normalize("NFKD");
  slug = slug.replace(/[^\u0000-\u007f]/g, (character) => TRANSLITERATE[character] ?? character);
  // Strip combining marks left by NFKD (é -> e + U+0301).
  slug = slug.replace(/[\u0300-\u036f]/g, "");
  slug = slug.toLowerCase();
  slug = slug.replace(/[^a-z0-9]+/g, "-");
  slug = slug.replace(/^-+|-+$/g, "");
  slug = trimToLength(slug, MAX_SLUG_LENGTH);

  if (slug.length === 0) slug = fallback;

  if (options.reserved === true && RESERVED.has(slug)) {
    slug = `${trimToLength(slug, MAX_SLUG_LENGTH - 4)}-pub`;
  }

  return slug;
}

function trimToLength(value: string, max: number): string {
  return value.slice(0, max).replace(/-+$/g, "");
}

/** `base-2`, `base-3`, ... kept within the 64-character limit. */
export function withNumericSuffix(base: string, n: number): string {
  const suffix = `-${n}`;
  const head = trimToLength(base, MAX_SLUG_LENGTH - suffix.length);
  return `${head.length > 0 ? head : "post"}${suffix}`;
}

export function isReservedSlug(slug: string): boolean {
  return RESERVED.has(slug);
}

/** Validate a caller-supplied slug. Reserved names are valid *syntax* but not
 * valid publication addresses, so both failures are VALIDATION. */
export function parseSlug(value: string): string {
  if (value.length < 1 || value.length > MAX_SLUG_LENGTH || !SLUG_PATTERN.test(value)) {
    throw validation("A slug is 1-64 characters of a-z, 0-9 and single hyphens");
  }
  if (RESERVED.has(value)) {
    throw validation("That slug is reserved");
  }
  return value;
}
