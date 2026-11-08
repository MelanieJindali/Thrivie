import "server-only";
import { z } from "zod";
import type { ScopedDb } from "../db";
import { isDateStr } from "../dates";
import { kgToDisplay, mlToDisplay, waterUnit, weightUnit, type Units } from "../units";
import type { ReviewItem } from "./normalize";

export type Decision = "add" | "merge" | "overwrite" | "replace" | "skip";

export type ReviewItemWithDup = ReviewItem & {
  decision: Decision;
  dup: { message: string; options: Decision[] } | null;
};

const similar = (a: string, b: string) => {
  const n = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const x = n(a);
  const y = n(b);
  return x === y || x.includes(y) || y.includes(x) || x.slice(0, 60) === y.slice(0, 60);
};

/** Flag likely duplicates of existing data and pick a safe default decision. */
export async function detectDuplicates(db: ScopedDb, items: ReviewItem[], units: Units): Promise<ReviewItemWithDup[]> {
  const dates = [...new Set(items.map((i) => i.date))];
  const [health, workouts, checkins, journal, goals, progress] = await Promise.all([
    db.healthLog.findMany({ where: { date: { in: dates } } }),
    db.workout.findMany({ where: { date: { in: dates } } }),
    db.habitCheckin.findMany({ where: { date: { in: dates } } }),
    db.journalEntry.findMany({ where: { date: { in: dates } } }),
    db.goal.findMany({ select: { id: true, title: true, linkType: true } }),
    db.goalProgress.findMany({ where: { date: { in: dates } } }),
  ]);

  return items.map((item): ReviewItemWithDup => {
    switch (item.kind) {
      case "health": {
        const ex = health.find((h) => h.date === item.date);
        if (!ex) return { ...item, decision: "add", dup: null };
        const conflicts: string[] = [];
        const cmp = (label: string, a: number | null, b: number | null, fmt = (v: number) => String(v)) => {
          if (a != null && b != null && fmt(a) !== fmt(b)) conflicts.push(`${label} ${fmt(b)} → ${fmt(a)}`);
        };
        cmp("weight", item.data.weightKg, ex.weightKg, (v) => `${kgToDisplay(v, units)} ${weightUnit(units)}`);
        cmp("sleep", item.data.sleepHours, ex.sleepHours, (v) => `${v}h`);
        cmp("sleep quality", item.data.sleepQuality, ex.sleepQuality);
        cmp("water", item.data.waterMl, ex.waterMl, (v) => `${mlToDisplay(v, units)} ${waterUnit(units)}`);
        cmp("mood", item.data.mood, ex.mood);
        cmp("energy", item.data.energy, ex.energy);
        cmp("steps", item.data.steps, ex.steps);
        if (!conflicts.length) {
          return { ...item, decision: "merge", dup: { message: "A health log already exists for this day. New values will be added to it.", options: ["merge", "skip"] } };
        }
        return {
          ...item,
          decision: "merge",
          dup: {
            message: `You already logged health for this day with different values (${conflicts.join(", ")}). Keep existing values, or overwrite them?`,
            options: ["merge", "overwrite", "skip"],
          },
        };
      }
      case "workout": {
        const ex = workouts.find((w) => w.date === item.date && w.type === item.data.type);
        if (!ex) return { ...item, decision: "add", dup: null };
        return {
          ...item,
          decision: "skip",
          dup: {
            message: `There's already a ${ex.type} workout on this day (${ex.title ?? ex.type}, ${ex.durationMin} min). Is this the same one?`,
            options: ["skip", "add", "replace"],
          },
        };
      }
      case "habit": {
        if (item.data.habitId && checkins.some((c) => c.habitId === item.data.habitId && c.date === item.date)) {
          return { ...item, decision: "skip", dup: { message: "Already checked off for this day.", options: ["skip"] } };
        }
        return { ...item, decision: item.data.habitId ? "add" : "skip", dup: null };
      }
      case "goal_update": {
        const goal = goals.find((g) => g.id === item.data.goalId);
        if (goal && goal.linkType !== "manual") {
          return { ...item, decision: "skip", dup: { message: `“${goal.title}” updates automatically from your logs, so this isn't needed.`, options: ["skip"] } };
        }
        const ex = progress.find((p) => p.goalId === item.data.goalId && p.date === item.date && Math.abs(p.value - item.data.value) < 1e-9);
        if (ex) return { ...item, decision: "skip", dup: { message: "The same progress update already exists for this day.", options: ["skip", "add"] } };
        return { ...item, decision: item.data.goalId ? "add" : "skip", dup: null };
      }
      case "journal": {
        const ex = journal.find((j) => j.date === item.date && similar(j.content, item.data.content));
        if (ex) return { ...item, decision: "skip", dup: { message: "A very similar journal entry already exists for this day.", options: ["skip", "add"] } };
        return { ...item, decision: "add", dup: null };
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Commit
// ---------------------------------------------------------------------------

const date = z.string().refine(isDateStr);
const r5 = z.number().int().min(1).max(5).nullable();
const nn = z.number().finite().nonnegative().nullable();
const decision = z.enum(["add", "merge", "overwrite", "replace", "skip"]);

export const CommitItem = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("health"), date, decision,
    data: z.object({ weightKg: nn, sleepHours: z.number().min(0).max(24).nullable(), sleepQuality: r5, waterMl: nn, mood: r5, energy: r5, steps: nn, custom: z.record(z.string(), z.number()) }),
  }),
  z.object({
    kind: z.literal("workout"), date, decision,
    data: z.object({
      type: z.enum(["strength", "cardio", "mobility", "sport", "other"]),
      title: z.string().max(100).nullable(),
      durationMin: z.number().int().min(1).max(1440),
      intensity: z.number().int().min(1).max(5),
      distanceKm: nn,
      paceMinKm: nn,
      exercises: z.array(z.object({ name: z.string().min(1).max(100), sets: nn, reps: nn, weightKg: nn })),
    }),
  }),
  z.object({
    kind: z.literal("habit"), date, decision,
    data: z.object({ habitName: z.string().min(1).max(60), habitId: z.string().nullable(), createNew: z.boolean(), frequency: z.enum(["daily", "weekly"]) }),
  }),
  z.object({
    kind: z.literal("goal_update"), date, decision,
    data: z.object({ goalName: z.string(), goalId: z.string().nullable(), value: z.number().finite(), note: z.string().nullable() }),
  }),
  z.object({
    kind: z.literal("journal"), date, decision,
    data: z.object({ content: z.string().min(1).max(20000), mood: r5 }),
  }),
]);
export const CommitBody = z.object({ items: z.array(CommitItem).max(500) });
export type CommitItem = z.infer<typeof CommitItem>;

export type CommitResult = { saved: Record<string, number>; skipped: number; createdHabits: string[] };

export async function commitItems(db: ScopedDb, userId: string, items: CommitItem[]): Promise<CommitResult> {
  const saved: Record<string, number> = { health: 0, workout: 0, habit: 0, goal_update: 0, journal: 0 };
  let skipped = 0;
  const createdHabits = new Map<string, string>(); // normalized name → id (avoid duplicates within one import)

  await db.$transaction(async (tx) => {
    for (const it of items) {
      if (it.decision === "skip") {
        skipped++;
        continue;
      }
      switch (it.kind) {
        case "health": {
          const { custom, ...fields } = it.data;
          const ex = await tx.healthLog.findUnique({ where: { userId_date: { userId, date: it.date } } });
          if (!ex) {
            await tx.healthLog.create({ data: { userId, date: it.date, ...fields, custom: Object.keys(custom).length ? JSON.stringify(custom) : null } });
          } else {
            const update: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(fields)) {
              if (v == null) continue;
              const current = (ex as Record<string, unknown>)[k];
              if (it.decision === "overwrite" || current == null) update[k] = v;
            }
            const exCustom = ex.custom ? (JSON.parse(ex.custom) as Record<string, number>) : {};
            const mergedCustom = it.decision === "overwrite" ? { ...exCustom, ...custom } : { ...custom, ...exCustom };
            if (Object.keys(mergedCustom).length) update.custom = JSON.stringify(mergedCustom);
            await tx.healthLog.update({ where: { id: ex.id }, data: update });
          }
          saved.health++;
          break;
        }
        case "workout": {
          if (it.decision === "replace") await tx.workout.deleteMany({ where: { date: it.date, type: it.data.type } });
          const { exercises, ...w } = it.data;
          await tx.workout.create({
            data: { userId, date: it.date, ...w, exercises: { create: exercises.map((e, i) => ({ ...e, sets: e.sets != null ? Math.round(e.sets) : null, reps: e.reps != null ? Math.round(e.reps) : null, order: i })) } },
          });
          saved.workout++;
          break;
        }
        case "habit": {
          let habitId = it.data.habitId;
          if (!habitId && it.data.createNew) {
            const key = it.data.habitName.trim().toLowerCase();
            habitId = createdHabits.get(key) ?? null;
            if (!habitId) {
              const h = await tx.habit.create({
                data: { userId, name: it.data.habitName.trim(), frequency: it.data.frequency, timesPerWeek: it.data.frequency === "daily" ? 7 : 3, order: await tx.habit.count() },
              });
              habitId = h.id;
              createdHabits.set(key, h.id);
            }
          }
          if (!habitId) {
            skipped++;
            break;
          }
          await tx.habitCheckin.upsert({ where: { habitId_date: { habitId, date: it.date } }, update: {}, create: { habitId, date: it.date } });
          saved.habit++;
          break;
        }
        case "goal_update": {
          if (!it.data.goalId) {
            skipped++;
            break;
          }
          await tx.goalProgress.create({ data: { goalId: it.data.goalId, date: it.date, value: it.data.value, note: it.data.note } });
          saved.goal_update++;
          break;
        }
        case "journal": {
          await tx.journalEntry.create({ data: { userId, date: it.date, content: it.data.content, mood: it.data.mood } });
          saved.journal++;
          break;
        }
      }
    }
  });

  return { saved, skipped, createdHabits: [...createdHabits.keys()] };
}
