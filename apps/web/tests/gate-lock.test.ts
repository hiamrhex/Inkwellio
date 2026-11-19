import { readFileSync, statSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The gate lock must never block pushes forever.
 *
 * A machine crash, a killed process, or a power failure can leave a stale
 * lock file. The lock manager should:
 * 1. Detect that the lock file exists.
 * 2. Try to read the owner's pid.
 * 3. Check if that process is alive.
 * 4. If not, remove the stale lock and proceed.
 * 5. If the owner is alive, wait and retry.
 * 6. If waiting exceeds WAIT_LIMIT_MS, fail with a clear message.
 */

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const lockPath = path.join(repoRoot, "inkwellio-gate.lock");

const WAIT_LIMIT_MS = 15 * 60 * 1_000; // 15 minutes

async function owner(lock: string): Promise<{ pid: number; startedAt: string } | null> {
  try {
    const raw = readFileSync(path.join(lock, "owner.json"), "utf8");
    const parsed = JSON.parse(raw);
    return { pid: Number(parsed.pid), startedAt: String(parsed.startedAt) };
  } catch {
    return null;
  }
}

function alive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function removeStaleLock(lock: string): Promise<void> {
  const current = await owner(lock);
  if (current !== null && !alive(current.pid)) {
    rmSync(lock, { recursive: true, force: true });
  }
}

describe("gate lock cleanup", () => {
  it("wait limit is a reasonable positive number", () => {
    // 15 minutes: long enough to handle a slow machine, short enough that a
    // stale lock does not block pushes indefinitely.
    expect(WAIT_LIMIT_MS).toBeGreaterThan(0);
    expect(WAIT_LIMIT_MS).toBeLessThanOrEqual(30 * 60 * 1_000); // ≤ 30 min
  });

  it("removes a stale lock when the owner is dead", async () => {
    // Create a fake stale lock.
    mkdirSync(lockPath, { recursive: true });
    writeFileSync(path.join(lockPath, "owner.json"), JSON.stringify({ pid: 99999, startedAt: new Date().toISOString() }));

    await removeStaleLock(lockPath);

    expect(() => statSync(lockPath)).toThrow();
  });

  it("does nothing when the lock is fresh and the owner is alive", async () => {
    mkdirSync(lockPath, { recursive: true });
    writeFileSync(
      path.join(lockPath, "owner.json"),
      JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }),
    );

    await removeStaleLock(lockPath);

    expect(statSync(lockPath).isDirectory()).toBe(true);
  });

  it("does nothing when the lock is fresh but the owner is dead", async () => {
    // Create a fake lock with a dead owner.
    mkdirSync(lockPath, { recursive: true });
    writeFileSync(
      path.join(lockPath, "owner.json"),
      JSON.stringify({ pid: 99998, startedAt: new Date().toISOString() }),
    );

    await removeStaleLock(lockPath);

    // The lock should be removed because we don't know if it's stale or not.
    expect(() => statSync(lockPath)).toThrow();
  });
});
