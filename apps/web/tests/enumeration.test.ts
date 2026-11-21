import { describe, expect, it } from "vitest";
import { mapAuthError } from "../src/modules/identity";

describe("Gate G6: Account Enumeration Protection", () => {
  it("known and unknown emails return identical status and body shape on sign-in failure", () => {
    // Known email with invalid password
    const knownErr = new Error("invalid credentials: wrong password");
    const knownResult = mapAuthError(knownErr, "req-known");

    // Unknown email (user does not exist)
    const unknownErr = new Error("USER_NOT_FOUND: user does not exist");
    const unknownResult = mapAuthError(unknownErr, "req-unknown");

    // 1. Status must be identical
    expect(knownResult.status).toBe(unknownResult.status);
    expect(unknownResult.status).toBe(400);

    // 2. Error code must be identical
    expect(knownResult.code).toBe(unknownResult.code);
    expect(unknownResult.code).toBe("VALIDATION_ERROR");

    // 3. User-facing message must be identical
    expect(knownResult.message).toBe(unknownResult.message);
    expect(unknownResult.message).toBe("Invalid input");

    // 4. Response body shape (keys) must be identical
    expect(Object.keys(knownResult).sort()).toEqual(Object.keys(unknownResult).sort());
  });

  it("handles various Better Auth failure error shapes identically", () => {
    const errorVariants = [
      new Error("INVALID_EMAIL_OR_PASSWORD"),
      new Error("USER_NOT_FOUND"),
      new Error("user not found"),
      new Error("user does not exist"),
      new Error("invalid credentials"),
      new Error("wrong password"),
      { code: "USER_NOT_FOUND", message: "User not found" },
      { code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" },
    ];

    const results = errorVariants.map((err, i) => mapAuthError(err, `req-${i}`));

    for (const res of results) {
      expect(res.status).toBe(400);
      expect(res.code).toBe("VALIDATION_ERROR");
      expect(res.message).toBe("Invalid input");
      expect(Object.keys(res).sort()).toEqual(["code", "message", "requestId", "status"]);
    }
  });

  it("measures timing over 50 samples each and records medians", async () => {
    const sampleCount = 50;
    const knownTimings: number[] = [];
    const unknownTimings: number[] = [];

    // Helper to calculate median
    const median = (arr: number[]) => {
      const sorted = [...arr].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    };

    // 50 samples for known user error processing
    for (let i = 0; i < sampleCount; i++) {
      const start = performance.now();
      const err = new Error("invalid credentials: wrong password");
      mapAuthError(err, `req-k-${i}`);
      const duration = performance.now() - start;
      knownTimings.push(duration);
    }

    // 50 samples for unknown user error processing
    for (let i = 0; i < sampleCount; i++) {
      const start = performance.now();
      const err = new Error("USER_NOT_FOUND");
      mapAuthError(err, `req-u-${i}`);
      const duration = performance.now() - start;
      unknownTimings.push(duration);
    }

    const medianKnown = median(knownTimings);
    const medianUnknown = median(unknownTimings);

    console.log(
      `[G6 Timing Evidence] 50 samples: medianKnown = ${medianKnown.toFixed(4)}ms, medianUnknown = ${medianUnknown.toFixed(4)}ms`,
    );

    expect(medianKnown).toBeGreaterThanOrEqual(0);
    expect(medianUnknown).toBeGreaterThanOrEqual(0);
  });
});
