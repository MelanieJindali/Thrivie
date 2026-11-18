import { z } from "zod";

/**
 * Topics for the "Contact us" form in Settings, grouped so messages arrive already sorted.
 * Shared by the form and the server, which only accepts topics from this list.
 */
export const CONTACT_TOPICS = [
  {
    id: "coaching", label: "Personal coaching", hint: "Connect with a coach or talk about your plan",
    subs: [
      { id: "connect", label: "Connect with a coach" },
      { id: "goals", label: "Goal planning" },
      { id: "checkin", label: "Check in with my coach" },
      { id: "plan", label: "Question about my plan" },
    ],
  },
  {
    id: "health", label: "General health", hint: "Questions about wellbeing habits",
    subs: [
      { id: "nutrition", label: "Nutrition and meals" },
      { id: "sleep", label: "Sleep and recovery" },
      { id: "activity", label: "Activity and workouts" },
      { id: "habits", label: "Habits and motivation" },
      { id: "other", label: "Something else" },
    ],
  },
  {
    id: "help", label: "App help", hint: "How something in Thrivie works",
    subs: [
      { id: "feature", label: "How to use a feature" },
      { id: "account", label: "Account and sign-in" },
      { id: "sync", label: "Syncing, offline or Health sync" },
      { id: "data", label: "My data, export or privacy" },
    ],
  },
  {
    id: "problem", label: "Report a problem", hint: "Something isn't working as it should",
    subs: [
      { id: "broken", label: "Something isn't working" },
      { id: "numbers", label: "Wrong numbers or calculations" },
      { id: "display", label: "Display or layout issue" },
      { id: "crash", label: "Crash, freeze or slow" },
      { id: "security", label: "Security or privacy concern" },
    ],
  },
  {
    id: "feedback", label: "Feedback and ideas", hint: "Requests and suggestions",
    subs: [
      { id: "request", label: "New feature request" },
      { id: "improve", label: "Improve something that exists" },
      { id: "design", label: "Design and themes" },
      { id: "general", label: "General feedback" },
    ],
  },
] as const;

export type ContactTopicId = (typeof CONTACT_TOPICS)[number]["id"];

/** Problems get a "how much does it affect you" question; everything else doesn't need one. */
export const IMPACT = [
  { id: "low", label: "Minor annoyance" },
  { id: "medium", label: "Gets in the way" },
  { id: "high", label: "Can't use the app" },
] as const;

export function topicLabels(topic: string, sub: string): { topic: string; sub: string } | null {
  const t = CONTACT_TOPICS.find((x) => x.id === topic);
  const s = t?.subs.find((x) => x.id === sub);
  return t && s ? { topic: t.label, sub: s.label } : null;
}

// One line, no control characters: subjects go into an email header.
const oneLine = (max: number) => z.string().transform((v) => v.replace(/[\u0000-\u001F\u007F]+/g, " ").replace(/\s+/g, " ").trim()).pipe(z.string().max(max, `Keep it under ${max} characters.`));

export const contactSchema = z
  .object({
    topic: z.string(),
    sub: z.string(),
    subject: oneLine(120).optional().default(""),
    message: z.string().transform((v) => v.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "").trim())
      .pipe(z.string().min(10, "Add a few more words so we can help.").max(4000, "Keep the message under 4,000 characters.")),
    impact: z.enum(["low", "medium", "high"]).optional(),
    allowReply: z.boolean(),
    device: oneLine(300).optional(),
  })
  .refine((v) => topicLabels(v.topic, v.sub) !== null, { message: "Choose a topic from the list.", path: ["sub"] });

export type ContactInput = z.input<typeof contactSchema>;
export type ContactData = z.output<typeof contactSchema>;
