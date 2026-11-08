// Pure helpers for meal totals (unit-tested).
type MealLike = { date: string; calories: number | null; proteinG: number | null; carbsG: number | null; fatG: number | null };
export type DayTotals = { meals: number; calories: number | null; proteinG: number | null; carbsG: number | null; fatG: number | null };

const add = (a: number | null, b: number | null) => (b == null ? a : (a ?? 0) + b);
const r1 = (v: number | null) => (v == null ? null : Math.round(v * 10) / 10);

/** Totals for one day. A total stays null when no meal recorded that number, so "not tracked" never reads as 0. */
export function dayTotals(meals: MealLike[]): DayTotals {
  let calories: number | null = null, proteinG: number | null = null, carbsG: number | null = null, fatG: number | null = null;
  for (const m of meals) {
    calories = add(calories, m.calories);
    proteinG = add(proteinG, m.proteinG);
    carbsG = add(carbsG, m.carbsG);
    fatG = add(fatG, m.fatG);
  }
  return { meals: meals.length, calories: calories == null ? null : Math.round(calories), proteinG: r1(proteinG), carbsG: r1(carbsG), fatG: r1(fatG) };
}

/** Group meals by date, newest day first. */
export function groupByDay<T extends MealLike>(meals: T[]): { date: string; meals: T[]; totals: DayTotals }[] {
  const map = new Map<string, T[]>();
  for (const m of meals) map.set(m.date, [...(map.get(m.date) ?? []), m]);
  return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([date, ms]) => ({ date, meals: ms, totals: dayTotals(ms) }));
}

/** "520 kcal · 40g protein" (only the numbers that were recorded). */
export function macroLine(m: { calories: number | null; proteinG: number | null; carbsG?: number | null; fatG?: number | null }) {
  return [
    m.calories != null && `${m.calories.toLocaleString("en-US")} kcal`,
    m.proteinG != null && `${m.proteinG}g protein`,
    m.carbsG != null && `${m.carbsG}g carbs`,
    m.fatG != null && `${m.fatG}g fat`,
  ].filter(Boolean).join(" · ");
}
