"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
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
    const row = await prisma.healthLog.upsert({ where: { date: v.date }, update: data, create: { date: v.date, ...data } });
    done();
    return { ok: true, id: row.id };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteHealthLog(id: string): Promise<ActionResult> {
  await prisma.healthLog.delete({ where: { id } }).catch(() => null);
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
      await prisma.exercise.deleteMany({ where: { workoutId: v.id } });
      id = (await prisma.workout.update({ where: { id: v.id }, data: { ...data, exercises: { create: exercises } } })).id;
    } else {
      id = (await prisma.workout.create({ data: { ...data, exercises: { create: exercises } } })).id;
    }
    done();
    return { ok: true, id };
  } catch (e) {
    return fail(e);
  }
}

/** Copy the most recent workout to today. */
export async function repeatLastWorkout(type?: string): Promise<ActionResult> {
  const last = await prisma.workout.findFirst({
    where: type ? { type } : {},
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: { exercises: true },
  });
  if (!last) return { ok: false, error: "No previous workout to repeat yet." };
  const today = await getToday();
  const w = await prisma.workout.create({
    data: {
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
  await prisma.workout.delete({ where: { id } }).catch(() => null);
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
  try {
    const v = habitInput.parse(input);
    const data = {
      name: v.name,
      emoji: v.emoji?.trim() || null,
      frequency: v.frequency,
      timesPerWeek: v.frequency === "daily" ? 7 : v.timesPerWeek,
    };
    const id = v.id
      ? (await prisma.habit.update({ where: { id: v.id }, data })).id
      : (await prisma.habit.create({ data: { ...data, order: await prisma.habit.count() } })).id;
    done();
    return { ok: true, id };
  } catch (e) {
    return fail(e);
  }
}

export async function toggleHabit(habitId: string, date?: string): Promise<ActionResult> {
  const d = date && isDateStr(date) ? date : await getToday();
  const existing = await prisma.habitCheckin.findUnique({ where: { habitId_date: { habitId, date: d } } });
  if (existing) await prisma.habitCheckin.delete({ where: { id: existing.id } });
  else await prisma.habitCheckin.create({ data: { habitId, date: d } });
  done();
  return { ok: true };
}

export async function archiveHabit(id: string, archived: boolean): Promise<ActionResult> {
  await prisma.habit.update({ where: { id }, data: { archived } });
  done();
  return { ok: true };
}

export async function deleteHabit(id: string): Promise<ActionResult> {
  await prisma.habit.delete({ where: { id } }).catch(() => null);
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
  try {
    const v = goalInput.parse(input);
    if (v.deadline < v.startDate) return { ok: false, error: "Deadline must be after the start date." };
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
    const id = v.id ? (await prisma.goal.update({ where: { id: v.id }, data })).id : (await prisma.goal.create({ data })).id;
    done();
    return { ok: true, id };
  } catch (e) {
    return fail(e);
  }
}

export async function addGoalProgress(goalId: string, value: number, note?: string, date?: string): Promise<ActionResult> {
  if (!Number.isFinite(value)) return { ok: false, error: "Enter a number." };
  const d = date && isDateStr(date) ? date : await getToday();
  await prisma.goalProgress.create({ data: { goalId, value, note: note?.trim() || null, date: d } });
  done();
  return { ok: true };
}

export async function archiveGoal(id: string, archived: boolean): Promise<ActionResult> {
  await prisma.goal.update({ where: { id }, data: { archived } });
  done();
  return { ok: true };
}

export async function deleteGoal(id: string): Promise<ActionResult> {
  await prisma.goal.delete({ where: { id } }).catch(() => null);
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
  try {
    const v = journalInput.parse(input);
    const data = { date: v.date, content: v.content, mood: v.mood ?? null, prompt: v.prompt || null };
    const id = v.id
      ? (await prisma.journalEntry.update({ where: { id: v.id }, data })).id
      : (await prisma.journalEntry.create({ data })).id;
    done();
    return { ok: true, id };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteJournal(id: string): Promise<ActionResult> {
  await prisma.journalEntry.delete({ where: { id } }).catch(() => null);
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
  try {
    const v = settingsInput.parse(input);
    await prisma.settings.upsert({
      where: { id: 1 },
      update: { ...v, visibleModules: v.visibleModules.join(",") },
      create: { id: 1, ...v, visibleModules: v.visibleModules.join(",") },
    });
    done();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteAllData(confirm: string): Promise<ActionResult> {
  if (confirm !== "DELETE") return { ok: false, error: 'Type "DELETE" to confirm.' };
  await prisma.$transaction([
    prisma.dailyBrief.deleteMany(),
    prisma.goalProgress.deleteMany(),
    prisma.goal.deleteMany(),
    prisma.habitCheckin.deleteMany(),
    prisma.habit.deleteMany(),
    prisma.exercise.deleteMany(),
    prisma.workout.deleteMany(),
    prisma.healthLog.deleteMany(),
    prisma.journalEntry.deleteMany(),
  ]);
  done();
  return { ok: true };
}

export async function clearBriefCache(): Promise<ActionResult> {
  await prisma.dailyBrief.deleteMany();
  done();
  return { ok: true };
}
