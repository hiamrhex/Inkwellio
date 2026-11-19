import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { publications } from "@/modules/publications";
import { slugFormatCheck } from "@/kernel/sql";

/**
 * Immutable editorial history. Written only on an explicit save or a publish
 * (A2); autosave never touches it.
 *
 * Declared before `posts` so the composite foreign keys can name it directly.
 * Its own foreign key to `posts` is lazy, which keeps the pair mutually
 * referential without a temporal-dead-zone error.
 */
export const postRevisions = pgTable(
  "post_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Column-level, not table-level: a table-level foreign key here would make
    // `post_revisions` and `posts` reference each other's *types* and TypeScript
    // refuses to infer either (TS7022). The reference is a thunk, so the runtime
    // order is still safe.
    postId: uuid("post_id")
      .notNull()
      .references((): AnyPgColumn => posts.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    bodyMarkdown: text("body_markdown").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The target of the composite foreign keys below: a revision belongs to
    // exactly one post, and a pointer can only name a revision of its own post.
    unique("post_revisions_id_post_unique").on(t.id, t.postId),
    check(
      "post_revisions_title_check",
      sql`char_length(${t.title}) BETWEEN 1 AND 200
        AND position(chr(10) in ${t.title}) = 0
        AND position(chr(13) in ${t.title}) = 0`,
    ),
    check(
      "post_revisions_body_length_check",
      sql`octet_length(${t.bodyMarkdown}) BETWEEN 1 AND 102400`,
    ),
    index("post_revisions_post_created_idx").on(t.postId, t.createdAt),
  ],
);

/**
 * A post has three states, and the pointers are constrained to match them:
 * `published_revision_id` is non-null exactly when the post is published, and
 * `deleted_at` is non-null exactly when it is deleted (ADR-007 lifecycle).
 * `published_at` is written once and never moves.
 */
export const posts = pgTable(
  "posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicationId: uuid("publication_id")
      .notNull()
      .references(() => publications.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    status: text("status").notNull().default("draft"),
    publishedRevisionId: uuid("published_revision_id"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // A revision is deleted only when its post is (erasure cascades from the
    // user). Deliberately not ON DELETE SET NULL: that would also null `id`,
    // because the key is composite.
    foreignKey({
      name: "posts_published_revision_fk",
      columns: [t.publishedRevisionId, t.id],
      foreignColumns: [postRevisions.id, postRevisions.postId],
    }),
    check("posts_status_check", sql`${t.status} IN ('draft', 'published', 'deleted')`),
    // Unique among *all* statuses, including deleted: a deleted post keeps its
    // address, so an accidental "undelete" cannot silently take another post's
    // URL, and a released slug can be reused only through slug history.
    unique("posts_publication_slug_unique").on(t.publicationId, t.slug),
    check("posts_slug_format_check", slugFormatCheck(t.slug)),
    check(
      "posts_published_pointer_check",
      sql`(${t.status} = 'published') = (${t.publishedRevisionId} IS NOT NULL)`,
    ),
    check("posts_deleted_at_check", sql`(${t.status} = 'deleted') = (${t.deletedAt} IS NOT NULL)`),
    check(
      "posts_published_at_check",
      sql`${t.status} <> 'published' OR ${t.publishedAt} IS NOT NULL`,
    ),
    // Feed order is (published_at, id) so a keyset cursor can never skip or
    // repeat a row. Partial: a draft is not in the feed.
    index("posts_feed_idx")
      .on(t.publishedAt, t.id)
      .where(sql`${t.status} = 'published'`),
    index("posts_publication_feed_idx")
      .on(t.publicationId, t.publishedAt, t.id)
      .where(sql`${t.status} = 'published'`),
    index("posts_publication_status_idx").on(t.publicationId, t.status),
    index("posts_published_revision_idx").on(t.publishedRevisionId),
  ],
);

/**
 * The mutable autosave row, one per post. `version` is the compare-and-set
 * token (A7): every write names the version it expects, and zero rows updated
 * is a conflict.
 */
export const draftState = pgTable(
  "draft_state",
  {
    postId: uuid("post_id")
      .primaryKey()
      .references(() => posts.id, { onDelete: "cascade" }),
    baseRevisionId: uuid("base_revision_id"),
    title: text("title").notNull(),
    bodyMarkdown: text("body_markdown").notNull(),
    version: integer("version").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "draft_state_base_revision_fk",
      columns: [t.baseRevisionId, t.postId],
      foreignColumns: [postRevisions.id, postRevisions.postId],
    }),
    index("draft_state_base_revision_idx").on(t.baseRevisionId),
    check("draft_state_version_check", sql`${t.version} >= 0`),
    check(
      "draft_state_title_check",
      sql`char_length(${t.title}) BETWEEN 1 AND 200
        AND position(chr(10) in ${t.title}) = 0
        AND position(chr(13) in ${t.title}) = 0`,
    ),
    check(
      "draft_state_body_length_check",
      sql`octet_length(${t.bodyMarkdown}) BETWEEN 1 AND 102400`,
    ),
  ],
);

/**
 * Every slug a post has ever had, so a rename redirects instead of 404s.
 */
export const postSlugHistory = pgTable(
  "post_slug_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("post_slug_history_post_slug_unique").on(t.postId, t.slug),
    check("post_slug_history_slug_format_check", slugFormatCheck(t.slug)),
    // A rename redirect looks up `/@publication/old-slug` by slug alone, then
    // joins the post to check the publication still matches.
    index("post_slug_history_slug_idx").on(t.slug),
  ],
);
