/**
 * Identity: Outbound email transport abstraction.
 *
 * Implements capturing transport for testing/development to deterministically
 * record emails without sending real network traffic.
 *
 * In production, uses Gmail SMTP over SMTPS (port 465) via server-only
 * `nodemailer` with bounded connection/socket timeouts, failing closed if
 * `GMAIL_USER` or `GMAIL_APP_PASSWORD` is missing. Prevents secret/token/email
 * leakage by never logging raw tokens, URLs with tokens, passwords, or PII.
 */

import nodemailer from "nodemailer";
import { env } from "@/kernel/env";
import { logEvent } from "@/kernel/log";

export interface OutboundEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
  url: string;
  token: string;
  type: "verification" | "reset_password" | "erasure_confirmation";
}

export interface EmailTransport {
  send(email: OutboundEmail): Promise<void>;
}

export interface SmtpTransportConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: { user: string; pass: string };
  connectionTimeout: number;
  greetingTimeout: number;
  socketTimeout: number;
}

export interface SmtpTransporter {
  sendMail(mail: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html: string;
  }): Promise<unknown>;
}

export type SmtpTransporterFactory = (config: SmtpTransportConfig) => SmtpTransporter;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildSafeHtml(email: OutboundEmail): string {
  if (email.html) {
    return email.html;
  }
  const safeSubject = escapeHtml(email.subject);
  const safeText = escapeHtml(email.text);
  const hasHttpUrl =
    email.url.startsWith("https://") || email.url.startsWith("http://");
  if (!hasHttpUrl) {
    return `<p><strong>${safeSubject}</strong></p><p>${safeText}</p>`;
  }
  const safeUrl = escapeHtml(email.url);
  return `<p><strong>${safeSubject}</strong></p><p>${safeText}</p><p><a href="${safeUrl}">Continue</a></p>`;
}

/**
 * In-memory capturing transport for tests and local development.
 */
export class CapturingTransport implements EmailTransport {
  private sent: OutboundEmail[] = [];

  async send(email: OutboundEmail): Promise<void> {
    this.sent.push({
      ...email,
      html: email.html ?? buildSafeHtml(email),
    });
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
 * Production email transport backed by Gmail SMTP (`smtp.gmail.com:465`, TLS)
 * with strict connection/greeting/socket timeouts and fail-closed config checks.
 */
export class ProductionEmailTransport implements EmailTransport {
  private transporter: SmtpTransporter | null = null;

  constructor(
    private readonly user?: string,
    private readonly appPassword?: string,
    private readonly transporterFactory: SmtpTransporterFactory = (config) =>
      nodemailer.createTransport(config),
  ) {}

  private getTransporter(): SmtpTransporter {
    if (!this.user || !this.appPassword) {
      throw new Error(
        "Missing production email configuration: GMAIL_USER and GMAIL_APP_PASSWORD are required in production",
      );
    }
    this.transporter ??= this.transporterFactory({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: this.user,
        pass: this.appPassword,
      },
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 10000,
    });
    return this.transporter;
  }

  async send(email: OutboundEmail): Promise<void> {
    const transporter = this.getTransporter();
    const html = buildSafeHtml(email);

    try {
      await transporter.sendMail({
        from: `Inkwellio <${this.user}>`,
        to: email.to,
        subject: email.subject,
        text: email.text,
        html,
      });
    } catch (err) {
      const code =
        typeof err === "object" && err !== null && "code" in err
          ? String((err as { code?: unknown }).code ?? "SMTP_ERROR")
          : "SMTP_ERROR";
      // Safe metadata only: NEVER log SMTP errors/messages/credentials/recipients/tokens
      logEvent("error", "production_email_failed", {
        type: email.type,
        code,
      });
      throw new Error("Email delivery failed");
    }

    logEvent("info", "production_email_dispatched", {
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
  const payload: OutboundEmail = {
    to: user.email,
    subject: "Verify your Inkwellio account",
    text: `Please verify your email address by following this link: ${url}`,
    url,
    token,
    type: "verification",
  };
  await transport.send({ ...payload, html: buildSafeHtml(payload) });

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
  const payload: OutboundEmail = {
    to: user.email,
    subject: "Reset your Inkwellio password",
    text: `Reset your password by following this link: ${url}`,
    url,
    token,
    type: "reset_password",
  };
  await transport.send({ ...payload, html: buildSafeHtml(payload) });

  // Safe metadata only: NEVER log raw token or url with token
  logEvent("info", "reset_password_email_sent", {
    userId: user.id,
    type: "reset_password",
  });
}

/**
 * Send a single-use account erasure confirmation token.
 * Safe against token and email leakage in application logs.
 */
export async function sendErasureConfirmationEmail({
  user,
  token,
}: {
  user: { id: string; email: string; name?: string };
  token: string;
}): Promise<void> {
  const transport = getEmailTransport();
  const payload: OutboundEmail = {
    to: user.email,
    subject: "Confirm deletion of your Inkwellio account",
    text: `Use this single-use confirmation token within 15 minutes to permanently delete your account: ${token}`,
    url: "",
    token,
    type: "erasure_confirmation",
  };
  await transport.send({ ...payload, html: buildSafeHtml(payload) });

  // Safe metadata only: NEVER log raw token or email address
  logEvent("info", "account_erasure_email_sent", {
    userId: user.id,
    type: "erasure_confirmation",
  });
}
