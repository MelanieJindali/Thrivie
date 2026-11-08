// Health sync payload (Apple Shortcuts, Android automations, scripts).
// Pure module: validation + conversion to metric, so it can be unit-tested.
import { z } from "zod";
import { isDateStr, type DateStr } from "./dates";
import { toMetric, type Units } from "./units";

const num = z.preprocess((v) => {
  if (v === null || v === undefined || v === "") return undefined;
  const n = typeof v === "string" ? Number(v.replace(/,/g, "").trim()) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}, z.number().nonnegative().optional());

const rating = z.preprocess((v) => (v == null || v === "" ? undefined : Math.min(5, Math.max(1, Math.round(Number(v))))), z.number().int().min(1).max(5).optional());

export const IngestSchema = z.object({
  date: z.string().optional(), // YYYY-MM-DD or ISO datetime; defaults to today
  steps: num,
  sleepHours: num,
  sleepMinutes: num,
  weight: num,
  weightUnit: z.string().optional(),
  water: num,
  waterUnit: z.string().optional(),
  mood: rating,
  energy: rating,
  restingHeartRate: num,
  custom: z.record(z.string().max(40), num).optional(),
  workouts: z
    .array(
      z.object({
        type: z.string().optional(),
        title: z.string().max(100).optional(),
        durationMin: num,
        distance: num,
        distanceUnit: z.string().optional(),
      }),
    )
    .max(20)
    .optional(),
});
export type IngestInput = z.infer<typeof IngestSchema>;

const TYPES = ["strength", "cardio", "mobility", "sport", "other"];
const TYPE_ALIASES: Record<string, string> = {
  running: "cardio", run: "cardio", walking: "cardio", walk: "cardio", cycling: "cardio", swimming: "cardio", hiking: "cardio", elliptical: "cardio", rowing: "cardio",
  "traditional strength training": "strength", "functional strength training": "strength", weights: "strength",
  yoga: "mobility", pilates: "mobility", stretching: "mobility", flexibility: "mobility",
  tennis: "sport", soccer: "sport", basketball: "sport", golf: "sport",
};

export function normalizeIngest(input: IngestInput, today: DateStr, units: Units) {
  const rawDate = (input.date ?? "").slice(0, 10);
  const date = isDateStr(rawDate) ? rawDate : today;
  const sleep = input.sleepHours ?? (input.sleepMinutes != null ? input.sleepMinutes / 60 : undefined);
  const weightKg = input.weight != null ? toMetric(input.weight, input.weightUnit ?? (units === "imperial" ? "lb" : "kg")).value : undefined;
  const waterMl = input.water != null ? toMetric(input.water, input.waterUnit ?? (units === "imperial" ? "oz" : "ml")).value : undefined;
  const custom: Record<string, number> = {};
  if (input.restingHeartRate != null) custom["Resting HR"] = Math.round(input.restingHeartRate);
  for (const [k, v] of Object.entries(input.custom ?? {})) if (v != null) custom[k] = v;

  const health: Record<string, number> = {};
  if (input.steps != null) health.steps = Math.round(input.steps);
  if (sleep != null && sleep <= 24) health.sleepHours = Math.round(sleep * 10) / 10;
  if (weightKg != null && weightKg > 0) health.weightKg = Math.round(weightKg * 100) / 100;
  if (waterMl != null) health.waterMl = Math.round(waterMl);
  if (input.mood != null) health.mood = input.mood;
  if (input.energy != null) health.energy = input.energy;

  const workouts = (input.workouts ?? [])
    .filter((w) => w.durationMin && w.durationMin > 0)
    .map((w) => {
      const t = (w.type ?? "other").toLowerCase().trim();
      const type = TYPES.includes(t) ? t : TYPE_ALIASES[t] ?? "other";
      const distanceKm = w.distance ? toMetric(w.distance, w.distanceUnit ?? (units === "imperial" ? "mi" : "km")).value : null;
      const durationMin = Math.round(w.durationMin!);
      return {
        type,
        title: w.title?.trim() || (w.type ? w.type.replace(/^\w/, (c) => c.toUpperCase()) : null),
        durationMin,
        distanceKm: distanceKm ? Math.round(distanceKm * 100) / 100 : null,
        paceMinKm: distanceKm ? Math.round((durationMin / distanceKm) * 100) / 100 : null,
      };
    });
  return { date, health, custom, workouts };
}
