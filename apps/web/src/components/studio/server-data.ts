import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/kernel/db";
import { getAuth } from "@/modules/identity";
import {
  draftState,
  getDraftForOwner,
  getPostById,
  posts,
  type PostStatus,
} from "@/modules/posts";
import {
  isServiceError,
  listPublicationsForOwner,
  type Actor,
  type Executor,
  type PublicationSummary,
} from "@/modules/publications";
import {
  listTopics,
  postTopics,
  topics,
  type AssignedTopic,
  type TopicSummary,
} from "@/modules/topics";

export interface DashboardPostSummary {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly status: PostStatus;
  readonly version: number;
  readonly updatedAt: string;
  readonly publishedAt: string | null;
}

export type DashboardLoadResult =
  | {
      readonly kind: "ready";
      readonly publication: PublicationSummary | null;
      readonly posts: readonly DashboardPostSummary[];
    }
  | { readonly kind: "unavailable" };

export type StudioLoadResult =
  | {
      readonly kind: "ready";
      readonly publicationSlug: string;
      readonly publicationName: string;
      readonly postId: string;
      readonly slug: string;
      readonly status: PostStatus;
      readonly version: number;
      readonly title: string;
      readonly bodyMarkdown: string;
      readonly publishedAt: string | null;
      readonly assignedTopics: readonly AssignedTopic[];
      readonly allTopics: readonly TopicSummary[];
    }
  | { readonly kind: "not_found" }
  | { readonly kind: "unavailable" };

export interface StudioSession {
  readonly userId: string;
  readonly email: string;
  readonly name: string | null;
}

export type SettingsLoadResult =
  | {
      readonly kind: "ready";
      readonly session: StudioSession;
      readonly publication: PublicationSummary | null;
      readonly postCounts: {
        readonly draft: number;
        readonly published: number;
        readonly deleted: number;
      };
    }
  | { readonly kind: "unavailable" };

/**
 * Resolves the active Better Auth session user (id, email, name) on the server,
 * failing closed to `null` whenever credentials or auth storage are missing.
 */
export async function resolveStudioSession(
  requestHeaders: Headers,
): Promise<StudioSession | null> {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: requestHeaders });
    const sessionUser = session?.user;
    if (
      !sessionUser ||
      typeof sessionUser.id !== "string" ||
      sessionUser.id.length === 0 ||
      typeof sessionUser.email !== "string" ||
      sessionUser.email.length === 0
    ) {
      return null;
    }
    return {
      userId: sessionUser.id,
      email: sessionUser.email,
      name: typeof sessionUser.name === "string" ? sessionUser.name : null,
    };
  } catch {
    return null;
  }
}

/**
 * Resolves the active Better Auth actor on the server, failing closed to `null`
 * whenever credentials, headers, or auth storage are missing/unavailable.
 */
export async function resolveStudioActor(
  requestHeaders: Headers,
): Promise<Actor> {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: requestHeaders });
    const userId = session?.user?.id;
    if (typeof userId !== "string" || userId.length === 0) {
      return null;
    }
    return { userId };
  } catch {
    return null;
  }
}

/**
 * Loads the authenticated writer's single publication and its posts across all
 * lifecycle states (`draft`, `published`, `deleted`).
 */
export async function loadDashboardData(
  actor: NonNullable<Actor>,
): Promise<DashboardLoadResult> {
  if (!process.env.DATABASE_URL) {
    return { kind: "unavailable" };
  }

  try {
    const db = getDb();
    const executor: Executor = { kind: "db", db };
    const ownPubs = await listPublicationsForOwner(executor, actor);
    const publication = ownPubs[0] ?? null;

    if (publication === null) {
      return { kind: "ready", publication: null, posts: [] };
    }

    const rows = await db
      .select({
        id: posts.id,
        slug: posts.slug,
        status: posts.status,
        publishedAt: posts.publishedAt,
        postUpdatedAt: posts.updatedAt,
        draftTitle: draftState.title,
        draftVersion: draftState.version,
        draftUpdatedAt: draftState.updatedAt,
      })
      .from(posts)
      .leftJoin(draftState, eq(draftState.postId, posts.id))
      .where(eq(posts.publicationId, publication.id))
      .orderBy(desc(posts.updatedAt), desc(posts.id));

    const summaries: DashboardPostSummary[] = rows.map((row) => {
      const updated = row.draftUpdatedAt ?? row.postUpdatedAt;
      const status = row.status as PostStatus;
      return {
        id: row.id,
        slug: row.slug,
        title: row.draftTitle ?? "",
        status,
        version: row.draftVersion ?? 0,
        updatedAt: updated.toISOString(),
        publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
      };
    });

    return {
      kind: "ready",
      publication,
      posts: summaries,
    };
  } catch {
    return { kind: "unavailable" };
  }
}

/**
 * Loads owner-scoped draft content, lifecycle state, slug, and curated topic
 * assignments for `/studio/[postId]`.
 */
export async function loadStudioPostData(
  actor: NonNullable<Actor>,
  postId: string,
): Promise<StudioLoadResult> {
  if (!process.env.DATABASE_URL) {
    return { kind: "unavailable" };
  }

  try {
    const db = getDb();
    const executor: Executor = { kind: "db", db };
    const ownPubs = await listPublicationsForOwner(executor, actor);
    const publication = ownPubs[0];
    if (!publication) {
      return { kind: "not_found" };
    }

    const [post, draft, assignedTopics, allTopics] = await Promise.all([
      getPostById(executor, postId, actor),
      getDraftForOwner(executor, postId, actor),
      db
        .select({
          id: topics.id,
          slug: topics.slug,
          name: topics.name,
        })
        .from(postTopics)
        .innerJoin(topics, eq(topics.id, postTopics.topicId))
        .where(eq(postTopics.postId, postId))
        .orderBy(asc(topics.name)),
      listTopics(executor),
    ]);

    return {
      kind: "ready",
      publicationSlug: publication.slug,
      publicationName: publication.name,
      postId: post.id,
      slug: post.slug,
      status: post.status,
      version: draft.version,
      title: draft.title,
      bodyMarkdown: draft.bodyMarkdown,
      publishedAt: post.publishedAt ? post.publishedAt.toISOString() : null,
      assignedTopics,
      allTopics,
    };
  } catch (caught) {
    if (isServiceError(caught) && (caught.code === "NOT_FOUND" || caught.code === "FORBIDDEN")) {
      return { kind: "not_found" };
    }
    return { kind: "unavailable" };
  }
}

/**
 * Loads owner-scoped account and publication summary data for `/settings/privacy`.
 */
export async function loadSettingsData(
  session: StudioSession,
): Promise<SettingsLoadResult> {
  if (!process.env.DATABASE_URL) {
    return { kind: "unavailable" };
  }

  try {
    const db = getDb();
    const executor: Executor = { kind: "db", db };
    const ownPubs = await listPublicationsForOwner(executor, { userId: session.userId });
    const publication = ownPubs[0] ?? null;

    if (publication === null) {
      return {
        kind: "ready",
        session,
        publication: null,
        postCounts: { draft: 0, published: 0, deleted: 0 },
      };
    }

    const postRows = await db
      .select({ status: posts.status })
      .from(posts)
      .where(eq(posts.publicationId, publication.id));

    let draft = 0;
    let published = 0;
    let deleted = 0;
    for (const row of postRows) {
      if (row.status === "published") published += 1;
      else if (row.status === "deleted") deleted += 1;
      else draft += 1;
    }

    return {
      kind: "ready",
      session,
      publication,
      postCounts: { draft, published, deleted },
    };
  } catch {
    return { kind: "unavailable" };
  }
}
