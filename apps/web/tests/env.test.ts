import { describe, expect, it } from "vitest";
import { parseEnv } from "../src/kernel/env";

describe("parseEnv", () => {
  it("returns a typed environment when the input is valid", () => {
    expect(parseEnv({ NODE_ENV: "test" })).toEqual({
      NODE_ENV: "test",
      LOG_LEVEL: "info",
      BETTER_AUTH_SECRET: "test-secret-minimum-32-characters-long",
      BETTER_AUTH_URL: "http://localhost:3000",
    });
  });

  it("throws when a required variable is missing", () => {
    expect(() => parseEnv({ NODE_ENV: "production" })).toThrow(/BETTER_AUTH_SECRET/);
  });

  it("throws when a variable has an invalid value", () => {
    expect(() => parseEnv({ NODE_ENV: "staging" })).toThrow(/NODE_ENV/);
  });
});
