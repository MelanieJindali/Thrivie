import "server-only";
import type { ScopedDb } from "../db";
import { addDays, type DateStr } from "../dates";

/**
 * Smart Import Layer 2: a small summary of the user's OWN data that the device uses to resolve
 * ambiguity ("172" means lb when recent weights are near 172 lb; "bench" means their "Bench press").
 * Numbers and names only; no note text is involved, and it's sent only to the signed-in user.
 */
export type PersonalContext = {
  recentWeightKg: number | null; // median of the last few logged weights
  lastWeight: { kg: number; date: DateStr } | null;
  typicalSleep: number | null; // median hours over the last 30 days
  exerciseNames: string[];
  workoutTitles: string[];
};

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

export async function personalContext(db: ScopedDb, today: DateStr): Promise<PersonalContext> {
  const [weights, sleeps, exercises, workouts] = await Promise.all([
    db.healthLog.findMany({ where: { weightKg: { not: null }, date: { gte: addDays(today, -90), lte: today } }, orderBy: { date: "desc" }, take: 7, select: { date: true, weightKg: true } }),
    db.healthLog.findMany({ where: { sleepHours: { not: null }, date: { gte: addDays(today, -30) } }, select: { sleepHours: true } }),
    db.exercise.findMany({ distinct: ["name"], select: { name: true }, take: 200 }),
    db.workout.findMany({ where: { title: { not: null } }, distinct: ["title"], select: { title: true }, take: 100 }),
  ]);
  const w = weights.map((x) => x.weightKg!) as number[];
  return {
    recentWeightKg: median(w),
    lastWeight: weights[0] ? { kg: weights[0].weightKg!, date: weights[0].date } : null,
    typicalSleep: median(sleeps.map((x) => x.sleepHours!)),
    exerciseNames: exercises.map((e) => e.name),
    workoutTitles: workouts.map((x) => x.title!).filter(Boolean),
  };
}
