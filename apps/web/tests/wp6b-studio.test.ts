import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  requestJson,
  toggleTopicSelection,
} from "../src/components/studio/api";
import { AuthGuardCard } from "../src/components/studio/auth-guard-card";
import { DashboardClient } from "../src/components/studio/dashboard-client";
import { SafeMarkdownPreview } from "../src/components/studio/safe-preview";
import { StudioEditor } from "../src/components/studio/studio-editor";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

describe("WP6b: Writer Dashboard & Post Studio UI", () => {
  it("requestJson checks status and content-type before json(), never surfacing SyntaxError on 500 HTML/text", async () => {
    const htmlFetch = vi.fn<typeof fetch>(async () => {
      return new Response("<html><body>500 Bad Gateway</body></html>", {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    });

    const htmlResult = await requestJson<{ id: string }>("/api/posts", {
      method: "POST",
      body: JSON.stringify({ publicationId: "pub-1" }),
      fetchImpl: htmlFetch,
    });

    expect(htmlResult.ok).toBe(false);
    if (!htmlResult.ok) {
      expect(htmlResult.status).toBe(500);
      expect(htmlResult.code).toBe("UNAVAILABLE");
      expect(htmlResult.message).not.toContain("SyntaxError");
      expect(htmlResult.message).not.toContain("<html>");
    }

    const badJson400 = vi.fn<typeof fetch>(async () => {
      return Response.json(
        {
          code: "VALIDATION_ERROR",
          message: "A title is 1-200 characters",
          requestId: "req-400-1",
        },
        { status: 400 },
      );
    });

    const errResult = await requestJson<{ id: string }>("/api/posts/p1/draft", {
      method: "PUT",
      body: JSON.stringify({ expectedVersion: 0, title: "", bodyMarkdown: "hi" }),
      fetchImpl: badJson400,
    });

    expect(errResult.ok).toBe(false);
    if (!errResult.ok) {
      expect(errResult.status).toBe(400);
      expect(errResult.code).toBe("VALIDATION_ERROR");
      expect(errResult.message).toBe("A title is 1-200 characters");
      expect(errResult.requestId).toBe("req-400-1");
    }

    const ok200NonJson = vi.fn<typeof fetch>(async () => {
      return new Response("ok", {
        status: 200,
        headers: { "content-type": "text/plain" },
      });
    });

    const nonJsonOk = await requestJson<{ id: string }>("/api/topics", {
      fetchImpl: ok200NonJson,
    });
    expect(nonJsonOk.ok).toBe(false);
  });

  it("enforces max 3 curated topics and toggles selections cleanly", () => {
    let selected: string[] = [];
    for (const slug of ["tactics", "analytics", "coaching"]) {
      const res = toggleTopicSelection(selected, slug);
      expect(res.atLimit).toBe(false);
      selected = res.next;
    }
    expect(selected).toEqual(["tactics", "analytics", "coaching"]);

    const fourth = toggleTopicSelection(selected, "set-pieces");
    expect(fourth.atLimit).toBe(true);
    expect(fourth.next).toEqual(["tactics", "analytics", "coaching"]);

    const removed = toggleTopicSelection(selected, "analytics");
    expect(removed.atLimit).toBe(false);
    expect(removed.next).toEqual(["tactics", "coaching"]);
  });

  it("renders markdown preview safely without raw HTML script or event-handler XSS", () => {
    const hostileMarkdown = [
      "# Match Notes",
      "",
      '<script>alert("xss")</script>',
      "",
      '<img src="x" onerror="alert(1)" />',
      "",
      "[bad](javascript:alert(1))",
      "",
      "[good](https://example.com/report)",
    ].join("\n");

    const html = renderToStaticMarkup(
      createElement(SafeMarkdownPreview, { content: hostileMarkdown }),
    );

    expect(html).toContain("Match Notes");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img");
    expect(html).toContain('href="https://example.com/report"');
    expect(html).toContain('rel="noopener noreferrer nofollow ugc"');
    expect(html.toLowerCase()).not.toContain("<script");
    expect(html.toLowerCase()).not.toContain("<img");
    expect(html.toLowerCase()).not.toContain("javascript:");
  });

  it("renders unauthenticated dashboard guard fail-closed without private post data", () => {
    const html = renderToStaticMarkup(
      createElement(AuthGuardCard, {
        heading: "Writer Dashboard",
      }),
    );

    expect(html).toContain("Sign in required");
    expect(html).toContain('href="/sign-in"');
    expect(html).toContain('href="/"');
    expect(html).toContain("--bg-canvas");
    expect(html).toContain("--text-primary");
    expect(html).not.toContain("New draft");
    expect(html).not.toContain("Create publication");
  });

  it("renders DashboardClient create-publication state and existing publication state cleanly", () => {
    const emptyHtml = renderToStaticMarkup(
      createElement(DashboardClient, {
        publication: null,
        initialPosts: [],
      }),
    );
    expect(emptyHtml).toContain("Create publication");
    expect(emptyHtml).toContain('for="pub-name"');
    expect(emptyHtml).toContain('for="pub-slug"');
    expect(emptyHtml).not.toContain("description");

    const readyHtml = renderToStaticMarkup(
      createElement(DashboardClient, {
        publication: { id: "pub-1", slug: "pitch-notes", name: "Pitch Notes" },
        initialPosts: [
          {
            id: "post-1",
            slug: "pressing-traps",
            title: "Pressing Traps",
            status: "draft",
            version: 2,
            updatedAt: "2026-11-25T10:00:00.000Z",
            publishedAt: null,
          },
        ],
      }),
    );
    expect(readyHtml).toContain("Pitch Notes");
    expect(readyHtml).toContain("@pitch-notes");
    expect(readyHtml).toContain("New draft");
    expect(readyHtml).toContain("Pressing Traps");
    expect(readyHtml).toContain('href="/studio/post-1"');
    expect(readyHtml).toContain('href="/@pitch-notes"');
  });

  it("renders StudioEditor with labeled fields, Write/Preview toggle, topic chips, and lifecycle buttons", () => {
    const html = renderToStaticMarkup(
      createElement(StudioEditor, {
        postId: "post-1",
        publicationSlug: "pitch-notes",
        publicationName: "Pitch Notes",
        initialSlug: "pressing-traps",
        initialStatus: "draft",
        initialVersion: 1,
        initialTitle: "Pressing Traps",
        initialBodyMarkdown: "## Notes\n\nBody text",
        initialTopics: [{ id: "t1", slug: "tactics", name: "Tactics" }],
        curatedTopics: [
          { id: "t1", slug: "tactics", name: "Tactics" },
          { id: "t2", slug: "analytics", name: "Analytics" },
        ],
      }),
    );

    expect(html).toContain('for="post-title"');
    expect(html).toContain('for="post-body"');
    expect(html).toContain('for="post-slug"');
    expect(html).toContain("Save draft");
    expect(html).toContain("Publish post");
    expect(html).toContain("Move to trash");
    expect(html).toContain("1/3 selected");
  });
});
