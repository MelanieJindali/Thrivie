import { getSettings } from "@/lib/settings";
import { requireUser } from "@/lib/auth";
import { todayInTz } from "@/lib/dates";
import { getGoalViews } from "@/lib/queries";
import { GoalSummary } from "@/components/GoalCard";
import { Empty } from "@/components/ui";
import { SortableCards } from "@/components/SortableCards";
import { GoalForm, GoalActions } from "./GoalForm";
import { goalDisplay } from "@/lib/goalDisplay";
import { PageHeader } from "@/components/ui";
import { Target } from "lucide-react";

export default async function GoalsPage() {
  const settings = await getSettings();
  const { db, user } = await requireUser();
  const today = todayInTz(settings.timezone);
  const goals = await getGoalViews(db, today, true);
  const habits = await db.habit.findMany({ where: { archived: false }, select: { id: true, name: true } });
  const active = goals.filter((g) => !g.archived);
  const archived = goals.filter((g) => g.archived);

  return (
    <div className="space-y-6">
      <PageHeader theme="goals" icon={<Target size={26} />} eyebrow="Ambitions" title="Goals" subtitle="Link a goal to your logs and it updates itself. The thin marker shows a steady pace." />
      <section className="scroll-mt-6 space-y-3" id="progress">
        {active.length ? (
          <SortableCards preset="goals" label="goals" items={active.map((g) => {
            const d = goalDisplay(g, settings.units);
            return { key: g.id, title: g.title, meta: { status: g.status, pct: g.pct, deadline: g.deadline }, node: (
              <div className="card">
                <GoalSummary goal={g} units={settings.units} />
                <GoalActions
                  goal={{
                    id: g.id, title: g.title, target: d.target, unit: g.unit, startDate: g.startDate, deadline: g.deadline,
                    startValue: d.start, linkType: g.linkType, linkMetric: g.linkMetric, linkWorkoutType: g.linkWorkoutType,
                    linkMeasure: g.linkMeasure, linkHabitId: g.linkHabitId, archived: g.archived,
                  }}
                  habits={habits}
                  today={today}
                  units={settings.units}
                />
              </div>
            ) };
          })} />
        ) : (
          <Empty>No goals yet. Try “Run 100 km by March”.</Empty>
        )}
      </section>
      <section className="card">
        <h2 className="h2 mb-3">New goal</h2>
        <GoalForm habits={habits} today={today} units={settings.units} />
      </section>
      {archived.length > 0 && (
        <section className="card">
          <h2 className="h2 mb-3">Archived</h2>
          <ul className="space-y-4">
            {archived.map((g) => (
              <li key={g.id}>
                <GoalSummary goal={g} units={settings.units} />
                <GoalActions goal={{ ...g, target: goalDisplay(g, settings.units).target, startValue: goalDisplay(g, settings.units).start }} habits={habits} today={today} units={settings.units} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
