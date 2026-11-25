/**
 * Kernel: configuration and error types shared by every module and by app/.
 * Must not import from modules/.
 */
import { z } from "zod";

const emptyToUndefined = (value: unknown): unknown =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),
  LOG_LEVEL: z.preprocess(
    emptyToUndefined,
    z.enum(["debug", "info", "warn", "error"]).default("info"),
  ),
  /**
   * Optional at parse time because `next build` imports every module without a
   * database. `kernel/db.ts` refuses to open a socket until this is set, so a
   * running server still fails loudly rather than lazily pretending.
   */
  DATABASE_URL: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .regex(/^postgres(ql)?:\/\/\S+$/, "must be a postgres:// or postgresql:// URL")
      .optional(),
  ),
  /** Better Auth secret for encryption/signing (min 32 chars) */
  BETTER_AUTH_SECRET: z.string().min(32, "secret must be at least 32 characters"),
  /** Base URL for Better Auth (e.g. https://inkwellio.vercel.app) */
  BETTER_AUTH_URL: z.string().url("must be a valid URL"),
  // Gmail SMTP (WP2b / WP2c)
  GMAIL_USER: z.preprocess(emptyToUndefined, z.string().email().optional()),
  GMAIL_APP_PASSWORD: z.preprocess(emptyToUndefined, z.string().min(16).optional()),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parse and validate environment variables. Throws on invalid configuration so
 * a misconfigured process fails at startup rather than on first request.
 *
 * In test mode, BETTER_AUTH_SECRET and BETTER_AUTH_URL are optional and
 * default to test values so that tests can run without real secrets.
 */
export function parseEnv(
  source: Readonly<Record<string, string | undefined>> = process.env,
): Env {
  // In test mode, provide defaults for Better Auth secrets
  const isTest = source.NODE_ENV === "test";
  const sourceWithDefaults = {
    ...source,
    BETTER_AUTH_SECRET: source.BETTER_AUTH_SECRET ?? (isTest ? "test-secret-minimum-32-characters-long" : undefined),
    BETTER_AUTH_URL: source.BETTER_AUTH_URL ?? (isTest ? "http://localhost:3000" : undefined),
  };

  const result = envSchema.safeParse(sourceWithDefaults);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
        return `${path}: ${issue.message}`;
      })
      .join("; ");

    throw new Error(`Invalid environment variables: ${details}`);
  }

  return result.data;
}

let cachedEnv: Env | undefined;

function getEnv(): Env {
  cachedEnv ??= parseEnv();
  return cachedEnv;
}

/**
 * Validated environment configuration.
 *
 * Parses eagerly at import time so a misconfigured server fails fast at startup.
 * During `next build` (`NEXT_PHASE === "phase-production-build"`), route metadata
 * collection imports modules without runtime auth secrets, so parsing is deferred
 * until a property is actually read.
 */
export const env: Env =
  process.env.NEXT_PHASE === "phase-production-build"
    ? new Proxy({} as Env, {
        get(_target, prop, receiver) {
          return Reflect.get(getEnv(), prop, receiver);
        },
      })
    : getEnv();
