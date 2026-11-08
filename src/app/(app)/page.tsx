import Link from "next/link";
import { CalendarDays, CircleCheck, Dumbbell, Sun, Target, Trophy } from "lucide-react";
import { getSettings } from "@/lib/settings";
import { requireUser } from "@/lib/auth";
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
import { buildBrief } from "@/lib/brief";

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
  const { db, user } = await requireUser();
  const { units: u, visibleModules: vis } = settings;
  const today = todayInTz(settings.timezone);

  const [health, workouts, habits, goals, journal, brief] = await Promise.all([
    getHealthRange(db, today, 90),
    getWorkoutsRange(db, today, 90),
    getHabitViews(db, today),
    getGoalViews(db, today),
    db.journalEntry.findMany({ where: { date: { gte: addDays(today, -60) } }, select: { date: true } }),
    buildBrief(db, user.id),
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


  return (
    <div className="space-y-6">
      <header className="pt-1">
        <p className="eyebrow">{formatDate(today, { weekday: "long", month: "long", day: "numeric" })}</p>
        <h1 className="h1 mt-2">
          {greeting(settings.name, settings.timezone)}
          <span className="text-gold">.</span>
        </h1>
        {dueCount > 0 && (
          <p className="mt-2 text-sm text-muted">
            {doneCount === dueCount ? "Every habit done today — beautifully consistent." : `${dueCount - doneCount} habit${dueCount - doneCount === 1 ? "" : "s"} left today. You've got this.`}
          </p>
        )}
      </header>

      <DailyBrief brief={brief.brief} hasData={hasAnyData} />

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
            <div className="mb-4 flex items-center justify-between">
              <SectionTitle icon={<CircleCheck size={16} />} tone="bg-emerald-soft text-emerald">Today&apos;s habits</SectionTitle>
              {dueCount > 0 && <Ring done={doneCount} total={dueCount} />}
            </div>
            <HabitCheckList habits={habits} />
          </section>
        )}

        <section className="card space-y-4">
          <SectionTitle icon={<Sun size={16} />} tone="bg-gold-soft text-gold">Today so far</SectionTitle>
          {vis.includes("health") && (
            todayLog ? (
              <div className="grid grid-cols-3 gap-2.5 text-center">
                <Stat tone="bg-sapphire-soft text-sapphire" label="Sleep" value={todayLog.sleepHours != null ? `${todayLog.sleepHours}h` : "—"} />
                <Stat tone="bg-plum-soft text-plum" label="Mood" value={todayLog.mood ? MOOD_EMOJI[todayLog.mood - 1] : "—"} />
                <Stat tone="bg-amber-soft text-amber" label="Energy" value={todayLog.energy ? ENERGY_EMOJI[todayLog.energy - 1] : "—"} />
                <Stat tone="bg-emerald-soft text-emerald" label="Steps" value={todayLog.steps != null ? todayLog.steps.toLocaleString("en-US") : "—"} />
                <Stat tone="bg-teal-soft text-teal" label="Water" value={todayLog.waterMl != null ? `${mlToDisplay(todayLog.waterMl, u)} ${waterUnit(u)}` : "—"} />
                <Stat tone="bg-rose-soft text-rose" label="Weight" value={todayLog.weightKg != null ? `${kgToDisplay(todayLog.weightKg, u)} ${weightUnit(u)}` : "—"} />
              </div>
            ) : (
              <p className="text-sm text-muted">No health log yet today. Tap <b>Log health</b> above — it takes a few seconds.</p>
            )
          )}
          {vis.includes("workouts") && (
            <div className="text-sm">
              {todaysWorkouts.length ? (
                <ul className="space-y-2">
                  {todaysWorkouts.map((w) => (
                    <li key={w.id} className="rounded-2xl bg-sapphire-soft px-3.5 py-2.5 font-medium text-sapphire">{describeWorkout(w, u)}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted">No workout logged today — rest days count too.</p>
              )}
            </div>
          )}
        </section>
      </div>

      {insights.length > 0 && (
        <section className="card">
          <div className="mb-4"><SectionTitle icon={<Trophy size={16} />} tone="bg-amber-soft text-amber">Highlights</SectionTitle></div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {insights.map((i, idx) => (
              <li key={i.id} className={`flex items-center gap-3.5 rounded-2xl px-4 py-3.5 text-sm font-medium ${HIGHLIGHT_TONES[idx % HIGHLIGHT_TONES.length]}`}>
                <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface text-xl shadow-sm">{i.emoji}</span>
                <span className="text-text">{i.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {vis.includes("health") && <TrendGroup specs={healthTrendSpecs(health, today, u)} />}

      <div className="grid gap-6 lg:grid-cols-2">
        {vis.includes("workouts") && (
          <section className="card">
            <div className="mb-4"><SectionTitle icon={<Dumbbell size={16} />} tone="bg-sapphire-soft text-sapphire">Weekly workout minutes</SectionTitle></div>
            <WorkoutVolumeChart data={weeklyVolume(workouts, today, 8)} />
          </section>
        )}
        {vis.includes("habits") && habits.length > 0 && (
          <section className="card">
            <div className="mb-4 flex items-center justify-between">
              <SectionTitle icon={<CalendarDays size={16} />} tone="bg-emerald-soft text-emerald">Habit consistency</SectionTitle>
              <Link href="/habits" className="text-xs font-semibold text-primary">Details ›</Link>
            </div>
            <Heatmap values={heat} today={today} weeks={13} />
            <p className="mt-2 text-xs text-muted">Last 13 weeks · darker = more daily habits done</p>
          </section>
        )}
      </div>

      {vis.includes("goals") && goals.length > 0 && (
        <section className="card">
          <div className="mb-4 flex items-center justify-between">
            <SectionTitle icon={<Target size={16} />} tone="bg-amber-soft text-amber">Goals</SectionTitle>
            <Link href="/goals" className="text-xs font-semibold text-primary">Manage ›</Link>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            {goals.map((g) => <GoalSummary key={g.id} goal={g} units={u} />)}
          </div>
        </section>
      )}
    </div>
  );
}

const HIGHLIGHT_TONES = [
  "bg-linear-to-br from-amber-soft to-gold-soft",
  "bg-linear-to-br from-sapphire-soft to-teal-soft",
  "bg-linear-to-br from-emerald-soft to-teal-soft",
  "bg-linear-to-br from-plum-soft to-rose-soft",
  "bg-linear-to-br from-rose-soft to-amber-soft",
];

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className={`rounded-2xl px-2 py-3 ${tone}`}>
      <div className="font-display text-lg font-semibold text-text">{value}</div>
      <div className="mt-0.5 text-[10px] font-bold tracking-[0.12em] uppercase opacity-90">{label}</div>
    </div>
  );
}

function SectionTitle({ icon, tone, children }: { icon: React.ReactNode; tone: string; children: React.ReactNode }) {
  return (
    <h2 className="h2 flex items-center gap-2.5">
      <span className={`grid h-8 w-8 place-items-center rounded-xl ${tone}`}>{icon}</span>
      {children}
    </h2>
  );
}

/** Small progress ring for "habits done today". */
function Ring({ done, total }: { done: number; total: number }) {
  const r = 16;
  const c = 2 * Math.PI * r;
  const pct = total ? done / total : 0;
  return (
    <div className="relative grid h-11 w-11 place-items-center" title={`${done} of ${total} done`}>
      <svg viewBox="0 0 40 40" className="absolute inset-0 -rotate-90">
        <circle cx="20" cy="20" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="4" />
        <circle cx="20" cy="20" r={r} fill="none" stroke="var(--emerald)" strokeWidth="4" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} style={{ transition: "stroke-dashoffset .6s" }} />
      </svg>
      <span className="text-[11px] font-bold">{done}/{total}</span>
    </div>
  );
}
