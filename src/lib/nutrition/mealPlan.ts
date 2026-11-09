// 7-day meal plans from the bundled, USDA-derived meal library (src/data/meals.json).
// Pure and deterministic for a given seed, so a stored plan renders the same everywhere.
// - Each day lands within ±10% of the calorie target (portion sizes and up to 3 snacks).
// - Respects diet type and allergies; a meal is used at most twice a week when possible.
import library from "@/data/meals.json";
import { addDays, type DateStr } from "../dates";
import type { Allergen, DietType } from "./calculations";

export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";
export type MealDiet = "vegan" | "vegetarian" | "pescatarian" | "omnivore";
export type LibraryMeal = {
  id: string;
  name: string;
  slot: MealSlot;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  diet: MealDiet;
  allergens: Allergen[];
  ingredients: { key: string; grams: number; label: string }[];
};
export type Macros = { kcal: number; proteinG: number; carbsG: number; fatG: number };
export type PlanItem = Macros & { mealId: string; slot: MealSlot; portion: number };
export type DayPlan = { date: DateStr; targetCalories: number; items: PlanItem[]; totals: Macros; withinTarget: boolean };
export type WeekPlan = { startDate: DateStr; seed: string; days: DayPlan[]; warnings: string[] };
export type PlanPreferences = { diet: DietType; allergies: Allergen[] };
/** What gets stored (encrypted): meal ids and portions only. Nutrition is recomputed from the library on read. */
export type StoredPlan = { startDate: DateStr; seed: string; target: number; swaps: number; days: { date: DateStr; items: { mealId: string; portion: number }[] }[] };

export const MEALS = library.meals as LibraryMeal[];
export const TOLERANCE = 0.1;
export const MAX_USES_PER_WEEK = 2;
export const PORTIONS = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;
const MAX_SNACKS = 3;
const MAIN_SLOTS: { slot: MealSlot; share: number }[] = [{ slot: "breakfast", share: 0.25 }, { slot: "lunch", share: 0.3 }, { slot: "dinner", share: 0.35 }];
const ALLOWED: Record<DietType, readonly MealDiet[]> = {
  none: ["vegan", "vegetarian", "pescatarian", "omnivore"],
  pescatarian: ["vegan", "vegetarian", "pescatarian"],
  vegetarian: ["vegan", "vegetarian"],
  vegan: ["vegan"],
};
const BY_ID = new Map(MEALS.map((m) => [m.id, m]));
export const getMeal = (id: string) => BY_ID.get(id);

/** Meals that fit the diet and contain none of the allergens. */
export function eligibleMeals(prefs: PlanPreferences, lib: readonly LibraryMeal[] = MEALS): LibraryMeal[] {
  const allowed = ALLOWED[prefs.diet];
  return lib.filter((m) => allowed.includes(m.diet) && !m.allergens.some((a) => prefs.allergies.includes(a)));
}

function toItem(m: LibraryMeal, portion: number): PlanItem {
  return { mealId: m.id, slot: m.slot, portion, kcal: Math.round(m.kcal * portion), proteinG: Math.round(m.proteinG * portion), carbsG: Math.round(m.carbsG * portion), fatG: Math.round(m.fatG * portion) };
}
const sumKcal = (items: PlanItem[]) => items.reduce((s, i) => s + i.kcal, 0);

function summarize(date: DateStr, target: number, items: PlanItem[]): DayPlan {
  const totals = items.reduce<Macros>((t, i) => ({ kcal: t.kcal + i.kcal, proteinG: t.proteinG + i.proteinG, carbsG: t.carbsG + i.carbsG, fatG: t.fatG + i.fatG }), { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  return { date, targetCalories: target, items, totals, withinTarget: Math.abs(totals.kcal - target) <= target * TOLERANCE };
}

const bestPortion = (m: LibraryMeal, kcal: number) => PORTIONS.reduce((b, p) => (Math.abs(m.kcal * p - kcal) < Math.abs(m.kcal * b - kcal) ? p : b), 1 as number);

function pick(candidates: LibraryMeal[], kcal: number, usage: Map<string, number>, rng: () => number): { meal: LibraryMeal; portion: number } | null {
  let pool = candidates.filter((m) => (usage.get(m.id) ?? 0) < MAX_USES_PER_WEEK);
  if (!pool.length) pool = candidates; // very restrictive preferences: allow a repeat rather than an empty slot
  if (!pool.length) return null;
  const ranked = pool
    .map((meal) => {
      const portion = bestPortion(meal, kcal);
      return { meal, portion, score: Math.abs(meal.kcal * portion - kcal) / kcal + (usage.get(meal.id) ?? 0) * 0.05 };
    })
    .sort((a, b) => a.score - b.score || a.meal.id.localeCompare(b.meal.id));
  const top = ranked.slice(0, Math.min(3, ranked.length)); // choose among the closest few for variety
  return top[Math.floor(rng() * top.length)];
}

/** Nudge one portion at a time until the day is within ±5% (or no single step helps). */
function fineTune(items: PlanItem[], target: number) {
  for (let step = 0; step < 12; step++) {
    const total = sumKcal(items);
    if (Math.abs(total - target) <= target * 0.05) return;
    let best: { i: number; item: PlanItem; err: number } | null = null;
    items.forEach((it, i) => {
      const m = BY_ID.get(it.mealId)!;
      const at = PORTIONS.indexOf(it.portion as (typeof PORTIONS)[number]);
      for (const p of [PORTIONS[at - 1], PORTIONS[at + 1]]) {
        if (p === undefined) continue;
        const cand = toItem(m, p);
        const err = Math.abs(total - it.kcal + cand.kcal - target);
        if (err < (best?.err ?? Math.abs(total - target))) best = { i, item: cand, err };
      }
    });
    if (!best) return;
    items[(best as { i: number }).i] = (best as { item: PlanItem }).item;
  }
}

function buildDay(date: DateStr, target: number, eligible: LibraryMeal[], usage: Map<string, number>, rng: () => number): DayPlan {
  const items: PlanItem[] = [];
  const add = (p: { meal: LibraryMeal; portion: number }) => { items.push(toItem(p.meal, p.portion)); usage.set(p.meal.id, (usage.get(p.meal.id) ?? 0) + 1); };
  for (const { slot, share } of MAIN_SLOTS) {
    const p = pick(eligible.filter((m) => m.slot === slot), target * share, usage, rng);
    if (p) add(p);
  }
  const snacks = eligible.filter((m) => m.slot === "snack");
  for (let n = 0; n < MAX_SNACKS && target - sumKcal(items) > target * 0.05; n++) {
    const p = pick(snacks, target - sumKcal(items), usage, rng);
    if (!p) break;
    add(p);
  }
  fineTune(items, target);
  return summarize(date, target, items);
}

export function generateWeekPlan({ calories, startDate, prefs, seed, lib = MEALS }: { calories: number; startDate: DateStr; prefs: PlanPreferences; seed: string; lib?: readonly LibraryMeal[] }): WeekPlan {
  if (!Number.isFinite(calories) || calories <= 0) throw new RangeError("Calorie target must be positive");
  const eligible = eligibleMeals(prefs, lib);
  const usage = new Map<string, number>();
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(startDate, i);
    return buildDay(date, calories, eligible, usage, createRng(`${seed}|${date}`));
  });
  return { startDate, seed, days, warnings: planWarnings(days, eligible) };
}

function planWarnings(days: DayPlan[], eligible: LibraryMeal[]): string[] {
  const w: string[] = [];
  const missing = (["breakfast", "lunch", "dinner"] as const).filter((s) => !eligible.some((m) => m.slot === s));
  if (missing.length) w.push(`No ${missing.join(" or ")} options match your diet and allergies yet, so some meals are missing.`);
  if (days.some((d) => !d.withinTarget)) w.push("Some days are a little outside your range because few meals match your preferences.");
  return w;
}

/**
 * Replace one meal with a similar one from the same slot (calories kept close).
 * `attempt` makes each tap draw differently, so repeated swaps move through the options instead of flipping back.
 */
export function swapMeal(week: WeekPlan, dayIndex: number, itemIndex: number, prefs: PlanPreferences, attempt: number): WeekPlan | null {
  const day = week.days[dayIndex];
  const current = day?.items[itemIndex];
  if (!current) return null;
  const usage = new Map<string, number>();
  week.days.forEach((d, di) => d.items.forEach((it, ii) => { if (di !== dayIndex || ii !== itemIndex) usage.set(it.mealId, (usage.get(it.mealId) ?? 0) + 1); }));
  const sameDay = new Set(day.items.map((i) => i.mealId));
  const candidates = eligibleMeals(prefs).filter((m) => m.slot === current.slot && !sameDay.has(m.id));
  const p = pick(candidates, current.kcal, usage, createRng(`${week.seed}|swap|${day.date}|${itemIndex}|${attempt}`));
  if (!p) return null;
  const items = day.items.map((it, i) => (i === itemIndex ? toItem(p.meal, p.portion) : it));
  fineTuneOthers(items, itemIndex, day.targetCalories);
  return { ...week, days: week.days.map((d, i) => (i === dayIndex ? summarize(d.date, d.targetCalories, items) : d)) };
}

/** After a swap, keep the day in range by adjusting the other portions (never the one the user just picked). */
function fineTuneOthers(items: PlanItem[], keep: number, target: number) {
  const others = items.filter((_, i) => i !== keep);
  const fixed = items[keep];
  fineTune(others, target - fixed.kcal);
  others.splice(keep, 0, fixed);
  others.forEach((it, i) => (items[i] = it));
}

export const toStored = (w: WeekPlan, target: number, swaps = 0): StoredPlan => ({
  startDate: w.startDate, seed: w.seed, target, swaps, days: w.days.map((d) => ({ date: d.date, items: d.items.map(({ mealId, portion }) => ({ mealId, portion })) })),
});

/** Rebuild a full plan from stored ids (unknown meals are skipped). */
export function fromStored(s: StoredPlan, prefs: PlanPreferences): WeekPlan {
  const days = s.days.map((d) => summarize(d.date, s.target, d.items.flatMap((it) => { const m = BY_ID.get(it.mealId); return m ? [toItem(m, it.portion)] : []; })));
  return { startDate: s.startDate, seed: s.seed, days, warnings: planWarnings(days, eligibleMeals(prefs)) };
}

const FRACTIONS: Record<number, string> = { 0: "", 0.25: "¼", 0.5: "½", 0.75: "¾" };
/** 1 → "1 serving", 1.5 → "1½ servings", 0.75 → "¾ serving". */
export function formatPortion(p: number): string {
  const whole = Math.floor(p);
  return `${whole || ""}${FRACTIONS[p - whole] ?? ""} serving${p > 1 ? "s" : ""}`;
}

/** Small seeded PRNG (mulberry32 over a string hash) so plans are reproducible. */
export function createRng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
