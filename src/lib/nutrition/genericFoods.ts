// Generic foods (an apple, a cup of rice, chicken breast) with USDA values, for search, photo
// matches and anything without a barcode. Built from the same bundled data as food estimates. Pure.
import ingredientsData from "@/data/ingredients.json";
import type { Allergen } from "./calculations";
import { scale, type Food } from "./food";
import { FOODS, PER100, type GenericEntry } from "./foodEstimate";

const info = ingredientsData.ingredients as Record<string, { allergens?: string[] }>;
const title = (s: string) => s[0].toUpperCase() + s.slice(1);
const per100 = (key: string) => { const p = PER100[key]; return { calories: p.kcal, proteinG: p.proteinG, carbsG: p.carbsG, fatG: p.fatG }; };

function toFood(f: GenericEntry): Food {
  const grams = Math.round(f.grams);
  return {
    id: `generic:${f.key}`, mine: false, source: "generic", barcode: null, name: title(f.words[0]), brand: null,
    servingSize: `${f.each ? `1 ${f.unit}` : f.unit} (${grams} g)`, servingGrams: f.grams,
    perServing: scale(per100(f.key), f.grams / 100), per100g: scale(per100(f.key), 1),
    allergens: (info[f.key]?.allergens ?? []) as Allergen[], traces: [],
  };
}

export const GENERIC_FOODS: Food[] = FOODS.map(toFood);
const BY_ID = new Map(GENERIC_FOODS.map((f) => [f.id, f]));
export const getGenericFood = (id: string) => BY_ID.get(id) ?? null;

/** Generic foods whose name or other common words match the query, best match first. */
export function searchGeneric(query: string, limit = 8): Food[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const scored = FOODS.map((f, i) => {
    const best = Math.min(...f.words.map((w) => (w === q ? 0 : w.startsWith(q) ? 1 : w.includes(q) || q.includes(w) ? 2 : 9)));
    return { food: GENERIC_FOODS[i], best };
  }).filter((x) => x.best < 9);
  return scored.sort((a, b) => a.best - b.best).slice(0, limit).map((x) => x.food);
}
