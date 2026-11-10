import { getSettings } from "@/lib/settings";
import { requireUser } from "@/lib/auth";
import { todayInTz } from "@/lib/dates";
import { getHabitViews, habitCompletionByDay, type HabitView } from "@/lib/queries";
import { streakUnitLabel } from "@/lib/habits/schedule";
import { HabitCheckList } from "@/components/HabitCheckList";
import { Heatmap } from "@/components/Heatmap";
import { HabitManager, type HabitRow } from "./HabitManager";
import { SortableCards } from "@/components/SortableCards";
import { PageHeader } from "@/components/ui";
import { CircleCheck } from "lucide-react";

const row = ({ id, name, emoji, schedule, summary }: HabitView, archived: boolean): HabitRow => ({ id, name, emoji, schedule, summary, archived });

export default async function HabitsPage() {
  const settings = await getSettings();
  const { db, user } = await requireUser();
  const today = todayInTz(settings.timezone);
  const habits = await getHabitViews(db, today);
  const archived = (await getHabitViews(db, today, true)).filter((h) => !habits.some((x) => x.id === h.id));
  const overall = Object.fromEntries(habitCompletionByDay(habits, today, 182).map((d) => [d.date, d.value]));

  return (
    <div className="space-y-6">
      <PageHeader theme="habits" icon={<CircleCheck size={26} />} eyebrow="Daily rituals" title="Habits" crumbs={[{ href: "/log", label: "Log" }]} subtitle="Tap to check off. Small and steady wins." />
      <section className="card scroll-mt-6" id="today">
        <h2 className="h2 mb-3">Today</h2>
        <HabitCheckList habits={habits} today={today} showAll />
      </section>
      {habits.length > 0 && (
        <section className="card">
          <h2 className="h2 mb-3">Last 6 months</h2>
          <Heatmap values={overall} today={today} weeks={26} label="Daily habit completion" />
          <p className="mt-2 text-xs text-muted">Darker squares mean more of your daily habits were done.</p>
        </section>
      )}
      <SortableCards preset="habits" label="habits" className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,19rem),1fr))] gap-4"
        items={habits.map((h, i) => ({ key: h.id, title: h.name, meta: { order: i, streak: h.streak, best: h.longest, unit: h.streakUnit, dueToday: h.dueToday }, node: (
          <div className="card">
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <h3 className="font-medium">{h.emoji} {h.name}</h3>
              <span className="text-xs text-muted">{h.summary}</span>
            </div>
            <Heatmap values={Object.fromEntries(h.dates.map((d) => [d, 1]))} today={today} weeks={17} label={`${h.name} check-ins`} />
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              <span>🔥 Current: <b className="text-text">{h.streak}</b> {streakUnitLabel(h.streakUnit, h.streak)}</span>
              <span>🏆 Best: <b className="text-text">{h.longest}</b></span>
              <span>✓ Days done: <b className="text-text">{h.dates.length}</b></span>
            </div>
          </div>
        ) }))} />
      <HabitManager habits={habits.map((h) => row(h, false))} archived={archived.map((h) => row(h, true))} />
    </div>
  );
}
