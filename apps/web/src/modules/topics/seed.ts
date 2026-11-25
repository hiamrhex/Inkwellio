import { sql } from "drizzle-orm";
import {
  parseSlug,
  queryable,
  rows,
  validation,
  type Executor,
  type Queryable,
} from "@/modules/publications";

export type SeedTopicInput = {
  readonly slug: string;
  readonly name: string;
};

export type TopicRecord = {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
};

const TOPIC_NAME_MAX_LENGTH = 40;

/**
 * Curated generic football writing topics (ADR-012).
 * Zero club names, logos, or trademarks; no admin UI in v1.
 */
export const SEED_TOPICS: readonly SeedTopicInput[] = [
  { slug: "tactics", name: "Tactics" },
  { slug: "match-reports", name: "Match Reports" },
  { slug: "analytics", name: "Analytics" },
  { slug: "transfers", name: "Transfers" },
  { slug: "coaching", name: "Coaching" },
  { slug: "youth-development", name: "Youth Development" },
  { slug: "goalkeeping", name: "Goalkeeping" },
  { slug: "football-history", name: "Football History" },
  { slug: "supporter-culture", name: "Supporter Culture" },
  { slug: "grassroots", name: "Grassroots" },
  { slug: "set-pieces", name: "Set Pieces" },
  { slug: "refereeing", name: "Refereeing" },
];

function parseTopicName(name: string): string {
  const trimmed = name.trim();
  const length = [...trimmed].length;
  if (length < 1 || length > TOPIC_NAME_MAX_LENGTH) {
    throw validation(`Topic name must be 1-${TOPIC_NAME_MAX_LENGTH} characters`);
  }
  return trimmed;
}

/**
 * Idempotently seeds curated topics into Postgres (`ON CONFLICT (slug) DO NOTHING`).
 *
 * Safe to call repeatedly across startups or parallel jobs; existing slugs
 * remain untouched and all requested topic records are returned sorted by name.
 */
export async function seedTopics(
  executor: Executor,
  entries: readonly SeedTopicInput[] = SEED_TOPICS,
): Promise<TopicRecord[]> {
  if (entries.length === 0) {
    return [];
  }

  const normalized = entries.map((entry) => ({
    slug: parseSlug(entry.slug.trim().toLowerCase()),
    name: parseTopicName(entry.name),
  }));

  const q: Queryable = queryable(executor);
  const slugs = normalized.map((item) => item.slug);

  const valuesSql = sql.join(
    normalized.map((item) => sql`(${item.slug}, ${item.name})`),
    sql`, `,
  );

  await rows(
    q,
    sql`
      INSERT INTO topics (slug, name)
      VALUES ${valuesSql}
      ON CONFLICT (slug) DO NOTHING
    `,
  );

  const slugListSql = sql.join(
    slugs.map((s) => sql`${s}`),
    sql`, `,
  );

  return rows<TopicRecord>(
    q,
    sql`
      SELECT id, slug, name
        FROM topics
       WHERE slug IN (${slugListSql})
       ORDER BY name ASC, slug ASC
    `,
  );
}
