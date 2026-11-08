import "server-only";
import type { ScopedDb } from "./db";
import { addDays, formatDate, startOfWeek, todayInTz, type DateStr } from "./dates";
import { loadSettings } from "./settings";
import { getGoalViews, getHabitViews } from "./queries";
import { mean, round } from "./stats";
import { goalDisplay } from "./goalDisplay";
import { kmToDisplay, distanceUnit } from "./units";

export type WeekStats = Awaited<ReturnType<typeof weekStats>>;
export type ReviewContent = { summary: string; wins: string[]; focus: string };

/** Numbers for one Mon–Sun week (computed in code; the AI only writes prose). */
export async function weekStats(db: ScopedDb, userId: string, weekStart: DateStr) {
  const settings = await loadSettings(db, userId);
  const u = settings.units;
  const today = todayInTz(settings.timezone);
  const end = addDays(weekStart, 6);
  const upTo = end < today ? end : today;
  const prevStart = addDays(weekStart, -7);
  const [health, workouts, prevWorkouts, habits, goals, journalDays] = await Promise.all([
    db.healthLog.findMany({ where: { date: { gte: weekStart, lte: end } } }),
    db.workout.findMany({ where: { date: { gte: weekStart, lte: end } } }),
    db.workout.findMany({ where: { date: { gte: prevStart, lt: weekStart } } }),
    getHabitViews(db, upTo),
    getGoalViews(db, upTo),
    db.journalEntry.findMany({ where: { date: { gte: weekStart, lte: end } }, select: { date: true }, distinct: ["date"] }),
  ]);
  const avg = (xs: (number | null)[]) => {
    const m = mean(xs.filter((x): x is number => x != null));
    return m == null ? null : round(m, 1);
  };
  const daysElapsed = Math.max(1, Math.min(7, Math.round((Date.parse(upTo) - Date.parse(weekStart)) / 86400000) + 1));
  const minutes = workouts.reduce((a, w) => a + w.durationMin, 0);
  const byType: Record<string, number> = {};
  for (const w of workouts) byType[w.type] = (byType[w.type] ?? 0) + w.durationMin;
  const distKm = workouts.reduce((a, w) => a + (w.distanceKm ?? 0), 0);

  return {
    weekStart,
    end,
    complete: end < today,
    label: `${formatDate(weekStart, { month: "short", day: "numeric" })} – ${formatDate(end, { month: "short", day: "numeric" })}`,
    name: settings.name,
    daysLogged: health.length,
    sleep: avg(health.map((h) => h.sleepHours)),
    mood: avg(health.map((h) => h.mood)),
    energy: avg(health.map((h) => h.energy)),
    steps: avg(health.map((h) => h.steps)),
    workouts: workouts.length,
    minutes,
    prevMinutes: prevWorkouts.reduce((a, w) => a + w.durationMin, 0),
    byType,
    distance: distKm ? `${kmToDisplay(distKm, u)} ${distanceUnit(u)}` : null,
    journalDays: journalDays.length,
    habits: habits.map((h) => {
      const done = h.dates.filter((d) => d >= weekStart && d <= end).length;
      const target = h.frequency === "weekly" ? h.timesPerWeek : daysElapsed;
      return { name: h.name, emoji: h.emoji, done, target, pct: Math.min(100, Math.round((done / Math.max(1, target)) * 100)), streak: h.streak };
    }),
    goals: goals.map((g) => {
      const d = goalDisplay(g, u);
      return { title: g.title, status: g.status, pct: Math.round(g.pct), current: d.current, target: d.target, unit: d.unit };
    }),
  };
}

export function fallbackReview(s: WeekStats): ReviewContent {
  const wins: string[] = [];
  const best = [...s.habits].sort((a, b) => b.pct - a.pct)[0];
  if (best && best.done) wins.push(`${best.name}: ${best.done} of ${best.target} this week.`);
  if (s.workouts) wins.push(`${s.workouts} workout${s.workouts === 1 ? "" : "s"}, ${s.minutes} active minutes.`);
  if (s.journalDays) wins.push(`You journaled on ${s.journalDays} day${s.journalDays === 1 ? "" : "s"}.`);
  if (s.sleep != null) wins.push(`Average sleep: ${s.sleep} hours.`);
  return {
    summary: s.daysLogged || s.workouts
      ? `This week you showed up for yourself on ${Math.max(s.daysLogged, s.workouts)} day${Math.max(s.daysLogged, s.workouts) === 1 ? "" : "s"}. Every entry is a small act of care.`
      : "A quiet week in your log — that's okay. Next week is a fresh start.",
    wins: wins.length ? wins : ["You opened Thrivie — that counts."],
    focus: s.sleep != null && s.sleep < 7 ? "You could try winding down 20 minutes earlier on a couple of nights." : "You could pick one habit to protect on your busiest day.",
  };
}

/** Weekly review: numbers computed in code, prose from templates (no AI service). */
export async function getReview(db: ScopedDb, userId: string, weekStart: DateStr) {
  const stats = await weekStats(db, userId, weekStart);
  return { stats, review: fallbackReview(stats) };
}

export function weekFromParam(param: string | undefined, today: DateStr): DateStr {
  const thisWeek = startOfWeek(today);
  if (param && /^\d{4}-\d{2}-\d{2}$/.test(param)) {
    const w = startOfWeek(param);
    return w > thisWeek ? thisWeek : w;
  }
  // Default: last full week early in the week, otherwise this week so far.
  return today <= addDays(thisWeek, 1) ? addDays(thisWeek, -7) : thisWeek;
}
