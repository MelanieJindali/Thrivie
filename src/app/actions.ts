"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser, sha256 } from "@/lib/auth";
import crypto from "node:crypto";
import { loadSampleData } from "@/lib/sampleData";
import { getReview } from "@/lib/review";
import { getSettings, getToday, ALL_MODULES } from "@/lib/settings";
import { isDateStr, isValidTimezone } from "@/lib/dates";
import { WORKOUT_TYPES } from "@/lib/constants";
import { displayToKg, displayToKm, displayToMl, displayToPace } from "@/lib/units";

const dateStr = z.string().refine(isDateStr, "Invalid date");
const rating = z.number().int().min(1).max(5);
const optNum = z.number().finite().nonnegative().nullable().optional();

function done() {
  revalidatePath("/", "layout");
}

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

function fail(e: unknown): ActionResult {
  if (e instanceof z.ZodError) return { ok: false, error: e.issues.map((i) => i.message).join(", ") };
  console.error(e);
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
  await db.workout.delete({ where: { id } }).catch(() => null);
  done();
  return { ok: true };
}

// ---------------------------------------------------------------- Habits ----

const habitInput = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Name is required").max(60),
  emoji: z.string().max(8).nullable().optional(),
  frequency: z.enum(["daily", "weekly"]),
  timesPerWeek: z.number().int().min(1).max(7).default(7),
});

export async function saveHabit(input: z.input<typeof habitInput>): Promise<ActionResult> {
  const { db, user } = await requireUser();
  try {
    const v = habitInput.parse(input);
    const data = {
      name: v.name,
      emoji: v.emoji?.trim() || null,
      frequency: v.frequency,
      timesPerWeek: v.frequency === "daily" ? 7 : v.timesPerWeek,
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

export async function toggleHabit(habitId: string, date?: string): Promise<ActionResult> {
  const { db, user } = await requireUser();
  const d = date && isDateStr(date) ? date : await getToday();
  const existing = await db.habitCheckin.findUnique({ where: { habitId_date: { habitId, date: d } } });
  if (existing) await db.habitCheckin.delete({ where: { id: existing.id } });
  else await db.habitCheckin.create({ data: { habitId, date: d } });
  done();
  return { ok: true };
}

export async function archiveHabit(id: string, archived: boolean): Promise<ActionResult> {
  const { db, user } = await requireUser();
  await db.habit.update({ where: { id }, data: { archived } });
  done();
  return { ok: true };
}

export async function deleteHabit(id: string): Promise<ActionResult> {
  const { db, user } = await requireUser();
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
  if (!Number.isFinite(value)) return { ok: false, error: "Enter a number." };
  const d = date && isDateStr(date) ? date : await getToday();
  await db.goalProgress.create({ data: { goalId, value, note: note?.trim() || null, date: d } });
  done();
  return { ok: true };
}

export async function archiveGoal(id: string, archived: boolean): Promise<ActionResult> {
  const { db, user } = await requireUser();
  await db.goal.update({ where: { id }, data: { archived } });
  done();
  return { ok: true };
}

export async function deleteGoal(id: string): Promise<ActionResult> {
  const { db, user } = await requireUser();
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
  if (confirm !== "DELETE") return { ok: false, error: 'Type "DELETE" to confirm.' };
  await db.$transaction([
    db.dailyBrief.deleteMany(),
    db.weeklyReview.deleteMany(),
    db.attachment.deleteMany(),
    db.goalProgress.deleteMany(),
    db.goal.deleteMany(),
    db.habitCheckin.deleteMany(),
    db.habit.deleteMany(),
    db.exercise.deleteMany(),
    db.workout.deleteMany(),
    db.healthLog.deleteMany(),
    db.journalEntry.deleteMany(),
  ]);
  done();
  return { ok: true };
}

export async function clearBriefCache(): Promise<ActionResult> {
  const { db, user } = await requireUser();
  await db.dailyBrief.deleteMany();
  done();
  return { ok: true };
}

/** Fill a brand-new account with ~30 days of example data (only if it's empty). */
export async function loadSampleDataAction(): Promise<ActionResult> {
  const { db, user } = await requireUser();
  const existing = (await db.healthLog.count()) + (await db.workout.count()) + (await db.habit.count()) + (await db.journalEntry.count());
  if (existing > 0) return { ok: false, error: "Your account already has data, so sample data wasn't added." };
  const { timezone } = await getSettings();
  await loadSampleData(db, user.id, timezone);
  done();
  return { ok: true };
}

/** Write (or rewrite) the weekly review for the week starting `weekStart`. */
export async function generateReview(weekStart: string): Promise<ActionResult> {
  const { db, user } = await requireUser();
  if (!isDateStr(weekStart)) return { ok: false, error: "Invalid week." };
  const r = await getReview(db, user.id, weekStart, true);
  done();
  return r.error ? { ok: false, error: r.error } : { ok: true };
}

export async function saveReminders(on: boolean, hour: number): Promise<ActionResult> {
  const { db, user } = await requireUser();
  const h = Math.max(0, Math.min(23, Math.round(hour)));
  await db.settings.update({ where: { userId: user.id }, data: { remindersOn: on, reminderHour: h, lastReminded: null } });
  done();
  return { ok: true };
}

// ------------------------------------------------------- health-sync tokens --

export async function createApiToken(name: string): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const { db, user } = await requireUser();
  const label = name.trim().slice(0, 40) || "My phone";
  if ((await db.apiToken.count()) >= 10) return { ok: false, error: "You can have up to 10 tokens. Revoke one first." };
  const token = `thr_${crypto.randomBytes(24).toString("base64url")}`;
  await db.apiToken.create({ data: { userId: user.id, name: label, tokenHash: sha256(token), prefix: token.slice(0, 8) } });
  done();
  return { ok: true, token };
}

export async function revokeApiToken(id: string): Promise<ActionResult> {
  const { db } = await requireUser();
  await db.apiToken.deleteMany({ where: { id } });
  done();
  return { ok: true };
}
