import "server-only";
import { IMPACT, topicLabels, type ContactData } from "./contact";

/** Builds the email for a Contact us message. Pure, so it can be tested without sending anything. */
export function buildContactEmail(v: ContactData, from: { id: string; email: string }) {
  const t = topicLabels(v.topic, v.sub)!;
  const impact = v.impact ? IMPACT.find((i) => i.id === v.impact)?.label : null;
  const subject = `[Thrivie] ${t.topic} · ${t.sub}${v.subject ? `: ${v.subject}` : ""}`.slice(0, 200);
  const lines = [
    `Topic: ${t.topic} › ${t.sub}`,
    ...(impact ? [`Impact: ${impact}`] : []),
    ...(v.subject ? [`Subject: ${v.subject}`] : []),
    "",
    ...v.message.split("\n"),
    "",
    "—",
    v.allowReply ? `From: ${from.email} (reply to this email to answer)` : `From: a Thrivie member who chose not to share their email (account ref ${from.id.slice(-8)})`,
    ...(v.device ? [`Device: ${v.device}`] : []),
  ];
  return { subject, lines, replyTo: v.allowReply ? from.email : undefined };
}

