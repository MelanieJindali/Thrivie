import type { GoalView } from "@/lib/queries";
import { goalDisplay, STATUS_LABEL, describeLink } from "@/lib/goalDisplay";
import { formatDate } from "@/lib/dates";
import type { Units } from "@/lib/units";
import { ProgressBar } from "./ui";

export function GoalSummary({ goal, units }: { goal: GoalView; units: Units }) {
  const d = goalDisplay(goal, units);
  const st = STATUS_LABEL[goal.status];
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="truncate text-sm font-medium">{goal.title}</span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${st.cls}`}>
          <span aria-hidden>{st.icon}</span> {st.label}
        </span>
      </div>
      <ProgressBar label={`${goal.title} progress`} pct={goal.pct} expected={goal.status === "done" ? undefined : goal.expectedPct} tone={goal.status === "behind" ? "warn" : "primary"} />
      <div className="mt-1 flex justify-between text-xs text-muted">
        <span>
          {d.current} / {d.target} {d.unit}
          {d.start != null && <> (from {d.start})</>}
        </span>
        <span>{goal.daysLeft >= 0 ? `${goal.daysLeft}d left · ${formatDate(goal.deadline, { month: "short", day: "numeric" })}` : `ended ${formatDate(goal.deadline, { month: "short", day: "numeric" })}`}</span>
      </div>
      <div className="mt-0.5 text-[11px] text-muted">{describeLink(goal)}</div>
    </div>
  );
}
