import "server-only";
import type { ScopedDb } from "./db";
import { addDays, type DateStr } from "./dates";
import { describeWorkout } from "./format";
import { getHealthRange, getWorkoutsRange } from "./queries";
import { kgToDisplay, mlToDisplay, type Units } from "./units";
import type { MealSlot } from "./constants";

// What each logging form needs from the signed-in person's own data. One source for the full
// pages and the quick-log sheet, so the two always offer the same fields, defaults and history.

export type HealthPrefill = {
  weight: number | null; sleepHours: number | null; sleepQuality: number | null; water: number | null;
  mood: number | null; energy: number | null; steps: number | null; custom: Record<string, number>; notes: string | null;
};
type HealthLogs = Awaited<ReturnType<typeof getHealthRange>>;

/** The values already logged for each day (so editing a day never drops what's there), the last weight and custom metric names. */
export function healthFormData(logs: HealthLogs, units: Units) {
  const prefill: Record<string, HealthPrefill> = {};
  const customKeys = new Set<string>();
  for (const l of logs) {
    let custom: Record<string, number> = {};
    try { custom = l.custom ? (JSON.parse(l.custom) as Record<string, number>) : {}; } catch { /* unreadable custom metrics are left out */ }
    Object.keys(custom).forEach((k) => customKeys.add(k));
    prefill[l.date] = {
      weight: l.weightKg != null ? kgToDisplay(l.weightKg, units) : null,
      sleepHours: l.sleepHours, sleepQuality: l.sleepQuality,
      water: l.waterMl != null ? mlToDisplay(l.waterMl, units) : null,
      mood: l.mood, energy: l.energy, steps: l.steps, custom, notes: l.notes,
    };
  }
  const last = [...logs].reverse().find((l) => l.weightKg != null);
  return { prefill, lastWeight: last?.weightKg != null ? kgToDisplay(last.weightKg, units) : null, customKeys: [...customKeys] };
}

/** Exercise names for autocomplete and a one-line summary of the most recent workout. */
export async function workoutFormData(db: ScopedDb, today: DateStr, units: Units) {
  const [recent, names] = await Promise.all([
    getWorkoutsRange(db, today, 120),
    db.exercise.findMany({ distinct: ["name"], select: { name: true }, take: 200 }),
  ]);
  const last = recent.at(-1);
  return { exerciseNames: names.map((n) => n.name), lastSummary: last ? describeWorkout(last, units) : null };
}

export type RecentMeal = { slot: MealSlot; name: string; calories: string; proteinG: string; carbsG: string; fatG: string; times?: number };
const str = (v: number | null) => (v == null ? "" : String(v));

/** Every distinct meal from the past year, most recent first, with how often it was had. The first four are the quick chips. */
export async function mealFormData(db: ScopedDb, today: DateStr) {
  const history = await db.meal.findMany({
    where: { date: { gte: addDays(today, -365) } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    select: { name: true, slot: true, calories: true, proteinG: true, carbsG: true, fatG: true },
    take: 3000,
  });
  const byName = new Map<string, RecentMeal>();
  for (const m of history) {
    const key = m.name.trim().toLowerCase();
    const had = byName.get(key);
    if (had) had.times = (had.times ?? 1) + 1;
    else if (byName.size < 400) byName.set(key, { slot: m.slot as MealSlot, name: m.name, calories: str(m.calories), proteinG: str(m.proteinG), carbsG: str(m.carbsG), fatG: str(m.fatG), times: 1 });
  }
  const allMeals = [...byName.values()];
  return { allMeals, recent: allMeals.slice(0, 4) };
}
