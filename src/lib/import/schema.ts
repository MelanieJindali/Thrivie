// AI Notes Import: the JSON contract with the model, the prompt, and parsing.
// Pure module (no DB, no network) so it can be unit-tested.
import { z } from "zod";
import { formatDate, type DateStr } from "../dates";

// ---------------------------------------------------------------------------
// Lenient field helpers: models sometimes send "172" instead of 172, or omit
// fields entirely. We coerce what is unambiguous and null out the rest.
// ---------------------------------------------------------------------------

const num = z.preprocess((v) => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "string") {
    const n = Number(v.replace(/,/g, "").trim());
    return Number.isFinite(n) ? n : null;
  }
  return v;
}, z.number().finite().nullable());

const optNum = num.optional().transform((v) => v ?? null);

const rating = z.preprocess((v) => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? Math.min(5, Math.max(1, Math.round(n))) : null;
}, z.number().int().min(1).max(5).nullable()).optional().transform((v) => v ?? null);

const confidence = z.preprocess((v) => {
  const raw = typeof v === "string" ? Number(v) : v;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 0.5;
  const n = raw > 1 && raw <= 100 ? raw / 100 : raw; // "85" → 0.85
  return Math.min(1, Math.max(0, n));
}, z.number().min(0).max(1));

const optStr = z.string().nullable().optional().transform((v) => (v && v.trim() ? v.trim() : null));

const quantity = z
  .object({ value: num, unit: optStr })
  .nullable()
  .optional()
  .transform((v) => (v && v.value != null ? { value: v.value, unit: v.unit } : null));

const base = {
  date_text: optStr, // the raw date reference as written ("Mon", "yesterday")
  date: optStr, // the model's own YYYY-MM-DD resolution
  confidence,
  field_confidence: z.record(z.string(), confidence).optional().default({}),
  source_text: optStr, // the snippet this entry came from
};

export const HealthEntry = z.object({
  kind: z.literal("health"),
  ...base,
  weight: quantity,
  sleep_hours: optNum,
  sleep_quality: rating,
  water: quantity,
  mood: rating,
  energy: rating,
  steps: optNum,
  custom: z
    .array(z.object({ name: z.string().min(1), value: num }))
    .optional()
    .default([])
    .transform((xs) => xs.filter((x) => x.value != null) as { name: string; value: number }[]),
});

export const WORKOUT_KINDS = ["strength", "cardio", "mobility", "sport", "other"] as const;

export const WorkoutEntry = z.object({
  kind: z.literal("workout"),
  ...base,
  type: z.preprocess((v) => (typeof v === "string" && (WORKOUT_KINDS as readonly string[]).includes(v.toLowerCase()) ? v.toLowerCase() : "other"), z.enum(WORKOUT_KINDS)),
  title: optStr,
  duration_min: optNum,
  intensity: rating,
  distance: quantity,
  pace_min_per_unit: optNum,
  exercises: z
    .array(z.object({ name: z.string().min(1), sets: optNum, reps: optNum, weight: quantity }))
    .optional()
    .default([]),
});

export const HabitEntry = z.object({
  kind: z.literal("habit"),
  ...base,
  habit_name: z.string().min(1),
  matched_habit: optStr, // exact name of an existing habit, or null
  completed: z.boolean().optional().default(true),
});

export const GoalEntry = z.object({
  kind: z.literal("goal_update"),
  ...base,
  goal_name: z.string().min(1),
  matched_goal: optStr,
  value: num,
  unit: optStr,
  note: optStr,
});

export const JournalEntry = z.object({
  kind: z.literal("journal"),
  ...base,
  content: z.string().min(1),
  mood: rating,
});

export const ImportEntry = z.discriminatedUnion("kind", [HealthEntry, WorkoutEntry, HabitEntry, GoalEntry, JournalEntry]);
export type ImportEntry = z.infer<typeof ImportEntry>;

export const ImportEnvelope = z.object({
  entries: z.array(z.unknown()),
  unparsed: z.array(z.string()).optional().default([]),
});

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

export const IMPORT_SYSTEM_PROMPT = `You convert messy personal wellness notes into structured JSON for a tracking app.

Return ONLY a single JSON object. No prose, no markdown, no code fences.

Schema:
{
  "entries": [Entry, ...],
  "unparsed": [string, ...]   // short snippets you could not interpret (may be empty)
}

Every Entry has these common fields:
  "kind": "health" | "workout" | "habit" | "goal_update" | "journal"
  "date_text": string | null    // the date reference exactly as written ("Mon", "yesterday", "11/3"); null if none applies
  "date": "YYYY-MM-DD"          // your resolution of that date (see rules)
  "confidence": number 0-1      // how sure you are about this entry overall
  "field_confidence": { "<field>": number 0-1 }  // only for fields you are unsure about
  "source_text": string         // the short snippet this entry came from

kind "health" (at most one per date; merge all health facts for a day):
  "weight": {"value": number, "unit": "kg"|"lb"} | null
  "sleep_hours": number | null
  "sleep_quality": 1-5 | null   // infer from words: "terrible"=1, "poor/tired"=2, "ok"=3, "good"=4, "great"=5
  "water": {"value": number, "unit": "ml"|"l"|"oz"|"glasses"} | null
  "mood": 1-5 | null
  "energy": 1-5 | null          // "tired"/"exhausted" → 2 or 1; "energized" → 4-5
  "steps": number | null
  "custom": [{"name": string, "value": number}]  // other numeric metrics, e.g. resting heart rate

kind "workout":
  "type": "strength" | "cardio" | "mobility" | "sport" | "other"
  "title": string | null        // e.g. "Run", "Push-ups", "Yoga"
  "duration_min": number | null
  "intensity": 1-5 | null
  "distance": {"value": number, "unit": "km"|"mi"|"m"} | null   // "5k" means 5 km
  "pace_min_per_unit": number | null
  "exercises": [{"name": string, "sets": number|null, "reps": number|null, "weight": {"value": number, "unit": "kg"|"lb"}|null}]
  Group bodyweight/strength exercises from the same day into ONE strength workout. A "rest day" is not a workout.

kind "habit" (a habit was done):
  "habit_name": string          // as the user described it ("meditated" → "Meditate")
  "matched_habit": string|null  // EXACT name from EXISTING HABITS if it clearly refers to one, else null
  "completed": boolean          // false only if the note says it was explicitly missed
  A ✅ or "done" next to an item usually means a habit was completed.

kind "goal_update" (explicit progress toward a goal, e.g. "read 50 pages of my book" when a reading goal exists):
  "goal_name": string
  "matched_goal": string|null   // EXACT title from EXISTING GOALS, else null
  "value": number               // the amount of progress, in the goal's unit
  "unit": string|null
  "note": string|null
  Do NOT create goal updates for things already captured as workouts or habits (those update linked goals automatically).

kind "journal" (reflections, feelings, events worth remembering):
  "content": string             // a faithful, lightly cleaned first-person version of what they wrote; do not invent details
  "mood": 1-5 | null

Date rules:
- Use TODAY and the weekday given below. Notes describe the past: a bare weekday ("Mon") means the most recent such day on or before today.
- "yesterday" = today minus 1 day. Text with no date applies to the most recent date mentioned before it, or today if none.
- Never output a date after today.

Other rules:
- Only extract what is actually written. Never guess numbers that aren't there.
- Lower the confidence for abbreviations or ambiguous values, and list those fields in field_confidence.
- Keep units as written; the app converts them.
- If the text contains nothing trackable, return {"entries": [], "unparsed": [...]}.`;

export function buildImportUserMessage(opts: {
  text: string;
  today: DateStr;
  timezone: string;
  habits: string[];
  goals: { title: string; unit: string }[];
}): string {
  return [
    `TODAY: ${opts.today} (${formatDate(opts.today, { weekday: "long" })}), timezone ${opts.timezone}`,
    `EXISTING HABITS: ${opts.habits.length ? JSON.stringify(opts.habits) : "none"}`,
    `EXISTING GOALS: ${opts.goals.length ? JSON.stringify(opts.goals) : "none"}`,
    "",
    "NOTES:",
    "<<<",
    opts.text.trim(),
    ">>>",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export type ParseResult =
  | { ok: true; entries: ImportEntry[]; unparsed: string[]; dropped: number }
  | { ok: false; error: string; detail?: string };

/** Pull the JSON object out of a model response (tolerates code fences and stray prose). */
export function extractJson(text: string): string | null {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const obj = t.indexOf("{");
  const arr = t.indexOf("[");
  // A bare top-level array is accepted too.
  const isArray = arr !== -1 && (obj === -1 || arr < obj);
  const start = isArray ? arr : obj;
  const end = t.lastIndexOf(isArray ? "]" : "}");
  if (start === -1 || end <= start) return null;
  return t.slice(start, end + 1);
}

export function parseImportResponse(text: string): ParseResult {
  const raw = extractJson(text);
  if (!raw) return { ok: false, error: "The AI response didn't contain any JSON.", detail: text.slice(0, 300) };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    return { ok: false, error: "The AI response wasn't valid JSON.", detail: (e as Error).message };
  }
  // Accept a bare array of entries too.
  if (Array.isArray(json)) json = { entries: json };
  const env = ImportEnvelope.safeParse(json);
  if (!env.success) return { ok: false, error: "The AI response didn't match the expected format.", detail: env.error.issues[0]?.message };

  const entries: ImportEntry[] = [];
  let dropped = 0;
  for (const e of env.data.entries) {
    const r = ImportEntry.safeParse(e);
    if (r.success) entries.push(r.data);
    else dropped++;
  }
  if (!entries.length && dropped > 0) {
    return { ok: false, error: "None of the entries in the AI response were valid.", detail: `${dropped} invalid entr${dropped === 1 ? "y" : "ies"}` };
  }
  return { ok: true, entries, unparsed: env.data.unparsed, dropped };
}
