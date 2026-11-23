import { sql } from "drizzle-orm";
import { conflict, notFound, pgCode, validation, type Actor } from "../errors";
import { parseBodyMarkdown, parseTitle } from "../validation";
import { rows, runInTransaction, toNumber, type Executor, type Queryable } from "./executor";
import { assertOwner } from "./ownership";

/**
 * Draft writes are compare-and-set on `draft_state.version` (A7).
 *
 * Autosave and explicit save share the mechanism; only an explicit save appends
 * a revision (A2). A stale token is a CONFLICT carrying the current draft, so
 * the editor can offer reload or copy — never a silent overwrite.
 */

export type DraftWrite = {
  readonly actor: Actor;
  readonly postId: string;
  /** The version the caller last saw. `0` means "no draft row yet". */
  readonly expectedVersion: number;
  readonly title: string;
  readonly bodyMarkdown: string;
};

export type DraftWriteResult = {
  readonly version: number;
  readonly revisionId: string | null;
  readonly updatedAt: Date;
};

type Mode = "autosave" | "save";

export async function autosaveDraft(
  executor: Executor,
  input: DraftWrite,
): Promise<DraftWriteResult> {
  return writeDraft(executor, input, "autosave");
}

export async function saveDraft(
  executor: Executor,
  input: DraftWrite,
): Promise<DraftWriteResult> {
  return writeDraft(executor, input, "save");
}

/** The owner of a post, or NOT_FOUND for a missing or malformed id. Never
 * leaks whether a post exists to a caller that may not see it. */
export async function loadPostOwner(q: Queryable, postId: string): Promise<string> {
  try {
    const found = await rows<{ owner_id: string }>(
      q,
      sql`
        SELECT pub.owner_id
          FROM posts p
          JOIN publications pub ON pub.id = p.publication_id
         WHERE p.id = ${postId}
      `,
    );
    if (found.length === 0) throw notFound();
    return found[0]!.owner_id;
  } catch (error) {
    if (pgCode(error) === "22P02") throw notFound();
    throw error;
  }
}

async function writeDraft(
  executor: Executor,
  input: DraftWrite,
  mode: Mode,
): Promise<DraftWriteResult> {
  const title = parseTitle(input.title);
  const bodyMarkdown = parseBodyMarkdown(input.bodyMarkdown);
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0) {
    throw validation("expectedVersion must be a non-negative integer");
  }

  return runInTransaction(executor, async (q) => {
    const ownerId = await loadPostOwner(q, input.postId);
    assertOwner(input.actor, ownerId);

    // The predicate is the whole concurrency control: no row, no write.
    let updated = await rows<{ version: unknown; updated_at: Date }>(
      q,
      sql`
        UPDATE draft_state
           SET title = ${title},
               body_markdown = ${bodyMarkdown},
               version = version + 1,
               updated_at = now()
         WHERE post_id = ${input.postId} AND version = ${input.expectedVersion}
        RETURNING version, updated_at
      `,
    );

    // Version 0 means "no draft row yet". Insert it once; a concurrent insert
    // makes this a no-op rather than an error, so the transaction stays usable.
    if (updated.length === 0 && input.expectedVersion === 0) {
      updated = await rows<{ version: unknown; updated_at: Date }>(
        q,
        sql`
          INSERT INTO draft_state (post_id, title, body_markdown, version)
          VALUES (${input.postId}, ${title}, ${bodyMarkdown}, 1)
          ON CONFLICT (post_id) DO NOTHING
          RETURNING version, updated_at
        `,
      );
    }

    if (updated.length === 0) {
      const current = await rows<{
        version: unknown;
        title: string;
        body_markdown: string;
        updated_at: Date;
      }>(
        q,
        sql`
          SELECT version, title, body_markdown, updated_at
            FROM draft_state
           WHERE post_id = ${input.postId}
        `,
      );
      throw conflict("The draft changed since it was loaded", {
        currentVersion: current.length === 0 ? 0 : toNumber(current[0]!.version),
        currentTitle: current.length === 0 ? "" : current[0]!.title,
        currentBodyMarkdown: current.length === 0 ? "" : current[0]!.body_markdown,
        updatedAt: current.length === 0 ? null : current[0]!.updated_at,
      });
    }

    const version = toNumber(updated[0]!.version);
    let revisionId: string | null = null;

    if (mode === "save") {
      const inserted = await rows<{ id: string }>(
        q,
        sql`
          INSERT INTO post_revisions (post_id, title, body_markdown)
          VALUES (${input.postId}, ${title}, ${bodyMarkdown})
          RETURNING id
        `,
      );
      revisionId = inserted[0]!.id;
      await q.execute(
        sql`UPDATE draft_state SET base_revision_id = ${revisionId} WHERE post_id = ${input.postId}`,
      );
    }

    return { version, revisionId, updatedAt: updated[0]!.updated_at };
  });
}
