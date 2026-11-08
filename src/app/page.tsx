import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { addDays, formatDate, todayInTz } from "@/lib/dates";
import { getGoalViews, getHabitViews, getHealthRange, getWorkoutsRange, habitCompletionByDay } from "@/lib/queries";
import { healthTrendSpecs, weeklyVolume } from "@/lib/trends";
import { computeInsights } from "@/lib/insights";
import { kgToDisplay, mlToDisplay, waterUnit, weightUnit } from "@/lib/units";
import { describeWorkout } from "@/lib/format";
import { MOOD_EMOJI, ENERGY_EMOJI } from "@/lib/constants";
import { HabitCheckList } from "@/components/HabitCheckList";
import { QuickAdd } from "@/components/QuickAdd";
import { TrendGroup, WorkoutVolumeChart } from "@/components/charts";
import { Heatmap } from "@/components/Heatmap";
import { GoalSummary } from "@/components/GoalCard";
import { DailyBrief } from "@/components/DailyBrief";

function greeting(name: string, timeZone: string) {
  let h = new Date().getHours();
  try {
    h = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone }).format(new Date()));
  } catch {}
  const part = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return name ? `${part}, ${name}` : part;
}

export default async function Dashboard() {
  const settings = await getSettings();
  const { units: u, visibleModules: vis } = settings;
  const today = todayInTz(settings.timezone);

  const [health, workouts, habits, goals, journal, cached] = await Promise.all([
    getHealthRange(today, 90),
    getWorkoutsRange(today, 90),
    getHabitViews(today),
    getGoalViews(today),
    prisma.journalEntry.findMany({ where: { date: { gte: addDays(today, -60) } }, select: { date: true } }),
    prisma.dailyBrief.findUnique({ where: { date: today } }),
  ]);

  const todayLog = health.find((h) => h.date === today) ?? null;
  const lastWeight = [...health].reverse().find((h) => h.weightKg != null)?.weightKg ?? null;
  const todaysWorkouts = workouts.filter((w) => w.date === today);
  const insights = computeInsights({
    today, units: u, health, workouts, habits, goals, journalDates: journal.map((j) => j.date),
  });
  const heat = Object.fromEntries(habitCompletionByDay(habits, today, 91).map((d) => [d.date, d.value]));
  const doneCount = habits.filter((h) => h.dueToday && h.checkedToday).length;
  const dueCount = habits.filter((h) => h.dueToday).length;
  const hasAnyData = health.length + workouts.length + habits.length + goals.length > 0;

  // AI-phrased highlight text (cached with the brief), keyed by insight id.
  const phrased = new Map<string, string>();
  try {
    for (const h of cached ? (JSON.parse(cached.highlights) as { id: string; text: string }[]) : []) phrased.set(h.id, h.text);
  } catch {}

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-muted">{formatDate(today, { weekday: "long", month: "long", day: "numeric" })}</p>
        <h1 className="h1 mt-0.5">{greeting(settings.name, settings.timezone)} 🌿</h1>
      </header>

      <DailyBrief initial={cached ? { brief: cached.brief, source: cached.source, createdAt: cached.createdAt.toISOString() } : null} hasData={hasAnyData} />

      <section>
        <QuickAdd
          today={today}
          units={u}
          visible={vis}
          lastWeight={lastWeight != null ? kgToDisplay(lastWeight, u) : null}
          lastWorkout={workouts.length ? describeWorkout(workouts[workouts.length - 1], u) : null}
          healthToday={
            todayLog
              ? {
                  weight: todayLog.weightKg != null ? kgToDisplay(todayLog.weightKg, u) : null,
                  sleepHours: todayLog.sleepHours, sleepQuality: todayLog.sleepQuality,
                  water: todayLog.waterMl != null ? mlToDisplay(todayLog.waterMl, u) : null,
                  mood: todayLog.mood, energy: todayLog.energy, steps: todayLog.steps, custom: {}, notes: todayLog.notes,
                }
              : null
          }
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {vis.includes("habits") && (
          <section className="card">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="h2">Today&apos;s habits</h2>
              {dueCount > 0 && <span className="text-xs text-muted">{doneCount}/{dueCount} done</span>}
            </div>
            <HabitCheckList habits={habits} />
          </section>
        )}

        <section className="card space-y-4">
          <h2 className="h2">Today so far</h2>
          {vis.includes("health") && (
            todayLog ? (
              <div className="grid grid-cols-3 gap-2 text-center">
                <Stat label="Sleep" value={todayLog.sleepHours != null ? `${todayLog.sleepHours}h` : "—"} />
                <Stat label="Mood" value={todayLog.mood ? MOOD_EMOJI[todayLog.mood - 1] : "—"} />
                <Stat label="Energy" value={todayLog.energy ? ENERGY_EMOJI[todayLog.energy - 1] : "—"} />
                <Stat label="Steps" value={todayLog.steps != null ? todayLog.steps.toLocaleString("en-US") : "—"} />
                <Stat label={`Water`} value={todayLog.waterMl != null ? `${mlToDisplay(todayLog.waterMl, u)} ${waterUnit(u)}` : "—"} />
                <Stat label="Weight" value={todayLog.weightKg != null ? `${kgToDisplay(todayLog.weightKg, u)} ${weightUnit(u)}` : "—"} />
              </div>
            ) : (
              <p className="text-sm text-muted">No health log yet today. Tap <b>Log health</b> above — it takes a few seconds.</p>
            )
          )}
          {vis.includes("workouts") && (
            <div className="text-sm">
              {todaysWorkouts.length ? (
                <ul className="space-y-1">{todaysWorkouts.map((w) => <li key={w.id}>{describeWorkout(w, u)}</li>)}</ul>
              ) : (
                <p className="text-muted">No workout logged today — rest days count too.</p>
              )}
            </div>
          )}
        </section>
      </div>

      {insights.length > 0 && (
        <section className="card">
          <h2 className="h2 mb-3">Highlights</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {insights.map((i) => (
              <li key={i.id} className="flex items-start gap-3 rounded-xl bg-surface-2 px-3 py-2.5 text-sm">
                <span aria-hidden className="text-lg leading-5">{i.emoji}</span>
                <span>{phrased.get(i.id) ?? i.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {vis.includes("health") && <TrendGroup specs={healthTrendSpecs(health, today, u)} />}

      <div className="grid gap-6 lg:grid-cols-2">
        {vis.includes("workouts") && (
          <section className="card">
            <h2 className="h2 mb-3">Weekly workout minutes</h2>
            <WorkoutVolumeChart data={weeklyVolume(workouts, today, 8)} />
          </section>
        )}
        {vis.includes("habits") && habits.length > 0 && (
          <section className="card">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="h2">Habit consistency</h2>
              <Link href="/habits" className="text-xs text-primary">Details ›</Link>
            </div>
            <Heatmap values={heat} today={today} weeks={13} />
            <p className="mt-2 text-xs text-muted">Last 13 weeks · darker = more daily habits done</p>
          </section>
        )}
      </div>

      {vis.includes("goals") && goals.length > 0 && (
        <section className="card">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="h2">Goals</h2>
            <Link href="/goals" className="text-xs text-primary">Manage ›</Link>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            {goals.map((g) => <GoalSummary key={g.id} goal={g} units={u} />)}
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-2 px-2 py-2.5">
      <div className="text-base font-medium">{value}</div>
      <div className="text-[11px] text-muted uppercase">{label}</div>
    </div>
  );
}
