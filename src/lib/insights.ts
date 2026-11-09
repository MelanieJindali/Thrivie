// Highlights: wins and patterns computed in code. The AI only re-phrases
// these facts; it never invents numbers.
import { addDays, diffDays, startOfWeek, type DateStr } from "./dates";
import { mean, round } from "./stats";
import { kgToDisplay, kmToDisplay, distanceUnit, weightUnit, type Units } from "./units";

export type Insight = { id: string; text: string; score: number; emoji: string };

type HealthRow = { date: string; sleepHours: number | null; mood: number | null; energy: number | null; steps: number | null; weightKg: number | null };
type WorkoutRow = { date: string; type: string; durationMin: number; distanceKm: number | null };
type HabitRow = { name: string; streakUnit: "day" | "week" | "month"; streak: number; longest: number; dates: string[] };
type GoalRow = { title: string; status: string; pct: number; linkType: string; linkMetric: string | null; startValue: number | null; current: number; target: number };

export type InsightInput = {
  today: DateStr;
  units: Units;
  health: HealthRow[];
  workouts: WorkoutRow[];
  habits: HabitRow[];
  goals: GoalRow[];
  journalDates: string[];
};

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export function computeInsights(input: InsightInput): Insight[] {
  const { today, units, health, workouts, habits, goals, journalDates } = input;
  const out: Insight[] = [];
  const workoutDays = new Set(workouts.map((w) => w.date));

  // 1. Habit streak records and notable streaks
  for (const h of habits) {
    const unit = h.streakUnit;
    if (h.streak >= 3 && h.streak >= h.longest) {
      out.push({ id: `streak-record-${h.name}`, emoji: "🏆", score: 90 + Math.min(h.streak, 30), text: `${h.name}: your longest streak yet — ${plural(h.streak, unit)}.` });
    } else if (h.streak >= 5) {
      out.push({ id: `streak-${h.name}`, emoji: "🔥", score: 60 + Math.min(h.streak, 30), text: `${h.name}: ${plural(h.streak, unit)} in a row.` });
    }
  }

  // 2. Sleep on workout days vs rest days (last 60 days)
  const recent = health.filter((h) => diffDays(h.date, today) < 60 && h.date <= today);
  const split = (key: "sleepHours" | "mood" | "energy") => {
    const on = recent.filter((h) => workoutDays.has(h.date) && h[key] != null).map((h) => h[key] as number);
    const off = recent.filter((h) => !workoutDays.has(h.date) && h[key] != null).map((h) => h[key] as number);
    if (on.length < 4 || off.length < 4) return null;
    return mean(on)! - mean(off)!;
  };
  const sleepDiff = split("sleepHours");
  if (sleepDiff != null && Math.abs(sleepDiff) >= 0.4) {
    const hrs = round(Math.abs(sleepDiff), 1);
    const amount = hrs >= 0.9 && hrs <= 1.1 ? "about 1 hour" : `about ${hrs} hours`;
    out.push({
      id: "sleep-workout",
      emoji: "😴",
      score: 80,
      text: sleepDiff > 0 ? `You sleep ${amount} more on workout days.` : `You sleep ${amount} less on workout days — worth noticing.`,
    });
  }
  const moodDiff = split("mood");
  if (moodDiff != null && moodDiff >= 0.4) {
    out.push({ id: "mood-workout", emoji: "🙂", score: 75, text: `Your mood averages ${round(moodDiff, 1)} points higher on days you move.` });
  }

  // 3. Workouts this week vs last week
  const ws = startOfWeek(today);
  const thisWeek = workouts.filter((w) => w.date >= ws && w.date <= today);
  const lastWeek = workouts.filter((w) => w.date >= addDays(ws, -7) && w.date < ws);
  const minutes = (xs: WorkoutRow[]) => xs.reduce((a, w) => a + w.durationMin, 0);
  if (thisWeek.length && minutes(thisWeek) > minutes(lastWeek)) {
    out.push({ id: "week-volume", emoji: "💪", score: 70, text: `${minutes(thisWeek)} active minutes this week — already more than last week (${minutes(lastWeek)}).` });
  } else if (thisWeek.length >= 2) {
    out.push({ id: "week-count", emoji: "💪", score: 50, text: `${plural(thisWeek.length, "workout")} so far this week.` });
  }

  // 4. Distance in the last 30 days
  const dist = workouts.filter((w) => diffDays(w.date, today) < 30 && w.date <= today).reduce((a, w) => a + (w.distanceKm ?? 0), 0);
  if (dist >= 5) out.push({ id: "distance", emoji: "🏃", score: 55, text: `${Math.round(kmToDisplay(dist, units) * 10) / 10} ${distanceUnit(units)} covered in the last 30 days.` });

  // 5. Steps trend: this week's average vs the previous 3 weeks
  const avgSteps = (from: DateStr, to: DateStr) => mean(health.filter((h) => h.date >= from && h.date <= to && h.steps != null).map((h) => h.steps!));
  const s1 = avgSteps(addDays(today, -6), today);
  const s0 = avgSteps(addDays(today, -27), addDays(today, -7));
  if (s1 && s0 && s1 > s0 * 1.08) {
    out.push({ id: "steps-up", emoji: "👟", score: 58, text: `Steps are up ${Math.round((s1 / s0 - 1) * 100)}% this week (avg ${Math.round(s1).toLocaleString("en-US")}/day).` });
  }

  // 6. Goals
  const done = goals.filter((g) => g.status === "done");
  const onTrack = goals.filter((g) => g.status === "on-track");
  for (const g of done) out.push({ id: `goal-done-${g.title}`, emoji: "🎯", score: 95, text: `Goal reached: ${g.title}!` });
  if (onTrack.length >= 2) out.push({ id: "goals-on-track", emoji: "🎯", score: 52, text: `${onTrack.length} of ${goals.length} goals are on track.` });
  // Weight is only mentioned as progress toward a goal the user set, never on its own.
  for (const g of goals) {
    if (g.linkType === "metric" && g.linkMetric === "weight" && g.startValue != null && g.status !== "done") {
      const moved = (g.current - g.startValue) * Math.sign(g.target - g.startValue);
      if (moved >= 0.5) out.push({ id: `weight-goal-${g.title}`, emoji: "📈", score: 54, text: `${kgToDisplay(moved, units)} ${weightUnit(units)} closer to “${g.title}”.` });
    }
  }

  // 7. Journaling consistency
  const j30 = new Set(journalDates.filter((d) => diffDays(d, today) < 30 && d <= today)).size;
  if (j30 >= 6) out.push({ id: "journal", emoji: "📝", score: 45, text: `You journaled on ${j30} days this month.` });

  // 8. Sleep consistency this week
  const sleepWeek = health.filter((h) => diffDays(h.date, today) < 7 && h.sleepHours != null).map((h) => h.sleepHours!);
  if (sleepWeek.length >= 5 && sleepWeek.every((x) => x >= 7)) {
    out.push({ id: "sleep-7", emoji: "🌙", score: 65, text: `7+ hours of sleep on all ${sleepWeek.length} nights logged this week.` });
  }

  return out.sort((a, b) => b.score - a.score).slice(0, 5);
}
