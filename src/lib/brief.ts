import "server-only";
import type { ScopedDb } from "./db";
import { addDays, formatDate, todayInTz, type DateStr } from "./dates";
import { loadSettings } from "./settings";
import { getGoalViews, getHabitViews, getHealthRange, getWorkoutsRange } from "./queries";
import { computeInsights, type Insight } from "./insights";
import { briefNumbers, composeBrief, type BriefFacts } from "./briefText";
import { mean, round } from "./stats";

/**
 * The daily brief is generated entirely in code from the user's own numbers
 * (no AI service, nothing leaves the server). Phrasing varies by day.
 */
export async function buildBrief(db: ScopedDb, userId: string): Promise<{ today: DateStr; brief: string; numbers: { label: string; value: string }[]; insights: Insight[] }> {
  const settings = await loadSettings(db, userId);
  const today = todayInTz(settings.timezone);
  const yesterday = addDays(today, -1);
  const [health, workouts, habits, goals, journal] = await Promise.all([
    getHealthRange(db, today, 90),
    getWorkoutsRange(db, today, 90),
    getHabitViews(db, today),
    getGoalViews(db, today),
    db.journalEntry.findMany({ where: { date: { gte: addDays(today, -60) } }, select: { date: true } }),
  ]);
  const insights = computeInsights({ today, units: settings.units, health, workouts, habits, goals, journalDates: journal.map((j) => j.date) });
  const y = health.find((h) => h.date === yesterday);
  const week = health.filter((h) => h.date >= addDays(today, -6));
  const avg = (xs: (number | null)[]) => {
    const m = mean(xs.filter((x): x is number => x != null));
    return m == null ? null : round(m, 1);
  };
  const facts: BriefFacts = {
    seed: `${userId}:${today}`,
    weekday: formatDate(today, { weekday: "long" }),
    name: settings.name,
    yesterday: {
      sleepHours: y?.sleepHours ?? null,
      workouts: workouts.filter((w) => w.date === yesterday).map((w) => ({ type: w.type, minutes: w.durationMin })),
      habitsDone: habits.filter((h) => h.dates.includes(yesterday)).length,
      logged: !!y,
    },
    atRisk: habits.filter((h) => h.atRisk && h.streak >= 2).map((h) => ({ name: h.name, streak: h.streak, unit: h.streakUnit })),
    openToday: habits.filter((h) => h.dueToday && !h.checkedToday).length,
    goals: { total: goals.length, onTrack: goals.filter((g) => g.status === "on-track" || g.status === "done").length, behind: goals.filter((g) => g.status === "behind").map((g) => g.title) },
    week: { sleep: avg(week.map((h) => h.sleepHours)), workouts: workouts.filter((w) => w.date >= addDays(today, -6)).length, steps: avg(week.map((h) => h.steps)) },
  };
  return { today, brief: composeBrief(facts), numbers: briefNumbers(facts), insights };
}
