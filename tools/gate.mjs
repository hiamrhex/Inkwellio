#!/usr/bin/env node
/**
 * The gate: lint, typecheck, build, test, seams — in that order, one process at
 * a time.
 *
 * Why a lock. Two `pnpm check` runs at once both try to write `.next`, and the
 * second dies with "Another next build process is already running". That is a
 * gate that fails at random: the answer is not to re-run it, it is to make
 * overlapping runs queue. Evidence: E-045.
 *
 * Build runs before test on purpose. The disclosure tests read `.next/static`
 * and start the production server, so they need a build to exist. A missing
 * build is reported as such, never skipped.
 *
 * Exit code is the first failing step's, so a red step stops the chain exactly
 * as `&&` did.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const STEPS = [
  { name: "lint", script: "lint" },
  { name: "typecheck", script: "typecheck" },
  { name: "build", script: "build" },
  { name: "test", script: "test" },
  { name: "boundaries", script: "check:boundaries" },
];

const POLL_MS = 1_000;
const WAIT_LIMIT_MS = 15 * 60 * 1_000;

function gitOutput(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

/** Shared repository lock path across all worktrees, or null when not a Git checkout. */
function lockPath() {
  const top = gitOutput(["rev-parse", "--show-toplevel"]);
  const common = gitOutput(["rev-parse", "--git-common-dir"]);
  if (top === null || common === null) {
    return null;
  }
  return join(resolve(top, common), "inkwellio-gate.lock");
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function owner(lock) {
  try {
    const raw = readFileSync(join(lock, "owner.json"), "utf8");
    const parsed = JSON.parse(raw);
    return { pid: Number(parsed.pid), startedAt: String(parsed.startedAt) };
  } catch {
    return null;
  }
}

function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means the process exists but belongs to someone else.
    return error.code === "EPERM";
  }
}

function acquire(lock) {
  const started = Date.now();
  let announced = false;
  for (;;) {
    try {
      mkdirSync(lock);
      writeFileSync(
        join(lock, "owner.json"),
        JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }),
      );
      return;
    } catch (error) {
      if (error.code !== "EEXIST") {
        throw error;
      }
    }

    const current = owner(lock);
    if (current !== null && !alive(current.pid)) {
      rmSync(lock, { recursive: true, force: true });
      continue;
    }

    if (Date.now() - started > WAIT_LIMIT_MS) {
      throw new Error(
        `gate: gave up waiting for the lock held by ${current === null ? "an unknown process" : `pid ${current.pid}`} (${lock})`,
      );
    }

    if (!announced) {
      const who = current === null ? "another gate" : `pid ${current.pid}`;
      console.error(`gate: ${who} is running the checks; waiting for it to finish`);
      announced = true;
    }
    sleep(POLL_MS);
  }
}

const lock = lockPath();
if (lock === null) {
  console.error("gate: not a Git checkout; running without a lock");
} else {
  acquire(lock);
}

let exitCode = 0;
try {
  for (const step of STEPS) {
    console.log(`\ngate: ${step.name}`);
    const result = spawnSync(`pnpm ${step.script}`, {
      stdio: "inherit",
      shell: true,
    });
    if (result.status !== 0) {
      exitCode = result.status ?? 1;
      console.error(`gate: ${step.name} failed (exit ${exitCode})`);
      break;
    }
  }
} finally {
  if (lock !== null) {
    rmSync(lock, { recursive: true, force: true });
  }
}

process.exit(exitCode);
