"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { rateLimit, requireUser, sha256 } from "@/lib/auth";
import { logError } from "@/lib/log";
import crypto from "node:crypto";
import { loadSampleData } from "@/lib/sampleData";
import { getSettings, getToday, ALL_MODULES } from "@/lib/settings";
import { addDays, isDateStr, isValidTimezone, todayInTz } from "@/lib/dates";
import { MEAL_SLOTS, WORKOUT_TYPES } from "@/lib/constants";
import { InvalidScheduleError, parseSchedule } from "@/lib/habits/schedule";
import { BodyProfileSchema } from "@/lib/nutrition/calculations";
import { storeBodyProfile } from "@/lib/nutrition/profile";
import { getPlanContext, regeneratePlan, swapStoredMeal } from "@/lib/nutrition/planStore";
import { formatPortion, getMeal } from "@/lib/nutrition/mealPlan";
import { displayToKg, displayToKm, displayToMl, displayToPace } from "@/lib/units";

const dateStr = z.string().refine(isDateStr, "Invalid date");
const rating = z.number().int().min(1).max(5);
const optNum = z.number().finite().nonnegative().nullable().optional();

function done() {
  revalidatePath("/", "layout");
}

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

const SLOW_DOWN = { ok: false, error: "You're going a little fast. Please wait a minute and try again." } as const;
/** Per-user write limit (600 writes per 10 minutes). */
async function tooFast(userId: string) {
  return !(await rateLimit(`write:${userId}`, 600, 600));
}

function fail(e: unknown): ActionResult {
  if (e instanceof z.ZodError) return { ok: false, error: e.issues.map((i) => i.message).join(", ") };
  logError("action", e);
  return { ok: false, error: "Something went wrong. Please try again." };
}

// ---------------------------------------------------------------- Health ----

const healthInput = z.object({
  date: dateStr,
  weight: optNum, // display units
  sleepHours: z.number().min(0).max(24).nullable().optional(),
  sleepQuality: rating.nullable().optional(),
  water: optNum, // display units
  mood: rating.nullable().optional(),
  energy: rating.nullable().optional(),
  steps: z.number().int().nonnegative().nullable().optional(),
  custom: z.record(z.string(), z.number()).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export async function saveHealthLog(input: z.input<typeof healthInput>): Promise<ActionResult> {
  const { db, user } = await requireUser();
  if (await tooFast(user.id)) return SLOW_DOWN;
  try {
    const v = healthInput.parse(input);
    const { units } = await getSettings();
    const data = {
      weightKg: v.weight != null ? Math.round(displayToKg(v.weight, units) * 100) / 100 : null,
      sleepHours: v.sleepHours ?? null,
      sleepQuality: v.sleepQuality ?? null,
      waterMl: v.water != null ? displayToMl(v.water, units) : null,
      mood: v.mood ?? null,
      energy: v.energy ?? null,
      steps: v.steps ?? null,
      // undefined = leave unchanged (the compact quick-log form doesn't show these)
      custom: v.custom === undefined ? undefined : v.custom && Object.keys(v.custom).length ? JSON.stringify(v.custom) : null,
      notes: v.notes === undefined ? undefined : v.notes?.trim() || null,
    };
    const row = await db.healthLog.upsert({ where: { userId_date: { userId: user.id, date: v.date } }, update: data, create: { userId: user.id, date: v.date, ...data } });
    done();
    return { ok: true, id: row.id };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteHealthLog(id: string): Promise<ActionResult> {
  const { db, user } = await requireUser();
  if (await tooFast(user.id)) return SLOW_DOWN;
  await db.healthLog.delete({ where: { id } }).catch(() => null);
  done();
  return { ok: true };
}

// -------------------------------------------------------------- Workouts ----

const workoutInput = z.object({
  id: z.string().optional(),
  date: dateStr,
  type: z.enum(WORKOUT_TYPES),
  title: z.string().max(100).nullable().optional(),
  durationMin: z.number().int().min(1).max(1440),
  intensity: rating,
  distance: optNum, // display units
  pace: optNum, // display units (min per km/mi)
  notes: z.string().max(2000).nullable().optional(),
  exercises: z
    .array(
      z.object({
        name: z.string().min(1).max(100),
        sets: z.number().int().positive().nullable().optional(),
        reps: z.number().int().positive().nullable().optional(),
        weight: optNum,
      }),
    )
    .default([]),
});

export async function saveWorkout(input: z.input<typeof workoutInput>): Promise<ActionResult> {
  const { db, user } = await requireUser();
  if (await tooFast(user.id)) return SLOW_DOWN;
  try {
    const v = workoutInput.parse(input);
    const { units } = await getSettings();
    const distanceKm = v.distance != null ? Math.round(displayToKm(v.distance, units) * 100) / 100 : null;
    let paceMinKm = v.pace != null ? displayToPace(v.pace, units) : null;
    if (paceMinKm == null && distanceKm) paceMinKm = Math.round((v.durationMin / distanceKm) * 100) / 100;
    const data = {
      date: v.date,
      type: v.type,
      title: v.title?.trim() || null,
      durationMin: v.durationMin,
      intensity: v.intensity,
      distanceKm,
      paceMinKm,
      notes: v.notes?.trim() || null,
    };
    const exercises = v.exercises.map((e, i) => ({
      name: e.name.trim(),
      sets: e.sets ?? null,
      reps: e.reps ?? null,
      weightKg: e.weight != null ? Math.round(displayToKg(e.weight, units) * 10) / 10 : null,
      order: i,
    }));
    let id: string;
    if (v.id) {
      await db.exercise.deleteMany({ where: { workoutId: v.id } });
      id = (await db.workout.update({ where: { id: v.id }, data: { ...data, exercises: { create: exercises } } })).id;
    } else {
      id = (await db.workout.create({ data: { ...data, userId: user.id, exercises: { create: exercises } } })).id;
    }
    done();
    return { ok: true, id };
  } catch (e) {
    return fail(e);
  }
}

/** Copy the most recent workout to today. */
export async function repeatLastWorkout(type?: string): Promise<ActionResult> {
  const { db, user } = await requireUser();
  if (await tooFast(user.id)) return SLOW_DOWN;
  const last = await db.workout.findFirst({
    where: type ? { type } : {},
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: { exercises: true },
  });
  if (!last) return { ok: false, error: "No previous workout to repeat yet." };
  const today = await getToday();
  const w = await db.workout.create({
    data: {
      userId: user.id,
      date: today,
      type: last.type,
      title: last.title,
      durationMin: last.durationMin,
      intensity: last.intensity,
      distanceKm: last.distanceKm,
      paceMinKm: last.paceMinKm,
      exercises: {
        create: last.exercises.map(({ name, sets, reps, weightKg, order }) => ({ name, sets, reps, weightKg, order })),
      },
    },
  });
  done();
  return { ok: true, id: w.id };
}

export async function deleteWorkout(id: string): Promise<ActionResult> {
  const { db, user } = await requireUser();
  if (await tooFast(user.id)) return SLOW_DOWN;
  await db.workout.delete({ where: { id } }).catch(() => null);
  done();
  return { ok: true };
}

// ------------------------------------------------------------- Nutrition ----

const macro = z.number().finite().min(0).max(2000).nullable().optional();
const mealInput = z.object({
  id: z.string().optional(),
  date: dateStr,
  slot: z.enum(MEAL_SLOTS),
  name: z.string().trim().min(1, "Add what you ate.").max(200),
  calories: z.number().int().min(0).max(10000).nullable().optional(),
  proteinG: macro,
  carbsG: macro,
  fatG: macro,
  notes: z.string().max(2000).nullable().optional(),
});

export async function saveMeal(input: z.input<typeof mealInput>): Promise<ActionResult> {
  const { db, user } = await requireUser();
  if (await tooFast(user.id)) return SLOW_DOWN;
  try {
    const { id, ...v } = mealInput.parse(input);
    const r1 = (x: number | null | undefined) => (x == null ? null : Math.round(x * 10) / 10);
    const data = { ...v, calories: v.calories ?? null, proteinG: r1(v.proteinG), carbsG: r1(v.carbsG), fatG: r1(v.fatG), notes: v.notes?.trim() || null };
    const row = id ? await db.meal.update({ where: { id }, data }) : await db.meal.create({ data: { ...data, userId: user.id } });
    done();
    return { ok: true, id: row.id };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteMeal(id: string): Promise<ActionResult> {
  const { db, user } = await requireUser();
  if (await tooFast(user.id)) return SLOW_DOWN;
  await db.meal.delete({ where: { id } }).catch(() => null);
  done();
  return { ok: true };
}

/** Body & Goals profile (encrypted). Validated strictly: unknown sex/diet/allergy values are rejected. */
export async function saveBodyProfile(input: unknown): Promise<ActionResult> {
  const { db, user } = await requireUser();
  if (await tooFast(user.id)) return SLOW_DOWN;
  try {
    await storeBodyProfile(db, user.id, BodyProfileSchema.parse(input));
    await db.mealPlan.deleteMany(); // plans regenerate from the new profile
    done();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Swap one meal in this week's plan (indices are validated; the plan is re-checked against the profile). */
export async function swapPlanMeal(dayIndex: number, itemIndex: number): Promise<ActionResult> {
  const { db, user } = await requireUser();
  if (await tooFast(user.id)) return SLOW_DOWN;
  if (![dayIndex, itemIndex].every((n) => Number.isInteger(n) && n >= 0 && n < 10)) return { ok: false, error: "Invalid meal." };
  const ok = await swapStoredMeal(db, user.id, await getToday(), dayIndex, itemIndex);
  done();
  return ok ? { ok: true } : { ok: false, error: "No other meal fits your preferences for this slot yet." };
}

/**
 * Adds a planned meal to the food log, with nutrition scaled to its portion. A future day in
 * the plan is logged as today (you're eating it now); past and current days keep their date.
 */
export async function logPlanMeal(dayIndex: number, itemIndex: number): Promise<ActionResult> {
  const { db, user } = await requireUser();
  if (await tooFast(user.id)) return SLOW_DOWN;
  if (![dayIndex, itemIndex].every((n) => Number.isInteger(n) && n >= 0 && n < 10)) return { ok: false, error: "Invalid meal." };
  const today = await getToday();
  const ctx = await getPlanContext(db, user.id, today);
  if (ctx.state !== "ready") return { ok: false, error: "Set up Body & Goals to get a meal plan first." };
  const day = ctx.plan.days[dayIndex];
  const item = day?.items[itemIndex];
  const meal = item && getMeal(item.mealId);
  if (!day || !item || !meal) return { ok: false, error: "That meal isn't in this week's plan anymore. Refresh and try again." };
  const date = day.date > today ? today : day.date;
  const row = await db.meal.create({
    data: {
      userId: user.id, date, slot: item.slot, name: meal.name.slice(0, 200),
      calories: item.kcal, proteinG: item.proteinG, carbsG: item.carbsG, fatG: item.fatG,
      notes: item.portion !== 1 ? `From your meal plan (${formatPortion(item.portion)})` : "From your meal plan",
    },
  });
  done();
  return { ok: true, id: row.id };
}

export async function newMealPlan(): Promise<ActionResult> {
  const { db, user } = await requireUser();
  if (await tooFast(user.id)) return SLOW_DOWN;
  await regeneratePlan(db, await getToday());
  done();
  return { ok: true };
}

export async function clearBodyProfile(): Promise<ActionResult> {
  const { db, user } = await requireUser();
  if (await tooFast(user.id)) return SLOW_DOWN;
  await db.bodyProfile.deleteMany();
  await db.mealPlan.deleteMany();
  done();
  return { ok: true };
}

export async function setHideCalories(hide: boolean): Promise<ActionResult> {
  const { db, user } = await requireUser();
  if (await tooFast(user.id)) return SLOW_DOWN;
  await db.settings.update({ where: { userId: user.id }, data: { hideCalories: hide === true } });
  done();
  return { ok: true };
}

const targetsInput = z.object({
  calorieTarget: z.number().int().min(500).max(10000).nullable(),
  proteinTargetG: z.number().int().min(10).max(500).nullable(),
});

/** Optional daily targets. Leaving both empty turns them off. */
export async function saveNutritionTargets(input: z.input<typeof targetsInput>): Promise<ActionResult> {
  const { db, user } = await requireUser();
  if (await tooFast(user.id)) return SLOW_DOWN;
  try {
    const v = targetsInput.parse(input);
    await db.settings.update({ where: { userId: user.id }, data: v });
    done();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------- Habits ----

const habitInput = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Name is required").max(60),
  emoji: z.string().max(8).nullable().optional(),
  schedule: z.unknown().transform((v, ctx) => {
    try {
      return parseSchedule(v);
    } catch (e) {
      ctx.addIssue({ code: "custom", message: e instanceof InvalidScheduleError ? e.message : "Invalid schedule." });
      return z.NEVER;
    }
  }),
});

export async function saveHabit(input: z.input<typeof habitInput>): Promise<ActionResult> {
  const { db, user } = await requireUser();
  if (await tooFast(user.id)) return SLOW_DOWN;
  try {
    const v = habitInput.parse(input);
    const data = {
      name: v.name,
      emoji: v.emoji?.trim() || null,
      schedule: v.schedule,
    };
    const id = v.id
      ? (await db.habit.update({ where: { id: v.id }, data })).id
      : (await db.habit.create({ data: { ...data, userId: user.id, order: await db.habit.count() } })).id;
    done();
    return { ok: true, id };
  } catch (e) {
    return fail(e);
  }
}

export async function archiveHabit(id: string, archived: boolean): Promise<ActionResult> {
  const { db, user } = await requireUser();
  if (await tooFast(user.id)) return SLOW_DOWN;
  await db.habit.update({ where: { id }, data: { archived } });
  done();
  return { ok: true };
}

export async function deleteHabit(id: string): Promise<ActionResult> {
  const { db, user } = await requireUser();
  if (await tooFast(user.id)) return SLOW_DOWN;
  await db.habit.delete({ where: { id } }).catch(() => null);
  done();
  return { ok: true };
}

// ----------------------------------------------------------------- Goals ----

const goalInput = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(1, "Title is required").max(100),
  target: z.number().finite(),
  unit: z.string().trim().max(20),
  startDate: dateStr,
  deadline: dateStr,
  startValue: z.number().finite().nullable().optional(),
  linkType: z.enum(["manual", "metric", "workout", "habit"]),
  linkMetric: z.enum(["steps", "water", "weight", "sleep"]).nullable().optional(),
  linkWorkoutType: z.enum([...WORKOUT_TYPES, "any"]).nullable().optional(),
  linkMeasure: z.enum(["count", "minutes", "distance"]).nullable().optional(),
  linkHabitId: z.string().nullable().optional(),
});

export async function saveGoal(input: z.input<typeof goalInput>): Promise<ActionResult> {
  const { db, user } = await requireUser();
  if (await tooFast(user.id)) return SLOW_DOWN;
  try {
    const v = goalInput.parse(input);
    if (v.deadline < v.startDate) return { ok: false, error: "Deadline must be after the start date." };
    if (v.linkType === "habit" && v.linkHabitId && !(await db.habit.findUnique({ where: { id: v.linkHabitId } }))) {
      return { ok: false, error: "That habit doesn't exist." };
    }
    const { units } = await getSettings();
    let target = v.target;
    let startValue = v.startValue ?? null;
    // Weight and distance goals are stored in metric.
    if (v.linkType === "metric" && v.linkMetric === "weight") {
      target = displayToKg(target, units);
      if (startValue != null) startValue = displayToKg(startValue, units);
    }
    if (v.linkType === "workout" && v.linkMeasure === "distance") target = displayToKm(target, units);
    const data = {
      title: v.title,
      target,
      unit: v.unit,
      startDate: v.startDate,
      deadline: v.deadline,
      startValue,
      linkType: v.linkType,
      linkMetric: v.linkType === "metric" ? v.linkMetric ?? "steps" : null,
      linkWorkoutType: v.linkType === "workout" ? v.linkWorkoutType ?? "any" : null,
      linkMeasure: v.linkType === "workout" ? v.linkMeasure ?? "count" : null,
      linkHabitId: v.linkType === "habit" ? v.linkHabitId ?? null : null,
    };
    const id = v.id ? (await db.goal.update({ where: { id: v.id }, data })).id : (await db.goal.create({ data: { ...data, userId: user.id } })).id;
    done();
    return { ok: true, id };
  } catch (e) {
    return fail(e);
  }
}

export async function addGoalProgress(goalId: string, value: number, note?: string, date?: string): Promise<ActionResult> {
  const { db, user } = await requireUser();
  if (await tooFast(user.id)) return SLOW_DOWN;
  if (!Number.isFinite(value)) return { ok: false, error: "Enter a number." };
  const d = date && isDateStr(date) ? date : await getToday();
  await db.goalProgress.create({ data: { goalId, value, note: note?.trim() || null, date: d } });
  done();
  return { ok: true };
}

export async function archiveGoal(id: string, archived: boolean): Promise<ActionResult> {
  const { db, user } = await requireUser();
  if (await tooFast(user.id)) return SLOW_DOWN;
  await db.goal.update({ where: { id }, data: { archived } });
  done();
  return { ok: true };
}

export async function deleteGoal(id: string): Promise<ActionResult> {
  const { db, user } = await requireUser();
  if (await tooFast(user.id)) return SLOW_DOWN;
  await db.goal.delete({ where: { id } }).catch(() => null);
  done();
  return { ok: true };
}

// --------------------------------------------------------------- Journal ----

const journalInput = z.object({
  id: z.string().optional(),
  date: dateStr,
  content: z.string().trim().min(1, "Write something first").max(20000),
  mood: rating.nullable().optional(),
  prompt: z.string().max(200).nullable().optional(),
});

export async function saveJournal(input: z.input<typeof journalInput>): Promise<ActionResult> {
  const { db, user } = await requireUser();
  if (await tooFast(user.id)) return SLOW_DOWN;
  try {
    const v = journalInput.parse(input);
    const data = { date: v.date, content: v.content, mood: v.mood ?? null, prompt: v.prompt || null };
    const id = v.id
      ? (await db.journalEntry.update({ where: { id: v.id }, data })).id
      : (await db.journalEntry.create({ data: { ...data, userId: user.id } })).id;
    done();
    return { ok: true, id };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteJournal(id: string): Promise<ActionResult> {
  const { db, user } = await requireUser();
  if (await tooFast(user.id)) return SLOW_DOWN;
  await db.journalEntry.delete({ where: { id } }).catch(() => null);
  done();
  return { ok: true };
}

// -------------------------------------------------------------- Settings ----

const settingsInput = z.object({
  name: z.string().max(60),
  units: z.enum(["metric", "imperial"]),
  timezone: z.string().refine(isValidTimezone, "Unknown timezone"),
  visibleModules: z.array(z.enum(ALL_MODULES)),
});

export async function saveSettings(input: z.input<typeof settingsInput>): Promise<ActionResult> {
  const { db, user } = await requireUser();
  if (await tooFast(user.id)) return SLOW_DOWN;
  try {
    const v = settingsInput.parse(input);
    await db.settings.upsert({
      where: { userId: user.id },
      update: { ...v, visibleModules: v.visibleModules.join(",") },
      create: { userId: user.id, ...v, visibleModules: v.visibleModules.join(",") },
    });
    done();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteAllData(confirm: string): Promise<ActionResult> {
  const { db, user } = await requireUser();
  if (await tooFast(user.id)) return SLOW_DOWN;
  if (confirm !== "DELETE") return { ok: false, error: 'Type "DELETE" to confirm.' };
  await db.$transaction(async (tx) => {
    await tx.attachment.deleteMany();
    await tx.goalProgress.deleteMany();
    await tx.goal.deleteMany();
    await tx.habitCheckin.deleteMany();
    await tx.habit.deleteMany();
    await tx.exercise.deleteMany();
    await tx.workout.deleteMany();
    await tx.meal.deleteMany();
    await tx.favoriteFood.deleteMany();
    await tx.food.deleteMany(); // your own foods only; shared product data isn't personal
    await tx.mealPlan.deleteMany();
    await tx.bodyProfile.deleteMany();
    await tx.healthLog.deleteMany();
    await tx.journalEntry.deleteMany();
    await tx.alias.deleteMany();
  });
  done();
  return { ok: true };
}


/** Fill a brand-new account with ~30 days of example data (only if it's empty). */
export async function loadSampleDataAction(): Promise<ActionResult> {
  const { db, user } = await requireUser();
  if (await tooFast(user.id)) return SLOW_DOWN;
  const existing = (await db.healthLog.count()) + (await db.workout.count()) + (await db.meal.count()) + (await db.habit.count()) + (await db.journalEntry.count());
  if (existing > 0) return { ok: false, error: "Your account already has data, so sample data wasn't added." };
  const { timezone } = await getSettings();
  await loadSampleData(db, user.id, timezone);
  done();
  return { ok: true };
}


export async function saveReminders(on: boolean, hour: number): Promise<ActionResult> {
  const { db, user } = await requireUser();
  if (await tooFast(user.id)) return SLOW_DOWN;
  const h = Math.max(0, Math.min(23, Math.round(hour)));
  await db.settings.update({ where: { userId: user.id }, data: { remindersOn: on, reminderHour: h, lastReminded: null } });
  done();
  return { ok: true };
}

// ------------------------------------------------------- health-sync tokens --

export async function createApiToken(name: string): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const { db, user } = await requireUser();
  if (await tooFast(user.id)) return SLOW_DOWN;
  const label = name.trim().slice(0, 40) || "My phone";
  if ((await db.apiToken.count()) >= 10) return { ok: false, error: "You can have up to 10 tokens. Revoke one first." };
  const token = `thr_${crypto.randomBytes(24).toString("base64url")}`;
  await db.apiToken.create({ data: { userId: user.id, name: label, tokenHash: sha256(token), prefix: token.slice(0, 8) } });
  done();
  return { ok: true, token };
}

export async function revokeApiToken(id: string): Promise<ActionResult> {
  const { db, user } = await requireUser();
  if (await tooFast(user.id)) return SLOW_DOWN;
  await db.apiToken.deleteMany({ where: { id } });
  done();
  return { ok: true };
}

export async function dismissTip(id: string): Promise<ActionResult> {
  const { db, user } = await requireUser();
  if (!/^[a-z-]{1,30}$/.test(id)) return { ok: false, error: "Invalid tip." };
  const s = await db.settings.findUnique({ where: { userId: user.id } });
  const seen = new Set((s?.tipsSeen ?? "").split(",").filter(Boolean));
  seen.add(id);
  await db.settings.update({ where: { userId: user.id }, data: { tipsSeen: [...seen].slice(-50).join(",") } });
  return { ok: true };
}

const onboardingInput = z.object({
  name: z.string().trim().max(60),
  units: z.enum(["metric", "imperial"]),
  timezone: z.string().refine(isValidTimezone, "Unknown timezone"),
  habits: z.array(z.object({ name: z.string().trim().min(1).max(60), emoji: z.string().max(8).optional() })).max(3),
  goal: z
    .object({ title: z.string().trim().min(1).max(100), target: z.number().positive(), unit: z.string().max(20), days: z.number().int().min(7).max(365), linkType: z.enum(["manual", "workout", "habit"]), linkMeasure: z.enum(["count", "minutes", "distance"]).optional() })
    .nullable(),
});

/** Finish onboarding: everything optional; nothing is created unless the user picked it. */
export async function completeOnboarding(input: z.input<typeof onboardingInput>): Promise<ActionResult> {
  try {
    const v = onboardingInput.parse(input);
    const { db, user } = await requireUser();
    await db.settings.update({ where: { userId: user.id }, data: { name: v.name, units: v.units, timezone: v.timezone, onboarded: true } });
    const today = todayInTz(v.timezone);
    const created: string[] = [];
    for (const [i, h] of v.habits.entries()) {
      created.push((await db.habit.create({ data: { userId: user.id, name: h.name, emoji: h.emoji ?? null, order: i } })).id);
    }
    if (v.goal) {
      const g = v.goal;
      const target = g.linkMeasure === "distance" ? displayToKm(g.target, v.units) : g.target;
      await db.goal.create({
        data: {
          userId: user.id, title: g.title, target, unit: g.unit, startDate: today, deadline: addDays(today, g.days), linkType: g.linkType,
          linkWorkoutType: g.linkType === "workout" ? "any" : null, linkMeasure: g.linkType === "workout" ? g.linkMeasure ?? "count" : null,
          linkHabitId: g.linkType === "habit" ? created[0] ?? null : null,
        },
      });
    }
    done();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function skipOnboarding(timezone?: string): Promise<ActionResult> {
  const { db, user } = await requireUser();
  const tz = timezone && isValidTimezone(timezone) ? { timezone } : {};
  await db.settings.update({ where: { userId: user.id }, data: { onboarded: true, ...tz } });
  return { ok: true };
}

/** Idempotent habit check (safe to replay from the offline queue). */
export async function setHabitCheck(habitId: string, date: string, checked: boolean): Promise<ActionResult> {
  const { db, user } = await requireUser();
  if (await tooFast(user.id)) return SLOW_DOWN;
  if (!isDateStr(date)) return { ok: false, error: "Invalid date." };
  if (!(await db.habit.findUnique({ where: { id: habitId } }))) return { ok: false, error: "Habit not found." };
  if (checked) await db.habitCheckin.upsert({ where: { habitId_date: { habitId, date } }, update: {}, create: { habitId, date } });
  else await db.habitCheckin.deleteMany({ where: { habitId, date } });
  done();
  return { ok: true };
}

/** Tap counter for "N times a day" habits. Sets the day's count (idempotent, safe to replay offline); 0 removes it. */
export async function setHabitCount(habitId: string, date: string, count: number): Promise<ActionResult> {
  const { db, user } = await requireUser();
  if (await tooFast(user.id)) return SLOW_DOWN;
  if (!isDateStr(date) || !Number.isInteger(count) || count < 0 || count > 100) return { ok: false, error: "Invalid count." };
  if (!(await db.habit.findUnique({ where: { id: habitId } }))) return { ok: false, error: "Habit not found." };
  if (count === 0) await db.habitCheckin.deleteMany({ where: { habitId, date } });
  else await db.habitCheckin.upsert({ where: { habitId_date: { habitId, date } }, update: { count }, create: { habitId, date, count } });
  done();
  return { ok: true };
}

export async function setOnDeviceAi(on: boolean): Promise<ActionResult> {
  const { db, user } = await requireUser();
  await db.settings.update({ where: { userId: user.id }, data: { onDeviceAi: on } });
  return { ok: true };
}

export async function updateAlias(id: string, target: string): Promise<ActionResult> {
  const { db } = await requireUser();
  const t = target.trim().slice(0, 60);
  if (!t) return { ok: false, error: "Enter what it should mean." };
  const r = await db.alias.updateMany({ where: { id }, data: { target: t } });
  done();
  return r.count ? { ok: true } : { ok: false, error: "Not found." };
}

export async function deleteAlias(id: string): Promise<ActionResult> {
  const { db } = await requireUser();
  await db.alias.deleteMany({ where: { id } });
  done();
  return { ok: true };
}
