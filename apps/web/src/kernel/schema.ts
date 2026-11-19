import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * The durable security record (A10).
 *
 * Hobby keeps one hour of runtime logs, so a log line is not evidence. These
 * rows are written in the same transaction as the action they describe.
 *
 * `actor_user_id` and `subject_user_id` deliberately have **no foreign key**.
 * A cascading key would either delete the evidence when an account is erased or
 * block the erasure; A10 requires the opposite of both — the audit row outlives
 * the account and loses only its actor id. The erasure test asserts those
 * columns are null afterwards, which is the check a foreign key would have
 * provided in the wrong direction.
 */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    action: text("action").notNull(),
    outcome: text("outcome").notNull(),
    actorKind: text("actor_kind").notNull(),
    actorUserId: uuid("actor_user_id"),
    subjectUserId: uuid("subject_user_id"),
    targetType: text("target_type"),
    targetId: text("target_id"),
    requestId: text("request_id").notNull(),
    ipHash: text("ip_hash"),
    metadata: jsonb("metadata").notNull().default({}),
  },
  (t) => [
    check("audit_events_outcome_check", sql`${t.outcome} IN ('ok', 'denied', 'failed')`),
    check(
      "audit_events_actor_kind_check",
      sql`${t.actorKind} IN ('user', 'admin', 'system', 'anonymous')`,
    ),
    check(
      "audit_events_action_check",
      sql`char_length(${t.action}) BETWEEN 1 AND 80 AND ${t.action} ~ '^[a-z][a-z0-9_.]*$'`,
    ),
    check("audit_events_request_id_check", sql`char_length(${t.requestId}) BETWEEN 1 AND 64`),
    check("audit_events_metadata_size_check", sql`octet_length(${t.metadata}::text) <= 1032`),
    index("audit_events_occurred_at_idx").on(t.occurredAt),
    index("audit_events_actor_idx").on(t.actorUserId, t.occurredAt),
    index("audit_events_action_idx").on(t.action, t.occurredAt),
  ],
);

/**
 * Fixed-window counters for the database-backed limiter (ADR-010).
 *
 * `expires_at` is what the daily cron deletes on; the platform cannot be asked
 * to expire rows, and a limiter whose rows never disappear is a slow leak.
 */
export const rateLimitCounters = pgTable(
  "rate_limit_counters",
  {
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ name: "rate_limit_counters_pk", columns: [t.key, t.windowStart] }),
    check("rate_limit_counters_count_check", sql`${t.count} >= 0`),
    index("rate_limit_counters_expires_at_idx").on(t.expiresAt),
  ],
);
