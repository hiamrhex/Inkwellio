"use strict";

/**
 * Single source of the seam rules.
 *
 * The shipped config and the boundary test both call `createSeamRules`. The
 * test passes a fixture root so the same rule text is proven to fail; the
 * shipped config passes the real source root. Never copy a rule into a test
 * config: a copy proves the copy.
 */

/** Source root the shipped rules are anchored to. */
const SRC_ROOT = "apps/web/src";

/**
 * @param {string} value
 * @returns {string}
 */
function escapeForRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * @param {string} [root] Source root, relative to the repo root, forward-slash separated.
 * @returns {Array<{
 *   name: string,
 *   severity: "error",
 *   comment: string,
 *   from: { path: string },
 *   to: { path?: string, pathNot?: string, circular?: boolean },
 * }>}
 */
function createSeamRules(root = SRC_ROOT) {
  const at = escapeForRegExp(root.replace(/\\/g, "/").replace(/\/+$/, ""));

  return [
    {
      name: "app-only-imports-module-public-api",
      severity: "error",
      comment:
        "Files under app/ may import a module only through that module's index.ts.",
      from: { path: `^${at}/app/` },
      to: {
        path: `^${at}/modules/([^/]+)/`,
        pathNot: `^${at}/modules/[^/]+/index\\.ts$`,
      },
    },
    {
      name: "modules-import-only-other-module-public-api",
      severity: "error",
      comment:
        "A module may import another module only through its index.ts. Imports inside the same module are unrestricted. $1 is the importing module's directory name.",
      from: { path: `^${at}/modules/([^/]+)/` },
      to: {
        path: `^${at}/modules/(?!$1/)[^/]+/`,
        pathNot: "/index\\.ts$",
      },
    },
    {
      name: "kernel-independent-of-modules",
      severity: "error",
      comment: "kernel/ must not depend on any module.",
      from: { path: `^${at}/kernel/` },
      to: { path: `^${at}/modules/` },
    },
    {
      name: "no-circular",
      severity: "error",
      comment: "Circular dependencies are forbidden.",
      from: {},
      to: { circular: true },
    },
  ];
}

module.exports = { SRC_ROOT, createSeamRules };
