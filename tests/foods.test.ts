import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { disconnect, scopedDb, systemDb } from "@/lib/db";
import { checkDigit, parseBarcode, upceToUpca } from "@/lib/nutrition/barcode";
import { allergenMatches, caloriesConsistent, nutrientsFor, scale, servingsFromGrams, type FoodData } from "@/lib/nutrition/food";
import { parseOffProduct } from "@/lib/nutrition/openFoodFacts";
import { lookupBarcode } from "@/lib/nutrition/foodStore";
import { exportAll } from "@/lib/backup";

// Food scanner, step 1: barcodes, Open Food Facts parsing, serving maths, the shared product
// cache, and proof that one person's foods and favorites are invisible to another. Synthetic data only.

describe("barcodes", () => {
  it("accepts EAN-13, UPC-A, EAN-8 and UPC-E with correct check digits", () => {
    expect(parseBarcode("3017620422003")).toMatchObject({ ok: true, format: "ean13", lookup: "3017620422003" });
    expect(parseBarcode("036000291452")).toMatchObject({ ok: true, format: "upca", lookup: "0036000291452" });
    expect(parseBarcode("96385074")).toMatchObject({ ok: true, format: "ean8", lookup: "96385074" });
    expect(parseBarcode("04252614", "upce")).toMatchObject({ ok: true, format: "upce", lookup: "0042100005264" });
  });
  it("ignores spaces and dashes", () => {
    expect(parseBarcode(" 3 017620-422003 ")).toMatchObject({ ok: true, lookup: "3017620422003" });
  });
  it("rejects a wrong check digit, letters and odd lengths with a plain message", () => {
    for (const bad of ["3017620422004", "036000291453", "96385075", "12345", "30176204220031", "abc", ""]) {
      const r = parseBarcode(bad);
      expect(r.ok, bad).toBe(false);
      if (!r.ok) expect(r.error.length).toBeGreaterThan(10);
    }
  });
  it("computes check digits and expands every UPC-E pattern", () => {
    expect(checkDigit("301762042200")).toBe(3);
    expect(checkDigit("03600029145")).toBe(2);
    expect(upceToUpca("04252614")).toBe("042100005264");
    expect(upceToUpca("01234531")?.slice(0, 11)).toBe("01230000045"); // last digit 3: three manufacturer digits
    expect(upceToUpca("01234541")?.slice(0, 11)).toBe("01234000005"); // last digit 4: four manufacturer digits
    expect(upceToUpca("01234581")?.slice(0, 11)).toBe("01234500008"); // 5–9: five manufacturer digits
    expect(upceToUpca("91234567")).toBeNull(); // UPC-E starts with 0 or 1
  });
});

const off = (product: Record<string, unknown>, status: unknown = 1) => ({ status, product });
const NUTELLA = off({
  code: "3017620422003", product_name: "Nutella", brands: "Ferrero, Nutella", serving_size: "15 g", serving_quantity: 15, serving_quantity_unit: "g",
  allergens_tags: ["en:milk", "en:nuts", "en:soybeans"], traces_tags: ["en:gluten", "en:milk"],
  nutriments: {
    "energy-kcal_100g": 539, "energy-kcal_serving": 80.9, proteins_100g: 6.3, proteins_serving: 0.945, carbohydrates_100g: 57.5, carbohydrates_serving: 8.63,
    fat_100g: 30.9, fat_serving: 4.64, "saturated-fat_100g": 10.6, sugars_100g: 56.3, fiber_100g: 0, salt_100g: 0.107, sodium_100g: 0.0428,
  },
});

describe("Open Food Facts responses", () => {
  it("reads a complete product", () => {
    const r = parseOffProduct(NUTELLA, "3017620422003");
    expect(r.found).toBe(true);
    if (!r.found) return;
    expect(r.food).toMatchObject({ source: "open_food_facts", barcode: "3017620422003", name: "Nutella", brand: "Ferrero", servingSize: "15 g", servingGrams: 15 });
    expect(r.food.per100g).toMatchObject({ calories: 539, proteinG: 6.3, carbsG: 57.5, fatG: 30.9, satFatG: 10.6, sugarsG: 56.3, fiberG: 0, sodiumMg: 43 });
    expect(r.food.perServing).toMatchObject({ calories: 81, proteinG: 0.9, fatG: 4.6 });
    expect(r.food.allergens.sort()).toEqual(["dairy", "nuts", "soy"]);
    expect(r.food.traces).toEqual(["gluten"]); // milk is already a definite allergen
  });
  it("converts kilojoules, salt, and numbers given as text", () => {
    const r = parseOffProduct(off({ product_name: " Müsli  Classic ", nutriments: { energy_100g: "1548", energy_unit: "kJ", proteins_100g: "10,5", carbohydrates_100g: "60", fat_100g: "7", salt_100g: "0.25" } }), "4000000000006");
    expect(r.found && r.food.name).toBe("Müsli Classic");
    expect(r.found && r.food.per100g).toMatchObject({ calories: 370, proteinG: 10.5, sodiumMg: 100 });
    expect(r.found && r.food.perServing).toBeNull();
    expect(r.found && r.food.brand).toBeNull();
  });
  it("falls back to other name fields and ignores a non-gram serving quantity", () => {
    const r = parseOffProduct(off({ product_name: "", product_name_en: "Oat drink", serving_size: "1 glass", serving_quantity: "abc", nutriments: { "energy-kcal_100g": 46 } }), "7394376616037");
    expect(r.found && r.food).toMatchObject({ name: "Oat drink", servingSize: "1 glass", servingGrams: null });
  });
  it("drops impossible values instead of saving them", () => {
    const r = parseOffProduct(off({ product_name: "Odd", nutriments: { "energy-kcal_100g": 99999, proteins_100g: -4, fat_100g: 12, carbohydrates_100g: "n/a" } }), "1");
    expect(r.found && r.food.per100g).toEqual({ fatG: 12 });
  });
  it("treats unknown, empty and malformed responses as not found", () => {
    for (const body of [null, undefined, "nope", 42, [], {}, { status: 0, status_verbose: "product not found" }, { status: 1 }, { status: 1, product: "x" },
      off({ product_name: "No nutrition here", nutriments: {} }), off({ product_name: "Only added sugars", nutriments: { "added-sugars_100g": 30.1 } }), off({ nutriments: { "energy-kcal_100g": 50 } }), off({ product_name: "Old", nutriments: { fat_100g: 1 } }, 0)]) {
      expect(parseOffProduct(body, "1").found, JSON.stringify(body)).toBe(false);
    }
  });
  it("accepts the newer 'success' status", () => {
    expect(parseOffProduct(off({ product_name: "Water", nutriments: { "energy-kcal_100g": 0 } }, "success"), "1").found).toBe(true);
  });
});

const food = (over: Partial<FoodData>): FoodData => ({ source: "custom", barcode: null, name: "Test", brand: null, servingSize: null, servingGrams: null, perServing: null, per100g: null, allergens: [], traces: [], ...over });

describe("servings, grams and checks", () => {
  const yogurt = food({ servingGrams: 150, perServing: { calories: 120, proteinG: 15, carbsG: 9, fatG: 3 }, per100g: { calories: 80, proteinG: 10, carbsG: 6, fatG: 2 } });
  it("scales by servings and by grams", () => {
    expect(nutrientsFor(yogurt, { servings: 2 })).toEqual({ calories: 240, proteinG: 30, carbsG: 18, fatG: 6 });
    expect(nutrientsFor(yogurt, { servings: 0.5 })).toMatchObject({ calories: 60, proteinG: 7.5 });
    expect(nutrientsFor(yogurt, { grams: 250 })).toEqual({ calories: 200, proteinG: 25, carbsG: 15, fatG: 5 });
    expect(servingsFromGrams(yogurt, 225)).toBe(1.5);
  });
  it("works from whichever data the food has", () => {
    const only100 = food({ per100g: { calories: 400 }, servingGrams: 30 });
    expect(nutrientsFor(only100, { servings: 1 })).toEqual({ calories: 120 });
    expect(nutrientsFor(food({ per100g: { calories: 400 } }), { servings: 1 })).toEqual({ calories: 400 }); // 100 g stands in for a serving
    const onlyServing = food({ perServing: { calories: 90 }, servingGrams: 30 });
    expect(nutrientsFor(onlyServing, { grams: 60 })).toEqual({ calories: 180 });
    expect(nutrientsFor(food({ perServing: { calories: 90 } }), { grams: 60 })).toBeNull(); // no weight to convert with
    expect(nutrientsFor(yogurt, { servings: 0 })).toBeNull();
    expect(servingsFromGrams(food({}), 50)).toBeNull();
  });
  it("rounds calories to whole numbers and grams to one decimal", () => {
    expect(scale({ calories: 101, proteinG: 3.33, sodiumMg: 151 }, 1.5)).toEqual({ calories: 152, proteinG: 5, sodiumMg: 227 });
  });
  it("checks that calories roughly match the macros", () => {
    expect(caloriesConsistent({ calories: 250, proteinG: 10, carbsG: 30, fatG: 10 })).toBe(true); // 250
    expect(caloriesConsistent({ calories: 200, proteinG: 10, carbsG: 30, fatG: 10 })).toBe(true); // fibre and rounding
    expect(caloriesConsistent({ calories: 25, proteinG: 10, carbsG: 30, fatG: 10 })).toBe(false); // a dropped digit
    expect(caloriesConsistent({ calories: 2500, proteinG: 10, carbsG: 30, fatG: 10 })).toBe(false);
    expect(caloriesConsistent({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0 })).toBe(true);
    expect(caloriesConsistent({ calories: 100, proteinG: 5 })).toBeNull(); // not enough to judge
  });
  it("matches allergens against a person's list, definite ones first", () => {
    const f = food({ allergens: ["dairy", "nuts"], traces: ["gluten", "nuts", "soy"] });
    expect(allergenMatches(f, ["nuts", "gluten", "fish"])).toEqual({ contains: ["nuts"], mayContain: ["gluten"] });
    expect(allergenMatches(f, [])).toEqual({ contains: [], mayContain: [] });
  });
});

describe("product cache and privacy (Postgres + row-level security)", () => {
  const sys = systemDb();
  const url = process.env.POSTGRES_PRISMA_URL!;
  let alice: string, bob: string, raw: Client;
  const BARCODE = "3017620422003";
  const product = (): Promise<ReturnType<typeof parseOffProduct>> => Promise.resolve(parseOffProduct(NUTELLA, BARCODE));

  async function asUser(userId: string, sql: string, params: unknown[] = []) {
    await raw.query("BEGIN");
    try {
      await raw.query("SELECT set_config('app.user_id', $1, true), set_config('app.system', 'off', true), set_config('role', 'thrivie_rls', true)", [userId]);
      const r = await raw.query(sql, params);
      await raw.query("COMMIT");
      return r;
    } catch (e) { await raw.query("ROLLBACK"); throw e; }
  }

  beforeAll(async () => {
    raw = new Client({ connectionString: url });
    await raw.connect();
    alice = (await sys.user.create({ data: { email: "alice@foods.test", passwordHash: "x" } })).id;
    bob = (await sys.user.create({ data: { email: "bob@foods.test", passwordHash: "x" } })).id;
  });
  afterAll(async () => {
    await sys.user.deleteMany({ where: { email: { endsWith: "@foods.test" } } });
    await sys.food.deleteMany({ where: { userId: null } });
    await raw.end();
    await disconnect();
  });

  it("asks Open Food Facts once, then answers from the cache for everyone", async () => {
    let calls = 0;
    const fetcher = () => { calls++; return product(); };
    const first = await lookupBarcode(scopedDb(alice), sys, BARCODE, { fetcher });
    expect(first).toMatchObject({ status: "found", cached: false, food: { name: "Nutella", mine: false } });
    const again = await lookupBarcode(scopedDb(bob), sys, BARCODE, { fetcher });
    expect(again).toMatchObject({ status: "found", cached: true, food: { name: "Nutella" } });
    expect(calls).toBe(1);
    expect(await sys.food.count({ where: { userId: null, barcode: BARCODE } })).toBe(1);
  });

  it("still answers from the cache when Open Food Facts is unreachable, and refreshes stale data when it's back", async () => {
    const later = new Date(Date.now() + 40 * 86_400_000);
    const down = () => Promise.reject(new Error("offline"));
    expect(await lookupBarcode(scopedDb(alice), sys, BARCODE, { fetcher: down, now: later })).toMatchObject({ status: "found", cached: true });
    let calls = 0;
    const r = await lookupBarcode(scopedDb(alice), sys, BARCODE, { fetcher: () => { calls++; return product(); }, now: later });
    expect(r).toMatchObject({ status: "found", cached: false });
    expect(calls).toBe(1);
    expect(await sys.food.count({ where: { userId: null, barcode: BARCODE } })).toBe(1); // updated in place
  });

  it("remembers unknown barcodes briefly, and says so when nothing is known and the service is down", async () => {
    let calls = 0;
    const missing = () => { calls++; return Promise.resolve({ found: false } as const); };
    expect(await lookupBarcode(scopedDb(alice), sys, "96385074", { fetcher: missing })).toEqual({ status: "not_found" });
    expect(await lookupBarcode(scopedDb(bob), sys, "96385074", { fetcher: missing })).toEqual({ status: "not_found" });
    expect(calls).toBe(1);
    expect(await lookupBarcode(scopedDb(alice), sys, "0036000291452", { fetcher: () => Promise.reject(new Error("offline")) })).toEqual({ status: "unavailable" });
    expect(await lookupBarcode(scopedDb(alice), sys, "0036000291452", { fetcher: missing, allowFetch: async () => false })).toEqual({ status: "unavailable" }); // rate limited
    expect(calls).toBe(1);
  });

  it("a person's own food for a barcode wins, and only for them", async () => {
    const a = scopedDb(alice);
    await a.food.create({ data: { userId: alice, source: "custom", barcode: BARCODE, name: "Alice's hazelnut spread", perServing: JSON.stringify({ calories: 99 }) } });
    const never = () => Promise.reject(new Error("should not be called"));
    expect(await lookupBarcode(a, sys, BARCODE, { fetcher: never })).toMatchObject({ status: "found", food: { name: "Alice's hazelnut spread", mine: true, perServing: { calories: 99 } } });
    expect(await lookupBarcode(scopedDb(bob), sys, BARCODE, { fetcher: never })).toMatchObject({ status: "found", food: { name: "Nutella", mine: false } });
  });

  it("custom foods are encrypted at rest and invisible to other people, at the app layer and in the database", async () => {
    const stored = await raw.query(`SELECT name FROM "Food" WHERE "userId" = $1`, [alice]);
    expect(stored.rows[0].name).not.toContain("hazelnut");
    expect(await scopedDb(bob).food.findMany()).toEqual([]);
    expect((await scopedDb(alice).food.findMany()).map((f) => f.name)).toEqual(["Alice's hazelnut spread"]);
    // Straight SQL as Bob, skipping every application check: Alice's food isn't there, the shared product is.
    const bobSees = await asUser(bob, `SELECT "userId", source FROM "Food"`);
    expect(bobSees.rows.every((r) => r.userId === null)).toBe(true);
    expect(bobSees.rows.length).toBeGreaterThan(0);
    expect((await asUser(bob, `UPDATE "Food" SET name = 'hacked' WHERE "userId" = $1`, [alice])).rowCount).toBe(0);
    expect((await asUser(bob, `DELETE FROM "Food" WHERE "userId" = $1`, [alice])).rowCount).toBe(0);
  });

  it("people can't write or change shared product data, or create foods for someone else", async () => {
    expect((await asUser(bob, `UPDATE "Food" SET name = 'hacked' WHERE "userId" IS NULL`)).rowCount).toBe(0);
    await expect(asUser(bob, `INSERT INTO "Food"(id, source, name) VALUES ('x1', 'open_food_facts', 'fake product')`)).rejects.toThrow(/row-level security/);
    await expect(asUser(bob, `INSERT INTO "Food"(id, "userId", source, name) VALUES ('x2', $1, 'custom', 'planted')`, [alice])).rejects.toThrow(/row-level security/);
    expect((await sys.food.findFirstOrThrow({ where: { userId: null, barcode: BARCODE } })).name).toBe("Nutella");
  });

  it("favorites and meal entries that reference foods stay private", async () => {
    const shared = await sys.food.findFirstOrThrow({ where: { userId: null, barcode: BARCODE } });
    await scopedDb(alice).favoriteFood.create({ data: { userId: alice, foodId: shared.id } });
    await scopedDb(alice).meal.create({ data: { userId: alice, date: "2026-11-11", slot: "snack", name: "Nutella", calories: 81, foodId: shared.id, servings: 1, nutrients: JSON.stringify({ sugarsG: 8.4 }) } });
    expect(await scopedDb(bob).favoriteFood.count()).toBe(0);
    expect((await asUser(bob, `SELECT 1 FROM "FavoriteFood"`)).rowCount).toBe(0);
    expect((await asUser(bob, `SELECT 1 FROM "Meal" WHERE "foodId" = $1`, [shared.id])).rowCount).toBe(0);
    await expect(asUser(bob, `INSERT INTO "FavoriteFood"(id, "userId", "foodId") VALUES ('f1', $1, $2)`, [alice, shared.id])).rejects.toThrow(/row-level security/);
    const meal = await scopedDb(alice).meal.findFirstOrThrow({ where: { foodId: shared.id }, include: { food: true } });
    expect(meal.name).toBe("Nutella"); // decrypted for its owner
    expect(meal.food?.name).toBe("Nutella"); // shared product name is readable as stored
  });

  it("a logged entry keeps its numbers when the product data later changes or disappears", async () => {
    const shared = await sys.food.findFirstOrThrow({ where: { userId: null, barcode: BARCODE } });
    await sys.food.update({ where: { id: shared.id }, data: { perServing: JSON.stringify({ calories: 999 }) } });
    expect((await scopedDb(alice).meal.findFirstOrThrow({ where: { foodId: shared.id } })).calories).toBe(81);
    await sys.food.delete({ where: { id: shared.id } });
    const kept = await scopedDb(alice).meal.findFirstOrThrow({ where: { date: "2026-11-11" } });
    expect(kept).toMatchObject({ calories: 81, foodId: null, servings: 1 });
  });

  it("export includes your custom foods and the fuller snapshot, and nothing of anyone else's", async () => {
    const a = await exportAll(scopedDb(alice), alice);
    expect(a.customFoods).toEqual([expect.objectContaining({ name: "Alice's hazelnut spread", barcode: BARCODE, perServing: { calories: 99 } })]);
    expect(a.meals).toEqual([expect.objectContaining({ name: "Nutella", servings: 1, nutrients: { sugarsG: 8.4 } })]);
    const b = await exportAll(scopedDb(bob), bob);
    expect(b.customFoods).toEqual([]);
    expect(b.meals).toEqual([]);
  });

  it("deleting an account removes its foods and favorites; shared products stay", async () => {
    await lookupBarcode(scopedDb(bob), sys, BARCODE, { fetcher: product });
    const shared = await sys.food.findFirstOrThrow({ where: { userId: null, barcode: BARCODE } });
    await scopedDb(alice).favoriteFood.create({ data: { userId: alice, foodId: shared.id } });
    await sys.user.delete({ where: { id: alice } });
    expect((await raw.query(`SELECT 1 FROM "Food" WHERE "userId" = $1`, [alice])).rowCount).toBe(0);
    expect((await raw.query(`SELECT 1 FROM "FavoriteFood" WHERE "userId" = $1`, [alice])).rowCount).toBe(0);
    expect(await sys.food.count({ where: { id: shared.id } })).toBe(1);
  });
});
