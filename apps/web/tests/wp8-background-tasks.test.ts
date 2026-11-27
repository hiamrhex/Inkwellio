import { beforeEach, describe, expect, it, vi } from "vitest";
import * as logModule from "../src/kernel/log";
import { trackIdentityBackgroundTask } from "../src/modules/identity";

/**
 * Better Auth's verification email is sent in a background promise. On Vercel
 * the invocation must stay alive until that promise settles; otherwise the
 * browser gets 200 with no email and no error. These tests pin the tracking
 * contract and the redaction rule for failures.
 */
const state = vi.hoisted(() => ({
  registered: [] as Array<() => Promise<void>>,
  afterThrows: false,
}));

vi.mock("next/server", () => ({
  after: (callback: () => Promise<void>) => {
    // Emulate both the request scope and the "outside a request scope" throw.
    if (state.afterThrows) {
      throw new Error("after was called outside a request scope");
    }
    state.registered.push(callback);
  },
}));

beforeEach(() => {
  state.registered.length = 0;
  state.afterThrows = false;
  vi.restoreAllMocks();
});

describe("Better Auth background task tracking", () => {
  it("registers the promise with the platform and awaits it after the response", async () => {
    let settled = false;
    const pending = new Promise<void>((resolve) => {
      setTimeout(() => {
        settled = true;
        resolve();
      }, 5);
    });

    expect(() => trackIdentityBackgroundTask(pending)).not.toThrow();
    expect(state.registered).toHaveLength(1);

    await state.registered[0]!();
    expect(settled).toBe(true);
  });

  it("logs a rejection with safe metadata only", async () => {
    const logSpy = vi.spyOn(logModule, "logEvent").mockImplementation(() => {});
    const secret = "token=SECRET_RESET_TOKEN writer@example.test password=hunter2";

    trackIdentityBackgroundTask(Promise.reject(new Error(secret)));
    expect(state.registered).toHaveLength(1);
    await state.registered[0]!();

    expect(logSpy).toHaveBeenCalledWith("error", "background_task_failed", {
      error: "Error",
    });
    const logged = JSON.stringify(logSpy.mock.calls);
    expect(logged).not.toContain("SECRET_RESET_TOKEN");
    expect(logged).not.toContain("writer@example.test");
    expect(logged).not.toContain("hunter2");
  });

  it("falls back without throwing when there is no request scope, and still logs failures", async () => {
    state.afterThrows = true;
    const logSpy = vi.spyOn(logModule, "logEvent").mockImplementation(() => {});

    expect(() => trackIdentityBackgroundTask(Promise.reject(new Error("boom")))).not.toThrow();
    expect(state.registered).toHaveLength(0);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(logSpy).toHaveBeenCalledWith("error", "background_task_failed", {
      error: "Error",
    });
  });
});
