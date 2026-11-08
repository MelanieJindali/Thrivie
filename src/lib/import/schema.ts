// AI Notes Import: the JSON contract with the model, the prompt, and parsing.
// Pure module (no DB, no network) so it can be unit-tested.
import { z } from "zod";

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

export const MEAL_KINDS = ["breakfast", "lunch", "dinner", "snack"] as const;

export const MealEntry = z.object({
  kind: z.literal("meal"),
  ...base,
  slot: z.preprocess((v) => {
    const s = typeof v === "string" ? v.toLowerCase() : "";
    return s === "brunch" ? "lunch" : s === "supper" ? "dinner" : (MEAL_KINDS as readonly string[]).includes(s) ? s : "snack";
  }, z.enum(MEAL_KINDS)),
  name: z.string().min(1).max(200),
  calories: optNum,
  protein_g: optNum,
  carbs_g: optNum,
  fat_g: optNum,
});

export const ImportEntry = z.discriminatedUnion("kind", [HealthEntry, WorkoutEntry, MealEntry, HabitEntry, GoalEntry, JournalEntry]);
export type ImportEntry = z.infer<typeof ImportEntry>;

export const ImportEnvelope = z.object({
  entries: z.array(z.unknown()),
  unparsed: z.array(z.string()).optional().default([]),
});

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
