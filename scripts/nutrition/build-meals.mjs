// Builds src/data/meals.json from the ingredient and meal sources using USDA
// FoodData Central SR Legacy values (public domain, no API key):
//   curl -LO https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip && unzip it
//   node scripts/nutrition/build-meals.mjs path/to/FoodData_Central_sr_legacy_food_csv_2018-04
// Per-100 g values are written to src/data/ingredients.json so the numbers stay traceable to their FDC ids.
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const DIR = process.argv[2];
if (!DIR) throw new Error("Pass the unzipped SR Legacy CSV folder.");
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const data = (f) => path.join(ROOT, "src/data", f);
const src = JSON.parse(fs.readFileSync(data("ingredients.source.json"), "utf8")).items;
const meals = JSON.parse(fs.readFileSync(data("meals.source.json"), "utf8")).meals;

const NUTRIENTS = { 1008: "kcal", 1003: "proteinG", 1005: "carbsG", 1004: "fatG" };
const wanted = new Set(src.map((i) => String(i.fdcId)));

function parseCsvLine(line) {
  const out = []; let cur = ""; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === ",") { out.push(cur); cur = ""; } else cur += c;
  }
  out.push(cur);
  return out;
}

async function readCsv(file, onRow) {
  const rl = readline.createInterface({ input: fs.createReadStream(path.join(DIR, file)) });
  let header = null;
  for await (const line of rl) {
    const cols = parseCsvLine(line);
    if (!header) { header = cols; continue; }
    onRow(Object.fromEntries(header.map((h, i) => [h, cols[i]])));
  }
}

const descriptions = {};
await readCsv("food.csv", (r) => { if (wanted.has(r.fdc_id)) descriptions[r.fdc_id] = r.description; });
const per100 = {};
await readCsv("food_nutrient.csv", (r) => {
  const key = NUTRIENTS[r.nutrient_id];
  if (key && wanted.has(r.fdc_id)) (per100[r.fdc_id] ??= {})[key] = Number(r.amount);
});

const ingredients = {};
for (const i of src) {
  const n = per100[String(i.fdcId)];
  if (!n || [n.kcal, n.proteinG, n.carbsG, n.fatG].some((v) => !Number.isFinite(v))) throw new Error(`Missing USDA values for ${i.key} (${i.fdcId})`);
  ingredients[i.key] = { fdcId: i.fdcId, usdaDescription: descriptions[String(i.fdcId)], per100g: n, allergens: i.allergens, animal: i.animal };
}

// Most restrictive diet the meal fits.
function dietOf(animals) {
  if (animals.has("meat")) return "omnivore";
  if (animals.has("fish") || animals.has("shellfish")) return "pescatarian";
  if (animals.size) return "vegetarian";
  return "vegan";
}

const r1 = (v) => Math.round(v * 10) / 10;
const out = meals.map((m) => {
  const totals = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
  const allergens = new Set(); const animals = new Set();
  for (const [key, grams] of m.ingredients) {
    const ing = ingredients[key];
    if (!ing) throw new Error(`${m.id}: unknown ingredient ${key}`);
    for (const k of Object.keys(totals)) totals[k] += (ing.per100g[k] * grams) / 100;
    ing.allergens.forEach((a) => allergens.add(a));
    if (ing.animal) animals.add(ing.animal);
  }
  return {
    id: m.id, name: m.name, slot: m.slot,
    kcal: Math.round(totals.kcal), proteinG: r1(totals.proteinG), carbsG: r1(totals.carbsG), fatG: r1(totals.fatG),
    diet: dietOf(animals), allergens: [...allergens].sort(),
    ingredients: m.ingredients.map(([key, grams, label]) => ({ key, grams, label })),
  };
});

fs.writeFileSync(data("ingredients.json"), JSON.stringify({ source: "USDA FoodData Central, SR Legacy (April 2018), public domain", ingredients }, null, 1) + "\n");
fs.writeFileSync(data("meals.json"), JSON.stringify({ source: "Calculated from USDA FoodData Central SR Legacy values for each ingredient", meals: out }, null, 1) + "\n");
console.log(`${out.length} meals from ${src.length} ingredients`);
for (const m of out) console.log(`${m.slot.padEnd(9)} ${String(m.kcal).padStart(4)} kcal  P${String(Math.round(m.proteinG)).padStart(3)} C${String(Math.round(m.carbsG)).padStart(3)} F${String(Math.round(m.fatG)).padStart(3)}  ${m.diet.padEnd(11)} ${m.allergens.join(",").padEnd(22)} ${m.name}`);
