import { afterEach, describe, expect, it, vi } from "vitest";
import { RateLimitError } from "../src/kernel/errors";
import { enforceWriteLimit } from "../src/app/api/_lib/write-limit";
import * as dbModule from "../src/kernel/db";
import { PUT as saveDraftRoute } from "../src/app/api/posts/[id]/draft/route";
import { requireUser } from "../src/app/api/_lib/session";
import { saveDraft } from "../src/modules/posts";

/**
 * Per-write limiter proofs (follow-up to PR #36).
 *
 * The draft route is the autosave path: the studio debounces 1,500 ms and keeps
 * one save in flight, so a human produces at most ~40 saves/minute. 120/minute
 * is three times that; 30/minute is used for structural writes.
 */
vi.mock("../src/app/api/_lib/session", () => ({
  requireUser: vi.fn(async () => ({ userId: "route-user" })),
}));

vi.mock("../src/app/api/_lib/executor", () => ({ dbExecutor: () => ({}) }));

vi.mock("../src/modules/posts", () => ({
  getDraftForOwner: vi.fn(),
  saveDraft: vi.fn(async () => ({ version: 1, updatedAt: "2026-11-27T00:00:00.000Z" })),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

function draftRequest(requestId: string): Request {
  return new Request("http://localhost/api/posts/post-1/draft", {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      "x-request-id": requestId,
    },
    body: JSON.stringify({ expectedVersion: 0, title: "T", bodyMarkdown: "body" }),
  });
}

const routeContext = { params: Promise.resolve({ id: "post-1" }) };

describe("write limiter tiers", () => {
  it("allows a normal autosave burst of 40 saves in one window", async () => {
    for (let i = 0; i < 40; i += 1) {
      await expect(
        enforceWriteLimit("write:draft_save", `burst-user-${i % 4}`),
      ).resolves.toBeUndefined();
    }
  });

  it("refuses the 121st draft save with a bounded Retry-After", async () => {
    for (let i = 0; i < 120; i += 1) {
      await enforceWriteLimit("write:draft_save", "flood-user");
    }
    await expect(enforceWriteLimit("write:draft_save", "flood-user")).rejects.toMatchObject({
      name: "RateLimitError",
      code: "RATE_LIMITED",
      retryAfterSeconds: expect.any(Number),
    });
    await expect(enforceWriteLimit("write:draft_save", "flood-user")).rejects.toBeInstanceOf(
      RateLimitError,
    );
  });

  it("refuses the 31st structural write, keeping a separate budget from autosave", async () => {
    for (let i = 0; i < 30; i += 1) {
      await enforceWriteLimit("write:publish", "structural-user", { structural: true });
    }
    await expect(
      enforceWriteLimit("write:publish", "structural-user", { structural: true }),
    ).rejects.toBeInstanceOf(RateLimitError);
    // A different action has its own bucket and is unaffected.
    await expect(
      enforceWriteLimit("write:slug", "structural-user", { structural: true }),
    ).resolves.toBeUndefined();
  });

  it("denies a counter-store outage as 503 UNAVAILABLE, never as 429", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://broken:broken@127.0.0.1:1/inkwellio");
    const spy = vi.spyOn(dbModule, "getDb").mockImplementation(() => {
      throw new Error("ECONNREFUSED");
    });
    try {
      await expect(
        enforceWriteLimit("write:draft_save", "outage-user"),
      ).rejects.toMatchObject({
        code: "UNAVAILABLE",
        message: "Temporarily unavailable",
      });
    } finally {
      spy.mockRestore();
    }
  });
});

describe("draft route wiring", () => {
  it("answers a flood with the kernel 429 JSON, Retry-After and requestId, before the service runs", async () => {
    for (let i = 0; i < 120; i += 1) {
      await enforceWriteLimit("write:draft_save", "route-user");
    }

    const response = await saveDraftRoute(draftRequest("req-flood"), routeContext);
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toMatch(/^\d+$/);
    expect(await response.json()).toMatchObject({
      code: "RATE_LIMITED",
      status: 429,
      requestId: "req-flood",
    });
    expect(saveDraft).not.toHaveBeenCalled();
  });

  it("answers a limiter outage with 503 JSON and no Retry-After", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://broken:broken@127.0.0.1:1/inkwellio");
    const spy = vi.spyOn(dbModule, "getDb").mockImplementation(() => {
      throw new Error("ECONNREFUSED");
    });
    try {
      const response = await saveDraftRoute(draftRequest("req-outage"), routeContext);
      expect(response.status).toBe(503);
      expect(response.headers.get("retry-after")).toBeNull();
      expect(await response.json()).toMatchObject({
        code: "UNAVAILABLE",
        requestId: "req-outage",
      });
      expect(saveDraft).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("lets a normal autosave reach the service", async () => {
    // A fresh user id: the flood test deliberately exhausted `route-user`.
    vi.mocked(requireUser).mockResolvedValueOnce({ userId: "normal-user" });
    const response = await saveDraftRoute(draftRequest("req-normal"), routeContext);
    expect(response.status).toBe(200);
    expect(saveDraft).toHaveBeenCalledTimes(1);
  });
});
