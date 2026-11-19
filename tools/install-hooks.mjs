#!/usr/bin/env node
/**
 * Points `core.hooksPath` at `.githooks` so the committed hooks are the ones
 * that run. Invoked by `prepare` on `pnpm install` and by `pnpm hooks:install`.
 *
 * Rules:
 * - Silent when nothing changes: `prepare` runs on every install, including CI.
 * - No-op outside a git work tree, so a packed tarball or a CI checkout without
 *   git cannot fail the install.
 * - Never overwrite a hooksPath that points somewhere else. That is somebody
 *   else's configuration, and stealing it silently is worse than warning.
 */
import { execFileSync } from "node:child_process";

const TARGET = ".githooks";

/** @param {string[]} args */
function git(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function insideWorkTree() {
  try {
    return git(["rev-parse", "--is-inside-work-tree"]) === "true";
  } catch {
    return false;
  }
}

if (!insideWorkTree()) {
  process.exit(0);
}

let current = "";
try {
  current = git(["config", "--local", "--get", "core.hooksPath"]);
} catch {
  current = "";
}

if (current === TARGET) {
  process.exit(0);
}

const force = process.argv.includes("--force");

if (current !== "" && !force) {
  console.warn(
    `hooks: core.hooksPath is already "${current}"; leaving it alone. ` +
      `Run \`pnpm hooks:install --force\` if you meant to use ${TARGET}.`,
  );
  process.exit(0);
}

try {
  git(["config", "--local", "core.hooksPath", TARGET]);
  console.log(`hooks: core.hooksPath -> ${TARGET}`);
} catch (error) {
  console.error(`hooks: could not set core.hooksPath: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
