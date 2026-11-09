// Turns validated AI entries into review items the UI can edit:
// resolves dates, converts units to metric storage, and matches habits/goals.
// Pure module (no DB) so it can be unit-tested.
import { pickEntryDate, type DateStr } from "../dates";
import { toMetric, type Units } from "../units";
import type { ImportEntry } from "./schema";

export const LOW_CONFIDENCE = 0.7;

export type HealthData = {
  weightKg: number | null;
  sleepHours: number | null;
  sleepQuality: number | null;
  waterMl: number | null;
  mood: number | null;
  energy: number | null;
  steps: number | null;
  custom: Record<string, number>;
};
export type WorkoutData = {
  type: "strength" | "cardio" | "mobility" | "sport" | "other";
  title: string | null;
  durationMin: number;
  intensity: number;
  distanceKm: number | null;
  paceMinKm: number | null;
  exercises: { name: string; sets: number | null; reps: number | null; weightKg: number | null }[];
};
export type MealData = { slot: "breakfast" | "lunch" | "dinner" | "snack"; name: string; calories: number | null; proteinG: number | null; carbsG: number | null; fatG: number | null };
export type HabitData = { habitName: string; habitId: string | null; createNew: boolean; frequency: "daily" | "weekly" };
export type GoalData = { goalName: string; goalId: string | null; value: number; note: string | null };
export type JournalData = { content: string; mood: number | null };

type Common = {
  key: string;
  date: DateStr;
  dateText: string | null;
  dateResolvedBy: "text" | "model" | "default";
  confidence: number;
  lowFields: string[];
  sourceText: string | null;
  /** Same-day values that disagreed and were not kept ("weight 168 lb vs 172 lb"). */
  conflicts?: { field: string; kept: number; other: number }[];
};

export type ReviewItem =
  | (Common & { kind: "health"; data: HealthData })
  | (Common & { kind: "workout"; data: WorkoutData })
  | (Common & { kind: "meal"; data: MealData })
  | (Common & { kind: "habit"; data: HabitData })
  | (Common & { kind: "goal_update"; data: GoalData })
  | (Common & { kind: "journal"; data: JournalData });

export type MatchCandidate = { id: string; name: string };

// ---------------------------------------------------------------------------
// Name matching
// ---------------------------------------------------------------------------

const STOP = new Set(["the", "a", "an", "my", "to", "of", "for", "and", "min", "mins", "minutes", "daily", "every", "day"]);

export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Very small stemmer so "meditated" ≈ "meditate", "journaling" ≈ "journal". */
function stem(w: string): string {
  let s = w;
  if (s.length > 5 && /(ing|ed)$/.test(s)) s = s.replace(/(ing|ed)$/, "");
  else if (s.length > 3 && /[^s]s$/.test(s)) s = s.slice(0, -1);
  if (s.length > 4 && s.endsWith("e")) s = s.slice(0, -1);
  return s;
}

function tokens(s: string): string[] {
  return normalizeName(s)
    .split(" ")
    .filter((t) => t && !STOP.has(t) && !/^\d+$/.test(t))
    .map(stem);
}

/**
 * Find the best existing habit/goal for a mentioned name. Exact (normalized)
 * matches win; otherwise token overlap must cover most of the shorter name.
 */
export function matchByName(mention: string, candidates: MatchCandidate[], hint?: string | null): string | null {
  if (!candidates.length) return null;
  const tryExact = (s: string | null | undefined) => {
    if (!s) return null;
    const n = normalizeName(s);
    return candidates.find((c) => normalizeName(c.name) === n)?.id ?? null;
  };
  const exact = tryExact(hint) ?? tryExact(mention);
  if (exact) return exact;

  const m = new Set(tokens(mention));
  if (!m.size) return null;
  let best: { id: string; score: number } | null = null;
  for (const c of candidates) {
    const ct = new Set(tokens(c.name));
    if (!ct.size) continue;
    let overlap = 0;
    for (const t of m) if (ct.has(t)) overlap++;
    const score = overlap / Math.min(m.size, ct.size);
    if (overlap > 0 && score >= 0.6 && (!best || score > best.score)) best = { id: c.id, score };
  }
  return best?.id ?? null;
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

const round = (n: number, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;

function weightKg(q: { value: number; unit: string | null } | null, units: Units): number | null {
  if (!q) return null;
  const unit = q.unit ?? (units === "imperial" ? "lb" : "kg");
  const r = toMetric(q.value, unit);
  return r.kind === "weight" || r.kind === "unknown" ? round(r.value, 2) : null;
}

function distanceKm(q: { value: number; unit: string | null } | null, units: Units): number | null {
  if (!q) return null;
  const unit = q.unit ?? (units === "imperial" ? "mi" : "km");
  const r = toMetric(q.value, unit);
  return r.kind === "distance" || r.kind === "unknown" ? round(r.value, 2) : null;
}

function waterMl(q: { value: number; unit: string | null } | null, units: Units): number | null {
  if (!q) return null;
  const unit = q.unit ?? (units === "imperial" ? "oz" : "ml");
  const r = toMetric(q.value, unit);
  return r.kind === "water" || r.kind === "unknown" ? Math.round(r.value) : null;
}

const clampRating = (n: number | null) => (n == null ? null : Math.min(5, Math.max(1, Math.round(n))));

export type NormalizeContext = {
  today: DateStr;
  units: Units;
  habits: MatchCandidate[];
  goals: MatchCandidate[];
};

export function normalizeEntries(entries: ImportEntry[], ctx: NormalizeContext): ReviewItem[] {
  const items: ReviewItem[] = [];
  const healthByDate = new Map<string, ReviewItem & { kind: "health" }>();
  // Keys come from the content, so they stay the same when other parts of the note change.
  const seen = new Map<string, number>();
  const keyFor = (kind: string, date: string, src: string | null) => {
    const base = `${kind}|${date}|${(src ?? "").slice(0, 80)}`;
    const k = seen.get(base) ?? 0;
    seen.set(base, k + 1);
    return `${base}|${k}`;
  };

  for (const e of entries) {
    const { date, resolvedBy } = pickEntryDate(e.date_text, e.date, ctx.today);
    const lowFields = Object.entries(e.field_confidence ?? {})
      .filter(([, c]) => c < LOW_CONFIDENCE)
      .map(([f]) => f);
    if (resolvedBy === "default" && e.date_text) lowFields.push("date");
    const common: Common = {
      key: keyFor(e.kind, date, e.source_text),
      date,
      dateText: e.date_text,
      dateResolvedBy: resolvedBy,
      confidence: e.confidence,
      lowFields,
      sourceText: e.source_text,
    };

    switch (e.kind) {
      case "health": {
        const data: HealthData = {
          weightKg: weightKg(e.weight, ctx.units),
          // Out-of-range sleep is kept so verification can offer "did you mean minutes?"
          sleepHours: e.sleep_hours != null && e.sleep_hours >= 0 && e.sleep_hours <= 1440 ? e.sleep_hours : null,
          sleepQuality: e.sleep_quality,
          waterMl: waterMl(e.water, ctx.units),
          mood: e.mood,
          energy: e.energy,
          steps: e.steps != null && e.steps >= 0 ? Math.round(e.steps) : null,
          custom: Object.fromEntries(e.custom.map((c) => [c.name, c.value])),
        };
        // Merge multiple health entries for the same date into one.
        const prev = healthByDate.get(date);
        if (prev) {
          for (const [k, v] of Object.entries(data) as [keyof HealthData, unknown][]) {
            if (k === "custom") prev.data.custom = { ...prev.data.custom, ...data.custom };
            else if (v != null && prev.data[k] == null) (prev.data as Record<string, unknown>)[k] = v;
            else if (typeof v === "number" && typeof prev.data[k] === "number" && Math.abs((prev.data[k] as number) - v) > 1e-6) {
              (prev.conflicts ??= []).push({ field: k, kept: prev.data[k] as number, other: v });
            }
          }
          prev.confidence = Math.min(prev.confidence, e.confidence);
          prev.lowFields = [...new Set([...prev.lowFields, ...lowFields])];
          break;
        }
        const item = { ...common, kind: "health" as const, data };
        healthByDate.set(date, item);
        items.push(item);
        break;
      }
      case "workout": {
        const dist = distanceKm(e.distance, ctx.units);
        const distUnit = (e.distance?.unit ?? (ctx.units === "imperial" ? "mi" : "km")).toLowerCase();
        const perMile = ["mi", "mile", "miles"].includes(distUnit);
        let pace = e.pace_min_per_unit != null ? (perMile ? e.pace_min_per_unit / 1.609344 : e.pace_min_per_unit) : null;
        let duration = e.duration_min;
        if (duration == null && dist && pace) duration = Math.round(dist * pace);
        if (pace == null && dist && duration) pace = round(duration / dist, 2);
        if (duration == null) {
          // We need a duration to save a workout; default it and flag it for review.
          duration = 30;
          lowFields.push("duration");
        }
        items.push({
          ...common,
          kind: "workout",
          data: {
            type: e.type,
            title: e.title,
            durationMin: Math.max(1, Math.round(duration)),
            intensity: e.intensity ?? 3,
            distanceKm: dist,
            paceMinKm: pace != null ? round(pace, 2) : null,
            exercises: e.exercises.map((x) => ({
              name: x.name,
              sets: x.sets != null ? Math.round(x.sets) : null,
              reps: x.reps != null ? Math.round(x.reps) : null,
              weightKg: weightKg(x.weight, ctx.units),
            })),
          },
        });
        break;
      }
      case "meal": {
        const g = (v: number | null) => (v != null && v >= 0 && v <= 2000 ? round(v, 1) : null);
        const calories = e.calories != null && e.calories >= 0 && e.calories <= 10000 ? Math.round(e.calories) : null;
        items.push({ ...common, kind: "meal", data: { slot: e.slot, name: e.name.slice(0, 200), calories, proteinG: g(e.protein_g), carbsG: g(e.carbs_g), fatG: g(e.fat_g) } });
        break;
      }
      case "habit": {
        if (!e.completed) break; // explicitly missed – nothing to record
        const habitId = matchByName(e.habit_name, ctx.habits, e.matched_habit);
        items.push({
          ...common,
          kind: "habit",
          data: { habitName: e.habit_name, habitId, createNew: false, frequency: "daily" },
        });
        break;
      }
      case "goal_update": {
        if (e.value == null) break;
        const goalId = matchByName(e.goal_name, ctx.goals, e.matched_goal);
        items.push({ ...common, kind: "goal_update", data: { goalName: e.goal_name, goalId, value: e.value, note: e.note } });
        break;
      }
      case "journal": {
        items.push({ ...common, kind: "journal", data: { content: e.content, mood: clampRating(e.mood) } });
        break;
      }
    }
  }

  // Drop empty health entries (nothing actually extracted).
  return items
    .filter((i) => i.kind !== "health" || Object.entries(i.data).some(([k, v]) => (k === "custom" ? Object.keys(v as object).length : v != null)))
    .sort((a, b) => (a.date === b.date ? KIND_ORDER[a.kind] - KIND_ORDER[b.kind] : a.date < b.date ? -1 : 1));
}

const KIND_ORDER: Record<ReviewItem["kind"], number> = { health: 0, workout: 1, meal: 2, habit: 3, goal_update: 4, journal: 5 };
