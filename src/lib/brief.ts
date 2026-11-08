import "server-only";
import { z } from "zod";
import { prisma } from "./db";
import { getSettings } from "./settings";
import { addDays, formatDate, todayInTz } from "./dates";
import { getGoalViews, getHabitViews, getHealthRange, getWorkoutsRange } from "./queries";
import { computeInsights, type Insight } from "./insights";
import { goalDisplay } from "./goalDisplay";
import { describeWorkout } from "./format";
import { mlToDisplay, waterUnit, weightUnit } from "./units";
import { mean, round } from "./stats";
import { aiConfigured, complete } from "./ai";
import { extractJson } from "./import/schema";

export const BRIEF_SYSTEM_PROMPT = `You write the "daily brief" for a personal wellness tracking app.

You receive a JSON summary of the user's last 7 days, computed by the app. Return ONLY a JSON object, no markdown:
{"brief": string, "highlights": [{"id": string, "text": string}]}

"brief": 3-5 short sentences, plain text, second person, covering in this order:
  1. a recap of yesterday (only what was logged; if little was logged, keep it light),
  2. any streaks at risk today,
  3. how goals are going,
  4. one gentle, specific, optional suggestion for today.
"highlights": rephrase each provided highlight in a warm, concise way (max ~15 words each), keeping the same id and the same numbers. Do not add or drop highlights.

Tone and safety rules:
- Encouraging, calm and non-judgmental. Celebrate effort and consistency.
- Never shame or moralize about weight, body size, food, or missed days. Missing a day is normal; never say "failed", "bad", "should have".
- Only mention weight if it appears as progress toward a goal the user set.
- No medical advice or diagnoses. Don't interpret symptoms. Suggestions are lifestyle-level and optional ("you could…").
- Use only the numbers provided; never invent data.`;

export type BriefContext = Awaited<ReturnType<typeof buildContext>>;

async function buildContext() {
  const settings = await getSettings();
  const u = settings.units;
  const today = todayInTz(settings.timezone);
  const yesterday = addDays(today, -1);
  const [health, workouts, habits, goals, journal] = await Promise.all([
    getHealthRange(today, 90),
    getWorkoutsRange(today, 90),
    getHabitViews(today),
    getGoalViews(today),
    prisma.journalEntry.findMany({ where: { date: { gte: addDays(today, -60) } }, select: { date: true } }),
  ]);
  const insights = computeInsights({ today, units: u, health, workouts, habits, goals, journalDates: journal.map((j) => j.date) });

  const week = health.filter((h) => h.date >= addDays(today, -6));
  const weekWorkouts = workouts.filter((w) => w.date >= addDays(today, -6));
  const y = health.find((h) => h.date === yesterday);
  const avg = (xs: (number | null)[]) => {
    const m = mean(xs.filter((x): x is number => x != null));
    return m == null ? null : round(m, 1);
  };

  const context = {
    today: `${today} (${formatDate(today, { weekday: "long" })})`,
    name: settings.name || null,
    yesterday: {
      health: y
        ? {
            sleep_hours: y.sleepHours, sleep_quality: y.sleepQuality, mood: y.mood, energy: y.energy, steps: y.steps,
            water: y.waterMl != null ? `${mlToDisplay(y.waterMl, u)} ${waterUnit(u)}` : null,
          }
        : "not logged",
      workouts: workouts.filter((w) => w.date === yesterday).map((w) => describeWorkout(w, u)),
      habits_done: habits.filter((h) => h.dates.includes(yesterday)).map((h) => h.name),
      daily_habits_not_done: habits.filter((h) => h.frequency !== "weekly" && !h.dates.includes(yesterday)).map((h) => h.name),
      journaled: journal.some((j) => j.date === yesterday),
    },
    last_7_days: {
      days_logged: week.length,
      avg_sleep_hours: avg(week.map((h) => h.sleepHours)),
      avg_mood_1_to_5: avg(week.map((h) => h.mood)),
      avg_energy_1_to_5: avg(week.map((h) => h.energy)),
      avg_steps: avg(week.map((h) => h.steps)),
      workouts: weekWorkouts.length,
      workout_minutes: weekWorkouts.reduce((a, w) => a + w.durationMin, 0),
    },
    today_so_far: {
      habits_done: habits.filter((h) => h.checkedToday).map((h) => h.name),
    },
    streaks_at_risk_today: habits.filter((h) => h.atRisk).map((h) => ({ habit: h.name, current_streak: h.streak, unit: h.frequency === "weekly" ? "weeks" : "days" })),
    goals: goals.map((g) => {
      const d = goalDisplay(g, u);
      return { title: g.title, status: g.status, progress_pct: Math.round(g.pct), expected_pct_at_steady_pace: Math.round(g.expectedPct), current: d.current, target: d.target, unit: d.unit, days_left: g.daysLeft };
    }),
    highlights: insights.map((i) => ({ id: i.id, text: i.text })),
    weight_unit: weightUnit(u),
  };
  return { today, context, insights };
}

/** Template brief used when no API key is set or the AI call fails. */
export function fallbackBrief(ctx: BriefContext["context"]): string {
  const parts: string[] = [];
  const yh = ctx.yesterday;
  const bits: string[] = [];
  if (typeof yh.health === "object" && yh.health.sleep_hours != null) bits.push(`slept ${yh.health.sleep_hours}h`);
  if (yh.workouts.length) bits.push(`did ${yh.workouts.length === 1 ? "a workout" : `${yh.workouts.length} workouts`}`);
  if (yh.habits_done.length) bits.push(`checked off ${yh.habits_done.length} habit${yh.habits_done.length === 1 ? "" : "s"}`);
  parts.push(bits.length ? `Yesterday you ${bits.join(", ")}.` : "Yesterday was a quiet day in your log — that's perfectly fine.");
  if (ctx.streaks_at_risk_today.length) {
    const s = ctx.streaks_at_risk_today[0];
    parts.push(`Your ${s.habit.toLowerCase()} streak (${s.current_streak} ${s.unit}) is waiting for today's check-in.`);
  }
  const onTrack = ctx.goals.filter((g) => g.status === "on-track" || g.status === "done").length;
  if (ctx.goals.length) parts.push(`${onTrack} of ${ctx.goals.length} goal${ctx.goals.length === 1 ? " is" : "s are"} on track.`);
  if (ctx.last_7_days.avg_sleep_hours != null && ctx.last_7_days.avg_sleep_hours < 7) parts.push("If it suits you, an earlier wind-down tonight could help your energy tomorrow.");
  else if (ctx.last_7_days.workouts === 0) parts.push("A short walk today could be a nice, easy win.");
  else parts.push("Keep doing what feels good — small steps add up.");
  return parts.join(" ");
}

const BriefResponse = z.object({
  brief: z.string().min(10).max(1500),
  highlights: z.array(z.object({ id: z.string(), text: z.string().min(1).max(300) })).default([]),
});

export type BriefResult = { brief: string; source: "ai" | "fallback"; createdAt: string; error?: string };

/** Return today's cached brief, generating (and caching) it if needed. */
export async function getOrCreateBrief(force = false): Promise<BriefResult> {
  const { today, context, insights } = await buildContext();
  if (!force) {
    const cached = await prisma.dailyBrief.findUnique({ where: { date: today } });
    if (cached) return { brief: cached.brief, source: cached.source as "ai" | "fallback", createdAt: cached.createdAt.toISOString() };
  }

  let brief = fallbackBrief(context);
  let highlights: { id: string; text: string }[] = insights.map((i: Insight) => ({ id: i.id, text: i.text }));
  let source: "ai" | "fallback" = "fallback";
  let error: string | undefined;

  if (aiConfigured()) {
    try {
      const text = await complete({ system: BRIEF_SYSTEM_PROMPT, user: JSON.stringify(context, null, 1), maxTokens: 4000, effort: "low" });
      const json = extractJson(text);
      const parsed = json ? BriefResponse.safeParse(JSON.parse(json)) : null;
      if (parsed?.success) {
        brief = parsed.data.brief.trim();
        const valid = new Set(insights.map((i) => i.id));
        const phrased = parsed.data.highlights.filter((h) => valid.has(h.id));
        highlights = highlights.map((h) => phrased.find((p) => p.id === h.id) ?? h);
        source = "ai";
      } else {
        error = "The AI response couldn't be read, so a simple summary is shown.";
      }
    } catch (e) {
      error = (e as Error).message;
    }
  }

  // Cached once per day; the refresh button regenerates (and retries after an AI error).
  const row = await prisma.dailyBrief.upsert({
    where: { date: today },
    update: { brief, highlights: JSON.stringify(highlights), source: error ? "fallback" : source, createdAt: new Date() },
    create: { date: today, brief, highlights: JSON.stringify(highlights), source: error ? "fallback" : source },
  });
  return { brief, source, createdAt: row.createdAt.toISOString(), error };
}
