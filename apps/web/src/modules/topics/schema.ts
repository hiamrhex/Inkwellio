import { sql } from "drizzle-orm";
import { check, index, pgTable, primaryKey, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { posts } from "@/modules/posts";
import { slugFormatCheck } from "@/kernel/sql";

/**
 * Curated topics only (ADR-012). The list is seeded; there is no admin UI in
 * v1, so a topic is created by a migration or by hand.
 */
export const topics = pgTable(
  "topics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("topics_slug_unique").on(t.slug),
    check("topics_slug_format_check", slugFormatCheck(t.slug)),
    check("topics_name_length_check", sql`char_length(${t.name}) BETWEEN 1 AND 40`),
  ],
);

/**
 * The join table. Composite primary key, so a post cannot carry the same topic
 * twice, and both sides cascade.
 */
export const postTopics = pgTable(
  "post_topics",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ name: "post_topics_pk", columns: [t.postId, t.topicId] }),
    index("post_topics_topic_idx").on(t.topicId),
  ],
);
