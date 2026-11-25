import { createServer, type Socket } from "node:net";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { closeDb } from "../src/kernel/db";
import { GET as healthGet, checkDatabaseHealth } from "../src/app/api/health/route";
import { GET as searchGet } from "../src/app/api/search/route";
import { GET as topicsGet } from "../src/app/api/topics/route";
import RouteError from "../src/app/error";
import GlobalError from "../src/app/global-error";
import NotFound from "../src/app/not-found";
import { mapPublicReadError, withPublicDbTimeout } from "../src/modules/search";

const LEAK_MARKERS = [
  "postgres://",
  "postgresql://",
  "SQLSTATE",
  "node_modules",
  "DATABASE_URL",
  "leaked_user",
  "leaked_pass",
  "drill_secret_pw",
];

function assertNoLeak(text: string): void {
  for (const marker of LEAK_MARKERS) {
    expect(text, `Found forbidden leak marker "${marker}"`).not.toContain(marker);
  }
}

describe("WP8: Failure-mode and graceful-degradation drills", () => {
  it("fails closed cleanly with 503 and security headers when DATABASE_URL is unset", async () => {
    const origUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    await closeDb();

    try {
      const healthRes = await healthGet();
      expect(healthRes.status).toBe(503);
      expect(healthRes.headers.get("cache-control")).toBe("no-store");
      expect(healthRes.headers.get("x-content-type-options")).toBe("nosniff");
      const healthText = await healthRes.text();
      expect(JSON.parse(healthText)).toEqual({ status: "unavailable" });
      assertNoLeak(healthText);

      const topicsRes = await topicsGet();
      expect(topicsRes.status).toBe(503);
      expect(topicsRes.headers.get("cache-control")).toBe("no-store");
      expect(topicsRes.headers.get("x-content-type-options")).toBe("nosniff");
      const topicsReqId = topicsRes.headers.get("x-request-id");
      expect(topicsReqId).toBeTruthy();
      const topicsText = await topicsRes.text();
      expect(JSON.parse(topicsText)).toEqual({
        error: {
          code: "UNAVAILABLE",
          status: 503,
          message: "Temporarily unavailable",
          requestId: topicsReqId,
        },
      });
      assertNoLeak(topicsText);

      const searchRes = await searchGet(
        new Request("https://inkwellio.example/api/search?q=football"),
      );
      expect(searchRes.status).toBe(503);
      expect(searchRes.headers.get("cache-control")).toBe("no-store");
      expect(searchRes.headers.get("x-content-type-options")).toBe("nosniff");
      const searchReqId = searchRes.headers.get("x-request-id");
      expect(searchReqId).toBeTruthy();
      const searchText = await searchRes.text();
      expect(JSON.parse(searchText)).toEqual({
        error: {
          code: "UNAVAILABLE",
          status: 503,
          message: "Temporarily unavailable",
          requestId: searchReqId,
        },
      });
      assertNoLeak(searchText);
    } finally {
      await closeDb();
      if (origUrl !== undefined) {
        process.env.DATABASE_URL = origUrl;
      } else {
        delete process.env.DATABASE_URL;
      }
    }
  });

  it("rejects empty search queries with 400 before checking database availability", async () => {
    const origUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;

    try {
      const response = await searchGet(
        new Request("https://inkwellio.example/api/search?q="),
      );
      expect(response.status).toBe(400);
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      const payload = (await response.json()) as { error: { code: string } };
      expect(payload.error.code).toBe("VALIDATION_ERROR");
    } finally {
      if (origUrl !== undefined) {
        process.env.DATABASE_URL = origUrl;
      } else {
        delete process.env.DATABASE_URL;
      }
    }
  });

  it("bounds unresponsive database hangs without leaking connection strings", async () => {
    const sockets = new Set<Socket>();
    const server = createServer((socket) => {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const addr = server.address();
    if (!addr || typeof addr === "string") {
      throw new Error("Expected TCP server address");
    }

    const origUrl = process.env.DATABASE_URL;
    await closeDb();
    process.env.DATABASE_URL = `postgres://leaked_user:drill_secret_pw@127.0.0.1:${addr.port}/inkwellio`;

    try {
      const start = performance.now();
      const ok = await checkDatabaseHealth(80);
      const elapsed = performance.now() - start;
      expect(ok).toBe(false);
      expect(elapsed).toBeLessThan(1000);

      let caught: unknown;
      try {
        await withPublicDbTimeout(
          () => new Promise((resolve) => setTimeout(resolve, 10_000).unref?.()),
          50,
        );
      } catch (err) {
        caught = err;
      }

      const mapped = mapPublicReadError(caught, "req-drill-timeout");
      expect(mapped).toEqual({
        code: "UNAVAILABLE",
        status: 503,
        message: "Temporarily unavailable",
        requestId: "req-drill-timeout",
      });
      assertNoLeak(JSON.stringify(mapped));
    } finally {
      if (origUrl !== undefined) {
        process.env.DATABASE_URL = origUrl;
      } else {
        delete process.env.DATABASE_URL;
      }
      for (const s of sockets) {
        s.destroy();
      }
      await closeDb();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("renders RouteError and GlobalError safely with Ink & Paper tokens, digest, retry, and home link", () => {
    const poisonedError = Object.assign(
      new Error(
        "postgres://leaked_user:leaked_pass@db.internal:5432/inkwellio SQLSTATE 42P01",
      ),
      { digest: "wp8-digest-1" },
    );

    const routeHtml = renderToStaticMarkup(
      createElement(RouteError, { error: poisonedError, reset: () => {} }),
    );
    expect(routeHtml).toContain("Something went wrong");
    expect(routeHtml).toContain("wp8-digest-1");
    expect(routeHtml).toContain("Try again");
    expect(routeHtml).toContain('href="/"');
    expect(routeHtml).toContain("--bg-canvas");
    expect(routeHtml).toContain("--text-primary");
    assertNoLeak(routeHtml);

    const globalHtml = renderToStaticMarkup(
      createElement(GlobalError, { error: poisonedError, reset: () => {} }),
    );
    expect(globalHtml).toContain("Something went wrong");
    expect(globalHtml).toContain("wp8-digest-1");
    expect(globalHtml).toContain("Try again");
    expect(globalHtml).toContain('href="/"');
    expect(globalHtml).toContain("--bg-canvas");
    expect(globalHtml).toContain("--text-primary");
    assertNoLeak(globalHtml);
  });

  it("renders NotFound with Ink & Paper styling, home link, and zero search controls", () => {
    const html = renderToStaticMarkup(createElement(NotFound));
    expect(html).toContain("Not found");
    expect(html).toContain('href="/"');
    expect(html).toContain("--bg-canvas");
    expect(html).toContain("--text-primary");
    expect(html.toLowerCase()).not.toContain("<form");
    expect(html.toLowerCase()).not.toContain("<input");
    assertNoLeak(html);
  });
});
