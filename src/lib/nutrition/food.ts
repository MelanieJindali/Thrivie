// Foods and their nutrition: shared types, validation and serving maths. Pure (device + server).
import { z } from "zod";
import { ALLERGENS, type Allergen } from "./calculations";

export const FOOD_SOURCES = ["open_food_facts", "label_scan", "custom", "generic"] as const;
export type FoodSource = (typeof FOOD_SOURCES)[number];

/** Upper bounds for one serving or 100 g. Anything outside is treated as a misread, not saved. */
export const NUTRIENT_LIMITS = {
  calories: 5000, proteinG: 500, carbsG: 1000, fatG: 500, satFatG: 500, transFatG: 100, fiberG: 300,
  sugarsG: 1000, addedSugarsG: 1000, sodiumMg: 100_000, cholesterolMg: 10_000,
} as const;
export type NutrientKey = keyof typeof NUTRIENT_LIMITS;
export const NUTRIENT_KEYS = Object.keys(NUTRIENT_LIMITS) as NutrientKey[];
export type Nutrients = { [K in NutrientKey]?: number | null };

const amount = (max: number) => z.number().finite().min(0).max(max).nullable().optional();
export const NutrientsSchema: z.ZodType<Nutrients> = z.object(Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, amount(NUTRIENT_LIMITS[k])])) as Record<NutrientKey, ReturnType<typeof amount>>);

export type FoodData = {
  source: FoodSource;
  barcode: string | null;
  name: string;
  brand: string | null;
  servingSize: string | null;
  servingGrams: number | null;
  perServing: Nutrients | null;
  per100g: Nutrients | null;
  allergens: Allergen[];
  /** "May contain" allergens (traces), kept apart from the ones the product definitely contains. */
  traces: Allergen[];
};
export type Food = FoodData & { id: string; mine: boolean };

export const FoodDataSchema = z.object({
  source: z.enum(FOOD_SOURCES),
  barcode: z.string().regex(/^\d{8,13}$/).nullable(),
  name: z.string().trim().min(1, "Give the food a name.").max(200),
  brand: z.string().trim().max(120).nullable(),
  servingSize: z.string().trim().max(80).nullable(),
  servingGrams: z.number().finite().positive().max(5000).nullable(),
  perServing: NutrientsSchema.nullable(),
  per100g: NutrientsSchema.nullable(),
  allergens: z.array(z.enum(ALLERGENS)).max(ALLERGENS.length).transform((a) => [...new Set(a)]),
  traces: z.array(z.enum(ALLERGENS)).max(ALLERGENS.length).transform((a) => [...new Set(a)]).default([]),
});

const dp = (k: NutrientKey) => (k === "calories" || k === "sodiumMg" || k === "cholesterolMg" ? 0 : 1);
const round = (k: NutrientKey, v: number) => Math.round(v * 10 ** dp(k)) / 10 ** dp(k);

export function scale(n: Nutrients, factor: number): Nutrients {
  const out: Nutrients = {};
  for (const k of NUTRIENT_KEYS) if (n[k] != null) out[k] = round(k, n[k]! * factor);
  return out;
}

/** How much was eaten: a number of servings, or a weight in grams (when the food has per-100 g data). */
export type Portion = { servings: number } | { grams: number };

/** Nutrition for a portion of a food, or null when the food can't be measured that way. */
export function nutrientsFor(food: Pick<FoodData, "perServing" | "per100g" | "servingGrams">, portion: Portion): Nutrients | null {
  if ("grams" in portion) {
    if (!(portion.grams > 0)) return null;
    if (food.per100g) return scale(food.per100g, portion.grams / 100);
    return food.perServing && food.servingGrams ? scale(food.perServing, portion.grams / food.servingGrams) : null;
  }
  if (!(portion.servings > 0)) return null;
  if (food.perServing) return scale(food.perServing, portion.servings);
  // No per-serving values: work them out from the serving weight, or treat 100 g as one serving.
  return food.per100g ? scale(food.per100g, (portion.servings * (food.servingGrams ?? 100)) / 100) : null;
}

/** Number of servings a gram amount represents (for the snapshot), or null without a serving weight. */
export const servingsFromGrams = (food: Pick<FoodData, "servingGrams">, grams: number) => (food.servingGrams ? Math.round((grams / food.servingGrams) * 100) / 100 : null);

/** Calories the macros add up to: protein × 4 + carbs × 4 + fat × 9. */
export const caloriesFromMacros = (n: Nutrients) => (n.proteinG ?? 0) * 4 + (n.carbsG ?? 0) * 4 + (n.fatG ?? 0) * 9;

/**
 * Whether the stated calories roughly match the macros. Labels round, fibre and sugar alcohols
 * count for less, and alcohol isn't a listed macro, so the allowance is generous.
 */
export function caloriesConsistent(n: Nutrients): boolean | null {
  if (n.calories == null || n.proteinG == null || n.carbsG == null || n.fatG == null) return null;
  const expected = caloriesFromMacros(n);
  return Math.abs(n.calories - expected) <= Math.max(25, expected * 0.25);
}

/** Allergens on the person's list that the food contains, or may contain traces of. */
export function allergenMatches(food: Pick<FoodData, "allergens" | "traces">, mine: readonly Allergen[]): { contains: Allergen[]; mayContain: Allergen[] } {
  const contains = food.allergens.filter((a) => mine.includes(a));
  return { contains, mayContain: food.traces.filter((a) => mine.includes(a) && !contains.includes(a)) };
}
