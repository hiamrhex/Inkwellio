import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

/**
 * The owner of a publication.
 *
 * WP1 creates this table because every other domain table cascades from it and
 * the erasure test needs a real target. Better Auth adopts it in WP2 through its
 * schema mapping (`user` table, `email` column); the columns it additionally
 * needs (`name`, `email_verified`, `image`) are an expand-only migration then.
 * Generating its session/account tables now would be a guess at an API that U-2
 * still marks unproven.
 *
 * Email is stored lowercased by CHECK rather than by a `citext` column: the
 * invariant is then visible in the schema and portable, and no extension has to
 * be verified on Neon (ADR-015).
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("users_email_unique").on(t.email),
    check("users_email_lowercase_check", sql`${t.email} = lower(${t.email})`),
    check(
      "users_email_shape_check",
      sql`${t.email} ~ '^[^@[:space:]]+@[^@[:space:]]+$' AND char_length(${t.email}) <= 254`,
    ),
  ],
);
