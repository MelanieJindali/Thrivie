import { describe, expect, it } from "vitest";
import { CONTACT_TOPICS, contactSchema } from "@/lib/contact";
import { buildContactEmail } from "@/lib/contactEmail";

// Synthetic sender; no real account.
const from = { id: "user_0000000000abcdef12", email: "sam@example.com" };
const ok = { topic: "problem", sub: "numbers", message: "My weekly average looks too high.", allowReply: true, impact: "medium" as const };

describe("contact form validation", () => {
  it("accepts every topic and sub-topic in the list", () => {
    for (const t of CONTACT_TOPICS) for (const s of t.subs) expect(contactSchema.safeParse({ ...ok, topic: t.id, sub: s.id }).success).toBe(true);
  });

  it("refuses topics that aren't in the list", () => {
    expect(contactSchema.safeParse({ ...ok, topic: "billing" }).success).toBe(false);
    expect(contactSchema.safeParse({ ...ok, topic: "help", sub: "numbers" }).success).toBe(false);
  });

  it("needs a real message and caps its length", () => {
    expect(contactSchema.safeParse({ ...ok, message: "  hi  " }).success).toBe(false);
    expect(contactSchema.safeParse({ ...ok, message: "x".repeat(4001) }).success).toBe(false);
  });

  it("flattens the subject to one line so it can't add email headers", () => {
    const v = contactSchema.parse({ ...ok, subject: "Hello\r\nBcc: someone@example.com" });
    expect(v.subject).toBe("Hello Bcc: someone@example.com");
    expect(v.subject).not.toMatch(/[\r\n]/);
  });

  it("refuses an unknown impact level", () => {
    expect(contactSchema.safeParse({ ...ok, impact: "urgent" }).success).toBe(false);
  });
});

describe("contact email", () => {
  it("labels the topic and includes the sender only when they allow a reply", () => {
    const m = buildContactEmail(contactSchema.parse({ ...ok, subject: "Averages" }), from);
    expect(m.subject).toBe("[Thrivie] Report a problem · Wrong numbers or calculations: Averages");
    expect(m.lines).toContain("Impact: Gets in the way");
    expect(m.replyTo).toBe("sam@example.com");
    expect(m.lines.join("\n")).toContain("sam@example.com");

    const anon = buildContactEmail(contactSchema.parse({ ...ok, allowReply: false }), from);
    expect(anon.replyTo).toBeUndefined();
    expect(anon.lines.join("\n")).not.toContain("sam@example.com");
    expect(anon.lines.join("\n")).toContain("abcdef12");
  });

  it("keeps the message's line breaks and adds device details only when given", () => {
    const m = buildContactEmail(contactSchema.parse({ ...ok, topic: "feedback", sub: "request", impact: undefined, message: "Line one\nLine two" }), from);
    expect(m.lines).toEqual(expect.arrayContaining(["Line one", "Line two"]));
    expect(m.lines.some((l) => l.startsWith("Device:"))).toBe(false);
    expect(m.lines.some((l) => l.startsWith("Impact:"))).toBe(false);
  });
});
