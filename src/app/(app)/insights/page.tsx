import Link from "next/link";
import { CalendarHeart, CalendarDays, ChevronRight, Dumbbell, Trophy } from "lucide-react";
import { getSettings } from "@/lib/settings";
import { requireUser } from "@/lib/auth";
import { addDays, todayInTz } from "@/lib/dates";
import { getGoalViews, getHabitViews, getHealthRange, getWorkoutsRange, habitCompletionByDay } from "@/lib/queries";
import { healthTrendSpecs, weeklyVolume } from "@/lib/trends";
import { computeInsights } from "@/lib/insights";
import { goalDisplay } from "@/lib/goalDisplay";
import { PageHeader } from "@/components/ui";
import { Tip } from "@/components/Tip";
import { Heatmap } from "@/components/Heatmap";
import { ProgressRing } from "@/components/ProgressRing";
import { TrendGroup, WorkoutVolumeChart } from "@/components/LazyCharts";

export default async function InsightsPage() {
  const settings = await getSettings();
  const { db } = await requireUser();
  const { units: u, visibleModules: vis } = settings;
  const today = todayInTz(settings.timezone);
  const [health, workouts, habits, goals, journal] = await Promise.all([
    getHealthRange(db, today, 90),
    getWorkoutsRange(db, today, 90),
    getHabitViews(db, today),
    getGoalViews(db, today),
    db.journalEntry.findMany({ where: { date: { gte: addDays(today, -60) } }, select: { date: true } }),
  ]);
  const insights = computeInsights({ today, units: u, health, workouts, habits, goals, journalDates: journal.map((j) => j.date) });
  const heat = Object.fromEntries(habitCompletionByDay(habits, today, 91).map((d) => [d.date, d.value]));
  const daysWithHabits = Object.values(heat).filter((v) => v > 0).length;

  return (
    <div className="space-y-6">
      <PageHeader theme="today" eyebrow="Insights" title="Your patterns">
        <Link href="/review" className="btn-soft"><CalendarHeart size={16} aria-hidden /> Weekly review</Link>
      </PageHeader>
      <Tip id="insights" seen={settings.tipsSeen}>Patterns only appear once there&apos;s enough data to be meaningful, usually after a week or two of logging.</Tip>

      {insights.length > 0 && (
        <section className="card" aria-labelledby="hl">
          <h2 id="hl" className="h2 mb-4 flex items-center gap-2.5"><span className="grid h-8 w-8 place-items-center rounded-xl bg-gold-soft text-gold-ink" aria-hidden><Trophy size={16} /></span>Highlights</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {insights.map((i) => (
              <li key={i.id} className="flex items-center gap-3.5 rounded-2xl bg-surface-2/60 px-4 py-3.5 text-sm font-medium">
                <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface text-xl shadow-sm">{i.emoji}</span>{i.text}
              </li>
            ))}
          </ul>
        </section>
      )}

      {vis.includes("health") && <TrendGroup specs={healthTrendSpecs(health, today, u, ["weight", "sleep", "mood", "energy", "steps", "water"])} />}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {vis.includes("workouts") && (
          <section className="card" aria-labelledby="vol">
            <h2 id="vol" className="h2 mb-4 flex items-center gap-2.5"><span className="grid h-8 w-8 place-items-center rounded-xl bg-ocean-soft text-ocean" aria-hidden><Dumbbell size={16} /></span>Weekly workout minutes</h2>
            <WorkoutVolumeChart data={weeklyVolume(workouts, today, 12)} />
          </section>
        )}
        {vis.includes("habits") && habits.length > 0 && (
          <section className="card" aria-labelledby="hm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 id="hm" className="h2 flex items-center gap-2.5"><span className="grid h-8 w-8 place-items-center rounded-xl bg-sage-soft text-sage-ink" aria-hidden><CalendarDays size={16} /></span>Habit consistency</h2>
              <Link href="/habits" className="inline-flex min-h-10 items-center text-xs font-bold text-primary">Details <ChevronRight size={14} aria-hidden /></Link>
            </div>
            <Heatmap values={heat} today={today} weeks={13} label={`Daily habit completion over 13 weeks: habits were done on ${daysWithHabits} of 91 days.`} />
            <p className="mt-2 text-xs text-muted">Last 13 weeks · darker means more daily habits done</p>
          </section>
        )}
      </div>

      {vis.includes("goals") && goals.length > 0 && (
        <section className="card" aria-labelledby="gp">
          <h2 id="gp" className="h2 mb-4">Goal progress</h2>
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {goals.map((g) => {
              const d = goalDisplay(g, u);
              return (
                <li key={g.id} className="flex flex-col items-center gap-2 text-center">
                  <ProgressRing id={`ig-${g.id}`} pct={g.pct} size={110} stroke={10} label={g.title} />
                  <p className="font-semibold">{g.title}</p>
                  <p className="text-xs text-muted">{d.current} / {d.target} {d.unit} · {g.daysLeft >= 0 ? `${g.daysLeft} days left` : "ended"}</p>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
