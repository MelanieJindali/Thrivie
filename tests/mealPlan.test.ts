import { describe, expect, it } from "vitest";
import ingredientsFile from "@/data/ingredients.json";
import { ALLERGENS, DIETS, type Allergen, type DietType } from "@/lib/nutrition/calculations";
import { eligibleMeals, formatPortion, fromStored, generateWeekPlan, getMeal, MEALS, swapMeal, TOLERANCE, toStored, type PlanPreferences } from "@/lib/nutrition/mealPlan";

const ING = (ingredientsFile as { ingredients: Record<string, { per100g: { kcal: number; proteinG: number; carbsG: number; fatG: number }; allergens: string[]; animal: string | null }> }).ingredients;
const START = "2026-11-09"; // Monday
const plan = (calories: number, prefs: PlanPreferences, seed = "s1") => generateWeekPlan({ calories, startDate: START, prefs, seed });

describe("meal library (USDA-derived)", () => {
  it("has about 40 meals covering every slot", () => {
    expect(MEALS.length).toBeGreaterThanOrEqual(38);
    for (const slot of ["breakfast", "lunch", "dinner", "snack"]) expect(MEALS.filter((m) => m.slot === slot).length, slot).toBeGreaterThanOrEqual(8);
  });
  it("matches its ingredients' USDA values, diet and allergens", () => {
    for (const m of MEALS) {
      const sum = (k: "kcal" | "proteinG" | "carbsG" | "fatG") => m.ingredients.reduce((s, i) => s + (ING[i.key].per100g[k] * i.grams) / 100, 0);
      expect(Math.abs(m.kcal - sum("kcal")), m.id).toBeLessThanOrEqual(1);
      expect(Math.abs(m.proteinG - sum("proteinG")), m.id).toBeLessThanOrEqual(0.1);
      const allergens = new Set(m.ingredients.flatMap((i) => ING[i.key].allergens));
      expect([...allergens].sort(), m.id).toEqual([...m.allergens].sort());
      const animals = new Set(m.ingredients.map((i) => ING[i.key].animal).filter(Boolean));
      if (animals.has("meat")) expect(m.diet, m.id).toBe("omnivore");
      if (m.diet === "vegan") expect(animals.size, m.id).toBe(0);
    }
  });
  it("has calories that agree with the macros (4/4/9 rule, within 15%)", () => {
    for (const m of MEALS) expect(Math.abs(m.proteinG * 4 + m.carbsG * 4 + m.fatG * 9 - m.kcal) / m.kcal, m.id).toBeLessThan(0.15);
  });
});

describe("diet and allergy filtering", () => {
  it("never includes excluded diets or allergens", () => {
    for (const diet of DIETS) {
      for (const a of ALLERGENS) {
        const meals = eligibleMeals({ diet, allergies: [a] });
        expect(meals.every((m) => !m.allergens.includes(a)), `${diet}/${a}`).toBe(true);
        if (diet === "vegan") expect(meals.every((m) => m.diet === "vegan")).toBe(true);
        if (diet === "vegetarian") expect(meals.every((m) => m.diet === "vegan" || m.diet === "vegetarian")).toBe(true);
        if (diet === "pescatarian") expect(meals.some((m) => m.diet === "omnivore")).toBe(false);
      }
    }
  });
  it("still has every main meal for a vegan avoiding all listed allergens", () => {
    const strict = eligibleMeals({ diet: "vegan", allergies: [...ALLERGENS] });
    for (const slot of ["breakfast", "lunch", "dinner", "snack"]) expect(strict.some((m) => m.slot === slot), slot).toBe(true);
  });
});

describe("plan generation", () => {
  const combos: PlanPreferences[] = [
    { diet: "none", allergies: [] }, { diet: "vegetarian", allergies: ["nuts"] }, { diet: "vegan", allergies: ["soy", "gluten"] },
    { diet: "pescatarian", allergies: ["dairy", "eggs"] }, { diet: "vegan", allergies: [...ALLERGENS] as Allergen[] },
  ];
  it.each([1200, 1500, 1800, 2200, 2600, 3000])("hits %i kcal within ±10% every day for common preferences", (kcal) => {
    for (const prefs of combos) {
      const w = plan(kcal, prefs);
      expect(w.days).toHaveLength(7);
      for (const d of w.days) {
        expect(Math.abs(d.totals.kcal - kcal) / kcal, `${prefs.diet}/${prefs.allergies.join(",")} ${d.date}: ${d.totals.kcal}`).toBeLessThanOrEqual(TOLERANCE);
        for (const it of d.items) expect(eligibleMeals(prefs).some((m) => m.id === it.mealId)).toBe(true);
        for (const slot of ["breakfast", "lunch", "dinner"]) expect(d.items.some((i) => i.slot === slot)).toBe(true);
      }
    }
  });
  it("is deterministic per seed and varies across seeds", () => {
    const p = { diet: "none" as DietType, allergies: [] };
    expect(plan(2000, p, "a")).toEqual(plan(2000, p, "a"));
    expect(JSON.stringify(plan(2000, p, "a").days)).not.toBe(JSON.stringify(plan(2000, p, "b").days));
  });
  it("uses a meal at most twice a week when there are enough options", () => {
    const uses = new Map<string, number>();
    for (const d of plan(2000, { diet: "none", allergies: [] }).days) for (const i of d.items) if (i.slot !== "snack") uses.set(i.mealId, (uses.get(i.mealId) ?? 0) + 1);
    expect(Math.max(...uses.values())).toBeLessThanOrEqual(2);
  });
});

describe("swap", () => {
  const prefs: PlanPreferences = { diet: "vegetarian", allergies: ["nuts"] };
  it("replaces a meal with a different one from the same slot that fits the preferences", () => {
    const w = plan(2000, prefs);
    const before = w.days[0].items[2];
    const after = swapMeal(w, 0, 2, prefs, 1)!;
    const it = after.days[0].items[2];
    expect(it.slot).toBe(before.slot);
    expect(it.mealId).not.toBe(before.mealId);
    expect(getMeal(it.mealId)!.allergens).not.toContain("nuts");
    expect(Math.abs(after.days[0].totals.kcal - 2000) / 2000).toBeLessThanOrEqual(TOLERANCE);
  });
  it("moves through options instead of flipping between two", () => {
    let w = plan(2000, { diet: "none", allergies: [] });
    const seen = new Set([w.days[0].items[1].mealId]);
    for (let n = 1; n <= 6; n++) { w = swapMeal(w, 0, 1, { diet: "none", allergies: [] }, n)!; seen.add(w.days[0].items[1].mealId); }
    expect(seen.size).toBeGreaterThanOrEqual(3);
  });
});

describe("storage", () => {
  it("round-trips ids and portions, recomputing nutrition", () => {
    const w = plan(1800, { diet: "pescatarian", allergies: [] });
    const back = fromStored(JSON.parse(JSON.stringify(toStored(w, 1800))), { diet: "pescatarian", allergies: [] });
    expect(back.days.map((d) => d.totals)).toEqual(w.days.map((d) => d.totals));
  });
  it("formats portions", () => {
    expect(formatPortion(1)).toBe("1 serving");
    expect(formatPortion(1.5)).toBe("1½ servings");
    expect(formatPortion(0.75)).toBe("¾ serving");
  });
});

describe("fat loss plans (protein focus)", () => {
  const avgProtein = (prefs: PlanPreferences) => { const w = plan(1900, prefs); return w.days.reduce((s, d) => s + d.totals.proteinG, 0) / 7; };
  it("gives more protein than the same plan without it, and stays in the calorie range", () => {
    for (const diet of DIETS) {
      const prefs = { diet, allergies: [] as Allergen[] };
      expect(avgProtein({ ...prefs, proteinFocus: true }), diet).toBeGreaterThanOrEqual(avgProtein(prefs));
      for (const d of plan(1900, { ...prefs, proteinFocus: true }).days) expect(Math.abs(d.totals.kcal - 1900) / 1900, `${diet} ${d.date}`).toBeLessThanOrEqual(TOLERANCE);
    }
    expect(avgProtein({ diet: "none", allergies: [], proteinFocus: true })).toBeGreaterThan(avgProtein({ diet: "none", allergies: [] }));
  });
  it("still respects diet and allergies, including after a swap", () => {
    const prefs: PlanPreferences = { diet: "vegetarian", allergies: ["nuts", "gluten"], proteinFocus: true };
    const ok = new Set(eligibleMeals(prefs).map((m) => m.id));
    const w = plan(1700, prefs);
    for (const d of w.days) for (const it of d.items) expect(ok.has(it.mealId), it.mealId).toBe(true);
    const s = swapMeal(w, 2, 1, prefs, 1)!;
    expect(ok.has(s.days[2].items[1].mealId)).toBe(true);
  });
  it("leaves other goals' plans unchanged", () => {
    expect(plan(2000, { diet: "none", allergies: [], proteinFocus: false })).toEqual(plan(2000, { diet: "none", allergies: [] }));
  });
});
