import { getSettings } from "@/lib/settings";
import { requireUser } from "@/lib/auth";
import { todayInTz } from "@/lib/dates";
import { getHabitViews, habitCompletionByDay } from "@/lib/queries";
import { HabitCheckList } from "@/components/HabitCheckList";
import { Heatmap } from "@/components/Heatmap";
import { HabitManager } from "./HabitManager";
import { PageHeader } from "@/components/ui";
import { CircleCheck } from "lucide-react";

export default async function HabitsPage() {
  const settings = await getSettings();
  const { db, user } = await requireUser();
  const today = todayInTz(settings.timezone);
  const habits = await getHabitViews(db, today);
  const archived = (await getHabitViews(db, today, true)).filter((h) => !habits.some((x) => x.id === h.id));
  const overall = Object.fromEntries(habitCompletionByDay(habits, today, 182).map((d) => [d.date, d.value]));

  return (
    <div className="space-y-6">
      <PageHeader theme="habits" icon={<CircleCheck size={26} />} eyebrow="Daily rituals" title="Habits" subtitle="Tap to check off. Small and steady wins." />
      <section className="card">
        <h2 className="h2 mb-3">Today</h2>
        <HabitCheckList habits={habits} showAll />
      </section>
      {habits.length > 0 && (
        <section className="card">
          <h2 className="h2 mb-3">Last 6 months</h2>
          <Heatmap values={overall} today={today} weeks={26} label="Daily habit completion" />
          <p className="mt-2 text-xs text-muted">Darker squares mean more of your daily habits were done.</p>
        </section>
      )}
      <section className="grid gap-4 sm:grid-cols-2">
        {habits.map((h) => (
          <div key={h.id} className="card">
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <h3 className="font-medium">{h.emoji} {h.name}</h3>
              <span className="text-xs text-muted">
                {h.frequency === "weekly" ? `${h.timesPerWeek}×/week` : "daily"}
              </span>
            </div>
            <Heatmap values={Object.fromEntries(h.dates.map((d) => [d, 1]))} today={today} weeks={17} label={`${h.name} check-ins`} />
            <div className="mt-3 flex gap-4 text-xs text-muted">
              <span>🔥 Current: <b className="text-text">{h.streak}</b> {h.frequency === "weekly" ? "wks" : "days"}</span>
              <span>🏆 Best: <b className="text-text">{h.longest}</b></span>
              <span>✓ Total: <b className="text-text">{h.dates.length}</b></span>
            </div>
          </div>
        ))}
      </section>
      <HabitManager habits={habits.map(({ id, name, emoji, frequency, timesPerWeek }) => ({ id, name, emoji, frequency, timesPerWeek, archived: false }))} archived={archived.map(({ id, name, emoji, frequency, timesPerWeek }) => ({ id, name, emoji, frequency, timesPerWeek, archived: true }))} />
    </div>
  );
}
