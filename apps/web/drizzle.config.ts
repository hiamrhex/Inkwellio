import { defineConfig } from "drizzle-kit";

/**
 * One config, every module's schema. The glob is proven to collect each
 * `modules/<name>/schema.ts` and to fail loudly when it matches nothing
 * (E-028, E-029, ADR-004).
 */
export default defineConfig({
  dialect: "postgresql",
  schema: ["./src/modules/*/schema.ts", "./src/kernel/schema.ts"],
  out: "./drizzle",
  strict: true,
  verbose: true,
});
