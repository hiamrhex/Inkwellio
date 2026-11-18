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
