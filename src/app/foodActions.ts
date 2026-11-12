"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { rateLimit, requireUser } from "@/lib/auth";
import { systemDb, type ScopedDb } from "@/lib/db";
import { isDateStr } from "@/lib/dates";
import { getToday } from "@/lib/settings";
import { MEAL_SLOTS } from "@/lib/constants";
import { FoodDataSchema, nutrientsFor, servingsFromGrams, type Food, type Nutrients, type Portion } from "@/lib/nutrition/food";
import { toFood } from "@/lib/nutrition/foodStore";
import { getGenericFood } from "@/lib/nutrition/genericFoods";
import { fitPortions } from "@/lib/nutrition/dayFit";
import { loadDay } from "@/lib/nutrition/dayData";
import { getPlanContext, setDayPortions } from "@/lib/nutrition/planStore";
import { getMeal } from "@/lib/nutrition/mealPlan";
import { getSettings } from "@/lib/settings";

export type FoodActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const SLOW = { ok: false as const, error: "You're going a little fast. Please wait a minute and try again." };
const done = () => revalidatePath("/", "layout");

const portionInput = z.union([z.object({ servings: z.number().finite().positive().max(50) }), z.object({ grams: z.number().finite().positive().max(5000) })]);
const logInput = z.object({
  foodId: z.string().min(1).max(80),
  portion: portionInput,
  slot: z.enum(MEAL_SLOTS),
  date: z.string().refine(isDateStr).optional(),
});
export type LogFoodInput = z.input<typeof logInput>;

/** A food the signed-in person may log: their own, a shared product, or a generic food. */
async function findFood(db: ScopedDb, id: string): Promise<Food | null> {
  if (id.startsWith("generic:")) return getGenericFood(id);
  const own = await db.food.findFirst({ where: { id } });
  if (own) return toFood(own);
  const shared = await systemDb().food.findFirst({ where: { id, userId: null, found: true } });
  return shared ? toFood(shared) : null;
}

const EXTRA: (keyof Nutrients)[] = ["satFatG", "transFatG", "cholesterolMg", "sodiumMg", "fiberG", "sugarsG", "addedSugarsG"];

function mealRow(food: Food, portion: Portion, slot: (typeof MEAL_SLOTS)[number], date: string, userId: string) {
  const n = nutrientsFor(food, portion);
  if (!n) return null;
  const extra = Object.fromEntries(EXTRA.filter((k) => n[k] != null).map((k) => [k, n[k]]));
  const servings = "servings" in portion ? portion.servings : servingsFromGrams(food, portion.grams);
  return {
    userId, date, slot,
    name: (food.brand && !food.name.toLowerCase().includes(food.brand.toLowerCase()) ? `${food.name} (${food.brand})` : food.name).slice(0, 200),
    // A snapshot: these numbers stay as logged even if the product's data changes later.
    calories: n.calories != null ? Math.round(n.calories) : null, proteinG: n.proteinG ?? null, carbsG: n.carbsG ?? null, fatG: n.fatG ?? null,
    nutrients: Object.keys(extra).length ? JSON.stringify(extra) : null,
    foodId: food.id.startsWith("generic:") ? null : food.id,
    servings,
    notes: "grams" in portion ? `${Math.round(portion.grams)} g` : null,
  };
}

/** Logs one or more foods to a meal. All of them are saved, or none. */
export async function logFoods(items: LogFoodInput[]): Promise<FoodActionResult<{ count: number }>> {
  const { db, user } = await requireUser();
  if (!(await rateLimit(`write:${user.id}`, 600, 600))) return SLOW;
  const parsed = z.array(logInput).min(1).max(30).safeParse(items);
  if (!parsed.success) return { ok: false, error: "Check the amount and try again." };
  const today = await getToday();
  const rows: NonNullable<ReturnType<typeof mealRow>>[] = [];
  for (const it of parsed.data) {
    const date = it.date && it.date <= today ? it.date : today;
    const food = await findFood(db, it.foodId);
    const row = food && mealRow(food, it.portion, it.slot, date, user.id);
    if (!row) return { ok: false, error: food ? `“${food.name}” can't be measured that way. Try servings instead.` : "That food isn't available anymore. Search or scan it again." };
    rows.push(row);
  }
  await db.$transaction(async (tx) => { for (const data of rows) await tx.meal.create({ data }); });
  done();
  return { ok: true, count: rows.length };
}

export const logFood = async (item: LogFoodInput) => logFoods([item]);

/** Saves a food the person entered or read from a label. Private to them. */
export async function saveCustomFood(input: unknown): Promise<FoodActionResult<{ food: Food }>> {
  const { db, user } = await requireUser();
  if (!(await rateLimit(`write:${user.id}`, 600, 600))) return SLOW;
  const parsed = FoodDataSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the values and try again." };
  const f = parsed.data;
  if (f.source !== "custom" && f.source !== "label_scan") return { ok: false, error: "Check the values and try again." };
  if (!f.perServing && !f.per100g) return { ok: false, error: "Add at least the calories, or one of protein, carbs or fat." };
  const data = {
    source: f.source, barcode: f.barcode, name: f.name, brand: f.brand, servingSize: f.servingSize, servingGrams: f.servingGrams,
    perServing: f.perServing ? JSON.stringify(f.perServing) : null, per100g: f.per100g ? JSON.stringify(f.per100g) : null,
    allergens: f.allergens.join(","), traces: f.traces.join(","), fetchedAt: new Date(),
  };
  // One private food per barcode: saving again for the same barcode updates it.
  const existing = f.barcode ? await db.food.findFirst({ where: { barcode: f.barcode } }) : null;
  const row = existing ? await db.food.update({ where: { id: existing.id }, data }) : await db.food.create({ data: { ...data, userId: user.id } });
  done();
  return { ok: true, food: toFood(row) };
}

export async function toggleFavorite(foodId: string): Promise<FoodActionResult<{ favorite: boolean }>> {
  const { db, user } = await requireUser();
  if (!(await rateLimit(`write:${user.id}`, 600, 600))) return SLOW;
  const food = typeof foodId === "string" && !foodId.startsWith("generic:") ? await findFood(db, foodId) : null;
  if (!food) return { ok: false, error: "That food can't be saved as a favorite." };
  const existing = await db.favoriteFood.findFirst({ where: { foodId: food.id } });
  if (existing) await db.favoriteFood.delete({ where: { id: existing.id } });
  else await db.favoriteFood.create({ data: { userId: user.id, foodId: food.id } });
  done();
  return { ok: true, favorite: !existing };
}

/**
 * Resizes the portions of today's planned meals that haven't been logged yet, so the day
 * still lands near the target given what has been logged.
 */
export async function adjustTodayPlan(): Promise<FoodActionResult<{ changed: number }>> {
  const { db, user } = await requireUser();
  if (!(await rateLimit(`write:${user.id}`, 600, 600))) return SLOW;
  const today = await getToday();
  const [ctx, day, logged] = await Promise.all([
    getPlanContext(db, user.id, today),
    loadDay(db, user.id, today, await getSettings()),
    db.meal.findMany({ where: { date: today }, select: { slot: true } }),
  ]);
  if (ctx.state !== "ready" || day.left.calories == null) return { ok: false, error: "Set up Body & Goals to get a meal plan first." };
  const loggedSlots = new Set(logged.map((m) => m.slot));
  const plan = ctx.plan.days[ctx.todayIndex];
  const open = plan.items.map((it, i) => ({ it, i })).filter(({ it }) => !loggedSlots.has(it.slot));
  if (!open.length) return { ok: false, error: "Every planned meal for today already has something logged." };
  const portions = fitPortions(open.map(({ it }) => ({ baseKcal: getMeal(it.mealId)?.kcal ?? it.kcal / it.portion })), day.left.calories);
  const changes = open.map(({ it, i }, n) => ({ index: i, portion: portions[n], was: it.portion })).filter((c) => c.portion !== c.was);
  if (changes.length) await setDayPortions(db, user.id, today, ctx.todayIndex, changes);
  done();
  return { ok: true, changed: changes.length };
}

const suggestionInput = z.union([
  z.object({ kind: z.literal("library"), mealId: z.string().max(60), portion: z.number().refine((p) => [0.75, 1, 1.25, 1.5, 1.75, 2].includes(p)), slot: z.enum(MEAL_SLOTS) }),
  z.object({ kind: z.literal("recent"), name: z.string().min(1).max(200), slot: z.enum(MEAL_SLOTS) }),
]);

/** Logs a suggested item for today: a library meal at a portion, or a repeat of something logged before. */
export async function logSuggestion(input: z.input<typeof suggestionInput>): Promise<FoodActionResult> {
  const { db, user } = await requireUser();
  if (!(await rateLimit(`write:${user.id}`, 600, 600))) return SLOW;
  const parsed = suggestionInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That suggestion isn't available anymore." };
  const s = parsed.data;
  const date = await getToday();
  if (s.kind === "library") {
    const m = getMeal(s.mealId);
    if (!m) return { ok: false, error: "That suggestion isn't available anymore." };
    await db.meal.create({ data: { userId: user.id, date, slot: s.slot, name: m.name, calories: Math.round(m.kcal * s.portion), proteinG: Math.round(m.proteinG * s.portion), carbsG: Math.round(m.carbsG * s.portion), fatG: Math.round(m.fatG * s.portion), servings: s.portion, notes: "Suggested for today" } });
  } else {
    // Meal names are encrypted, so the match happens here after they're decrypted.
    const past = await db.meal.findMany({ orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 600 });
    const src = past.find((p) => p.name.trim().toLowerCase() === s.name.trim().toLowerCase());
    if (!src) return { ok: false, error: "Couldn't find that earlier meal." };
    await db.meal.create({ data: { userId: user.id, date, slot: s.slot, name: src.name, calories: src.calories, proteinG: src.proteinG, carbsG: src.carbsG, fatG: src.fatG, nutrients: src.nutrients, foodId: src.foodId, servings: src.servings } });
  }
  done();
  return { ok: true };
}
