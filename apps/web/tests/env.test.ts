import { describe, expect, it } from "vitest";
import { parseEnv } from "../src/kernel/env";

describe("parseEnv", () => {
  it("returns a typed environment when the input is valid", () => {
    expect(parseEnv({ NODE_ENV: "test" })).toEqual({
      NODE_ENV: "test",
      LOG_LEVEL: "info",
    });
  });

  it("throws when a required variable is missing", () => {
    expect(() => parseEnv({})).toThrow(/NODE_ENV/);
  });

  it("throws when a variable has an invalid value", () => {
    expect(() => parseEnv({ NODE_ENV: "staging" })).toThrow(/NODE_ENV/);
  });
});
