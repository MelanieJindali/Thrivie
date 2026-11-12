// How logged food relates to the day's targets: what's left, how an item fits, what to eat
// next, and how a meal compares to its share of the day. Pure (device + server).
// Tone rules: neutral and encouraging. No food is good or bad, nothing is "too much".
import type { Nutrients } from "./food";
import { PORTIONS, eligibleMeals, type LibraryMeal, type MealSlot, type PlanPreferences } from "./mealPlan";

export type DayTargets = { calories: number | null; proteinG: number | null; carbsG: number | null; fatG: number | null };
export type Macro = keyof DayTargets;
export const MACROS: Macro[] = ["calories", "proteinG", "carbsG", "fatG"];
export const MACRO_LABEL: Record<Macro, string> = { calories: "calories", proteinG: "protein", carbsG: "carbs", fatG: "fat" };

/** Each meal's usual share of the day (snacks share what's left). */
export const MEAL_SHARE: Record<MealSlot, number> = { breakfast: 0.25, lunch: 0.3, dinner: 0.35, snack: 0.1 };

export type Totals = { calories: number; proteinG: number; carbsG: number; fatG: number };

export function sum(items: Pick<Nutrients, Macro>[]): Totals {
  const t = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 };
  for (const n of items) for (const k of MACROS) t[k] += n[k] ?? 0;
  return { calories: Math.round(t.calories), proteinG: Math.round(t.proteinG), carbsG: Math.round(t.carbsG), fatG: Math.round(t.fatG) };
}

/** What's left of each target today. Never negative: past the target simply reads as nothing left. */
export function remaining(targets: DayTargets, eaten: Pick<Nutrients, Macro>): DayTargets {
  const left = (k: Macro) => (targets[k] == null ? null : Math.max(0, Math.round(targets[k]! - (eaten[k] ?? 0))));
  return { calories: left("calories"), proteinG: left("proteinG"), carbsG: left("carbsG"), fatG: left("fatG") };
}

/** "about a third", "about half"… for a share between 0 and 1. */
export function shareWords(x: number): string {
  if (x >= 0.95) return "all";
  if (x >= 0.85) return "nearly all";
  if (x >= 0.7) return "about three quarters";
  if (x >= 0.58) return "about two thirds";
  if (x >= 0.42) return "about half";
  if (x >= 0.29) return "about a third";
  if (x >= 0.2) return "about a quarter";
  if (x >= 0.1) return "a small part";
  return "very little";
}

/**
 * One short, neutral sentence on how an item fits what's left today, or null when there are
 * no targets to compare with. With calorie numbers hidden, it never mentions calories.
 */
export function fitNote(item: Nutrients, left: DayTargets, opts: { hideCalories?: boolean } = {}): string | null {
  const share = (k: Macro) => (left[k] != null && item[k] != null ? (left[k]! > 0 ? item[k]! / left[k]! : item[k]! > 0 ? Infinity : 0) : null);
  const protein = share("proteinG");
  const cal = opts.hideCalories ? null : share("calories");
  if (cal != null && cal > 1.05) {
    return left.calories === 0
      ? "You've reached today's calorie guide. It's a guide, not a limit, so log this if you're having it."
      : "This goes a little past what's left of today's calorie guide. Guides flex from day to day.";
  }
  if (protein != null && Number.isFinite(protein) && protein >= 0.2 && (item.proteinG ?? 0) >= 5) {
    return `This covers ${shareWords(Math.min(protein, 1))} of your remaining protein for today${cal != null && cal >= 0.1 ? `, and ${shareWords(cal)} of the calories you have left` : ""}.`;
  }
  if (cal != null) return cal < 0.1 ? "This barely touches what's left of today's calorie guide." : `This uses ${shareWords(cal)} of the calories you have left today.`;
  if (protein != null && Number.isFinite(protein)) return protein >= 0.1 ? `This covers ${shareWords(Math.min(protein, 1))} of your remaining protein for today.` : "This fits easily into the rest of your day.";
  return null;
}

/** How a meal built from several items compares with that meal's usual share of the day. */
export function mealComparison(total: Pick<Nutrients, Macro>, slot: MealSlot, targets: DayTargets, opts: { hideCalories?: boolean } = {}): string | null {
  if (opts.hideCalories || targets.calories == null || total.calories == null) {
    if (targets.proteinG == null || total.proteinG == null) return null;
    const p = total.proteinG / (targets.proteinG * MEAL_SHARE[slot]);
    return p >= 0.8 ? `This meal covers a full ${slot}'s worth of protein.` : `This meal covers ${shareWords(p)} of a typical ${slot}'s protein.`;
  }
  const usual = Math.round((targets.calories * MEAL_SHARE[slot]) / 10) * 10;
  const ratio = total.calories / usual;
  const how = ratio < 0.8 ? "lighter than" : ratio <= 1.2 ? "right around" : "heartier than";
  return `About ${total.calories.toLocaleString("en-US")} kcal, ${how} a typical ${slot} for you (around ${usual.toLocaleString("en-US")}).`;
}

export type Suggestion = { kind: "library"; mealId: string; name: string; portion: number; nutrients: Required<Pick<Nutrients, Macro>>; reason: string }
  | { kind: "recent"; name: string; portion: 1; nutrients: Pick<Nutrients, Macro>; reason: string };
export type RecentFood = { name: string; slot: MealSlot; nutrients: Pick<Nutrients, Macro> };

const scaleMeal = (m: LibraryMeal, p: number) => ({ calories: Math.round(m.kcal * p), proteinG: Math.round(m.proteinG * p), carbsG: Math.round(m.carbsG * p), fatG: Math.round(m.fatG * p) });

/**
 * A few things that fit what's left today: meals from the library (matching diet and
 * allergies, at the portion that fits best) and foods the person has logged recently.
 * Ranked by how closely calories match this eating occasion, with a nudge toward protein
 * when protein is what's most behind.
 */
export function suggestNext(input: { targets: DayTargets; left: DayTargets; slot: MealSlot; prefs: PlanPreferences; recents?: RecentFood[]; exclude?: string[]; limit?: number; library?: readonly LibraryMeal[] }): Suggestion[] {
  const { targets, left, slot } = input;
  if (targets.calories == null || left.calories == null || left.calories < 60) return [];
  const leftCal = left.calories;
  const aim = Math.min(leftCal, slot === "snack" ? Math.max(120, targets.calories * MEAL_SHARE.snack) : targets.calories * MEAL_SHARE[slot]);
  // Protein matters more when a larger share of it is still to come than of calories.
  const proteinBehind = targets.proteinG && left.proteinG != null ? left.proteinG / targets.proteinG - leftCal / targets.calories : 0;
  const score = (n: Pick<Nutrients, Macro>) => {
    const cal = n.calories ?? 0;
    const off = Math.abs(cal - aim) / aim + (cal > leftCal ? 0.6 : 0);
    const density = cal > 0 ? ((n.proteinG ?? 0) * 4) / cal : 0;
    return off - (proteinBehind > 0.05 ? density * 1.2 : density * 0.3);
  };
  const reason = (n: Pick<Nutrients, Macro>) => {
    const ps = left.proteinG ? (n.proteinG ?? 0) / left.proteinG : 0;
    return proteinBehind > 0.05 && ps >= 0.2 ? `Covers ${shareWords(Math.min(ps, 1))} of your remaining protein` : "Fits what's left today";
  };
  const skip = new Set((input.exclude ?? []).map((s) => s.trim().toLowerCase()));
  const out: (Suggestion & { s: number })[] = [];
  for (const m of eligibleMeals(input.prefs, input.library)) {
    if (m.slot !== slot || skip.has(m.name.toLowerCase())) continue;
    const best = PORTIONS.map((p) => ({ p, n: scaleMeal(m, p) })).sort((a, b) => score(a.n) - score(b.n))[0];
    out.push({ kind: "library", mealId: m.id, name: m.name, portion: best.p, nutrients: best.n, reason: reason(best.n), s: score(best.n) });
  }
  const seen = new Set<string>();
  for (const r of input.recents ?? []) {
    const key = r.name.trim().toLowerCase();
    if (seen.has(key) || skip.has(key) || r.nutrients.calories == null || (r.slot !== slot && slot !== "snack")) continue;
    seen.add(key);
    out.push({ kind: "recent", name: r.name, portion: 1, nutrients: r.nutrients, reason: "You've had this recently", s: score(r.nutrients) - 0.05 });
  }
  return out.filter((x) => x.s < 1.2).sort((a, b) => a.s - b.s).slice(0, input.limit ?? 4).map(({ s: _s, ...x }) => x as Suggestion);
}

/** Picks a portion for each planned item so the set lands as near as possible to `kcal`. */
export function fitPortions(items: { baseKcal: number }[], kcal: number): number[] {
  if (!items.length) return [];
  const base = items.reduce((s, i) => s + i.baseKcal, 0);
  if (base <= 0) return items.map(() => 1);
  const want = kcal / base;
  // Same portion for every item first, then nudge single items toward the goal.
  const nearest = (x: number) => PORTIONS.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a));
  const portions = items.map(() => nearest(want));
  const total = () => items.reduce((s, it, i) => s + it.baseKcal * portions[i], 0);
  for (let pass = 0; pass < items.length; pass++) {
    let improved = false;
    for (let i = 0; i < items.length; i++) {
      for (const p of PORTIONS) {
        const before = Math.abs(total() - kcal);
        const old = portions[i];
        portions[i] = p;
        if (Math.abs(total() - kcal) < before - 1) improved = true; else portions[i] = old;
      }
    }
    if (!improved) break;
  }
  return portions;
}
