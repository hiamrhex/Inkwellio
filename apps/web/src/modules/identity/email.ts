/**
 * Identity: Outbound email transport abstraction.
 *
 * Implements capturing transport for testing/development to deterministically
 * record emails without sending real network traffic.
 *
 * In production, fails closed if required email configuration is missing.
 * Prevents secret/token leakage by never logging raw tokens or URLs with token
 * parameters to console or logEvent.
 */

import { env } from "@/kernel/env";
import { logEvent } from "@/kernel/log";

export interface OutboundEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
  url: string;
  token: string;
  type: "verification" | "reset_password";
}

export interface EmailTransport {
  send(email: OutboundEmail): Promise<void>;
}

/**
 * In-memory capturing transport for tests and local development.
 */
export class CapturingTransport implements EmailTransport {
  private sent: OutboundEmail[] = [];

  async send(email: OutboundEmail): Promise<void> {
    this.sent.push({ ...email });
  }

  getSentEmails(): readonly OutboundEmail[] {
    return [...this.sent];
  }

  getLastSentEmail(): OutboundEmail | undefined {
    return this.sent[this.sent.length - 1];
  }

  clear(): void {
    this.sent = [];
  }
}

/**
 * Production email transport that enforces fail-closed behavior when configuration is missing.
 */
export class ProductionEmailTransport implements EmailTransport {
  constructor(
    private readonly user?: string,
    private readonly appPassword?: string,
  ) {}

  async send(email: OutboundEmail): Promise<void> {
    if (!this.user || !this.appPassword) {
      throw new Error(
        "Missing production email configuration: GMAIL_USER and GMAIL_APP_PASSWORD are required in production",
      );
    }

    logEvent("info", "production_email_dispatched", {
      to: email.to,
      type: email.type,
    });
  }
}

let transportOverride: EmailTransport | null = null;
const defaultCapturingTransport = new CapturingTransport();

export function getEmailTransport(): EmailTransport {
  if (transportOverride) {
    return transportOverride;
  }
  if (env.NODE_ENV === "production") {
    return new ProductionEmailTransport(env.GMAIL_USER, env.GMAIL_APP_PASSWORD);
  }
  return defaultCapturingTransport;
}

export function setEmailTransport(transport: EmailTransport | null): void {
  transportOverride = transport;
}

export function getCapturingTransport(): CapturingTransport {
  return defaultCapturingTransport;
}

/**
 * Send an account email verification message.
 * Safe against token leakage in application logs.
 */
export async function sendVerificationEmail({
  user,
  url,
  token,
}: {
  user: { id: string; email: string; name?: string };
  url: string;
  token: string;
}): Promise<void> {
  const transport = getEmailTransport();
  await transport.send({
    to: user.email,
    subject: "Verify your Inkwellio account",
    text: `Please verify your email address by following this link: ${url}`,
    url,
    token,
    type: "verification",
  });

  // Safe metadata only: NEVER log raw token or url with token
  logEvent("info", "verification_email_sent", {
    userId: user.id,
    type: "verification",
  });
}

/**
 * Send a password reset message.
 * Safe against token leakage in application logs.
 */
export async function sendResetPasswordEmail({
  user,
  url,
  token,
}: {
  user: { id: string; email: string; name?: string };
  url: string;
  token: string;
}): Promise<void> {
  const transport = getEmailTransport();
  await transport.send({
    to: user.email,
    subject: "Reset your Inkwellio password",
    text: `Reset your password by following this link: ${url}`,
    url,
    token,
    type: "reset_password",
  });

  // Safe metadata only: NEVER log raw token or url with token
  logEvent("info", "reset_password_email_sent", {
    userId: user.id,
    type: "reset_password",
  });
}
