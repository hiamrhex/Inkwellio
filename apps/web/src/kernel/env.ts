/**
 * Kernel: configuration and error types shared by every module and by app/.
 * Must not import from modules/.
 */
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parse and validate environment variables. Throws on invalid configuration so
 * a misconfigured process fails at startup rather than on first request.
 */
export function parseEnv(
  source: Readonly<Record<string, string | undefined>> = process.env,
): Env {
  const result = envSchema.safeParse(source);

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

export const env = parseEnv();
