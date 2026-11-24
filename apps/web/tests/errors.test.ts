import { describe, expect, it } from "vitest";
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  isPublicErrorCode,
  toPublicError,
  type PublicErrorCode,
} from "../src/kernel/errors";

/**
 * The mapper is the only door between a thrown value and a browser. These tests
 * use error objects shaped exactly like the ones `pg` produces, captured from a
 * real Postgres 17 in `tests/db/postgres.test.ts`; the shapes matter more than
 * the values, because the test asserts that *none* of the extra fields survive.
 */

const REQUEST_ID = "req-0000-1111";

const PUBLIC_CODES: PublicErrorCode[] = [
  "VALIDATION_ERROR",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "UNAVAILABLE",
  "INTERNAL",
];

/** A `pg` DatabaseError, field for field. */
function pgError(code: string, extra: Record<string, unknown> = {}): Error {
  return Object.assign(new Error(`duplicate key value violates unique constraint "x"`), {
    length: 244,
    severity: "ERROR",
    code,
    detail: "Key (owner_user_id, slug)=(9f1c, hello-world) already exists.",
    schema: "public",
    table: "publications",
    constraint: "publications_owner_slug_key",
    file: "nbtinsert.c",
    line: "673",
    routine: "_bt_check_unique",
    ...extra,
  });
}

function serialised(error: unknown): string {
  return JSON.stringify(toPublicError(error, REQUEST_ID));
}

function expectNoLeak(error: unknown, secrets: string[]): void {
  const body = serialised(error);
  for (const secret of secrets) {
    expect(body, `"${secret}" leaked into the public error`).not.toContain(secret);
  }
}

describe("toPublicError", () => {
  it.each([
    ["23505", "CONFLICT"],
    ["23503", "VALIDATION_ERROR"],
    ["23514", "VALIDATION_ERROR"],
    ["22P02", "VALIDATION_ERROR"],
    ["40001", "CONFLICT"],
    ["57014", "UNAVAILABLE"],
    ["53300", "UNAVAILABLE"],
  ])("maps SQLSTATE %s to %s", (sqlstate, expected) => {
    const result = toPublicError(pgError(sqlstate), REQUEST_ID);
    expect(result.code).toBe(expected);
  });

  it.each(["42P07", "42703", "42601", "XX000"])(
    "treats SQLSTATE %s as an internal fault, not a user mistake",
    (sqlstate) => {
      expect(toPublicError(pgError(sqlstate), REQUEST_ID).code).toBe("INTERNAL");
    },
  );

  it("never copies the raw message, detail, constraint, table or SQLSTATE", () => {
    expectNoLeak(pgError("23505"), [
      "23505",
      "publications",
      "publications_owner_slug_key",
      "nbtinsert.c",
      "Key (owner_user_id",
      "duplicate key value",
      "9f1c",
    ]);
  });

  it("maps socket failures to UNAVAILABLE and leaks no host", () => {
    const error = Object.assign(
      new Error("connect ECONNREFUSED 10.0.0.5:5432"),
      { code: "ECONNREFUSED" },
    );
    expect(toPublicError(error, REQUEST_ID).code).toBe("UNAVAILABLE");
    expectNoLeak(error, ["10.0.0.5", "5432", "ECONNREFUSED"]);
  });

  it("falls back to INTERNAL for anything it does not recognise", () => {
    for (const thrown of [
      new Error("secret internal detail"),
      "a string",
      null,
      undefined,
      42,
      { code: 23505 },
      Object.create(null),
    ]) {
      const result = toPublicError(thrown, REQUEST_ID);
      expect(result.code).toBe("INTERNAL");
      expect(result.status).toBe(500);
      expect(result.message).toBe("Something went wrong");
      expect(JSON.stringify(result)).not.toContain("secret internal detail");
    }
  });

  it("keeps a message this repository wrote, and the code it declares", () => {
    const result = toPublicError(new ValidationError("Title is required"), REQUEST_ID);
    expect(result).toMatchObject({
      code: "VALIDATION_ERROR",
      status: 400,
      message: "Title is required",
      requestId: REQUEST_ID,
    });
  });

  it("refuses a code that is not in the public vocabulary", () => {
    // A subclass could be handed a database code by mistake. The union is not a
    // runtime guarantee, so the mapper checks it.
    const rogue = new AppError(
      "duplicate key",
      "23505" as unknown as PublicErrorCode,
    );
    expect(toPublicError(rogue, REQUEST_ID).code).toBe("INTERNAL");
    expectNoLeak(rogue, ["23505"]);
  });

  it("always returns a code from the closed set and the caller's id", () => {
    const samples: unknown[] = [
      new NotFoundError(),
      new ConflictError(),
      new ForbiddenError(),
      new Error("x"),
      pgError("23505"),
      pgError("XX000"),
    ];
    for (const sample of samples) {
      const result = toPublicError(sample, REQUEST_ID);
      expect(PUBLIC_CODES).toContain(result.code);
      expect(result.requestId).toBe(REQUEST_ID);
      expect(result.status).toBeGreaterThanOrEqual(400);
      expect(result.status).toBeLessThan(600);
    }
  });
});

describe("isPublicErrorCode", () => {
  it("accepts only the six codes", () => {
    for (const code of PUBLIC_CODES) {
      expect(isPublicErrorCode(code)).toBe(true);
    }
    for (const value of ["23505", "internal", "", null, 500, {}]) {
      expect(isPublicErrorCode(value)).toBe(false);
    }
  });
});
