import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // This repo is App Router only; the Pages Router check cannot resolve.
      "@next/next/no-html-link-for-pages": "off",
      // User Markdown is the main untrusted input; raw HTML injection is banned.
      "react/no-danger": "error",
    },
  },
  {
    // Application code never writes to a console: in the browser it is a
    // disclosure channel, and on the server it is unstructured. `kernel/log.ts`
    // is the single writer, and it is exempt below.
    files: ["apps/web/src/**/*.{ts,tsx}"],
    rules: {
      "no-console": "error",
    },
  },
  {
    files: ["apps/web/src/kernel/log.ts"],
    rules: {
      "no-console": "off",
    },
  },
  globalIgnores([
    "**/node_modules/**",
    "**/.next/**",
    "**/out/**",
    "**/build/**",
    "**/coverage/**",
    "apps/web/next-env.d.ts",
    // Config files are CommonJS and are not application code.
    "**/*.cjs",
  ]),
]);
