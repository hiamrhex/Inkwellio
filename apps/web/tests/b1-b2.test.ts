import { describe, expect, it } from "vitest";
import { authorize, mapAuthError } from "../src/modules/identity";

describe("B1: authorize() account tenant isolation", () => {
  const userA = { type: "user" as const, id: "user-a", role: "user" as const };
  const userB = { type: "user" as const, id: "user-b", role: "user" as const };

  it("denies user A from exporting user B's account", () => {
    const allowed = authorize(userA, "export_data", {
      type: "account",
      action: "export",
      userId: userB.id,
    });
    expect(allowed).toBe(false);
  });

  it("denies user A from deleting user B's account", () => {
    const allowed = authorize(userA, "delete_account", {
      type: "account",
      action: "delete",
      userId: userB.id,
    });
    expect(allowed).toBe(false);
  });

  it("allows user A to export their own account", () => {
    const allowed = authorize(userA, "export_data", {
      type: "account",
      action: "export",
      userId: userA.id,
    });
    expect(allowed).toBe(true);
  });
});

describe("B2: mapAuthError() maps SQLSTATE 23505 to 409 CONFLICT", () => {
  it("maps pg error with code 23505 to CONFLICT (409)", () => {
    const pgErr = Object.assign(new Error("duplicate key value violates unique constraint"), {
      code: "23505",
    });
    const result = mapAuthError(pgErr, "req-1");
    expect(result.code).toBe("CONFLICT");
    expect(result.status).toBe(409);
  });

  it("maps Better Auth wrapped error containing 23505 to CONFLICT (409)", () => {
    const wrappedErr = new Error("Failed query: duplicate key value violates unique constraint \"users_email_unique\" (code: 23505)");
    const result = mapAuthError(wrappedErr, "req-2");
    expect(result.code).toBe("CONFLICT");
    expect(result.status).toBe(409);
  });
});
