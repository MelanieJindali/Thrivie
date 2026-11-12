// Reads the text of a Nutrition Facts label (as produced by on-device OCR) into numbers.
// Rules only, no network. Handles US labels (per serving, % Daily Value) and EU tables
// (per 100 g, optionally per serving) in English, German, French, Spanish and Italian,
// plus common OCR slips: "O" for 0, "l" for 1, a trailing "g" read as "9", commas as decimals.
import type { Allergen } from "./calculations";
import { NUTRIENT_LIMITS, caloriesConsistent, caloriesFromMacros, type NutrientKey, type Nutrients } from "./food";

export type LabelRead = {
  layout: "us" | "eu" | "unknown";
  servingSize: string | null;
  servingGrams: number | null;
  servingsPerContainer: number | null;
  perServing: Nutrients | null;
  per100g: Nutrients | null;
  allergens: Allergen[];
  traces: Allergen[];
  /** Fields the reader is less sure about (shown highlighted for a quick look). */
  unsure: NutrientKey[];
};

type Rule = { key: NutrientKey | "salt"; re: RegExp; unit: "g" | "mg" | "kcal" };
// Order matters: the more specific names come first ("added sugars" before "sugars", "saturated" before "fat").
const RULES: Rule[] = [
  { key: "addedSugarsG", re: /added sugars?|zugesetzter? zucker|sucres ajout[ée]s|az[uú]cares a[ñn]adidos/, unit: "g" },
  { key: "satFatG", re: /saturate[ds]?( fat)?|sat\.? ?fat|ges[aä]ttigte|satur[ée]s|saturad[ao]s|saturi/, unit: "g" },
  { key: "transFatG", re: /trans/, unit: "g" },
  { key: "cholesterolMg", re: /cholest|colest/, unit: "mg" },
  { key: "sodiumMg", re: /sodium|natrium|sodio/, unit: "mg" },
  { key: "salt", re: /\bsalt\b|\bsalz\b|\bsel\b|\bsal\b|\bsale\b/, unit: "g" },
  { key: "fiberG", re: /fib(er|re)s?|ballaststoffe|fibra/, unit: "g" },
  { key: "sugarsG", re: /sugars?|zucker|sucres|az[uú]cares|zuccheri/, unit: "g" },
  { key: "carbsG", re: /carb|kohlenhydrate|glucides|hidratos|carboidrati/, unit: "g" },
  { key: "proteinG", re: /prote[iíï]n|eiwei[sß]|prot[ée]ines|proteine/, unit: "g" },
  { key: "fatG", re: /\bfat\b|\bfett\b|mati[èe]res grasses|lipides|grasas|grassi/, unit: "g" },
  { key: "calories", re: /calories|energy|energie|[ée]nergie|energ[ií]a|kcal|brennwert|valor energ/, unit: "kcal" },
];

const ALLERGEN_WORDS: [RegExp, Allergen][] = [
  [/shellfish|crustacean|shrimp|prawn|crab|lobster|mollus[ck]|oyster|clam|mussel|krebstiere|crustac[ée]s/, "shellfish"],
  [/milk|dairy|lactose|whey|casein|butter|cream|cheese|milch|lait/, "dairy"],
  [/wheat|gluten|barley|rye|\boats?\b|spelt|weizen|bl[ée](?![a-z])/, "gluten"],
  [/soy|soja/, "soy"],
  [/egg|eier|\boeufs?\b|œuf/, "eggs"],
  [/peanut|almond|hazelnut|walnut|cashew|pecan|pistachio|macadamia|brazil nut|tree nut|\bnuts?\b|n[uü]sse|noisette|fruits [àa] coque|erdn[uü]sse|arachide/, "nuts"],
  [/\bfish\b|anchov|salmon|tuna|\bcod\b|fisch|poisson/, "fish"],
];

/** Fixes the OCR slips that matter for numbers, keeping line structure. */
export function cleanOcr(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/[|¦]/g, " ")
    .replace(/(\d),(\d)/g, "$1.$2") // decimal comma
    .replace(/(?<=\d)[oO](?=\d|\s|g\b|mg\b|%|$)/gm, "0").replace(/(?<=\s|^)[oO](?=\s?(g|mg|%)\b)/gm, "0").replace(/(?<=\s)[oO](?=\d)/g, "0")
    .replace(/(?<=\d)[lI](?=\d|\s|g\b|mg\b|$)/gm, "1").replace(/(?<=\s)[lI](?=\d)/g, "1").replace(/(?<=\s)[lI](?=\s?(g|mg)\b)/g, "1")
    .replace(/(\d)\s?[qQ]\b/g, "$1g") // "8q" for "8g"
    .replace(/(\d)\s?rng\b/gi, "$1mg")
    .replace(/[ \t]+/g, " ");
}

const allergensIn = (s: string) => [...new Set(ALLERGEN_WORDS.filter(([re]) => re.test(s)).map(([, a]) => a))];

type Amount = { value: number; unit: string | null; raw: string };
/** Numbers on a line that are amounts (not "% daily value" figures). */
function amounts(line: string): Amount[] {
  const out: Amount[] = [];
  for (const m of line.matchAll(/(<\s*)?(\d+(?:\.\d+)?)\s*(kcal|kj|cal\b|mcg|µg|mg|g\b|ml\b|%)?/gi)) {
    const unit = m[3]?.toLowerCase() ?? null;
    if (unit === "%") continue;
    out.push({ value: Number(m[2]), unit: unit === "cal" ? "kcal" : unit, raw: m[2] });
  }
  return out;
}

function toValue(rule: Rule, a: Amount, unsure: () => void): number | null {
  let v = a.value;
  if (rule.unit === "kcal") {
    if (a.unit === "kj") v = v / 4.184;
    return Math.round(v);
  }
  if (a.unit === "mcg" || a.unit === "µg" || a.unit === "ml") return null;
  if (a.unit == null) {
    // No unit read. A gram amount whose "g" was read as "9" looks like 89 for 8g, or 2.59 for 2.5g.
    if (rule.unit === "g" && /9$/.test(a.raw) && a.raw.replace(".", "").length >= 2) { v = Number(a.raw.slice(0, -1).replace(/\.$/, "")); unsure(); }
    else if (rule.unit === "g") unsure();
  } else if (rule.unit === "mg" && a.unit === "g") v = v * 1000;
  else if (rule.unit === "g" && a.unit === "mg") v = v / 1000;
  // Salt is kept precise: it's converted to sodium afterwards, where small amounts matter.
  return rule.unit === "mg" ? Math.round(v) : rule.key === "salt" ? Math.round(v * 1000) / 1000 : Math.round(v * 10) / 10;
}

/** Parses label text. Never throws; anything it can't read is simply left out. */
export function parseLabel(input: string): LabelRead {
  const text = cleanOcr(input);
  const lower = text.toLowerCase();
  const lines = lower.split("\n").map((l) => l.trim()).filter(Boolean);
  const hasPer100 = /(per|pro|pour|por|je|par)\s*100\s?(g|ml)|\b100\s?(g|ml)\b/.test(lower);
  const usMarks = /nutrition facts|serving size|daily value|servings? per container|amount per serving/.test(lower);
  const layout: LabelRead["layout"] = hasPer100 && !usMarks ? "eu" : usMarks ? "us" : hasPer100 ? "eu" : "unknown";

  // EU tables may have two number columns. Find which comes first from the header line.
  const header = lines.find((l) => /100\s?(g|ml)/.test(l) && /(serving|portion|porci[oó]n|porzione)/.test(l));
  const servingFirst = !!header && header.search(/serving|portion|porci[oó]n|porzione/) < header.search(/100\s?(g|ml)/);
  const twoColumns = layout === "eu" && !!header;

  const a: Nutrients = {}; // first column (US: per serving; EU: per 100 g unless the header says otherwise)
  const b: Nutrients = {}; // second column, when there is one
  const unsure = new Set<NutrientKey>();
  let saltA: number | null = null, saltB: number | null = null;

  for (const rawLine of lines) {
    // "Calories from fat 110" isn't total calories or fat: drop that part and keep the rest of the line.
    const line = rawLine.replace(/calories from fat\s*\d*/g, " ");
    const rule = RULES.find((r) => r.re.test(line));
    if (!rule) continue;
    // US labels put the amount first for added sugars ("Includes 10g Added Sugars").
    const after = rule.key === "addedSugarsG" ? line : line.slice(line.search(rule.re));
    let nums = amounts(after);
    if (rule.unit === "kcal") {
      const kcal = nums.filter((n) => n.unit === "kcal");
      const kj = nums.filter((n) => n.unit === "kj");
      nums = kcal.length ? kcal : kj.length ? kj : nums.filter((n) => n.unit == null);
    } else nums = nums.filter((n) => n.unit !== "kcal" && n.unit !== "kj");
    if (!nums.length) continue;
    const key = rule.key;
    const put = (target: Nutrients, amt: Amount, isA: boolean) => {
      const v = toValue(rule, amt, () => key !== "salt" && unsure.add(key));
      if (v == null) return;
      if (key === "salt") { if (isA) saltA ??= v; else saltB ??= v; return; }
      if (v > NUTRIENT_LIMITS[key]) { unsure.add(key); return; }
      if (target[key] == null) target[key] = v;
    };
    put(a, nums[0], true);
    if (twoColumns && nums[1]) put(b, nums[1], false);
  }
  if (a.sodiumMg == null && saltA != null) a.sodiumMg = Math.round((saltA / 2.5) * 1000);
  if (b.sodiumMg == null && saltB != null) b.sodiumMg = Math.round((saltB / 2.5) * 1000);

  // Serving size and count.
  const sizeLine = lines.find((l) => /serving size|portion(sgr[oö][sß]e)?\b|taille de la portion|tama[ñn]o de (la )?porci[oó]n|per serving \(/.test(l) && /\d/.test(l));
  let servingSize: string | null = null, servingGrams: number | null = null;
  if (sizeLine) {
    const rest = sizeLine.replace(/^.*?(serving size|portionsgr[oö][sß]e|taille de la portion|tama[ñn]o de (la )?porci[oó]n|portion|per serving)\s*[:(]?\s*/, "").replace(/\)\s*$/, "").trim();
    servingSize = rest.slice(0, 60) || null;
    const g = rest.match(/(\d+(?:\.\d+)?)\s?(g|ml)\b/);
    if (g) servingGrams = Number(g[1]);
  }
  const perCont = lower.match(/(?:about |approx\.? )?(\d+(?:\.\d+)?)\s+servings? per (?:container|package|pack)/) ?? lower.match(/servings? per (?:container|package|pack)[:\s]+(?:about |approx\.? )?(\d+(?:\.\d+)?)/);
  const servingsPerContainer = perCont ? Number(perCont[1]) : null;

  // Allergens: "may contain" first, so those words aren't also counted as definite.
  const may = [...lower.matchAll(/may contain(?: traces of)?[:\s]+([^.\n]+)|kann spuren von ([^.\n]+)|peut contenir[:\s]+([^.\n]+)|traces?( [ée]ventuelles)? de ([^.\n]+)/g)].map((m) => m[1] ?? m[2] ?? m[3] ?? m[5] ?? "").join(" ");
  const definite = [...lower.replace(/may contain[^.\n]*/g, " ").matchAll(/(?:contains|enth[aä]lt|contient|contiene)[:\s]+([^.\n]+)|allergens?[:\s]+([^.\n]+)/g)].map((m) => m[1] ?? m[2]).join(" ");
  const allergens = allergensIn(definite);
  const traces = allergensIn(may).filter((x) => !allergens.includes(x));

  const has = (n: Nutrients) => Object.keys(n).length > 0;
  let perServing: Nutrients | null, per100g: Nutrients | null;
  if (layout === "eu") {
    per100g = has(servingFirst ? b : a) ? (servingFirst ? b : a) : null;
    perServing = has(servingFirst ? a : b) ? (servingFirst ? a : b) : null;
    // A lone column under a "per serving" header with no per-100 header is per serving.
    if (!twoColumns && !hasPer100) { perServing = per100g; per100g = null; }
  } else {
    perServing = has(a) ? a : null;
    per100g = null;
  }
  // A label whose calories and macros clearly disagree gets its calories marked for a look.
  for (const n of [perServing, per100g]) if (n && caloriesConsistent(n) === false) unsure.add("calories");
  return { layout, servingSize, servingGrams, servingsPerContainer, perServing, per100g, allergens, traces, unsure: [...unsure] };
}

export type LabelIssue = { field: NutrientKey; message: string; fix?: { label: string; value: number } };

/** Background checks on a set of label values: calories against macros, and parts against their totals. */
export function labelIssues(n: Nutrients): LabelIssue[] {
  const out: LabelIssue[] = [];
  if (caloriesConsistent(n) === false) {
    const calc = Math.round(caloriesFromMacros(n) / 5) * 5;
    out.push({ field: "calories", message: `Calories don't quite match the protein, carbs and fat (those add up to about ${calc}).`, fix: { label: `Use ${calc}`, value: calc } });
  }
  const part = (p: NutrientKey, whole: NutrientKey, pl: string, wl: string) => {
    if (n[p] != null && n[whole] != null && n[p]! > n[whole]! + 0.5) out.push({ field: p, message: `${pl} is higher than ${wl}, so one of them may be misread.`, fix: { label: `Use ${n[whole]}`, value: n[whole]! } });
  };
  part("satFatG", "fatG", "Saturated fat", "total fat");
  part("sugarsG", "carbsG", "Sugars", "total carbs");
  part("fiberG", "carbsG", "Fiber", "total carbs");
  part("addedSugarsG", "sugarsG", "Added sugars", "total sugars");
  if (n.calories != null && n.calories > 1500) out.push({ field: "calories", message: "That's a lot of calories for one serving. Check the number." });
  return out;
}
