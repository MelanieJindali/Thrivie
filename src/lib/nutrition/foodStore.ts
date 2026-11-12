import "server-only";
import type { Food as FoodRow, PrismaClient } from "@prisma/client";
import type { ScopedDb } from "../db";
import { ALLERGENS, type Allergen } from "./calculations";
import { NutrientsSchema, type Food, type FoodData, type FoodSource, type Nutrients } from "./food";
import { OFF_FIELDS, parseOffProduct, type OffResult } from "./openFoodFacts";

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
