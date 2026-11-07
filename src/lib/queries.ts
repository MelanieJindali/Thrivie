import "server-only";
import { prisma } from "./db";
import { addDays, lastNDays, startOfWeek, type DateStr } from "./dates";
import {
  computeGoal,
  currentStreak,
  isDueToday,
  longestStreak,
  streakAtRisk,
  weekCount,
  type GoalComputed,
} from "./stats";
import type { Goal } from "@prisma/client";

export type HabitView = {
  id: string;
  name: string;
  emoji: string | null;
  frequency: string;
  timesPerWeek: number;
  checkedToday: boolean;
  streak: number;
  longest: number;
  thisWeek: number;
  dueToday: boolean;
  atRisk: boolean;
  dates: string[]; // all check-in dates
};

export async function getHabitViews(today: DateStr, includeArchived = false): Promise<HabitView[]> {
  const habits = await prisma.habit.findMany({
    where: includeArchived ? {} : { archived: false },
    include: { checkins: { select: { date: true } } },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
  return habits.map((h) => {
    const dates = new Set(h.checkins.map((c) => c.date));
    return {
      id: h.id,
      name: h.name,
      emoji: h.emoji,
      frequency: h.frequency,
      timesPerWeek: h.timesPerWeek,
      checkedToday: dates.has(today),
      streak: currentStreak(h, dates, today),
      longest: longestStreak(h, dates),
      thisWeek: weekCount(dates, startOfWeek(today)),
      dueToday: isDueToday(h, dates, today),
      atRisk: streakAtRisk(h, dates, today),
      dates: [...dates].sort(),
    };
  });
}

/** Current value of a goal based on its link. */
export async function goalCurrentValue(goal: Goal, today: DateStr): Promise<number> {
  const range = { gte: goal.startDate, lte: today };
  switch (goal.linkType) {
    case "metric": {
      if (goal.linkMetric === "weight") {
        const latest = await prisma.healthLog.findFirst({
          where: { weightKg: { not: null }, date: { lte: today } },
          orderBy: { date: "desc" },
        });
        return latest?.weightKg ?? goal.startValue ?? 0;
      }
      if (goal.linkMetric === "sleep") {
        const agg = await prisma.healthLog.aggregate({ where: { date: range }, _avg: { sleepHours: true } });
        return agg._avg.sleepHours ?? 0;
      }
      const agg = await prisma.healthLog.aggregate({
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
      if (goal.linkMeasure === "count") return prisma.workout.count({ where });
      const agg = await prisma.workout.aggregate({ where, _sum: { distanceKm: true, durationMin: true } });
      return goal.linkMeasure === "minutes" ? agg._sum.durationMin ?? 0 : Math.round((agg._sum.distanceKm ?? 0) * 10) / 10;
    }
    case "habit": {
      if (!goal.linkHabitId) return 0;
      return prisma.habitCheckin.count({ where: { habitId: goal.linkHabitId, date: range } });
    }
    default: {
      const agg = await prisma.goalProgress.aggregate({ where: { goalId: goal.id }, _sum: { value: true } });
      return agg._sum.value ?? 0;
    }
  }
}

export type GoalView = Goal & GoalComputed & { habitName: string | null };

export async function getGoalViews(today: DateStr, includeArchived = false): Promise<GoalView[]> {
  const goals = await prisma.goal.findMany({
    where: includeArchived ? {} : { archived: false },
    include: { habit: { select: { name: true } } },
    orderBy: { deadline: "asc" },
  });
  return Promise.all(
    goals.map(async ({ habit, ...g }) => {
      const current = await goalCurrentValue(g, today);
      return { ...g, ...computeGoal(g, current, today), habitName: habit?.name ?? null };
    }),
  );
}

export async function getHealthRange(today: DateStr, days: number) {
  return prisma.healthLog.findMany({
    where: { date: { gte: addDays(today, -(days - 1)), lte: today } },
    orderBy: { date: "asc" },
  });
}

export async function getWorkoutsRange(today: DateStr, days: number) {
  return prisma.workout.findMany({
    where: { date: { gte: addDays(today, -(days - 1)), lte: today } },
    include: { exercises: { orderBy: { order: "asc" } } },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });
}

/** Share of active habits completed per day (for the dashboard heatmap). */
export function habitCompletionByDay(habits: HabitView[], today: DateStr, days: number) {
  const daily = habits.filter((h) => h.frequency !== "weekly");
  const pool = daily.length ? daily : habits;
  return lastNDays(today, days).map((date) => {
    const done = pool.filter((h) => h.dates.includes(date)).length;
    return { date, value: pool.length ? done / pool.length : 0, count: done };
  });
}
