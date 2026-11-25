/**
 * Pure normalization and hashing helpers shared inside `modules/identity`
 * without pulling `@/kernel/db` or Better Auth into helper callers.
 */

import { createHash } from "node:crypto";

const AUDIT_PEPPER = process.env.AUDIT_PEPPER || "inkwellio-audit-pepper-default-secret-salt";

export function normalizeRateLimitEmail(email: string): string {
  if (!email) return "";
  return email.trim().toLowerCase().normalize("NFKC");
}

export function hashIp(ip: string): string {
  return createHash("sha256").update(ip + AUDIT_PEPPER).digest("hex");
}
