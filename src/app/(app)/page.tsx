import Link from "next/link";
import { HeartPulse, Dumbbell, Repeat, NotebookPen, ClipboardPaste, CircleCheck, Sun, Trophy, ChevronRight, Utensils } from "lucide-react";
import { getSettings } from "@/lib/settings";
import { requireUser } from "@/lib/auth";
import { formatDate, todayInTz } from "@/lib/dates";
import { buildBrief } from "@/lib/brief";
import { getGoalViews, getHabitViews, getWorkoutsRange } from "@/lib/queries";
import { kgToDisplay, mlToDisplay, waterUnit, weightUnit } from "@/lib/units";
import { describeWorkout } from "@/lib/format";
import { MOOD_EMOJI, ENERGY_EMOJI } from "@/lib/constants";
import { HabitCheckList } from "@/components/HabitCheckList";
import { DailyBrief } from "@/components/DailyBrief";
import { ProgressRing } from "@/components/ProgressRing";
import { RepeatLastButton } from "@/components/RepeatLastButton";
import { goalDisplay } from "@/lib/goalDisplay";
import { dayTotals, macroLine } from "@/lib/nutrition";

function greeting(name: string, timeZone: string) {
  let h = 12;
  try {
    h = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone }).format(new Date()));
  } catch {}
  const part = h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return name ? `${part}, ${name}` : part;
}

const MILESTONES = [7, 14, 30, 50, 100, 365];

export default async function TodayPage() {
  const settings = await getSettings();
  const { db, user } = await requireUser();
  const { units: u, visibleModules: vis } = settings;
  const today = todayInTz(settings.timezone);

  const [habits, goals, recentWorkouts, todayLog, brief, todayMeals] = await Promise.all([
    getHabitViews(db, today),
    getGoalViews(db, today),
    getWorkoutsRange(db, today, 60),
    db.healthLog.findUnique({ where: { userId_date: { userId: user.id, date: today } } }),
    buildBrief(db, user.id),
    vis.includes("nutrition") ? db.meal.findMany({ where: { date: today }, select: { date: true, calories: true, proteinG: true, carbsG: true, fatG: true } }) : [],
  ]);
  const food = dayTotals(todayMeals);
  const todaysWorkouts = recentWorkouts.filter((w) => w.date === today);
  const lastWorkout = recentWorkouts.at(-1);
  const due = habits.filter((h) => h.dueToday);
  const done = due.filter((h) => h.checkedToday).length;
  const hasAnyData = habits.length + goals.length + recentWorkouts.length > 0 || !!todayLog || brief.insights.length > 0;
  const milestone = habits.find((h) => h.checkedToday && MILESTONES.includes(h.streak));
  const topGoals = goals.slice(0, 3);

  const quick = [
    vis.includes("health") && { href: "/health#log", label: "Check-in", icon: HeartPulse, tone: "bg-terracotta-soft text-terracotta-ink" },
    vis.includes("workouts") && { href: "/workouts#log", label: "Workout", icon: Dumbbell, tone: "bg-ocean-soft text-ocean" },
    vis.includes("nutrition") && { href: "/nutrition#log", label: "Meal", icon: Utensils, tone: "bg-clay-soft text-clay-ink" },
    vis.includes("journal") && { href: "/journal#new", label: "Journal", icon: NotebookPen, tone: "bg-iris-soft text-iris" },
    { href: "/import", label: "Paste notes", icon: ClipboardPaste, tone: "bg-seaglass-soft text-primary" },
  ].filter(Boolean) as { href: string; label: string; icon: typeof HeartPulse; tone: string }[];

  return (
    <div className="space-y-6">
      <header className="pt-1">
        <p className="eyebrow">{formatDate(today, { weekday: "long", month: "long", day: "numeric" })}</p>
        <h1 className="h1 mt-2">{greeting(settings.name, settings.timezone)}<span className="text-gold-bright">.</span></h1>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2"><DailyBrief brief={brief.brief} hasData={hasAnyData} /></div>
        <section className="card flex flex-col items-center justify-center gap-3 text-center" aria-labelledby="today-progress">
          <h2 id="today-progress" className="sr-only">Today&apos;s progress</h2>
          {due.length ? (
            <>
              <ProgressRing id="habits-today" pct={(done / due.length) * 100} size={132} label="Habits done today" sub={`${done} of ${due.length} habits`} />
              <p className="text-sm text-muted">{done === due.length ? "Every habit done today. Beautifully consistent." : `${due.length - done} to go. One tap each.`}</p>
            </>
          ) : (
            <p className="text-sm text-muted">Add a habit and your daily progress ring appears here.</p>
          )}
        </section>
      </div>

      {milestone && (
        <div className="flex items-center gap-4 rounded-3xl bg-gold-soft p-4" role="status">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full font-display text-lg font-semibold text-[#3A2C10] shadow-[0_0_0_3px_var(--surface),0_0_24px_2px_rgb(212_178_106/0.55)] pop"
            style={{ background: "radial-gradient(circle at 35% 30%, #F4E3B5, #D4B26A 55%, #9C7A35)" }} aria-hidden>{milestone.streak}</span>
          <div>
            <p className="font-display text-lg font-semibold">{milestone.streak}-{milestone.frequency === "weekly" ? "week" : "day"} streak!</p>
            <p className="text-sm text-muted">{milestone.name}: a real milestone. Well done.</p>
          </div>
        </div>
      )}

      <nav aria-label="Quick log" className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,9.5rem),1fr))] gap-3">
        {quick.map(({ href, label, icon: Icon, tone }) => (
          <Link key={href} href={href} className="lift flex min-h-20 items-center gap-3 rounded-3xl border border-border/70 bg-surface p-4 text-sm font-bold shadow-soft">
            <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${tone}`} aria-hidden><Icon size={20} /></span>
            {label}
          </Link>
        ))}
        {vis.includes("workouts") && lastWorkout && <RepeatLastButton summary={describeWorkout(lastWorkout, u)} />}
      </nav>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {vis.includes("habits") && (
          <section className="card" aria-labelledby="habits-h">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 id="habits-h" className="h2 flex items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-sage-soft text-sage-ink" aria-hidden><CircleCheck size={16} /></span>
                Today&apos;s habits
              </h2>
              <Link href="/habits" className="inline-flex min-h-10 items-center text-xs font-bold text-primary">All habits <ChevronRight size={14} aria-hidden /></Link>
            </div>
            <HabitCheckList habits={habits} today={today} />
          </section>
        )}

        <section className="card space-y-4" aria-labelledby="sofar-h">
          <h2 id="sofar-h" className="h2 flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-gold-soft text-gold-ink" aria-hidden><Sun size={16} /></span>
            Today so far
          </h2>
          {vis.includes("health") &&
            (todayLog ? (
              <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,6rem),1fr))] gap-2.5 text-center">
                <Stat tone="bg-ocean-soft" label="Sleep" value={todayLog.sleepHours != null ? `${todayLog.sleepHours}h` : "—"} />
                <Stat tone="bg-iris-soft" label="Mood" value={todayLog.mood ? MOOD_EMOJI[todayLog.mood - 1] : "—"} />
                <Stat tone="bg-gold-soft" label="Energy" value={todayLog.energy ? ENERGY_EMOJI[todayLog.energy - 1] : "—"} />
                <Stat tone="bg-sage-soft" label="Steps" value={todayLog.steps != null ? todayLog.steps.toLocaleString("en-US") : "—"} />
                <Stat tone="bg-seaglass-soft" label="Water" value={todayLog.waterMl != null ? `${mlToDisplay(todayLog.waterMl, u)} ${waterUnit(u)}` : "—"} />
                <Stat tone="bg-clay-soft" label="Weight" value={todayLog.weightKg != null ? `${kgToDisplay(todayLog.weightKg, u)} ${weightUnit(u)}` : "—"} />
              </dl>
            ) : (
              <Link href="/health#log" className="flex min-h-14 items-center justify-between rounded-2xl bg-surface-2/60 px-4 text-sm">
                <span>No check-in yet today. It takes a few seconds.</span>
                <ChevronRight size={16} aria-hidden />
              </Link>
            ))}
          {vis.includes("nutrition") && (
            <Link href="/nutrition" className="flex min-h-12 items-center justify-between gap-3 rounded-2xl bg-clay-soft px-4 py-2.5 text-sm">
              <span><span aria-hidden>🍽️ </span>{food.meals ? [`${food.meals} ${food.meals === 1 ? "meal" : "meals"}`, macroLine({ calories: food.calories, proteinG: food.proteinG })].filter(Boolean).join(" · ") : "No meals logged yet today."}</span>
              <ChevronRight size={16} aria-hidden />
            </Link>
          )}
          {vis.includes("workouts") && (
            todaysWorkouts.length ? (
              <ul className="space-y-2">{todaysWorkouts.map((w) => <li key={w.id} className="rounded-2xl bg-ocean-soft px-4 py-2.5 text-sm font-semibold">{describeWorkout(w, u)}</li>)}</ul>
            ) : <p className="text-sm text-muted">No workout today. Rest days count too.</p>
          )}
        </section>
      </div>

      {vis.includes("goals") && topGoals.length > 0 && (
        <section className="card" aria-labelledby="goals-h">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 id="goals-h" className="h2">Goals</h2>
            <Link href="/goals" className="inline-flex min-h-10 items-center text-xs font-bold text-primary">Manage <ChevronRight size={14} aria-hidden /></Link>
          </div>
          <ul className="grid gap-5 sm:grid-cols-3">
            {topGoals.map((g) => {
              const d = goalDisplay(g, u);
              return (
                <li key={g.id} className="flex items-center gap-4 sm:flex-col sm:text-center">
                  <ProgressRing id={`g-${g.id}`} pct={g.pct} size={96} stroke={9} label={g.title} />
                  <div>
                    <p className="font-semibold">{g.title}</p>
                    <p className="text-xs text-muted">{d.current} / {d.target} {d.unit}</p>
                    <p className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${g.status === "behind" ? "bg-terracotta-soft text-terracotta-ink" : g.status === "done" ? "bg-gold-soft text-gold-ink" : "bg-sage-soft text-sage-ink"}`}>
                      {g.status === "behind" ? "A little behind" : g.status === "done" ? "Complete" : g.status === "overdue" ? "Past deadline" : "On track"}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {brief.insights.length > 0 && (
        <section className="card" aria-labelledby="hl-h">
          <h2 id="hl-h" className="h2 mb-4 flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-gold-soft text-gold-ink" aria-hidden><Trophy size={16} /></span>
            Highlights
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {brief.insights.map((i) => (
              <li key={i.id} className="flex items-center gap-3.5 rounded-2xl bg-surface-2/60 px-4 py-3.5 text-sm font-medium">
                <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface text-xl shadow-sm">{i.emoji}</span>
                <span>{i.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className={`rounded-2xl px-2 py-3 ${tone}`}>
      <dd className="font-display text-lg font-semibold">{value}</dd>
      <dt className="mt-0.5 text-[10px] font-bold tracking-[0.12em] text-text uppercase">{label}</dt>
    </div>
  );
}
