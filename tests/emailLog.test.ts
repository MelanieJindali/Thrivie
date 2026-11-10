import { afterEach, describe, expect, it, vi } from "vitest";
import { logEmailFailure, sendPasswordResetEmail } from "@/lib/email";

describe("email failure logging", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("logs Resend's reason without any email address", async () => {
    process.env.RESEND_API_KEY = "test-key-not-real";
    process.env.EMAIL_FROM = "Thrivie <noreply@example.com>";
    process.env.APP_URL = "https://example.com";
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({
      name: "validation_error",
      message: "You can only send testing emails to your own email address (owner@example.org). To send emails to other recipients, please verify a domain.",
    }), { status: 403 }));
    const logs: string[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((m: string) => { logs.push(m); });
    await sendPasswordResetEmail("someone@example.net", "a".repeat(43)).catch(logEmailFailure("reset link"));
    spy.mockRestore();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("HTTP 403 validation_error");
    expect(logs[0]).toContain("verify a domain");
    expect(logs[0]).not.toMatch(/@/);
    expect(logs[0]).not.toContain("someone");
    expect(logs[0]).not.toContain("a".repeat(43)); // never the token
  });
});
