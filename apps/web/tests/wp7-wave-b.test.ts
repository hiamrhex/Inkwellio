import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SiteShell } from "../src/components/site-shell";
import { WorkspaceShell } from "../src/components/workspace-shell";
import {
  formatApiFailure,
  parseRetryAfterSeconds,
  requestAccountExportDownload,
  requestJson,
  slugifyHandlePreview,
} from "../src/components/studio/api";
import { DashboardClient } from "../src/components/studio/dashboard-client";
import { SettingsPrivacyClient } from "../src/components/studio/settings-privacy-client";
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

  it("renders the workspace app shell with sidebar sections and a single Sign out", () => {
    const html = renderToStaticMarkup(
      createElement(
        WorkspaceShell,
        { activePath: "/dashboard" },
        createElement("main", { id: "main-content" }, "body"),
      ),
    );

    expect(html).toContain("workspace-shell");
    expect(html).toContain("workspace-sidebar");
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain('href="/topics"');
    expect(html).toContain('href="/search"');
    expect(html).toContain('href="/settings/privacy"');
    expect(html).toContain("Browse topics");
    expect(html).toContain("New story");
    expect(html).not.toContain("data-motion-toggle");
    expect(html).not.toContain('href="/history"');
    expect(html).not.toContain("inkwellio.example");

    const shellSrc = fs.readFileSync(
      path.join(root, "apps/web/src/components/workspace-shell.tsx"),
      "utf8",
    );
    const headerBlock = shellSrc.slice(0, shellSrc.indexOf("<aside"));
    expect(headerBlock).not.toContain("data-motion-toggle");
    expect(shellSrc).toContain("aria-label=\"Workspace navigation\"");
    expect(shellSrc).toContain('href={`/@${encodeURIComponent(publication.slug)}`}');
    expect(shellSrc).toContain("setDrawerOpen(false)");
    expect(shellSrc).toContain('event.key === "Escape"');
  });

  it("renders the reader shell with Topics / Search active state and no marketing anchors", () => {
    const readerHtml = renderToStaticMarkup(
      createElement(
        SiteShell,
        { activePath: "/topics" },
        createElement("main", { id: "main-content" }, "body"),
      ),
    );
    expect(readerHtml).toContain("site-header-bar");
    expect(readerHtml).toContain('href="/topics"');
    expect(readerHtml).toContain('href="/search"');
    expect(readerHtml).toContain('aria-current="page"');
    expect(readerHtml).not.toContain("Principles");
    expect(readerHtml).not.toContain("Publishing");
    expect(readerHtml).toContain("Inkwellio — 2026 — Independent football publishing");

    const homeHtml = renderToStaticMarkup(
      createElement(
        SiteShell,
        { isHome: true },
        createElement("main", { id: "main-content" }, "body"),
      ),
    );
    for (const label of ["Principles", "Editor", "Reading", "Publishing"]) {
      expect(homeHtml).toContain(label);
    }
  });

  it("root html declares smooth-scroll intent so Next disables it during route transitions", () => {
    const layoutSrc = fs.readFileSync(
      path.join(root, "apps/web/src/app/layout.tsx"),
      "utf8",
    );
    const cssSrc = fs.readFileSync(
      path.join(root, "apps/web/src/app/globals.css"),
      "utf8",
    );
    expect(layoutSrc).toContain('data-scroll-behavior="smooth"');
    expect(cssSrc).toMatch(/html\s*\{[^}]*scroll-behavior:\s*smooth/);
  });

  it("signed-in landing CTAs and plain writer copy replace developer jargon", () => {
    const pageSrc = fs.readFileSync(
      path.join(root, "apps/web/src/app/page.tsx"),
      "utf8",
    );
    expect(pageSrc).toContain("Open dashboard");
    expect(pageSrc).toContain('href="/dashboard"');
    expect(pageSrc).toContain('href="/sign-up"');
    expect(pageSrc).not.toContain("Write in plain Markdown");
    expect(pageSrc).not.toContain("full JSON export");
    expect(pageSrc).not.toContain("inkwellio.example");

    const cssSrc = fs.readFileSync(
      path.join(root, "apps/web/src/app/globals.css"),
      "utf8",
    );
    expect(cssSrc).toContain(".site-header-bar:has(.nav-auth-slot button) ~ main .cta-signed-in");
  });

  it("topics directory renders a two-column card grid and no bogus breadcrumb", () => {
    const topicsSrc = fs.readFileSync(
      path.join(root, "apps/web/src/app/topics/page.tsx"),
      "utf8",
    );
    expect(topicsSrc).toContain('className="topics-grid"');
    expect(topicsSrc).toContain('className="topic-card"');
    expect(topicsSrc).not.toContain("Breadcrumb");
    expect(topicsSrc).not.toContain('href="/search"');
    expect(topicsSrc).toContain('activePath="/topics"');

    const cssSrc = fs.readFileSync(
      path.join(root, "apps/web/src/app/globals.css"),
      "utf8",
    );
    const gridBlock = cssSrc.slice(cssSrc.indexOf(".topics-grid"), cssSrc.indexOf(".topic-card-name"));
    expect(gridBlock).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(gridBlock).toContain("gap: 24px");
    expect(gridBlock).toMatch(/\.topic-card:hover\s*\{[^}]*translateY\(-4px\)/);
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

  it("Milestone 3: /settings/privacy enforces auth redirect, policy, and real export/erasure controls", () => {
    const policySrc = fs.readFileSync(
      path.join(root, "apps/web/src/app/settings/privacy/policy.ts"),
      "utf8",
    );
    const pageSrc = fs.readFileSync(
      path.join(root, "apps/web/src/app/settings/privacy/page.tsx"),
      "utf8",
    );
    const clientSrc = fs.readFileSync(
      path.join(root, "apps/web/src/components/studio/settings-privacy-client.tsx"),
      "utf8",
    );

    expect(policySrc).toContain('export const policy = "authenticated" as const;');
    expect(pageSrc).toContain('redirect("/sign-in?next=%2Fsettings%2Fprivacy")');
    expect(pageSrc).toContain('<WorkspaceShell activePath="/settings/privacy">');
    expect(clientSrc).toContain("/api/account/erasure/request");
    expect(clientSrc).toContain("/api/account/erasure/confirm");
    expect(clientSrc).toContain("/api/auth/sign-out");
    expect(clientSrc).toContain("requestAccountExportDownload");
    expect(clientSrc).not.toMatch(/\/api\/publications\/[^/]+\s*method:\s*["'](PATCH|PUT)/i);

    const html = renderToStaticMarkup(
      createElement(SettingsPrivacyClient, {
        session: {
          userId: "user-1",
          email: "writer@example.test",
          name: "Test Writer",
        },
        publication: {
          id: "pub-1",
          slug: "pitch-notes",
          name: "Pitch Notes",
        },
        postCounts: { draft: 2, published: 3, deleted: 1 },
      }),
    );

    expect(html).toContain('id="main-content"');
    expect(html).toContain("workspace-main");
    expect(html).toContain("writer@example.test");
    expect(html).toContain("Pitch Notes");
    expect(html).toContain("@pitch-notes");
    expect(html).toContain("3 published · 2 drafts · 1 in trash");
    expect(html).toContain("Export JSON");
    expect(html).toContain("Send confirmation code");
    expect(html).toContain('for="erasure-password"');
    expect(html).not.toContain('href="/history"');
  });
});
