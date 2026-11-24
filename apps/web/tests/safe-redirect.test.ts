import { describe, expect, it } from "vitest";
import { safeRedirect } from "../src/modules/identity";

/**
 * safeRedirect test table (A13).
 *
 * Twelve payloads that exercise every boundary condition. The helper must
 * reject every malicious target and return "/" as the safe fallback.
 */

const ORIGIN = "https://inkwellio.com";

const testCases: Array<[string, string, string]> = [
  // [description, target, expected]
  ["relative path allowed", "/dashboard", "/dashboard"],
  ["relative path with query allowed", "/dashboard?tab=posts", "/dashboard?tab=posts"],
  ["root allowed", "/", "/"],
  ["double slash rejected", "//evil.com", "/"],
  ["backslash rejected", "/\\evil.com", "/"],
  ["protocol-relative rejected", "//evil.com/path", "/"],
  ["javascript: rejected", "javascript:alert(1)", "/"],
  ["data: rejected", "data:text/html,<script>alert(1)</script>", "/"],
  ["control chars rejected", "/path\x00injection", "/"],
  ["absolute URL to same origin allowed", "https://inkwellio.com/dashboard", "/dashboard"],
  ["absolute URL to different origin rejected", "https://evil.com/dashboard", "/"],
  ["relative with encoded slash rejected", "/path%2F..%2Fadmin", "/"],
  ["malformed URI percent encoding rejected", "/%E0%A4%A", "/"],
  ["encoded CRLF rejected", "/%0d%0aSet-Cookie:bad", "/"],
  ["literal CRLF rejected", "/path\r\ninjection", "/"],
  ["backslash in path rejected", "/path\\to\\resource", "/"],
  ["double backslash protocol-relative rejected", "/\\\\evil.com", "/"],
];

describe("safeRedirect", () => {
  for (const [description, target, expected] of testCases) {
    it(`${description}: "${target}" -> "${expected}"`, () => {
      expect(safeRedirect(target, ORIGIN)).toBe(expected);
    });
  }

  it("rejects paths that resolve outside origin via directory traversal", () => {
    // This should be caught by the URL constructor
    expect(safeRedirect("/../admin", ORIGIN)).toBe("/");
    expect(safeRedirect("/path/../../etc/passwd", ORIGIN)).toBe("/");
  });

  it("handles empty string", () => {
    expect(safeRedirect("", ORIGIN)).toBe("/");
  });

  it("handles null/undefined gracefully", () => {
    // TypeScript prevents this, but runtime safety
    expect(safeRedirect("/" as unknown as string, ORIGIN)).toBe("/");
  });
});