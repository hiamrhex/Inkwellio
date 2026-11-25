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

  it("treats empty or whitespace-only optional variables as undefined without crashing", () => {
    const parsed = parseEnv({
      NODE_ENV: "production",
      BETTER_AUTH_SECRET: "prod-secret-minimum-32-characters-long-xyz",
      BETTER_AUTH_URL: "https://inkwellio.vercel.app",
      DATABASE_URL: "",
      LOG_LEVEL: "   ",
      GMAIL_USER: "",
      GMAIL_APP_PASSWORD: "  ",
    });

    expect(parsed.NODE_ENV).toBe("production");
    expect(parsed.LOG_LEVEL).toBe("info");
    expect(parsed.DATABASE_URL).toBeUndefined();
    expect(parsed.GMAIL_USER).toBeUndefined();
    expect(parsed.GMAIL_APP_PASSWORD).toBeUndefined();
  });

  it("still throws in production when BETTER_AUTH_SECRET or BETTER_AUTH_URL is empty", () => {
    expect(() =>
      parseEnv({
        NODE_ENV: "production",
        BETTER_AUTH_SECRET: "",
        BETTER_AUTH_URL: "https://inkwellio.vercel.app",
      }),
    ).toThrow(/BETTER_AUTH_SECRET/);

    expect(() =>
      parseEnv({
        NODE_ENV: "production",
        BETTER_AUTH_SECRET: "prod-secret-minimum-32-characters-long-xyz",
        BETTER_AUTH_URL: "",
      }),
    ).toThrow(/BETTER_AUTH_URL/);
  });
});
