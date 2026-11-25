import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword } from "better-auth/crypto";
import { ForbiddenError, ValidationError } from "../src/kernel/errors";

const h = vi.hoisted(() => ({
  revalidateCalls: [] as Array<{ tag: string; profile: unknown }>,
  credentialHash: "",
  erasedCommitted: false,
  mode: "ok" as "ok" | "no-credential",
}));

vi.mock("next/cache", () => ({
  updateTag: () => undefined,
  revalidateTag: (tag: string, profile: unknown) => {
    h.revalidateCalls.push({ tag, profile });
  },
  cacheTag: () => undefined,
  cacheLife: () => undefined,
}));

vi.mock("@/kernel/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/kernel/db")>();

  const query = async (sqlText: string) => {
    if (sqlText.includes("DELETE FROM users")) {
      return { rows: [], rowCount: 1 };
    }
    if (sqlText.includes("FROM users WHERE id =")) {
      return { rows: [{ id: "user-1", email: "writer@example.com", name: "Writer" }] };
    }
    if (sqlText.includes("FROM accounts") && sqlText.includes("provider_id = 'credential'")) {
      return h.mode === "no-credential"
        ? { rows: [] }
        : { rows: [{ password: h.credentialHash }] };
    }
    if (sqlText.includes("FROM verifications") && sqlText.includes("FOR UPDATE")) {
      const { createHash } = await import("node:crypto");
      const tokenHash = createHash("sha256").update("valid-token-123").digest("hex");
      return {
        rows: [
          {
            id: "ver-1",
            value: tokenHash,
            expires_at: new Date(Date.now() + 60_000),
          },
        ],
      };
    }
    if (sqlText.includes("FROM publications WHERE owner_id =")) {
      return { rows: [{ slug: "writer-pub" }] };
    }
    if (sqlText.includes("po.status = 'published'")) {
      return {
        rows: [
          {
            post_id: "post-1",
            publication_slug: "writer-pub",
            post_slug: "hello-world",
          },
        ],
      };
    }
    if (sqlText === "COMMIT") {
      h.erasedCommitted = true;
    }
    return { rows: [{ c: 1 }], rowCount: 1 };
  };

  const fakePool = {
    query,
    connect: async () => ({
      query,
      release: () => undefined,
    }),
  };

  return {
    ...actual,
    getPool: () => fakePool as unknown as ReturnType<typeof actual.getPool>,
  };
});

import {
  confirmAccountErasure,
  requestAccountErasure,
} from "../src/modules/identity/privacy";
import { invalidateErasedAccount } from "../src/app/api/_lib/cache-seam";

describe("WP2b Erasure Hardening (Password Re-Entry & Post-Erasure Cache Seam)", () => {
  beforeEach(async () => {
    h.revalidateCalls.length = 0;
    h.erasedCommitted = false;
    h.mode = "ok";
    h.credentialHash = await hashPassword("RightPassword-2026!");
  });

  it("rejects requestAccountErasure with ValidationError when password is missing on a credential account", async () => {
    await expect(
      requestAccountErasure({
        userId: "user-1",
        requestId: "req-missing-pw",
        ip: "198.51.100.1",
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects requestAccountErasure with ForbiddenError when password is wrong on a credential account", async () => {
    await expect(
      requestAccountErasure({
        userId: "user-1",
        password: "WrongPassword-999!",
        requestId: "req-wrong-pw",
        ip: "198.51.100.1",
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("captures cache targets in confirmAccountErasure and invalidates WP4 public caches after commit", async () => {
    const result = await confirmAccountErasure({
      userId: "user-1",
      token: "valid-token-123",
      requestId: "req-confirm",
      ip: "198.51.100.1",
      invalidateCache: invalidateErasedAccount,
    });

    expect(h.erasedCommitted).toBe(true);
    expect(result.users).toBe(1);

    const tags = h.revalidateCalls.map((c) => c.tag);
    expect(tags).toContain("publication:writer-pub");
    expect(tags).toContain("publication-feed:writer-pub");
    expect(tags).toContain("post:writer-pub:hello-world");
    expect(tags).toContain("post-id:post-1");
    expect(
      h.revalidateCalls.every((c) => JSON.stringify(c.profile) === '{"expire":0}'),
    ).toBe(true);
  });
});
