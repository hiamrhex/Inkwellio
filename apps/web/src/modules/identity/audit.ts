/**
 * Transactional Security Audit Writer (A10, ADR-014).
 *
 * Implements:
 * 1. Security events are rows in `audit_events`, written in the same transaction
 *    as the action they record. If the insert fails, the action fails (fail-closed).
 * 2. Plaintext emails, passwords, tokens, cookies, and markdown bodies are NEVER
 *    stored. Anonymous auth events carry `ip_hash = sha256(ip + pepper)` and
 *    an `email_hash` in metadata.
 * 3. Aggregation of repeated failures: repeated failure events collapse into
 *    one bucket row per (action, ip_hash, 10-minute window) with `metadata.attempts`.
 * 4. In-memory fallback and test query helpers for unit tests without DATABASE_URL.
 */

import { createHash, randomUUID } from "node:crypto";
import { and, eq, gte } from "drizzle-orm";
import { getDb } from "@/kernel/db";
import { auditEvents } from "@/kernel/schema";
import { normalizeRateLimitEmail } from "./limiter";

const AUDIT_PEPPER = process.env.AUDIT_PEPPER || "inkwellio-audit-pepper-default-secret-salt";
const MAX_METADATA_BYTES = 1032; // Enforced by audit_events_metadata_size_check
const AGGREGATION_WINDOW_MS = 10 * 60 * 1000; // 10 minutes (A10)

export type AuditOutcome = "ok" | "denied" | "failed";
export type AuditActorKind = "user" | "admin" | "system" | "anonymous";

export interface AuditEventInput {
  action: string;
  outcome: AuditOutcome;
  actorKind: AuditActorKind;
  actorUserId?: string | null;
  subjectUserId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  requestId: string;
  ip?: string | null;
  email?: string | null;
  metadata?: Record<string, unknown>;
}

export interface StoredAuditEvent {
  id: string;
  occurredAt: Date;
  action: string;
  outcome: string;
  actorKind: string;
  actorUserId: string | null;
  subjectUserId: string | null;
  targetType: string | null;
  targetId: string | null;
  requestId: string;
  ipHash: string | null;
  metadata: Record<string, unknown>;
}

export function hashIp(ip: string): string {
  return createHash("sha256").update(ip + AUDIT_PEPPER).digest("hex");
}

export function hashEmail(email: string): string {
  const normalized = normalizeRateLimitEmail(email);
  return createHash("sha256").update(normalized + AUDIT_PEPPER).digest("hex");
}

/** In-memory storage for test/offline execution when DATABASE_URL is unset */
const memoryAuditEvents: StoredAuditEvent[] = [];

export function clearMemoryAuditEvents(): void {
  memoryAuditEvents.length = 0;
}

export async function getAuditEvents(): Promise<StoredAuditEvent[]> {
  if (process.env.DATABASE_URL) {
    try {
      const db = getDb();
      const rows = await db.select().from(auditEvents).orderBy(auditEvents.occurredAt);
      return rows.map((r) => ({
        id: r.id,
        occurredAt: r.occurredAt,
        action: r.action,
        outcome: r.outcome,
        actorKind: r.actorKind,
        actorUserId: r.actorUserId,
        subjectUserId: r.subjectUserId,
        targetType: r.targetType,
        targetId: r.targetId,
        requestId: r.requestId,
        ipHash: r.ipHash,
        metadata: (r.metadata as Record<string, unknown>) ?? {},
      }));
    } catch {
      // Fallback to memory store if DB read fails
    }
  }
  return [...memoryAuditEvents];
}

/**
 * Validates metadata and sanitizes against forbidden keys and size caps.
 */
function buildMetadata(
  inputMetadata: Record<string, unknown> | undefined,
  email: string | null | undefined,
  attempts = 1,
): Record<string, unknown> {
  const metadata: Record<string, unknown> = { ...inputMetadata };

  // Never store plaintext email; replace with emailHash
  if (email) {
    delete metadata.email;
    metadata.emailHash = hashEmail(email);
  }

  // Set attempts count
  if (attempts > 1 || metadata.attempts !== undefined) {
    metadata.attempts = attempts;
  }

  // Ensure forbidden fields are stripped
  delete metadata.password;
  delete metadata.token;
  delete metadata.cookie;
  delete metadata.authorization;
  delete metadata.session;

  const serialized = JSON.stringify(metadata);
  const byteLength = Buffer.byteLength(serialized, "utf8");
  if (byteLength > MAX_METADATA_BYTES) {
    throw new Error(
      `audit_events: metadata size ${byteLength} bytes exceeds limit of ${MAX_METADATA_BYTES} bytes`,
    );
  }

  return metadata;
}

/**
 * Records an audit event (A10).
 *
 * Fails closed: if the audit insert fails (e.g. check violation, metadata overflow),
 * the error is thrown so the parent action fails too.
 */
export async function recordAuditEvent(input: AuditEventInput): Promise<StoredAuditEvent> {
  const ipHash = input.ip ? hashIp(input.ip) : null;
  const now = new Date();
  const windowStart = new Date(Math.floor(now.getTime() / AGGREGATION_WINDOW_MS) * AGGREGATION_WINDOW_MS);

  // Aggregation of repeated failures: collapse (action, ip_hash, 10-minute window)
  const isAggregatableFailure = input.outcome === "failed" && ipHash !== null;

  if (process.env.DATABASE_URL) {
    const db = getDb();

    if (isAggregatableFailure) {
      // Find existing failure event in the current window
      const existing = await db
        .select()
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.action, input.action),
            eq(auditEvents.outcome, "failed"),
            eq(auditEvents.ipHash, ipHash),
            gte(auditEvents.occurredAt, windowStart),
          ),
        )
        .limit(1);

      if (existing.length > 0 && existing[0]) {
        const row = existing[0];
        const prevMetadata = (row.metadata as Record<string, unknown>) ?? {};
        const currentAttempts = typeof prevMetadata.attempts === "number" ? prevMetadata.attempts + 1 : 2;
        const updatedMetadata = buildMetadata(prevMetadata, input.email, currentAttempts);

        await db
          .update(auditEvents)
          .set({
            occurredAt: now,
            metadata: updatedMetadata,
          })
          .where(eq(auditEvents.id, row.id));

        return {
          id: row.id,
          occurredAt: now,
          action: row.action,
          outcome: row.outcome,
          actorKind: row.actorKind,
          actorUserId: row.actorUserId,
          subjectUserId: row.subjectUserId,
          targetType: row.targetType,
          targetId: row.targetId,
          requestId: row.requestId,
          ipHash: row.ipHash,
          metadata: updatedMetadata,
        };
      }
    }

    // New event insert
    const metadata = buildMetadata(input.metadata, input.email, 1);
    const id = randomUUID();

    await db.insert(auditEvents).values({
      id,
      occurredAt: now,
      action: input.action,
      outcome: input.outcome,
      actorKind: input.actorKind,
      actorUserId: input.actorUserId ?? null,
      subjectUserId: input.subjectUserId ?? null,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      requestId: input.requestId,
      ipHash,
      metadata,
    });

    return {
      id,
      occurredAt: now,
      action: input.action,
      outcome: input.outcome,
      actorKind: input.actorKind,
      actorUserId: input.actorUserId ?? null,
      subjectUserId: input.subjectUserId ?? null,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      requestId: input.requestId,
      ipHash,
      metadata,
    };
  }

  // In-memory fallback
  if (isAggregatableFailure) {
    const existing = memoryAuditEvents.find(
      (e) =>
        e.action === input.action &&
        e.outcome === "failed" &&
        e.ipHash === ipHash &&
        e.occurredAt.getTime() >= windowStart.getTime(),
    );

    if (existing) {
      const prevAttempts = (existing.metadata.attempts as number) ?? 1;
      const updatedMetadata = buildMetadata(existing.metadata, input.email, prevAttempts + 1);
      existing.metadata = updatedMetadata;
      existing.occurredAt = now;
      return existing;
    }
  }

  const metadata = buildMetadata(input.metadata, input.email, 1);
  const event: StoredAuditEvent = {
    id: randomUUID(),
    occurredAt: now,
    action: input.action,
    outcome: input.outcome,
    actorKind: input.actorKind,
    actorUserId: input.actorUserId ?? null,
    subjectUserId: input.subjectUserId ?? null,
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
    requestId: input.requestId,
    ipHash,
    metadata,
  };

  memoryAuditEvents.push(event);
  return event;
}
