// Suggested calories and macros for a meal as it's typed into the food log.
// Pure and on-device: nothing typed is sent anywhere. Sources, in order of trust:
//   1. the person's own past entries with the same name
//   2. a close match in the bundled meal library (USDA-based recipes)
//   3. a sum of recognised foods ("2 eggs and toast with avocado") at typical servings,
//      using USDA FoodData Central values per 100 g
// Suggestions are approximate and only fill the form when the person taps Use.
import Fuse from "fuse.js";
import ingredientsData from "@/data/ingredients.json";
import { MEALS } from "./mealPlan";

export type Macros = { calories: number; proteinG: number; carbsG: number; fatG: number };
export type PastMeal = { name: string; calories: string; proteinG: string; carbsG: string; fatG: string };
export type FoodEstimate = Macros & { source: "history" | "library" | "foods"; basis: string };

type Per100 = { kcal: number; proteinG: number; carbsG: number; fatG: number };
const PER100 = Object.fromEntries(Object.entries(ingredientsData.ingredients).map(([k, v]) => [k, v.per100g as Per100])) as Record<string, Per100>;

/** Typical serving per food (USDA household measures). `unit` is how one serving is described. */
type Food = { key: string; words: string[]; grams: number; unit: string; each?: boolean };
const FOODS: Food[] = [
  { key: "oats", words: ["oatmeal", "oats", "porridge", "overnight oats"], grams: 40, unit: "½ cup dry" },
  { key: "milk", words: ["milk"], grams: 244, unit: "1 cup" },
  { key: "soymilk", words: ["soy milk", "soymilk"], grams: 243, unit: "1 cup" },
  { key: "yogurt_greek", words: ["greek yogurt", "yogurt", "yoghurt"], grams: 170, unit: "1 container" },
  { key: "blueberries", words: ["blueberries", "berries"], grams: 74, unit: "½ cup" },
  { key: "strawberries", words: ["strawberries"], grams: 76, unit: "½ cup" },
  { key: "banana", words: ["banana", "bananas"], grams: 118, unit: "medium", each: true },
  { key: "apple", words: ["apple", "apples"], grams: 182, unit: "medium", each: true },
  { key: "orange", words: ["orange", "oranges"], grams: 131, unit: "medium", each: true },
  { key: "egg", words: ["eggs", "egg", "omelet", "omelette", "scrambled eggs"], grams: 50, unit: "large", each: true },
  { key: "bread_ww", words: ["toast", "bread", "slice of bread", "sandwich bread"], grams: 32, unit: "slice", each: true },
  { key: "pita_ww", words: ["pita"], grams: 64, unit: "pita", each: true },
  { key: "avocado", words: ["avocado", "guacamole"], grams: 68, unit: "½" },
  { key: "peanut_butter", words: ["peanut butter", "pb"], grams: 32, unit: "2 tbsp" },
  { key: "almonds", words: ["almonds", "nuts"], grams: 28, unit: "1 oz" },
  { key: "walnuts", words: ["walnuts"], grams: 28, unit: "1 oz" },
  { key: "chia", words: ["chia"], grams: 12, unit: "1 tbsp" },
  { key: "honey", words: ["honey"], grams: 21, unit: "1 tbsp" },
  { key: "chicken", words: ["chicken breast", "chicken"], grams: 113, unit: "4 oz" },
  { key: "turkey", words: ["turkey"], grams: 85, unit: "3 oz" },
  { key: "beef", words: ["ground beef", "beef", "burger", "steak"], grams: 113, unit: "4 oz" },
  { key: "salmon", words: ["salmon"], grams: 113, unit: "4 oz" },
  { key: "tuna", words: ["tuna"], grams: 113, unit: "4 oz" },
  { key: "cod", words: ["cod", "white fish"], grams: 113, unit: "4 oz" },
  { key: "shrimp", words: ["shrimp", "prawns"], grams: 85, unit: "3 oz" },
  { key: "tofu", words: ["tofu"], grams: 126, unit: "½ cup" },
  { key: "tempeh", words: ["tempeh"], grams: 84, unit: "3 oz" },
  { key: "edamame", words: ["edamame"], grams: 78, unit: "½ cup" },
  { key: "black_beans", words: ["black beans", "beans"], grams: 86, unit: "½ cup" },
  { key: "chickpeas", words: ["chickpeas", "garbanzo"], grams: 82, unit: "½ cup" },
  { key: "lentils", words: ["lentils", "dal", "dhal"], grams: 99, unit: "½ cup" },
  { key: "hummus", words: ["hummus"], grams: 30, unit: "2 tbsp" },
  { key: "rice_brown", words: ["brown rice"], grams: 195, unit: "1 cup cooked" },
  { key: "rice_white", words: ["rice"], grams: 158, unit: "1 cup cooked" },
  { key: "quinoa", words: ["quinoa"], grams: 185, unit: "1 cup cooked" },
  { key: "pasta_ww", words: ["pasta", "spaghetti", "noodles", "penne"], grams: 140, unit: "1 cup cooked" },
  { key: "sweet_potato", words: ["sweet potato", "sweet potatoes"], grams: 114, unit: "medium", each: true },
  { key: "potato", words: ["potato", "potatoes"], grams: 173, unit: "medium", each: true },
  { key: "broccoli", words: ["broccoli"], grams: 78, unit: "½ cup" },
  { key: "spinach", words: ["spinach"], grams: 30, unit: "1 cup" },
  { key: "romaine", words: ["salad", "lettuce", "greens", "romaine"], grams: 47, unit: "1 cup" },
  { key: "tomato", words: ["tomato", "tomatoes"], grams: 123, unit: "medium", each: true },
  { key: "cucumber", words: ["cucumber"], grams: 52, unit: "½ cup" },
  { key: "bell_pepper", words: ["bell pepper", "peppers", "pepper"], grams: 75, unit: "½" },
  { key: "carrot", words: ["carrots", "carrot"], grams: 61, unit: "medium", each: true },
  { key: "onion", words: ["onion", "onions"], grams: 40, unit: "¼ cup" },
  { key: "mushroom", words: ["mushrooms", "mushroom"], grams: 35, unit: "½ cup" },
  { key: "zucchini", words: ["zucchini"], grams: 113, unit: "½" },
  { key: "olive_oil", words: ["olive oil", "oil"], grams: 13.5, unit: "1 tbsp" },
  { key: "cottage", words: ["cottage cheese"], grams: 113, unit: "½ cup" },
  { key: "feta", words: ["feta"], grams: 28, unit: "1 oz" },
  { key: "mozzarella", words: ["mozzarella"], grams: 28, unit: "1 oz" },
  { key: "parmesan", words: ["parmesan", "parm"], grams: 5, unit: "1 tbsp" },
  { key: "cheddar", words: ["cheese", "cheddar"], grams: 28, unit: "1 oz" },
  { key: "tortilla_corn", words: ["corn tortilla", "corn tortillas", "taco"], grams: 26, unit: "tortilla", each: true },
  { key: "tortilla_flour", words: ["tortilla", "wrap", "burrito"], grams: 49, unit: "tortilla", each: true },
  { key: "granola", words: ["granola"], grams: 61, unit: "½ cup" },
  { key: "salsa", words: ["salsa"], grams: 32, unit: "2 tbsp" },
  { key: "marinara", words: ["marinara", "tomato sauce", "pasta sauce"], grams: 125, unit: "½ cup" },
  { key: "rice_cakes", words: ["rice cakes", "rice cake"], grams: 9, unit: "cake", each: true },
];

// Longest phrases first, so "peanut butter" wins over "butter" and "sweet potato" over "potato".
const PHRASES = FOODS.flatMap((f) => f.words.map((w) => ({ w, f }))).sort((a, b) => b.w.length - a.w.length);
const NUM_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, half: 0.5, couple: 2 };
const UNIT_G: Record<string, number> = { g: 1, gram: 1, grams: 1, oz: 28.35, ounce: 28.35, ounces: 28.35 };

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}½¼¾./\s-]/gu, " ").replace(/\s+/g, " ").trim();
const parseQty = (t: string): number | null => {
  const s = t.replace("½", ".5").replace("¼", ".25").replace("¾", ".75");
  if (/^\d+\/\d+$/.test(s)) { const [a, b] = s.split("/").map(Number); return b ? a / b : null; }
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : NUM_WORDS[t] ?? null;
};
const round = (m: Macros): Macros => ({ calories: Math.round(m.calories / 5) * 5, proteinG: Math.round(m.proteinG), carbsG: Math.round(m.carbsG), fatG: Math.round(m.fatG) });
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n === 0.5 ? "½" : String(Math.round(n * 10) / 10));

/** Adds up the foods it recognises in free text, at typical servings unless an amount is given. */
export function estimateFromFoods(text: string): { macros: Macros; parts: string[] } | null {
  let rest = ` ${norm(text)} `;
  const total: Macros = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 };
  const found: { at: number; label: string }[] = [];
  for (const { w, f } of PHRASES) {
    const re = new RegExp(`(?:(\\d+(?:\\.\\d+)?|\\d+/\\d+|[½¼¾]|a|an|one|two|three|four|five|six|half|couple)\\s*(?:of\\s+)?(g|grams?|oz|ounces?|cups?|slices?|tbsp|pieces?|servings?)?\\s+(?:of\\s+)?)?\\b${w.replace(/\s/g, "\\s")}\\b`, "g");
    rest = rest.replace(re, (_all: string, q: string | undefined, unit: string | undefined, at: number) => {
      const qty = q ? parseQty(q) ?? 1 : 1;
      const grams = unit && UNIT_G[unit] ? qty * UNIT_G[unit] : qty * f.grams;
      const p = PER100[f.key];
      total.calories += (p.kcal * grams) / 100;
      total.proteinG += (p.proteinG * grams) / 100;
      total.carbsG += (p.carbsG * grams) / 100;
      total.fatG += (p.fatG * grams) / 100;
      const amount = unit && UNIT_G[unit] ? `${fmt(qty)} ${unit === "grams" || unit === "gram" ? "g" : unit}`
        : f.each ? (f.unit === "slice" || f.unit === "pita" || f.unit === "cake" ? `${fmt(qty)} ${f.unit}${qty > 1 ? "s" : ""} of` : fmt(qty))
        : qty === 1 ? f.unit : `${fmt(qty)} × ${f.unit}`;
      found.push({ at, label: `${amount} ${w}`.replace(/ of (\S+)$/, " $1") });
      // Keep the text length the same so later matches report positions in the original order.
      return " ".repeat(_all.length);
    });
  }
  const parts = found.sort((a, b) => a.at - b.at).map((x) => x.label);
  return parts.length ? { macros: round(total), parts } : null;
}

const libraryFuse = new Fuse(MEALS, { keys: ["name"], threshold: 0.3, includeScore: true, ignoreLocation: true });
const toNum = (s: string) => (s.trim() === "" ? null : Number(s));

/** The best suggestion for a typed meal name, or null when there's nothing reasonable to suggest. */
export function estimateFood(name: string, past: PastMeal[] = []): FoodEstimate | null {
  const q = norm(name);
  if (q.length < 3) return null;
  // 1. Their own log: same name, with a calorie value recorded.
  const own = past.find((m) => norm(m.name) === q && toNum(m.calories) != null);
  if (own) {
    return { calories: toNum(own.calories)!, proteinG: toNum(own.proteinG) ?? 0, carbsG: toNum(own.carbsG) ?? 0, fatG: toNum(own.fatG) ?? 0, source: "history", basis: "your last entry with this name" };
  }
  // 2. A close match in the meal library (one serving).
  const hit = q.length >= 6 ? libraryFuse.search(q)[0] : undefined;
  if (hit && (hit.score ?? 1) < 0.2) {
    const m = hit.item;
    return { ...round({ calories: m.kcal, proteinG: m.proteinG, carbsG: m.carbsG, fatG: m.fatG }), source: "library", basis: `one serving of “${m.name}” (USDA-based recipe)` };
  }
  // 3. Recognised foods at typical servings.
  const foods = estimateFromFoods(name);
  if (foods) return { ...foods.macros, source: "foods", basis: `${foods.parts.join(", ")} (USDA values)` };
  return null;
}
