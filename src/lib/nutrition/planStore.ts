import "server-only";
import crypto from "node:crypto";
import type { ScopedDb } from "../db";
import { startOfWeek, type DateStr } from "../dates";
import { calculateTargets, type BodyProfile, type NutritionTargets } from "./calculations";
import { PORTIONS, fromStored, generateWeekPlan, getMeal, swapMeal, toStored, type PlanPreferences, type StoredPlan, type WeekPlan } from "./mealPlan";
import { loadBodyProfile } from "./profile";

export type PlanContext =
  | { state: "no-profile" }
  | { state: "blocked"; message: string }
  | { state: "ready"; plan: WeekPlan; targets: NutritionTargets; todayIndex: number; notes: string[] };

const prefsOf = (p: BodyProfile): PlanPreferences => ({ diet: p.diet, allergies: p.allergies });
/** Changes whenever anything that shapes the plan changes, so the plan regenerates. */
const hashOf = (p: BodyProfile, calories: number) => crypto.createHash("sha256").update(JSON.stringify([p.diet, [...p.allergies].sort(), calories, p.goal])).digest("hex").slice(0, 32);

async function save(db: ScopedDb, userId: string, weekStart: DateStr, stored: StoredPlan, profileHash: string) {
  const data = JSON.stringify(stored);
  await db.mealPlan.upsert({ where: { userId_weekStart: { userId, weekStart } }, update: { data, profileHash }, create: { userId, weekStart, data, profileHash } });
}

/** This week's plan for the signed-in user, generating (and storing) it when missing or out of date. */
export async function getPlanContext(db: ScopedDb, userId: string, today: DateStr): Promise<PlanContext> {
  const profile = await loadBodyProfile(db, userId);
  if (!profile) return { state: "no-profile" };
  const result = calculateTargets(profile);
  if (!result.ok) return { state: "blocked", message: result.message };
  const weekStart = startOfWeek(today);
  const hash = hashOf(profile, result.targets.calories);
  const row = await db.mealPlan.findUnique({ where: { userId_weekStart: { userId, weekStart } } });
  let plan: WeekPlan | null = null;
  if (row && row.profileHash === hash) {
    try { plan = fromStored(JSON.parse(row.data) as StoredPlan, prefsOf(profile)); } catch { plan = null; }
  }
  if (!plan) {
    plan = generateWeekPlan({ calories: result.targets.calories, startDate: weekStart, prefs: prefsOf(profile), seed: crypto.randomUUID() });
    await save(db, userId, weekStart, toStored(plan, result.targets.calories), hash);
  }
  return { state: "ready", plan, targets: result.targets, todayIndex: Math.max(0, plan.days.findIndex((d) => d.date === today)), notes: result.notes };
}

/** Swap one meal in this week's plan. Returns false when nothing else fits. */
export async function swapStoredMeal(db: ScopedDb, userId: string, today: DateStr, dayIndex: number, itemIndex: number): Promise<boolean> {
  const ctx = await getPlanContext(db, userId, today);
  if (ctx.state !== "ready") return false;
  const profile = (await loadBodyProfile(db, userId))!;
  const weekStart = startOfWeek(today);
  const row = (await db.mealPlan.findUnique({ where: { userId_weekStart: { userId, weekStart } } }))!;
  const stored = JSON.parse(row.data) as StoredPlan;
  const next = swapMeal(ctx.plan, dayIndex, itemIndex, prefsOf(profile), (stored.swaps ?? 0) + 1);
  if (!next) return false;
  await save(db, userId, weekStart, toStored(next, ctx.targets.calories, (stored.swaps ?? 0) + 1), row.profileHash);
  return true;
}

/** Changes the portions of some of one day's planned meals (the meals themselves stay). */
export async function setDayPortions(db: ScopedDb, userId: string, today: DateStr, dayIndex: number, changes: { index: number; portion: number }[]): Promise<void> {
  const weekStart = startOfWeek(today);
  const row = await db.mealPlan.findUnique({ where: { userId_weekStart: { userId, weekStart } } });
  if (!row) return;
  const stored = JSON.parse(row.data) as StoredPlan;
  const day = stored.days[dayIndex];
  if (!day) return;
  for (const c of changes) if (day.items[c.index] && (PORTIONS as readonly number[]).includes(c.portion)) day.items[c.index].portion = c.portion;
  await save(db, userId, weekStart, stored, row.profileHash);
}

export async function regeneratePlan(db: ScopedDb, today: DateStr): Promise<void> {
  await db.mealPlan.deleteMany({ where: { weekStart: startOfWeek(today) } });
}

/**
 * Which planned meals are already in the food log, per day and item (matched by date, meal and
 * name). A future day counts as today, matching how logPlanMeal records it.
 */
export async function loggedFromPlan(db: ScopedDb, ctx: PlanContext, today: DateStr): Promise<boolean[][]> {
  if (ctx.state !== "ready") return [];
  const days = ctx.plan.days;
  const rows = await db.meal.findMany({ where: { date: { gte: days[0].date, lte: today } }, select: { date: true, slot: true, name: true } });
  const have = new Set(rows.map((r) => `${r.date}|${r.slot}|${r.name.trim().toLowerCase()}`));
  return days.map((d) => d.items.map((it) => have.has(`${d.date > today ? today : d.date}|${it.slot}|${(getMeal(it.mealId)?.name ?? "").trim().toLowerCase()}`)));
}

/** The props for MealPlanCard (today's day only). */
export function planCard(ctx: PlanContext, hideCalories: boolean, logged: boolean[][] = []) {
  if (ctx.state !== "ready") return ctx;
  return { state: "ready" as const, day: ctx.plan.days[ctx.todayIndex], dayIndex: ctx.todayIndex, hideCalories, warnings: ctx.plan.warnings, logged: logged[ctx.todayIndex] ?? [] };
}
