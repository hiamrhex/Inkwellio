import { sql } from "drizzle-orm";
import {
  pgCode,
  rows,
  runInTransaction,
  validation,
  type Actor,
  type Executor,
  type Queryable,
} from "@/modules/publications";
import {
  assertOwner,
  loadPostOwner,
  notFound,
  type PostStatus,
} from "@/modules/posts";
import { normalizeTopicSlug } from "../reads";

/**
 * Writer topic assignment (ADR-012).
 *
 * Topics are curated: a writer may only attach existing rows, never create one.
 * The replacement is atomic — the post's whole topic set is deleted and
 * reinserted in one transaction — so a failure leaves the previous set intact
 * rather than a half-applied one.
 *
 * The ownership rule is the posts module's own (`assertOwner`): a stranger is
 * FORBIDDEN, and a missing or deleted post is NOT_FOUND for everyone.
 */

export const MAX_POST_TOPICS = 3;

export type SetPostTopicsInput = {
  readonly actor: Actor;
  readonly postId: string;
  readonly topicSlugs: readonly string[];
};

export type AssignedTopic = {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
};

export type SetPostTopicsResult = {
  readonly postId: string;
  readonly status: PostStatus;
  readonly topics: readonly AssignedTopic[];
};

/**
 * Normalise the requested slugs: trim, lowercase, validate format, and collapse
 * duplicates while keeping the caller's order. The three-topic ceiling applies
 * to distinct topics, not to repeated input.
 */
function normalizeAssignments(raw: readonly string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const entry of raw) {
    const slug = normalizeTopicSlug(entry);
    if (slug === undefined) throw validation("topicSlugs must be valid topic slugs");
    if (seen.has(slug)) continue;
    seen.add(slug);
    normalized.push(slug);
  }
  if (normalized.length > MAX_POST_TOPICS) {
    throw validation(`A post can have at most ${MAX_POST_TOPICS} topics`);
  }
  return normalized;
}

/** Resolve curated slugs to rows, refusing any slug the taxonomy does not own. */
async function resolveTopics(q: Queryable, slugs: readonly string[]): Promise<AssignedTopic[]> {
  if (slugs.length === 0) return [];

  const slugList = sql.join(
    slugs.map((slug) => sql`${slug}`),
    sql`, `,
  );
  const found = await rows<AssignedTopic>(
    q,
    sql`
      SELECT id, slug, name
        FROM topics
       WHERE slug IN (${slugList})
    `,
  );

  const bySlug = new Map(found.map((topic) => [topic.slug, topic]));
  return slugs.map((slug) => {
    const topic = bySlug.get(slug);
    if (topic === undefined) throw validation(`Unknown topic: ${slug}`);
    return topic;
  });
}

export async function setPostTopics(
  executor: Executor,
  input: SetPostTopicsInput,
): Promise<SetPostTopicsResult> {
  const slugs = normalizeAssignments(input.topicSlugs);

  return runInTransaction(executor, async (q) => {
    const ownerId = await loadPostOwner(q, input.postId);
    assertOwner(input.actor, ownerId);

    // Serialise against a concurrent assign/publish on the same post. The row
    // lock also decides whether this post may be written to at all.
    let locked: Array<{ status: PostStatus }>;
    try {
      locked = await rows<{ status: PostStatus }>(
        q,
        sql`SELECT status FROM posts WHERE id = ${input.postId} FOR UPDATE`,
      );
    } catch (error) {
      if (pgCode(error) === "22P02") throw notFound();
      throw error;
    }
    const post = locked[0];
    if (post === undefined) throw notFound();
    if (post.status === "deleted") throw notFound();

    const topics = await resolveTopics(q, slugs);

    await rows(q, sql`DELETE FROM post_topics WHERE post_id = ${input.postId}`);
    if (topics.length > 0) {
      const values = sql.join(
        topics.map((topic) => sql`(${input.postId}, ${topic.id})`),
        sql`, `,
      );
      await rows(
        q,
        sql`INSERT INTO post_topics (post_id, topic_id) VALUES ${values}`,
      );
    }

    return { postId: input.postId, status: post.status, topics };
  });
}
