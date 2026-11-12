import "server-only";
import { z } from "zod";
import type { ScopedDb } from "./db";
import { BodyProfileSchema } from "./nutrition/calculations";
import { loadBodyProfile } from "./nutrition/profile";
import { describeSchedule, parseSchedule, readSchedule, scheduleFromLegacy } from "./habits/schedule";
import { kgToDisplay, kmToDisplay, mlToDisplay, paceToDisplay, distanceUnit, weightUnit, waterUnit, type Units } from "./units";

/** 2: habits carry a `schedule` and per-day check-in counts. Version 1 backups still restore. */
export const BACKUP_VERSION = 2;

export async function exportAll(db: ScopedDb, userId: string) {
  const [settings, healthLogs, workouts, meals, habits, goals, journal, aliases, bodyProfile, foods, favorites] = await Promise.all([
    db.settings.findUnique({ where: { userId } }),
    db.healthLog.findMany({ orderBy: { date: "asc" } }),
    db.workout.findMany({ include: { exercises: { orderBy: { order: "asc" } } }, orderBy: { date: "asc" } }),
    db.meal.findMany({ orderBy: [{ date: "asc" }, { createdAt: "asc" }] }),
    db.habit.findMany({ include: { checkins: { orderBy: { date: "asc" } } }, orderBy: { order: "asc" } }),
    db.goal.findMany({ include: { progress: { orderBy: { date: "asc" } } } }),
    db.journalEntry.findMany({ orderBy: { date: "asc" } }),
    db.alias.findMany({ select: { kind: true, alias: true, target: true } }),
    loadBodyProfile(db, userId),
    db.food.findMany({ orderBy: { createdAt: "asc" } }), // only the foods you created; shared product data isn't yours to export
    db.favoriteFood.findMany({ include: { food: { select: { name: true, brand: true, barcode: true } } }, orderBy: { createdAt: "asc" } }),
  ]);
  const json = (s: string | null) => (s ? JSON.parse(s) : null);
  return {
    app: "thrivie",
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    note: "Measurements are stored in metric (kg, km, ml, min/km) regardless of display units.",
    settings: settings && { name: settings.name, units: settings.units, timezone: settings.timezone, visibleModules: settings.visibleModules },
    healthLogs: healthLogs.map(({ createdAt, updatedAt, ...h }) => ({ ...h, custom: h.custom ? JSON.parse(h.custom) : null })),
    workouts: workouts.map(({ createdAt, exercises, ...w }) => ({ ...w, exercises: exercises.map(({ id, workoutId, ...e }) => e) })),
    meals: meals.map(({ id, userId, createdAt, foodId, nutrients, ...m }) => ({ ...m, nutrients: json(nutrients) })),
    customFoods: foods.map((f) => ({
      source: f.source, barcode: f.barcode, name: f.name, brand: f.brand, servingSize: f.servingSize, servingGrams: f.servingGrams,
      perServing: json(f.perServing), per100g: json(f.per100g), allergens: f.allergens ? f.allergens.split(",") : [], traces: f.traces ? f.traces.split(",") : [],
    })),
    favoriteFoods: favorites.map((f) => ({ name: f.food.name, brand: f.food.brand, barcode: f.food.barcode })),
    habits: habits.map(({ checkins, createdAt, ...h }) => ({ ...h, createdAt: createdAt.toISOString(), checkins: checkins.map((c) => ({ date: c.date, count: c.count })) })),
    goals: goals.map(({ progress, createdAt, ...g }) => ({ ...g, progress: progress.map(({ id, goalId, ...p }) => p) })),
    journal: journal.map(({ createdAt, updatedAt, ...j }) => ({ ...j, createdAt: createdAt.toISOString() })),
    aliases,
    bodyProfile, // decrypted for you; meal plans are regenerated from it
  };
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

function csvCell(v: unknown): string {
  if (v == null) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  return [columns.join(","), ...rows.map((r) => columns.map((c) => csvCell(r[c])).join(","))].join("\r\n") + "\r\n";
}

export const CSV_TABLES = ["health", "workouts", "exercises", "meals", "habits", "checkins", "goals", "goal_progress", "journal"] as const;
export type CsvTable = (typeof CSV_TABLES)[number];

/** CSV export in the user's display units (column names include the unit). */
export async function exportCsv(db: ScopedDb, table: CsvTable, u: Units): Promise<string> {
  const wu = weightUnit(u);
  switch (table) {
    case "health": {
      const rows = await db.healthLog.findMany({ orderBy: { date: "asc" } });
      const cols = ["date", `weight_${wu}`, "sleep_hours", "sleep_quality", `water_${waterUnit(u)}`, "mood", "energy", "steps", "custom", "notes"];
      return toCsv(rows.map((r) => ({
        date: r.date, [`weight_${wu}`]: r.weightKg != null ? kgToDisplay(r.weightKg, u) : null, sleep_hours: r.sleepHours, sleep_quality: r.sleepQuality,
        [`water_${waterUnit(u)}`]: r.waterMl != null ? mlToDisplay(r.waterMl, u) : null, mood: r.mood, energy: r.energy, steps: r.steps, custom: r.custom, notes: r.notes,
      })), cols);
    }
    case "workouts": {
      const rows = await db.workout.findMany({ orderBy: { date: "asc" } });
      const du = distanceUnit(u);
      const cols = ["id", "date", "type", "title", "duration_min", "intensity", `distance_${du}`, `pace_min_per_${du}`, "notes"];
      return toCsv(rows.map((r) => ({
        id: r.id, date: r.date, type: r.type, title: r.title, duration_min: r.durationMin, intensity: r.intensity,
        [`distance_${du}`]: r.distanceKm != null ? kmToDisplay(r.distanceKm, u) : null, [`pace_min_per_${du}`]: r.paceMinKm != null ? paceToDisplay(r.paceMinKm, u) : null, notes: r.notes,
      })), cols);
    }
    case "exercises": {
      const rows = await db.exercise.findMany({ include: { workout: { select: { date: true } } }, orderBy: [{ workoutId: "asc" }, { order: "asc" }] });
      return toCsv(rows.map((r) => ({ workout_id: r.workoutId, date: r.workout.date, name: r.name, sets: r.sets, reps: r.reps, [`weight_${wu}`]: r.weightKg != null ? kgToDisplay(r.weightKg, u) : null })), ["workout_id", "date", "name", "sets", "reps", `weight_${wu}`]);
    }
    case "habits": {
      const rows = await db.habit.findMany({ orderBy: { order: "asc" } });
      return toCsv(rows.map((r) => ({ id: r.id, name: r.name, emoji: r.emoji, schedule: describeSchedule(readSchedule(r.schedule)), archived: r.archived })), ["id", "name", "emoji", "schedule", "archived"]);
    }
    case "checkins": {
      const rows = await db.habitCheckin.findMany({ include: { habit: { select: { name: true } } }, orderBy: { date: "asc" } });
      return toCsv(rows.map((r) => ({ date: r.date, habit: r.habit.name, habit_id: r.habitId, count: r.count })), ["date", "habit", "habit_id", "count"]);
    }
    case "goals": {
      const rows = await db.goal.findMany();
      return toCsv(rows.map((r) => ({ id: r.id, title: r.title, target: r.target, unit: r.unit, start_date: r.startDate, deadline: r.deadline, start_value: r.startValue, link_type: r.linkType, link_metric: r.linkMetric, link_workout_type: r.linkWorkoutType, link_measure: r.linkMeasure, link_habit_id: r.linkHabitId, archived: r.archived })),
        ["id", "title", "target", "unit", "start_date", "deadline", "start_value", "link_type", "link_metric", "link_workout_type", "link_measure", "link_habit_id", "archived"]);
    }
    case "goal_progress": {
      const rows = await db.goalProgress.findMany({ include: { goal: { select: { title: true } } }, orderBy: { date: "asc" } });
      return toCsv(rows.map((r) => ({ date: r.date, goal: r.goal.title, goal_id: r.goalId, value: r.value, note: r.note })), ["date", "goal", "goal_id", "value", "note"]);
    }
    case "meals": {
      const rows = await db.meal.findMany({ orderBy: [{ date: "asc" }, { createdAt: "asc" }] });
      const cols = ["date", "slot", "name", "calories", "protein_g", "carbs_g", "fat_g", "notes"];
      return toCsv(rows.map((r) => ({ date: r.date, slot: r.slot, name: r.name, calories: r.calories, protein_g: r.proteinG, carbs_g: r.carbsG, fat_g: r.fatG, notes: r.notes })), cols);
    }
    case "journal": {
      const rows = await db.journalEntry.findMany({ orderBy: { date: "asc" } });
      return toCsv(rows.map((r) => ({ date: r.date, mood: r.mood, prompt: r.prompt, content: r.content })), ["date", "mood", "prompt", "content"]);
    }
  }
}

// ---------------------------------------------------------------------------
// Restore
// ---------------------------------------------------------------------------

const d = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const n = z.number().finite().nullable().optional();

export const BackupSchema = z.object({
  app: z.literal("thrivie"),
  version: z.number().int().max(BACKUP_VERSION),
  settings: z.object({ name: z.string(), units: z.string(), timezone: z.string(), visibleModules: z.string() }).nullable().optional(),
  healthLogs: z.array(z.object({
    date: d, weightKg: n, sleepHours: n, sleepQuality: n, waterMl: n, mood: n, energy: n, steps: n,
    custom: z.record(z.string(), z.number()).nullable().optional(), notes: z.string().nullable().optional(),
  })).default([]),
  workouts: z.array(z.object({
    id: z.string().optional(), date: d, type: z.string(), title: z.string().nullable().optional(), durationMin: z.number().int().positive(),
    intensity: z.number().int().min(1).max(5).default(3), distanceKm: n, paceMinKm: n, notes: z.string().nullable().optional(),
    exercises: z.array(z.object({ name: z.string(), sets: n, reps: n, weightKg: n, order: z.number().int().optional() })).default([]),
  })).default([]),
  meals: z.array(z.object({
    date: d, slot: z.enum(["breakfast", "lunch", "dinner", "snack"]), name: z.string().min(1).max(200), calories: n, proteinG: n, carbsG: n, fatG: n,
    notes: z.string().nullable().optional(),
  })).default([]),
  habits: z.array(z.object({
    id: z.string(), name: z.string(), emoji: z.string().nullable().optional(),
    schedule: z.unknown().optional(), // v2
    frequency: z.string().optional(), timesPerWeek: z.number().int().optional(), // v1
    archived: z.boolean().default(false), order: z.number().int().default(0),
    checkins: z.array(z.union([d, z.object({ date: d, count: z.number().int().min(1).max(100) })])).default([]),
  })).default([]),
  goals: z.array(z.object({
    id: z.string(), title: z.string(), target: z.number(), unit: z.string(), startDate: d, deadline: d, startValue: n,
    linkType: z.string(), linkMetric: z.string().nullable().optional(), linkWorkoutType: z.string().nullable().optional(),
    linkMeasure: z.string().nullable().optional(), linkHabitId: z.string().nullable().optional(), archived: z.boolean().default(false),
    progress: z.array(z.object({ date: d, value: z.number(), note: z.string().nullable().optional() })).default([]),
  })).default([]),
  journal: z.array(z.object({ date: d, content: z.string(), mood: n, prompt: z.string().nullable().optional() })).default([]),
  bodyProfile: BodyProfileSchema.nullable().optional(),
  aliases: z.array(z.object({ kind: z.enum(["exercise", "habit", "workout", "metric"]), alias: z.string().min(1).max(40), target: z.string().min(1).max(60) })).max(500).default([]),
});

/** Replace all data with the backup contents (atomic). */
export async function restoreBackup(db: ScopedDb, userId: string, raw: unknown) {
  const b = BackupSchema.parse(raw);
  const int = (v: number | null | undefined) => (v == null ? null : Math.round(v));
  await db.$transaction(async (tx) => {
    await tx.attachment.deleteMany();
    await tx.goalProgress.deleteMany();
    await tx.goal.deleteMany();
    await tx.habitCheckin.deleteMany();
    await tx.habit.deleteMany();
    await tx.exercise.deleteMany();
    await tx.workout.deleteMany();
    await tx.meal.deleteMany();
    await tx.mealPlan.deleteMany();
    await tx.bodyProfile.deleteMany();
    if (b.bodyProfile) await tx.bodyProfile.create({ data: { userId, data: JSON.stringify(b.bodyProfile) } });
    await tx.healthLog.deleteMany();
    await tx.journalEntry.deleteMany();
    if (b.settings) {
      await tx.settings.upsert({ where: { userId }, update: b.settings, create: { userId, ...b.settings } });
    }
    for (const h of b.healthLogs) {
      await tx.healthLog.create({ data: {
        userId, date: h.date, weightKg: h.weightKg ?? null, sleepHours: h.sleepHours ?? null, sleepQuality: int(h.sleepQuality), waterMl: int(h.waterMl),
        mood: int(h.mood), energy: int(h.energy), steps: int(h.steps), custom: h.custom ? JSON.stringify(h.custom) : null, notes: h.notes ?? null,
      } });
    }
    for (const w of b.workouts) {
      await tx.workout.create({ data: {
        userId, date: w.date, type: w.type, title: w.title ?? null, durationMin: w.durationMin, intensity: w.intensity, distanceKm: w.distanceKm ?? null,
        paceMinKm: w.paceMinKm ?? null, notes: w.notes ?? null,
        exercises: { create: w.exercises.map((e, i) => ({ name: e.name, sets: int(e.sets), reps: int(e.reps), weightKg: e.weightKg ?? null, order: e.order ?? i })) },
      } });
    }
    for (const m of b.meals) {
      await tx.meal.create({ data: { userId, date: m.date, slot: m.slot, name: m.name, calories: int(m.calories), proteinG: m.proteinG ?? null, carbsG: m.carbsG ?? null, fatG: m.fatG ?? null, notes: m.notes ?? null } });
    }
    // New ids are generated so a backup can be restored into any account.
    const habitIdMap = new Map<string, string>();
    for (const h of b.habits) {
      const created = await tx.habit.create({ data: {
        userId, name: h.name, emoji: h.emoji ?? null, archived: h.archived, order: h.order,
        schedule: h.schedule !== undefined ? parseSchedule(h.schedule) : scheduleFromLegacy(h.frequency ?? "daily", h.timesPerWeek ?? 7),
        checkins: { create: [...new Map(h.checkins.map((c) => (typeof c === "string" ? [c, 1] : [c.date, c.count]) as [string, number])).entries()].map(([date, count]) => ({ date, count })) },
      } });
      habitIdMap.set(h.id, created.id);
    }
    for (const g of b.goals) {
      await tx.goal.create({ data: {
        userId, title: g.title, target: g.target, unit: g.unit, startDate: g.startDate, deadline: g.deadline, startValue: g.startValue ?? null,
        linkType: g.linkType, linkMetric: g.linkMetric ?? null, linkWorkoutType: g.linkWorkoutType ?? null, linkMeasure: g.linkMeasure ?? null,
        linkHabitId: g.linkHabitId ? habitIdMap.get(g.linkHabitId) ?? null : null, archived: g.archived,
        progress: { create: g.progress.map((p) => ({ date: p.date, value: p.value, note: p.note ?? null })) },
      } });
    }
    await tx.alias.deleteMany();
    for (const a of b.aliases) await tx.alias.create({ data: { userId, ...a } });
    for (const j of b.journal) {
      await tx.journalEntry.create({ data: { userId, date: j.date, content: j.content, mood: int(j.mood), prompt: j.prompt ?? null } });
    }
  }, { timeout: 60_000 });
  return {
    health: b.healthLogs.length, workouts: b.workouts.length, meals: b.meals.length, habits: b.habits.length, goals: b.goals.length, journal: b.journal.length,
  };
}
