import { sql } from "drizzle-orm";
import { notFound, pgCode, type Actor } from "@/modules/publications";
import { rows, queryable, type Executor } from "./executor";
import { assertCanReadDraft } from "./ownership";
import { loadPostOwner } from "./drafts";

/**
 * Load a post's draft for the editor (WP3b).
 *
 * The read is owner-scoped and total: a stranger, an anonymous caller, a
 * missing post and a malformed id all collapse into the same argument-less
 * `notFound()`, so the editor cannot be used to probe for someone else's post.
 * A post that exists but has no draft row yet reads as an empty draft at
 * version 0, which is the same shape the first autosave expects.
 */

export type DraftRead = {
  readonly postId: string;
  readonly version: number;
  readonly title: string;
  readonly bodyMarkdown: string;
};

export async function getDraftForOwner(
  executor: Executor,
  postId: string,
  actor: Actor,
): Promise<DraftRead> {
  const q = queryable(executor);

  // Owner is resolved first; a stranger is refused before any draft text moves.
  let ownerId: string;
  try {
    ownerId = await loadPostOwner(q, postId);
  } catch (error) {
    if (pgCode(error) === "22P02") throw notFound();
    throw error;
  }
  assertCanReadDraft(actor, ownerId);

  const found = await rows<{ version: unknown; title: string; body_markdown: string }>(
    q,
    sql`
      SELECT version, title, body_markdown
        FROM draft_state
       WHERE post_id = ${postId}
    `,
  );
  const draft = found[0];
  if (draft === undefined) {
    return { postId, version: 0, title: "", bodyMarkdown: "" };
  }

  const version = typeof draft.version === "number" ? draft.version : Number(draft.version);
  if (!Number.isFinite(version)) throw new Error("Expected a numeric draft version");
  return { postId, version, title: draft.title, bodyMarkdown: draft.body_markdown };
}