import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["apps/web/tests/**/*.test.ts"],
    restoreMocks: true,
    // Every test file shares one Postgres database, and the WP1 suite resets
    // the `public` schema. Running files in parallel lets one file drop tables
    // while another is writing (CI: audit.test.ts saw 2 rows where 1 was
    // expected). Serial execution makes the database deterministic.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.join(__dirname, "apps", "web", "src"),
    },
  },
});
