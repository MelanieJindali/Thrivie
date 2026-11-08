import "server-only";
import { z } from "zod";
import type { ScopedDb } from "./db";
import { addDays, formatDate, startOfWeek, todayInTz, type DateStr } from "./dates";
import { loadSettings } from "./settings";
import { getGoalViews, getHabitViews } from "./queries";
import { mean, round } from "./stats";
import { goalDisplay } from "./goalDisplay";
import { aiConfigured, complete } from "./ai";
import { extractJson } from "./import/schema";
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

const REVIEW_PROMPT = `You write a short weekly review for a personal wellness tracking app.
You get a JSON summary of one week, computed by the app. Return ONLY JSON:
{"summary": string, "wins": [string, string, string], "focus": string}
- summary: 2-3 warm sentences reflecting on the week as a whole.
- wins: 2-4 specific wins drawn from the numbers (consistency counts as a win).
- focus: one gentle, optional, concrete idea for next week ("You could…").
Rules: encouraging and non-judgmental; never shame about weight, food, or missed days; no medical advice;
mention weight only as progress toward a goal the user set; use only the numbers provided.`;

function fallbackReview(s: WeekStats): ReviewContent {
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

const ReviewSchema = z.object({ summary: z.string().min(10).max(1200), wins: z.array(z.string().min(1).max(300)).min(1).max(5), focus: z.string().min(5).max(400) });

export async function getReview(db: ScopedDb, userId: string, weekStart: DateStr, generate: boolean) {
  const stats = await weekStats(db, userId, weekStart);
  const cached = await db.weeklyReview.findUnique({ where: { userId_weekStart: { userId, weekStart } } });
  if (cached && !generate) return { stats, review: JSON.parse(cached.content) as ReviewContent, source: cached.source, error: null as string | null };
  if (!generate) return { stats, review: null, source: null, error: null };

  let review = fallbackReview(stats);
  let source = "fallback";
  let error: string | null = null;
  if (aiConfigured()) {
    try {
      const { habits, goals, ...rest } = stats;
      const text = await complete({ system: REVIEW_PROMPT, user: JSON.stringify({ ...rest, habits, goals }), maxTokens: 3000, effort: "low" });
      const parsed = ReviewSchema.safeParse(JSON.parse(extractJson(text) ?? "null"));
      if (parsed.success) {
        review = parsed.data;
        source = "ai";
      } else error = "The AI response couldn't be read, so a simple review is shown.";
    } catch (e) {
      error = (e as Error).message;
    }
  }
  await db.weeklyReview.upsert({
    where: { userId_weekStart: { userId, weekStart } },
    update: { content: JSON.stringify(review), source, createdAt: new Date() },
    create: { userId, weekStart, content: JSON.stringify(review), source },
  });
  return { stats, review, source, error };
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
