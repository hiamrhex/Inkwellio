# E-053: Gate lock cleanup for stale locks

**What:** The gate lock must never block pushes forever. A machine crash, killed process, or power failure can leave a stale lock file.

**How verified:** `apps/web/tests/gate-lock.test.ts` tests that the lock manager removes a stale lock when the owner is dead.

**Source:** tools/gate.mjs, apps/web/tests/gate-lock.test.ts.

**Date:** 2026-11-19.

**Status:** Confirmed.

**Details:**
- The lock manager reads the owner's pid from `owner.json` and checks if the process is alive.
- If the process is dead, the lock is removed and the gate proceeds.
- If the process is alive, the gate waits and retries.
- If waiting exceeds 15 minutes, the gate fails with a clear message.
- The test creates a fake stale lock with a dead pid (99999) and verifies that the lock is removed.

**Note on the original "Test failed" flake:** The log was truncated, so the original cause of the flaky gate cannot be proven. The race was reproduced with two simultaneous `pnpm check` runs, and the fix (per-worktree lock) is correct. The gate lock cleanup test ensures that a stale lock never blocks pushes forever.
