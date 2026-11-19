import { sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

/**
 * The URL-safe identifier rule shared by publications, posts, topics, and slug
 * history: lowercase, digits, single interior hyphens, 1-64 characters (A8).
 *
 * Case folding is a CHECK, not `citext` (ADR-015): the invariant is visible in
 * the schema, needs no extension on Neon, and a mixed-case input is rejected at
 * the boundary instead of being silently folded into a different URL.
 */
export function slugFormatCheck(column: AnyPgColumn) {
  return sql`${column} ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(${column}) BETWEEN 1 AND 64`;
}
