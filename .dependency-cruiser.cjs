const { createSeamRules } = require("./tools/seam-rules.cjs");

/**
 * Rules live in tools/seam-rules.cjs so the boundary test runs the same rule
 * text against fixtures. Do not add a rule here without a failing fixture;
 * apps/web/tests/boundaries.test.ts enforces that pairing.
 *
 * @type {import('dependency-cruiser').IConfiguration}
 */
module.exports = {
  forbidden: createSeamRules(),
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "(\\.next|node_modules|tests/fixtures)" },
    tsConfig: { fileName: "apps/web/tsconfig.json" },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
    },
  },
};
