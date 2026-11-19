import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "@/modules/identity";
import { slugFormatCheck } from "@/kernel/sql";

/**
 * Slugs that would collide with a route, a file, or a future feature.
 * `p` is the internal route the `/@slug` rewrite points at (ADR-011), and
 * `_next` is reserved by the framework. A8 fixes the list; this constant is the
 * single source for both the CHECK and the create-form validation.
 */
export const RESERVED_SLUGS = [
  "about",
  "admin",
  "api",
  "edit",
  "health",
  "login",
  "new",
  "p",
  "privacy",
  "rss",
  "search",
  "settings",
  "sign-in",
  "sign-up",
  "sitemap",
  "terms",
  "topics",
  "_next",
] as const;

/** One generated list, so the CHECK cannot drift from the exported constant. */
const RESERVED_SLUGS_SQL = RESERVED_SLUGS.map((slug) => `'${slug}'`).join(",");

/**
 * One publication per user (ADR-006). `slug` is the public `/@slug` address.
 */
export const publications = pgTable(
  "publications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    bio: text("bio"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("publications_owner_unique").on(t.ownerId),
    unique("publications_slug_unique").on(t.slug),
    check("publications_slug_format_check", slugFormatCheck(t.slug)),
    check(
      "publications_slug_reserved_check",
      sql`${t.slug} NOT IN (${sql.raw(RESERVED_SLUGS_SQL)})`,
    ),
    check("publications_name_length_check", sql`char_length(${t.name}) BETWEEN 1 AND 80`),
    check("publications_bio_length_check", sql`${t.bio} IS NULL OR char_length(${t.bio}) <= 500`),
  ],
);

/**
 * Every publication slug ever used. A rename inserts here and updates
 * `publications.slug`, so old links redirect instead of breaking (ADR-011).
 *
 * `slug` is indexed but not unique: a slug can legitimately reappear as a
 * different publication's history, and the live slug always wins at read time.
 */
export const publicationSlugHistory = pgTable(
  "publication_slug_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicationId: uuid("publication_id")
      .notNull()
      .references(() => publications.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("publication_slug_history_publication_slug_unique").on(t.publicationId, t.slug),
    check("publication_slug_history_slug_format_check", slugFormatCheck(t.slug)),
    index("publication_slug_history_slug_idx").on(t.slug),
  ],
);
