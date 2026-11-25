import { defineConfig } from "drizzle-kit";

/**
 * One config, every module's schema. The glob is proven to collect each
 * `modules/<name>/schema.ts` and to fail loudly when it matches nothing
 * (E-028, E-029, ADR-004).
 *
 * `dbCredentials` is only added when `DATABASE_URL` is present. `generate`
 * does not need a connection, and `migrate` gets the URL from the caller's
 * environment (the ops runner sets it to the unpooled connection and never
 * prints it).
 */
const databaseUrl = process.env.DATABASE_URL;

export default defineConfig({
  dialect: "postgresql",
  schema: ["./src/modules/*/schema.ts", "./src/kernel/schema.ts"],
  out: "./drizzle",
  strict: true,
  verbose: true,
  ...(databaseUrl === undefined ? {} : { dbCredentials: { url: databaseUrl } }),
});
