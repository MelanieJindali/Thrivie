import "server-only";
import { z } from "zod";
import type { ScopedDb } from "../db";
import { isDateStr } from "../dates";

export type { Decision, ReviewItemWithDup } from "./duplicates";

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
    kind: z.literal("meal"), date, decision,
    data: z.object({
      slot: z.enum(["breakfast", "lunch", "dinner", "snack"]),
      name: z.string().trim().min(1).max(200),
      calories: z.number().int().min(0).max(10000).nullable(),
      proteinG: z.number().finite().min(0).max(2000).nullable(),
      carbsG: z.number().finite().min(0).max(2000).nullable(),
      fatG: z.number().finite().min(0).max(2000).nullable(),
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
export const AliasInput = z.object({ kind: z.enum(["exercise", "habit", "workout", "metric"]), alias: z.string().trim().toLowerCase().min(1).max(40), target: z.string().trim().min(1).max(60) });
export const CommitBody = z.object({ items: z.array(CommitItem).max(500), aliases: z.array(AliasInput).max(50).default([]) });
export type CommitItem = z.infer<typeof CommitItem>;

export type CommitResult = { saved: Record<string, number>; skipped: number; createdHabits: string[] };

export async function commitItems(db: ScopedDb, userId: string, items: CommitItem[]): Promise<CommitResult> {
  const saved: Record<string, number> = { health: 0, workout: 0, meal: 0, habit: 0, goal_update: 0, journal: 0 };
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
        case "meal": {
          await tx.meal.create({ data: { userId, date: it.date, ...it.data } });
          saved.meal++;
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

/** Remember corrections as personal shorthand for future imports. */
export async function saveAliases(db: ScopedDb, userId: string, aliases: z.infer<typeof AliasInput>[]) {
  for (const a of aliases) {
    if (a.alias === a.target.toLowerCase()) continue;
    await db.alias.upsert({
      where: { userId_kind_alias: { userId, kind: a.kind, alias: a.alias } },
      update: { target: a.target },
      create: { userId, kind: a.kind, alias: a.alias, target: a.target },
    });
  }
}
