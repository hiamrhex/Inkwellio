import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "apps/web/tests/**/*.test.ts",
      "packages/ui/tests/**/*.test.ts",
    ],
    restoreMocks: true,
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.join(__dirname, "apps", "web", "src"),
      "@inkwellio/ui": path.join(__dirname, "packages", "ui", "src", "index.ts"),
    },
  },
});
