import { describe, expect, it } from "vitest";
import { parseEnv } from "../src/kernel/env";

describe("parseEnv", () => {
  it("returns a typed environment when the input is valid", () => {
    expect(parseEnv({ NODE_ENV: "test" })).toEqual({
      NODE_ENV: "test",
      LOG_LEVEL: "info",
      BETTER_AUTH_SECRET: "test-secret-minimum-32-characters-long",
      BETTER_AUTH_URL: "http://localhost:3000",
      // Defaults that decide whether a client header may key a rate limit and
      // whether mail leaves the process. They are part of the typed surface.
      TRUST_PROXY_HEADERS: "0",
      EMAIL_TRANSPORT: "auto",
    });
  });

  it("parses an explicit trusted-origin allowlist and rejects wildcards or bare hosts", () => {
    const parsed = parseEnv({
      NODE_ENV: "production",
      BETTER_AUTH_SECRET: "prod-secret-minimum-32-characters-long-xyz",
      BETTER_AUTH_URL: "https://inkwellio.vercel.app",
      BETTER_AUTH_TRUSTED_ORIGINS:
        "https://inkwellio-git-preview.vercel.app, http://192.168.1.20:3000",
    });
    expect(parsed.BETTER_AUTH_TRUSTED_ORIGINS).toEqual([
      "https://inkwellio-git-preview.vercel.app",
      "http://192.168.1.20:3000",
    ]);

    const base = {
      NODE_ENV: "production",
      BETTER_AUTH_SECRET: "prod-secret-minimum-32-characters-long-xyz",
      BETTER_AUTH_URL: "https://inkwellio.vercel.app",
    };
    expect(() =>
      parseEnv({ ...base, BETTER_AUTH_TRUSTED_ORIGINS: "https://*.vercel.app" }),
    ).toThrow(/wildcard/i);
    expect(() =>
      parseEnv({ ...base, BETTER_AUTH_TRUSTED_ORIGINS: "inkwellio.vercel.app" }),
    ).toThrow(/Invalid URL|absolute URL/i);
    expect(() =>
      parseEnv({ ...base, BETTER_AUTH_TRUSTED_ORIGINS: "https://evil.test/path" }),
    ).toThrow(/origin/i);
    expect(() =>
      parseEnv({ ...base, BETTER_AUTH_TRUSTED_ORIGINS: "ftp://evil.test" }),
    ).toThrow(/http/i);
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
