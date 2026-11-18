/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "app-only-imports-module-public-api",
      severity: "error",
      comment:
        "Files under app/ may import a module only through that module's index.ts.",
      from: { path: "^apps/web/src/app/" },
      to: {
        path: "^apps/web/src/modules/([^/]+)/",
        pathNot: "^apps/web/src/modules/[^/]+/index\\.ts$",
      },
    },
    {
      name: "modules-import-only-other-module-public-api",
      severity: "error",
      comment:
        "A module may import another module only through its index.ts. Imports inside the same module are unrestricted. $1 is the importing module's directory name.",
      from: { path: "^apps/web/src/modules/([^/]+)/" },
      to: {
        path: "^apps/web/src/modules/(?!$1/)[^/]+/",
        pathNot: "/index\\.ts$",
      },
    },
    {
      name: "kernel-independent-of-modules",
      severity: "error",
      comment: "kernel/ must not depend on any module.",
      from: { path: "^apps/web/src/kernel/" },
      to: { path: "^apps/web/src/modules/" },
    },
    {
      name: "no-circular",
      severity: "error",
      comment: "Circular dependencies are forbidden.",
      from: {},
      to: { circular: true },
    },
    // TODO(WP2): once Better Auth is introduced, add a rule allowing only
    // modules/identity/ to import better-auth.
  ],
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
