"use server";

import { rateLimit, requireUser } from "@/lib/auth";
import { contactSchema, type ContactInput } from "@/lib/contact";
import { buildContactEmail } from "@/lib/contactEmail";
import { contactEnabled, logEmailFailure, sendContactEmail } from "@/lib/email";
import type { ActionResult } from "./actions";

export async function sendContactMessage(input: ContactInput): Promise<ActionResult> {
  const { user } = await requireUser();
  if (!contactEnabled()) return { ok: false, error: "Messages can't be sent right now. Please try again later." };
  const parsed = contactSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  // Limits per account: a burst guard and a daily cap.
  if (!(await rateLimit(`contact:h:${user.id}`, 3, 3600)) || !(await rateLimit(`contact:d:${user.id}`, 8, 86_400)))
    return { ok: false, error: "You've sent several messages recently. Please wait a while before sending another." };
  const mail = buildContactEmail(parsed.data, user);
  const sent = await sendContactEmail(mail).then(() => true, logEmailFailure("contact message"));
  return sent ? { ok: true } : { ok: false, error: "Your message couldn't be sent. Please try again in a few minutes." };
}
