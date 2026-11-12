import "server-only";
import type { Food as FoodRow, PrismaClient } from "@prisma/client";
import type { ScopedDb } from "../db";
import { ALLERGENS, type Allergen } from "./calculations";
import { NutrientsSchema, type Food, type FoodData, type FoodSource, type Nutrients } from "./food";
import { OFF_FIELDS, parseOffProduct, type OffResult } from "./openFoodFacts";
import { parseBarcode } from "./barcode";
import { searchGeneric } from "./genericFoods";

// Product lookups with a shared cache. The only thing that leaves Thrivie is the barcode
// number, sent to Open Food Facts with no account details. Shared cache rows hold public
// product data only; a person's own foods live in private rows that only they can read.

const FRESH_FOUND_MS = 30 * 86_400_000; // product data is refreshed monthly
const FRESH_MISSING_MS = 3 * 86_400_000; // unknown barcodes are re-checked after a few days
const OFF_TIMEOUT_MS = 6000;

const list = (s: string) => s.split(",").filter((a): a is Allergen => (ALLERGENS as readonly string[]).includes(a));
function nutrients(json: string | null): Nutrients | null {
  if (!json) return null;
  try { const r = NutrientsSchema.safeParse(JSON.parse(json)); return r.success ? r.data : null; } catch { return null; }
}

export function toFood(row: FoodRow): Food {
  return {
    id: row.id, mine: row.userId !== null, source: row.source as FoodSource, barcode: row.barcode, name: row.name, brand: row.brand,
    servingSize: row.servingSize, servingGrams: row.servingGrams, perServing: nutrients(row.perServing), per100g: nutrients(row.per100g),
    allergens: list(row.allergens), traces: list(row.traces),
  };
}
const toRow = (f: FoodData) => ({
  source: f.source, barcode: f.barcode, name: f.name, brand: f.brand, servingSize: f.servingSize, servingGrams: f.servingGrams,
  perServing: f.perServing ? JSON.stringify(f.perServing) : null, per100g: f.per100g ? JSON.stringify(f.per100g) : null,
  allergens: f.allergens.join(","), traces: f.traces.join(","),
});

/** Open Food Facts asks every app to identify itself and give a way to be reached. */
const userAgent = () => `Thrivie/1.0 (${process.env.OFF_CONTACT || process.env.APP_URL || "https://github.com/MelanieJindali/Thrivie"})`;

/** Asks Open Food Facts about one barcode. Throws when the service can't be reached or is busy. */
export async function fetchOffProduct(barcode: string): Promise<OffResult> {
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}?fields=${OFF_FIELDS}`, {
    headers: { "User-Agent": userAgent(), Accept: "application/json" },
    signal: AbortSignal.timeout(OFF_TIMEOUT_MS),
    cache: "no-store",
  });
  if (res.status === 404) return { found: false };
  if (!res.ok) throw new Error(`Open Food Facts answered ${res.status}`);
  return parseOffProduct(await res.json(), barcode);
}

export type LookupResult =
  | { status: "found"; food: Food; cached: boolean }
  | { status: "not_found" }
  | { status: "unavailable" }; // couldn't reach Open Food Facts and nothing is cached

/**
 * Finds a product by its (already validated) barcode: the person's own food first, then the
 * shared cache, then Open Food Facts. `allowFetch` lets the caller apply rate limits.
 */
export async function lookupBarcode(
  db: ScopedDb, sys: PrismaClient, barcode: string,
  opts: { fetcher?: (barcode: string) => Promise<OffResult>; allowFetch?: () => Promise<boolean>; now?: Date } = {},
): Promise<LookupResult> {
  const own = await db.food.findFirst({ where: { barcode }, orderBy: { createdAt: "desc" } });
  if (own) return { status: "found", food: toFood(own), cached: true };

  const now = opts.now ?? new Date();
  const cached = await sys.food.findFirst({ where: { userId: null, barcode } });
  const age = cached ? now.getTime() - cached.fetchedAt.getTime() : Infinity;
  const fromCache = (): LookupResult => (cached?.found ? { status: "found", food: toFood(cached), cached: true } : cached ? { status: "not_found" } : { status: "unavailable" });
  if (cached && age < (cached.found ? FRESH_FOUND_MS : FRESH_MISSING_MS)) return fromCache();
  if (opts.allowFetch && !(await opts.allowFetch())) return fromCache();

  let result: OffResult;
  try {
    result = await (opts.fetcher ?? fetchOffProduct)(barcode);
  } catch {
    return fromCache(); // offline or busy: an older copy is better than nothing
  }
  const data = result.found
    ? { ...toRow(result.food), found: true, fetchedAt: now }
    : { source: "open_food_facts", barcode, name: "", found: false, fetchedAt: now, brand: null, servingSize: null, servingGrams: null, perServing: null, per100g: null, allergens: "", traces: "" };
  // Two people scanning the same new product at once must not create two rows.
  const saved = cached
    ? await sys.food.update({ where: { id: cached.id }, data })
    : await sys.food.create({ data }).catch(async () => (await sys.food.findFirst({ where: { userId: null, barcode } }))!);
  return saved.found ? { status: "found", food: toFood(saved), cached: false } : { status: "not_found" };
}

/** Asks Open Food Facts for products by name (strictly rate-limited by them: used only on request). */
export async function searchOffProducts(query: string): Promise<FoodData[]> {
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=12&fields=${OFF_FIELDS}`;
  const res = await fetch(url, { headers: { "User-Agent": userAgent(), Accept: "application/json" }, signal: AbortSignal.timeout(OFF_TIMEOUT_MS + 2000), cache: "no-store" });
  if (!res.ok) throw new Error(`Open Food Facts answered ${res.status}`);
  const body = (await res.json()) as { products?: unknown[] };
  const out: FoodData[] = [];
  for (const p of Array.isArray(body.products) ? body.products : []) {
    const parsed = parseBarcode(String((p as { code?: unknown })?.code ?? ""));
    if (!parsed.ok) continue;
    const r = parseOffProduct({ status: 1, product: p }, parsed.lookup);
    if (r.found) out.push(r.food);
  }
  return out;
}

/** Stores searched products in the shared cache (so they can be logged and found again) and returns them with ids. */
export async function cacheProducts(sys: PrismaClient, products: FoodData[]): Promise<Food[]> {
  const out: Food[] = [];
  for (const f of products) {
    if (!f.barcode) continue;
    const data = { ...toRow(f), found: true, fetchedAt: new Date() };
    const existing = await sys.food.findFirst({ where: { userId: null, barcode: f.barcode } });
    const row = existing ? (existing.found ? existing : await sys.food.update({ where: { id: existing.id }, data })) : await sys.food.create({ data }).catch(() => sys.food.findFirst({ where: { userId: null, barcode: f.barcode } }));
    if (row) out.push(toFood(row));
  }
  return out;
}

export type FoodSearchResult = { favorites: Food[]; recents: Food[]; results: Food[] };

/**
 * Local food search: favorites and recently logged foods first, then the person's own foods,
 * generic foods and cached products whose name matches. No outside requests.
 */
export async function searchFoods(db: ScopedDb, sys: PrismaClient, query: string, since: string): Promise<FoodSearchResult> {
  const q = query.trim().toLowerCase().slice(0, 80);
  const [favRows, recentMeals, own] = await Promise.all([
    db.favoriteFood.findMany({ include: { food: true }, orderBy: { createdAt: "desc" }, take: 30 }),
    db.meal.findMany({ where: { foodId: { not: null }, date: { gte: since } }, include: { food: true }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 80 }),
    db.food.findMany({ orderBy: { createdAt: "desc" }, take: 300 }), // names are encrypted, so they're matched here after decryption
  ]);
  // Favorites and recents may point at shared products, whose names are stored as plain text and read back unchanged.
  const visible = (f: FoodRow | null): f is FoodRow => !!f && f.found;
  const match = (f: Food) => !q || f.name.toLowerCase().includes(q) || (f.brand ?? "").toLowerCase().includes(q);
  const favorites = favRows.map((r) => r.food).filter(visible).map(toFood).filter(match);
  const seen = new Set(favorites.map((f) => f.id));
  const recents: Food[] = [];
  for (const m of recentMeals) {
    if (!visible(m.food) || seen.has(m.food.id)) continue;
    seen.add(m.food.id);
    const f = toFood(m.food);
    if (match(f)) recents.push(f);
    if (recents.length >= 12) break;
  }
  const results: Food[] = [];
  if (q.length >= 2) {
    const add = (f: Food) => { if (!seen.has(f.id) && results.length < 30) { seen.add(f.id); results.push(f); } };
    own.map(toFood).filter(match).forEach(add);
    searchGeneric(q).forEach(add);
    const cached = await sys.food.findMany({ where: { userId: null, found: true, source: "open_food_facts", OR: [{ name: { contains: q, mode: "insensitive" } }, { brand: { contains: q, mode: "insensitive" } }] }, orderBy: { fetchedAt: "desc" }, take: 15 });
    cached.map(toFood).forEach(add);
  }
  return { favorites, recents, results };
}
