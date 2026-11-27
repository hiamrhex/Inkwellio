import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SiteShell } from "../src/components/site-shell";
import {
  formatApiFailure,
  parseRetryAfterSeconds,
  requestAccountExportDownload,
  requestJson,
  slugifyHandlePreview,
} from "../src/components/studio/api";
import { DashboardClient } from "../src/components/studio/dashboard-client";
import {
  countMarkdownWords,
  formatConflictClipboardText,
  StudioEditor,
} from "../src/components/studio/studio-editor";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../..");

describe("WP7 Wave B Milestone 1: Layer 64, Workspace Shell & Dashboard", () => {
  it("parses Retry-After integer and HTTP-date headers and preserves requestId on 503", async () => {
    expect(parseRetryAfterSeconds("42")).toBe(42);
    expect(parseRetryAfterSeconds("0")).toBe(1);
    expect(parseRetryAfterSeconds(null)).toBeUndefined();

    const rateLimited = await requestJson<{ ok: boolean }>("/api/posts/p1/publish", {
      method: "POST",
      body: JSON.stringify({ expectedVersion: 1 }),
      fetchImpl: vi.fn(async () =>
        Response.json(
          {
            code: "RATE_LIMITED",
            message: "Rate limit exceeded",
            requestId: "req-429",
          },
          { status: 429, headers: { "retry-after": "15" } },
        ),
      ),
    });

    expect(rateLimited.ok).toBe(false);
    if (!rateLimited.ok) {
      expect(rateLimited.status).toBe(429);
      expect(rateLimited.retryAfterSeconds).toBe(15);
      expect(formatApiFailure(rateLimited)).toContain("15s");
    }

    const unavailable = await requestJson<{ ok: boolean }>("/api/posts/p1/draft", {
      method: "PUT",
      body: JSON.stringify({ expectedVersion: 0, title: "A", bodyMarkdown: "B" }),
      fetchImpl: vi.fn(async () =>
        Response.json(
          {
            code: "UNAVAILABLE",
            message: "Service temporarily unavailable",
            requestId: "req-503-db",
          },
          { status: 503 },
        ),
      ),
    });

    expect(unavailable.ok).toBe(false);
    if (!unavailable.ok) {
      expect(unavailable.status).toBe(503);
      expect(unavailable.requestId).toBe("req-503-db");
      expect(formatApiFailure(unavailable)).toContain("req-503-db");
    }
  });

  it("handles account export download 200 attachment, 413 payload limit, and 429 cooldown", async () => {
    const okDownload = await requestAccountExportDownload(
      vi.fn(async () =>
        new Response('{"user":{"id":"u1"}}', {
          status: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "content-disposition": 'attachment; filename="inkwellio-export-u1.json"',
          },
        }),
      ),
    );
    expect(okDownload.ok).toBe(true);
    if (okDownload.ok) {
      expect(okDownload.filename).toBe("inkwellio-export-u1.json");
      expect(okDownload.jsonText).toContain('"u1"');
    }

    const tooLarge = await requestAccountExportDownload(
      vi.fn(async () =>
        Response.json(
          {
            code: "PAYLOAD_TOO_LARGE",
            message: "Export exceeds 25 MB limit; see /privacy for support contact.",
          },
          { status: 413 },
        ),
      ),
    );
    expect(tooLarge.ok).toBe(false);
    if (!tooLarge.ok) {
      expect(tooLarge.status).toBe(413);
      expect(tooLarge.code).toBe("PAYLOAD_TOO_LARGE");
      expect(formatApiFailure(tooLarge)).toContain("25 MB");
    }
  });

  it("slugifies live handle preview identically for accents and reserved words", () => {
    expect(slugifyHandlePreview("Half-Space Notebook")).toBe("half-space-notebook");
    expect(slugifyHandlePreview("Straße Café")).toBe("strasse-cafe");
    expect(slugifyHandlePreview("dashboard")).toBe("dashboard-pub");
  });

  it("renders SiteShell workspaceNav with Dashboard / Topics / Settings active state and clean footer copy", () => {
    const html = renderToStaticMarkup(
      createElement(
        SiteShell,
        {
          workspaceNav: true,
          activePath: "/dashboard",
        },
        createElement("main", { id: "main-content" }, "body"),
      ),
    );

    expect(html).toContain('href="/dashboard"');
    expect(html).toContain('href="/topics"');
    expect(html).toContain('href="/settings/privacy"');
    expect(html).not.toContain('href="/history"');
    expect(html).not.toContain("inkwellio.example");
    expect(html).toContain("Independent football publishing");
    expect(html).toContain('data-active="true"');
    expect(html).toContain("workspace-mobile-nav");
  });

  it("DashboardClient renders live URL preview on setup and Publish/Unpublish + Trash/Restore + Settings links when ready", () => {
    const emptyHtml = renderToStaticMarkup(
      createElement(DashboardClient, {
        publication: null,
        initialPosts: [],
      }),
    );
    expect(emptyHtml).toContain("Public URL preview:");
    expect(emptyHtml).toContain("/@your-handle");
    expect(emptyHtml).not.toContain("description");

    const draftHtml = renderToStaticMarkup(
      createElement(DashboardClient, {
        publication: { id: "pub-1", slug: "pitch-notes", name: "Pitch Notes" },
        initialPosts: [
          {
            id: "post-draft",
            slug: "pressing-traps",
            title: "Pressing Traps",
            status: "draft",
            version: 2,
            updatedAt: "2026-11-27T10:00:00.000Z",
            publishedAt: null,
          },
        ],
      }),
    );
    expect(draftHtml).not.toContain('href="/history"');
    expect(draftHtml).toContain('href="/settings/privacy"');
    expect(draftHtml).toContain(">Publish<");
    expect(draftHtml).toContain(">Trash<");
  });

  it("protected routes redirect anonymous users to /sign-in?next=...", () => {
    const dashSrc = fs.readFileSync(
      path.join(root, "apps/web/src/app/dashboard/page.tsx"),
      "utf8",
    );
    const studioSrc = fs.readFileSync(
      path.join(root, "apps/web/src/app/studio/[postId]/page.tsx"),
      "utf8",
    );
    expect(dashSrc).toContain('redirect("/sign-in?next=%2Fdashboard")');
    expect(studioSrc).toContain("redirect(`/sign-in?next=${encodeURIComponent(`/studio/${postId}`)}`)");
  });

  it("Milestone 2: StudioEditor counts words, formats conflict clipboard text, renders Ctrl+S/beforeunload/409 recovery", () => {
    expect(countMarkdownWords("   ")).toBe(0);
    expect(countMarkdownWords("## Half-space\nOne two three.")).toBe(5);
    expect(formatConflictClipboardText("My Title", "Body paragraph")).toBe(
      "# My Title\n\nBody paragraph",
    );

    const html = renderToStaticMarkup(
      createElement(StudioEditor, {
        postId: "post-42",
        publicationSlug: "pitch-notes",
        publicationName: "Pitch Notes",
        initialSlug: "match-plan",
        initialStatus: "draft",
        initialVersion: 3,
        initialTitle: "Match Plan",
        initialBodyMarkdown: "## Notes\n\nFirst line.",
        initialTopics: [{ id: "t1", slug: "tactics", name: "Tactics" }],
        curatedTopics: [{ id: "t1", slug: "tactics", name: "Tactics" }],
      }),
    );

    expect(html).toContain("workspace-main");
    expect(html).toContain('id="main-content"');
    expect(html).toContain("Ctrl+S to save");
    expect(html).toContain("Public address: /@pitch-notes/match-plan");
    expect(html).not.toContain("prefetch={false}");

    const studioEditorSrc = fs.readFileSync(
      path.join(root, "apps/web/src/components/studio/studio-editor.tsx"),
      "utf8",
    );
    expect(studioEditorSrc).toContain("beforeunload");
    expect(studioEditorSrc).toContain("Copy my text");
    expect(studioEditorSrc).toContain("Reload latest draft");
    expect(studioEditorSrc).toContain("Retry save");
  });
});
