import { describe, expect, it } from "vitest";
import { optionalString, readJsonObject, requireString, requireStringArray, requireVersion } from "../src/app/api/_lib/body";

/**
 * WP3b request-body parsing. A malformed body is a 400 (ValidationError), never
 * a 500 that leaks the JSON parser's message or a stack.
 */

function jsonRequest(body: string): Request {
  return new Request("http://localhost/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("readJsonObject", () => {
  it("parses a JSON object", async () => {
    expect(await readJsonObject(jsonRequest('{"name":"Ada"}'))).toEqual({ name: "Ada" });
  });

  it("rejects invalid JSON as a validation error", async () => {
    await expect(readJsonObject(jsonRequest("{not json"))).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("rejects a JSON array or primitive as a validation error", async () => {
    await expect(readJsonObject(jsonRequest("[1,2]"))).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    await expect(readJsonObject(jsonRequest("42"))).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });
});

describe("field helpers", () => {
  it("requireString returns a present string", () => {
    expect(requireString({ title: "Hello" }, "title")).toBe("Hello");
  });

  it("requireString rejects a missing or non-string field", () => {
    expect(() => requireString({}, "title")).toThrow();
    expect(() => requireString({ title: 7 }, "title")).toThrow();
  });

  it("optionalString returns undefined when absent and validates when present", () => {
    expect(optionalString({}, "slug")).toBeUndefined();
    expect(optionalString({ slug: "a-slug" }, "slug")).toBe("a-slug");
    expect(() => optionalString({ slug: 7 }, "slug")).toThrow();
  });

  it("requireVersion accepts non-negative integers only", () => {
    expect(requireVersion({ expectedVersion: 0 })).toBe(0);
    expect(requireVersion({ expectedVersion: 12 })).toBe(12);
    expect(() => requireVersion({ expectedVersion: -1 })).toThrow();
    expect(() => requireVersion({ expectedVersion: 1.5 })).toThrow();
    expect(() => requireVersion({})).toThrow();
  });

  it("requireStringArray accepts an array of strings, including an empty one", () => {
    expect(requireStringArray({ topicSlugs: ["tactics", "analytics"] }, "topicSlugs")).toEqual([
      "tactics",
      "analytics",
    ]);
    expect(requireStringArray({ topicSlugs: [] }, "topicSlugs")).toEqual([]);
  });

  it("requireStringArray rejects anything that is not an array of strings", () => {
    expect(() => requireStringArray({}, "topicSlugs")).toThrow();
    expect(() => requireStringArray({ topicSlugs: "tactics" }, "topicSlugs")).toThrow();
    expect(() => requireStringArray({ topicSlugs: ["tactics", 7] }, "topicSlugs")).toThrow();
    expect(() => requireStringArray({ topicSlugs: null }, "topicSlugs")).toThrow();
  });
});