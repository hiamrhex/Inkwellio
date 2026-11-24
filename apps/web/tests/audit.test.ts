import { describe, expect, it, beforeEach } from "vitest";
import {
  recordAuditEvent,
  getAuditEvents,
  clearMemoryAuditEvents,
  hashIp,
  hashEmail,
} from "../src/modules/identity/audit";
import { getPool } from "../src/kernel/db";

const DATABASE_URL = process.env.DATABASE_URL;

/** Remove only this file's rows, so rows owned by other suites cannot leak in. */
async function clearSignInEvents(): Promise<void> {
  if (!DATABASE_URL) return;
  await getPool().query("DELETE FROM audit_events WHERE action = $1", ["auth.sign_in"]);
}

describe("Gate G7: Transactional Audit Writer", () => {
  beforeEach(async () => {
    clearMemoryAuditEvents();
    await clearSignInEvents();
  });

  it("five failed sign-ins produce exactly one aggregated audit_events row (A10: action, ip_hash, 10-minute window, attempts = 5)", async () => {
    const ip = "203.0.113.42";
    const email = "TargetUser@example.com";
    const requestId = "req-fail-batch";

    // 5 failed sign-in attempts within the same 10-minute window
    for (let i = 1; i <= 5; i++) {
      await recordAuditEvent({
        action: "auth.sign_in",
        outcome: "failed",
        actorKind: "anonymous",
        requestId: `${requestId}-${i}`,
        ip,
        email,
      });
    }

    // Scope to this file's bucket: `audit_events` is shared with the WP1 suite,
    // which writes its own rows (and resets the schema).
    const events = (await getAuditEvents()).filter(
      (event) => event.action === "auth.sign_in" && event.ipHash === hashIp(ip),
    );
    // Exactly one aggregated row for this bucket
    expect(events.length).toBe(1);

    const aggregated = events[0]!;
    expect(aggregated.action).toBe("auth.sign_in");
    expect(aggregated.outcome).toBe("failed");
    expect(aggregated.actorKind).toBe("anonymous");
    expect(aggregated.ipHash).toBe(hashIp(ip));
    // Metadata carries aggregated attempts = 5
    expect((aggregated.metadata as { attempts: number }).attempts).toBe(5);
    // Carrying emailHash, NOT plaintext email
    expect((aggregated.metadata as { emailHash: string }).emailHash).toBe(hashEmail(email));
  });

  it("scan finds no plaintext email in audit_events", async () => {
    const testEmail = "sensitive.author@publishing.org";
    const ip = "198.51.100.24";

    // Record both success and failure events
    await recordAuditEvent({
      action: "auth.sign_in",
      outcome: "ok",
      actorKind: "user",
      actorUserId: "00000000-0000-0000-0000-000000000001",
      requestId: "req-success",
      ip,
      email: testEmail,
    });

    await recordAuditEvent({
      action: "auth.sign_in",
      outcome: "failed",
      actorKind: "anonymous",
      requestId: "req-fail",
      ip,
      email: testEmail,
    });

    const events = await getAuditEvents();
    expect(events.length).toBeGreaterThan(0);

    // Deep serialization scan of all columns and metadata
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain(testEmail);
    expect(serialized).not.toContain("sensitive.author");
    expect(serialized).not.toContain("publishing.org");

    // General regex scan for standard email address pattern
    const emailRegex = /[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/;
    expect(emailRegex.test(serialized)).toBe(false);
  });

  it("if the audit insert fails, the action fails (fail-closed)", async () => {
    // A10: metadata cannot exceed 1032 bytes UTF-8 (check constraint)
    // or invalid outcome value
    const massiveMetadata = {
      blob: "A".repeat(2000), // Exceeds 1032 bytes cap
    };

    await expect(
      recordAuditEvent({
        action: "auth.sign_in",
        outcome: "failed",
        actorKind: "anonymous",
        requestId: "req-overflow",
        ip: "127.0.0.1",
        metadata: massiveMetadata,
      }),
    ).rejects.toThrow();
  });
});
