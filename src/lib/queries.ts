import "server-only";
import type { ScopedDb } from "./db";
import { addDays, lastNDays, type DateStr } from "./dates";
import { computeGoal, type GoalComputed } from "./stats";
import { computeStreak, describeSchedule, getHabitStatus, isScheduledOn, readSchedule, streakAtRisk, targetOf, type HabitLog, type HabitSchedule, type HabitStatus, type Period } from "./habits/schedule";
import type { Goal } from "@prisma/client";

export type HabitView = {
  id: string;
  name: string;
  emoji: string | null;
  schedule: HabitSchedule;
  /** Plain-language schedule, e.g. "Mon, Wed, Fri" or "3 times a week". */
  summary: string;
  status: HabitStatus;
  /** Done for today: the daily target is met (day habits) or there's a check-in today (week/month habits). */
  checkedToday: boolean;
  dueToday: boolean;
  streak: number;
  longest: number;
  streakUnit: Period;
  atRisk: boolean;
  logs: HabitLog[];
  dates: string[]; // dates with at least one check-in (oldest first)
};

export function toHabitView(h: { id: string; name: string; emoji: string | null; schedule: unknown; checkins: HabitLog[] }, today: DateStr): HabitView {
  const schedule = readSchedule(h.schedule);
  const logs = h.checkins.filter((c) => c.count > 0);
  const status = getHabitStatus(schedule, logs, today);
  const streak = computeStreak(schedule, logs, today);
  return {
    id: h.id,
    name: h.name,
    emoji: h.emoji,
    schedule,
    summary: describeSchedule(schedule),
    status,
    checkedToday: status.window === "day" ? status.complete : status.todayCount > 0,
    dueToday: status.showToday,
    streak: streak.current,
    longest: streak.best,
    streakUnit: streak.unit,
    atRisk: streakAtRisk(schedule, logs, today),
    logs,
    dates: logs.map((l) => l.date).sort(),
  };
}

export async function getHabitViews(db: ScopedDb, today: DateStr, includeArchived = false): Promise<HabitView[]> {
  const habits = await db.habit.findMany({
    where: includeArchived ? {} : { archived: false },
    include: { checkins: { select: { date: true, count: true } } },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
  return habits.map((h) => toHabitView(h, today));
}

/** Current value of a goal based on its link. */
export async function goalCurrentValue(db: ScopedDb, goal: Goal, today: DateStr): Promise<number> {
  const range = { gte: goal.startDate, lte: today };
  switch (goal.linkType) {
    case "metric": {
      if (goal.linkMetric === "weight") {
        const latest = await db.healthLog.findFirst({
          where: { weightKg: { not: null }, date: { lte: today } },
          orderBy: { date: "desc" },
        });
        return latest?.weightKg ?? goal.startValue ?? 0;
      }
      if (goal.linkMetric === "sleep") {
        const agg = await db.healthLog.aggregate({ where: { date: range }, _avg: { sleepHours: true } });
        return agg._avg.sleepHours ?? 0;
      }
      const agg = await db.healthLog.aggregate({
        where: { date: range },
        _sum: { steps: true, waterMl: true },
      });
      return goal.linkMetric === "water" ? (agg._sum.waterMl ?? 0) / 1000 : agg._sum.steps ?? 0;
    }
    case "workout": {
      const where = {
        date: range,
        ...(goal.linkWorkoutType && goal.linkWorkoutType !== "any" ? { type: goal.linkWorkoutType } : {}),
      };
      if (goal.linkMeasure === "count") return db.workout.count({ where });
      const agg = await db.workout.aggregate({ where, _sum: { distanceKm: true, durationMin: true } });
      return goal.linkMeasure === "minutes" ? agg._sum.durationMin ?? 0 : Math.round((agg._sum.distanceKm ?? 0) * 10) / 10;
    }
    case "habit": {
      if (!goal.linkHabitId) return 0;
      return db.habitCheckin.count({ where: { habitId: goal.linkHabitId, date: range } });
    }
    default: {
      const agg = await db.goalProgress.aggregate({ where: { goalId: goal.id }, _sum: { value: true } });
      return agg._sum.value ?? 0;
    }
  }
}

export type GoalView = Goal & GoalComputed & { habitName: string | null };

export async function getGoalViews(db: ScopedDb, today: DateStr, includeArchived = false): Promise<GoalView[]> {
  const goals = await db.goal.findMany({
    where: includeArchived ? {} : { archived: false },
    include: { habit: { select: { name: true } } },
    orderBy: { deadline: "asc" },
  });
  return Promise.all(
    goals.map(async ({ habit, ...g }) => {
      const current = await goalCurrentValue(db, g, today);
      return { ...g, ...computeGoal(g, current, today), habitName: habit?.name ?? null };
    }),
  );
}

export async function getHealthRange(db: ScopedDb, today: DateStr, days: number) {
  return db.healthLog.findMany({
    where: { date: { gte: addDays(today, -(days - 1)), lte: today } },
    orderBy: { date: "asc" },
  });
}

export async function getWorkoutsRange(db: ScopedDb, today: DateStr, days: number) {
  return db.workout.findMany({
    where: { date: { gte: addDays(today, -(days - 1)), lte: today } },
    include: { exercises: { orderBy: { order: "asc" } } },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });
}

/** Share of active habits completed per day (for the dashboard heatmap). */
export function habitCompletionByDay(habits: HabitView[], today: DateStr, days: number) {
  // Day-based habits judged on the days they're scheduled; week/month habits only if there are no day habits.
  const dayHabits = habits.filter((h) => h.streakUnit === "day");
  const pool = dayHabits.length ? dayHabits : habits;
  const counts = pool.map((h) => new Map(h.logs.map((l) => [l.date, l.count])));
  return lastNDays(today, days).map((date) => {
    let due = 0, done = 0;
    pool.forEach((h, i) => {
      if (h.streakUnit === "day" && !isScheduledOn(h.schedule, date)) return;
      due++;
      if ((counts[i].get(date) ?? 0) >= (h.streakUnit === "day" ? targetOf(h.schedule) : 1)) done++;
    });
    return { date, value: due ? done / due : 0, count: done };
  });
}
