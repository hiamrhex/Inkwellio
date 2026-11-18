/**
 * Boundary config used only by the negative test. It mirrors the app rule from
 * .dependency-cruiser.cjs against the fixture tree so the test proves the rule
 * can fail.
 *
 * @type {import('dependency-cruiser').IConfiguration}
 */
module.exports = {
  forbidden: [
    {
      name: "app-only-imports-module-public-api",
      severity: "error",
      comment:
        "Files under app/ may import a module only through that module's index.ts.",
      from: { path: "^apps/web/tests/fixtures/boundaries/src/app/" },
      to: {
        path: "^apps/web/tests/fixtures/boundaries/src/modules/([^/]+)/",
        pathNot:
          "^apps/web/tests/fixtures/boundaries/src/modules/[^/]+/index\\.ts$",
      },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
  },
};
