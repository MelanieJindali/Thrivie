// Turns an Open Food Facts product response into a Thrivie food. Pure, so it can be tested
// against awkward real-world shapes: missing fields, numbers as text, salt without sodium,
// energy only in kilojoules. Product data © Open Food Facts contributors (ODbL).
import type { Allergen } from "./calculations";
import { NUTRIENT_LIMITS, type FoodData, type NutrientKey, type Nutrients } from "./food";

export const OFF_FIELDS = "code,product_name,product_name_en,generic_name,brands,serving_size,serving_quantity,serving_quantity_unit,nutriments,allergens_tags,traces_tags";

/** Open Food Facts nutriment name, and what to multiply by (it stores sodium and cholesterol in grams). */
const NUTRIMENTS: Record<Exclude<NutrientKey, "calories">, [string, number]> = {
  proteinG: ["proteins", 1], carbsG: ["carbohydrates", 1], fatG: ["fat", 1], satFatG: ["saturated-fat", 1], transFatG: ["trans-fat", 1],
  fiberG: ["fiber", 1], sugarsG: ["sugars", 1], addedSugarsG: ["added-sugars", 1], sodiumMg: ["sodium", 1000], cholesterolMg: ["cholesterol", 1000],
};

const ALLERGEN_TAGS: Record<string, Allergen> = {
  "en:milk": "dairy", "en:gluten": "gluten", "en:nuts": "nuts", "en:peanuts": "nuts", "en:eggs": "eggs", "en:soybeans": "soy",
  "en:crustaceans": "shellfish", "en:molluscs": "shellfish", "en:fish": "fish",
};

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v.replace(",", ".")) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const text = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() ? v.trim().replace(/\s+/g, " ").slice(0, max) : null);

function nutrients(nm: Record<string, unknown>, suffix: "100g" | "serving"): Nutrients | null {
  const out: Nutrients = {};
  const set = (k: NutrientKey, v: number | null) => { if (v != null && v <= NUTRIENT_LIMITS[k]) out[k] = Math.round(v * 10) / 10; };
  const kj = num(nm[`energy-kj_${suffix}`]) ?? (String(nm.energy_unit ?? "").toLowerCase() !== "kcal" ? num(nm[`energy_${suffix}`]) : null);
  set("calories", num(nm[`energy-kcal_${suffix}`]) ?? (kj != null ? kj / 4.184 : null));
  if (out.calories != null) out.calories = Math.round(out.calories);
  for (const [k, [name, factor]] of Object.entries(NUTRIMENTS) as [NutrientKey, [string, number]][]) {
    const v = num(nm[`${name}_${suffix}`]);
    set(k, v != null ? v * factor : null);
  }
  // Salt is listed far more often than sodium in Europe: sodium = salt ÷ 2.5.
  if (out.sodiumMg == null) { const salt = num(nm[`salt_${suffix}`]); set("sodiumMg", salt != null ? (salt / 2.5) * 1000 : null); }
  if (out.sodiumMg != null) out.sodiumMg = Math.round(out.sodiumMg);
  if (out.cholesterolMg != null) out.cholesterolMg = Math.round(out.cholesterolMg);
  return Object.keys(out).length ? out : null;
}

export type OffResult = { found: true; food: FoodData } | { found: false };

/** `body` is the JSON from /api/v2/product/{barcode}. Anything unusable counts as not found. */
export function parseOffProduct(body: unknown, barcode: string): OffResult {
  const b = body as { status?: unknown; product?: Record<string, unknown> } | null;
  const p = b && typeof b === "object" && b.product && typeof b.product === "object" ? b.product : null;
  if (!p || (b!.status !== 1 && b!.status !== "1" && b!.status !== "success")) return { found: false };
  const nm = p.nutriments && typeof p.nutriments === "object" ? (p.nutriments as Record<string, unknown>) : {};
  const per100g = nutrients(nm, "100g");
  const perServing = nutrients(nm, "serving");
  const name = text(p.product_name, 200) ?? text(p.product_name_en, 200) ?? text(p.generic_name, 200);
  // A product page with no name, or without calories or any main macro, can't be logged usefully;
  // treat it as unknown so the person can scan the label instead.
  const usable = (n: Nutrients | null) => !!n && (["calories", "proteinG", "carbsG", "fatG"] as const).some((k) => n[k] != null);
  if (!name || (!usable(per100g) && !usable(perServing))) return { found: false };
  const unit = String(p.serving_quantity_unit ?? "g").toLowerCase();
  const qty = num(p.serving_quantity);
  const tags = (v: unknown) => [...new Set((Array.isArray(v) ? v : []).map((t) => ALLERGEN_TAGS[String(t).toLowerCase()]).filter(Boolean))] as Allergen[];
  const allergens = tags(p.allergens_tags);
  return {
    found: true,
    food: {
      source: "open_food_facts", barcode, name,
      brand: text(typeof p.brands === "string" ? p.brands.split(",")[0] : null, 120),
      servingSize: text(p.serving_size, 80),
      servingGrams: qty != null && qty > 0 && qty <= 5000 && (unit === "g" || unit === "ml") ? qty : null,
      perServing, per100g, allergens,
      traces: tags(p.traces_tags).filter((a) => !allergens.includes(a)),
    },
  };
}
