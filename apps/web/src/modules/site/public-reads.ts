import { getDb } from "@/kernel/db";
import {
  FEED_PAGE_SIZE_DEFAULT,
  fetchPublishedPage,
  getPublishedPostById,
  resolvePostSlug,
  type Executor,
  type FeedPage,
  type PublishedPostContent,
} from "@/modules/posts";
import {
  getPublicationBySlug,
  isReservedSlug,
  parseSlug,
  type PublicationSummary,
} from "@/modules/publications";
import { READ_TIMEOUT_MS, withReadTimeout } from "./timeout";

export type PublicPublicationFeedResult =
  | { readonly kind: "not_found" }
  | { readonly kind: "redirect"; readonly location: string }
  | {
      readonly kind: "ok";
      readonly publication: PublicationSummary;
      readonly feed: FeedPage;
    };

export type PublicPostResult =
  | { readonly kind: "not_found" }
  | { readonly kind: "redirect"; readonly location: string }
  | {
      readonly kind: "ok";
      readonly publication: PublicationSummary;
      readonly post: PublishedPostContent;
    };

export type PublicReadOptions = {
  readonly executor?: Executor;
  readonly timeoutMs?: number;
  readonly pageSize?: number;
};

function normalizePublicSlug(rawSlug: string): string | undefined {
  const lowered = rawSlug.trim().toLowerCase();
  if (isReservedSlug(lowered)) {
    return undefined;
  }
  try {
    return parseSlug(lowered);
  } catch {
    return undefined;
  }
}

function defaultExecutor(): Executor {
  return { kind: "db", db: getDb() };
}

/**
 * Loads a publication summary and its first feed page under a strict timeout.
 *
 * Uppercase handles redirect to their canonical lowercase `/@slug` URL (ADR-015).
 */
export async function loadPublicPublicationFeed(
  rawHandle: string,
  options?: PublicReadOptions,
): Promise<PublicPublicationFeedResult> {
  const normalizedHandle = normalizePublicSlug(rawHandle);
  if (normalizedHandle === undefined) {
    return { kind: "not_found" };
  }

  const timeoutMs = options?.timeoutMs ?? READ_TIMEOUT_MS;
  const pageSize = options?.pageSize ?? FEED_PAGE_SIZE_DEFAULT;

  return withReadTimeout(async () => {
    const executor = options?.executor ?? defaultExecutor();
    const publication = await getPublicationBySlug(executor, normalizedHandle);
    if (publication === undefined) {
      return { kind: "not_found" };
    }

    if (rawHandle !== publication.slug) {
      return {
        kind: "redirect",
        location: `/@${encodeURIComponent(publication.slug)}`,
      };
    }

    const feed = await fetchPublishedPage(executor, publication.id, undefined, pageSize);
    return { kind: "ok", publication, feed };
  }, timeoutMs);
}

/**
 * Resolves a public `/@handle/slug` post under a strict timeout.
 *
 * Redirects uppercase segments (ADR-015) and retired post slugs (ADR-011 / `post_slug_history`)
 * to the canonical lowercase published URL; drafts and deleted posts return `not_found`.
 */
export async function loadPublicPost(
  rawHandle: string,
  rawPostSlug: string,
  options?: PublicReadOptions,
): Promise<PublicPostResult> {
  const normalizedHandle = normalizePublicSlug(rawHandle);
  const normalizedSlug = normalizePublicSlug(rawPostSlug);
  if (normalizedHandle === undefined || normalizedSlug === undefined) {
    return { kind: "not_found" };
  }

  const timeoutMs = options?.timeoutMs ?? READ_TIMEOUT_MS;

  return withReadTimeout(async () => {
    const executor = options?.executor ?? defaultExecutor();
    const publication = await getPublicationBySlug(executor, normalizedHandle);
    if (publication === undefined) {
      return { kind: "not_found" };
    }

    const resolved = await resolvePostSlug(executor, publication.id, normalizedSlug);
    if (resolved === undefined) {
      return { kind: "not_found" };
    }

    if (
      resolved.redirect ||
      rawHandle !== publication.slug ||
      rawPostSlug !== resolved.slug
    ) {
      return {
        kind: "redirect",
        location: `/@${encodeURIComponent(publication.slug)}/${encodeURIComponent(resolved.slug)}`,
      };
    }

    const post = await getPublishedPostById(executor, resolved.postId);
    if (post === undefined) {
      return { kind: "not_found" };
    }

    return { kind: "ok", publication, post };
  }, timeoutMs);
}
