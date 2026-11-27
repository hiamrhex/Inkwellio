import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  ProductionEmailTransport,
  setEmailTransport,
  getCapturingTransport,
  sendVerificationEmail,
  sendResetPasswordEmail,
  type OutboundEmail,
} from "../src/modules/identity/email";
import * as logModule from "../src/kernel/log";

describe("Finding B: Email & Capturing Transport", () => {
  beforeEach(() => {
    getCapturingTransport().clear();
    setEmailTransport(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("G1.1: Capturing transport deterministically records outbound emails in test/dev", () => {
    it("captures verification emails with recipient, token, and verification URL", async () => {
      const capturing = getCapturingTransport();
      expect(capturing.getSentEmails()).toHaveLength(0);

      const sampleUrl = "http://localhost:3000/api/auth/verify-email?token=verif-token-12345";
      await sendVerificationEmail({
        user: { id: "user-1", email: "author@inkwellio.test", name: "Author" },
        url: sampleUrl,
        token: "verif-token-12345",
      });

      const sent = capturing.getSentEmails();
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({
        to: "author@inkwellio.test",
        type: "verification",
        token: "verif-token-12345",
        url: sampleUrl,
      });
      expect(sent[0].subject).toContain("Verify");
    });

    it("captures password reset emails with recipient, token, and reset URL", async () => {
      const capturing = getCapturingTransport();
      const sampleUrl = "http://localhost:3000/reset-password?token=reset-token-67890";

      await sendResetPasswordEmail({
        user: { id: "user-2", email: "editor@inkwellio.test", name: "Editor" },
        url: sampleUrl,
        token: "reset-token-67890",
      });

      const last = capturing.getLastSentEmail();
      expect(last).toBeDefined();
      expect(last).toMatchObject({
        to: "editor@inkwellio.test",
        type: "reset_password",
        token: "reset-token-67890",
        url: sampleUrl,
      });
      expect(last?.subject).toContain("Reset");
    });

    it("allows resetting/clearing captured emails between tests", async () => {
      const capturing = getCapturingTransport();
      await sendVerificationEmail({
        user: { id: "user-3", email: "test@inkwellio.test" },
        url: "http://localhost:3000/verify?token=tok",
        token: "tok",
      });
      expect(capturing.getSentEmails()).toHaveLength(1);

      capturing.clear();
      expect(capturing.getSentEmails()).toHaveLength(0);
      expect(capturing.getLastSentEmail()).toBeUndefined();
    });
  });

  describe("G1.2: Raw tokens, reset tokens, and secrets never leak to console or logEvent", () => {
    it("does not leak raw verification token or url-with-token to console or log payload", async () => {
      const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const logEventSpy = vi.spyOn(logModule, "logEvent");

      const canaryToken = "CANARY_SECRET_VERIFICATION_TOKEN_999";
      const sensitiveUrl = `http://localhost:3000/verify?token=${canaryToken}`;

      await sendVerificationEmail({
        user: { id: "user-secure", email: "secure@inkwellio.test" },
        url: sensitiveUrl,
        token: canaryToken,
      });

      // 1. Inspect console calls
      const allConsoleCalls = [
        ...consoleLogSpy.mock.calls,
        ...consoleInfoSpy.mock.calls,
        ...consoleWarnSpy.mock.calls,
        ...consoleErrorSpy.mock.calls,
      ].flat().map(String).join(" ");

      expect(allConsoleCalls).not.toContain(canaryToken);

      // 2. Inspect logEvent calls: must not include url containing the token, nor raw token
      for (const call of logEventSpy.mock.calls) {
        const payloadString = JSON.stringify(call[2] ?? {});
        expect(payloadString).not.toContain(canaryToken);
        expect(payloadString).not.toContain("token=");
      }
    });

    it("does not leak password reset token to console or log payload", async () => {
      const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const logEventSpy = vi.spyOn(logModule, "logEvent");

      const canaryResetToken = "CANARY_SECRET_RESET_TOKEN_888";
      const sensitiveResetUrl = `http://localhost:3000/reset?token=${canaryResetToken}`;

      await sendResetPasswordEmail({
        user: { id: "user-secure-2", email: "secure2@inkwellio.test" },
        url: sensitiveResetUrl,
        token: canaryResetToken,
      });

      const allConsoleCalls = consoleLogSpy.mock.calls.flat().map(String).join(" ");
      expect(allConsoleCalls).not.toContain(canaryResetToken);

      for (const call of logEventSpy.mock.calls) {
        const payloadString = JSON.stringify(call[2] ?? {});
        expect(payloadString).not.toContain(canaryResetToken);
        expect(payloadString).not.toContain("token=");
      }
    });
  });

  describe("G1.3: Missing production email configuration fails closed", () => {
    it("fails closed when instantiated or sending in production without credentials", async () => {
      // Production transport missing credentials
      const prodTransport = new ProductionEmailTransport("", "");
      const sampleEmail: OutboundEmail = {
        to: "recipient@inkwellio.test",
        subject: "Verification",
        text: "Please verify",
        url: "https://inkwellio.test/verify?token=123",
        token: "123",
        type: "verification",
      };

      // The contract is the kernel's: a dependency outage is UNAVAILABLE (503),
      // not a generic Error that would surface as an empty-bodied 500.
      await expect(prodTransport.send(sampleEmail)).rejects.toMatchObject({
        code: "UNAVAILABLE",
        message: "Email delivery is temporarily unavailable",
      });
    });

    it("never falls back to silent drop or console logging in production transport", async () => {
      const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const prodTransport = new ProductionEmailTransport(undefined, undefined);

      const sampleEmail: OutboundEmail = {
        to: "recipient@inkwellio.test",
        subject: "Verification",
        text: "Please verify",
        url: "https://inkwellio.test/verify?token=123",
        token: "123",
        type: "verification",
      };

      let errorThrown = false;
      try {
        await prodTransport.send(sampleEmail);
      } catch (err) {
        errorThrown = true;
        expect((err as { code?: string }).code).toBe("UNAVAILABLE");
        expect((err as Error).message).toBe("Email delivery is temporarily unavailable");
      }

      expect(errorThrown).toBe(true);
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it("delivers sanitized email via Gmail SMTP config and never logs credentials or tokens", async () => {
      const sendMailMock = vi.fn().mockResolvedValue({ messageId: "msg-123" });
      const capturedConfigs: Array<Record<string, unknown>> = [];
      const logEventSpy = vi.spyOn(logModule, "logEvent");

      const prodTransport = new ProductionEmailTransport(
        "sender@gmail.com",
        "super-secret-gmail-app-pw-16",
        (config) => {
          capturedConfigs.push(config as unknown as Record<string, unknown>);
          return { sendMail: sendMailMock };
        },
      );

      await prodTransport.send({
        to: "writer@inkwellio.test",
        subject: "Reset your Inkwellio password",
        text: "Reset link: https://inkwellio.vercel.app/api/auth/reset-password/tok?a=1&b=2",
        url: "https://inkwellio.vercel.app/api/auth/reset-password/tok?a=1&b=2",
        token: "CANARY_SMTP_RESET_TOKEN",
        type: "reset_password",
      });

      expect(capturedConfigs).toHaveLength(1);
      expect(capturedConfigs[0]).toMatchObject({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        connectionTimeout: 5000,
        greetingTimeout: 5000,
        socketTimeout: 10000,
      });

      expect(sendMailMock).toHaveBeenCalledTimes(1);
      const sentArg = sendMailMock.mock.calls[0]?.[0] as {
        from: string;
        to: string;
        subject: string;
        text: string;
        html: string;
      };
      expect(sentArg.from).toContain("sender@gmail.com");
      expect(sentArg.to).toBe("writer@inkwellio.test");
      expect(sentArg.html).toContain("&amp;");

      const allLogged = JSON.stringify(logEventSpy.mock.calls);
      expect(allLogged).not.toContain("super-secret-gmail-app-pw-16");
      expect(allLogged).not.toContain("CANARY_SMTP_RESET_TOKEN");
      expect(allLogged).not.toContain("writer@inkwellio.test");
    });

    it("propagates a safe error on SMTP timeout/failure without leaking credentials", async () => {
      const logEventSpy = vi.spyOn(logModule, "logEvent");
      const prodTransport = new ProductionEmailTransport(
        "sender@gmail.com",
        "super-secret-gmail-app-pw-16",
        () => ({
          sendMail: vi.fn().mockRejectedValue(
            Object.assign(new Error("Connection timeout with super-secret-gmail-app-pw-16"), {
              code: "ETIMEDOUT",
            }),
          ),
        }),
      );

      await expect(
        prodTransport.send({
          to: "writer@inkwellio.test",
          subject: "Verify",
          text: "Verify",
          url: "https://inkwellio.vercel.app/verify?token=SECRET_TOK",
          token: "SECRET_TOK",
          type: "verification",
        }),
      ).rejects.toMatchObject({
        code: "UNAVAILABLE",
        message: /temporarily unavailable/i,
      });

      const allLogged = JSON.stringify(logEventSpy.mock.calls);
      expect(allLogged).not.toContain("super-secret-gmail-app-pw-16");
      expect(allLogged).not.toContain("SECRET_TOK");
      expect(allLogged).not.toContain("writer@inkwellio.test");
    });
  });
});
