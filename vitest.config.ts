import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["apps/web/tests/**/*.test.ts"],
    restoreMocks: true,
  },
  resolve: {
    alias: {
      "@": path.join(__dirname, "apps", "web", "src"),
    },
  },
});
