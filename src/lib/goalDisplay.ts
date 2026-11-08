import type { GoalView } from "./queries";
import { distanceUnit, kgToDisplay, kmToDisplay, weightUnit, type Units } from "./units";

export function goalDisplay(g: GoalView, u: Units) {
  if (g.linkType === "metric" && g.linkMetric === "weight")
    return { current: kgToDisplay(g.current, u), target: kgToDisplay(g.target, u), start: g.startValue != null ? kgToDisplay(g.startValue, u) : null, unit: weightUnit(u) };
  if (g.linkType === "workout" && g.linkMeasure === "distance")
    return { current: Math.round(kmToDisplay(g.current, u) * 10) / 10, target: Math.round(kmToDisplay(g.target, u) * 10) / 10, start: null, unit: distanceUnit(u) };
  const r = (n: number) => Math.round(n * 10) / 10;
  return { current: r(g.current), target: r(g.target), start: g.startValue, unit: g.unit };
}

export const STATUS_LABEL: Record<string, { label: string; cls: string; icon: string }> = {
  done: { label: "Complete", cls: "bg-primary-soft text-primary", icon: "✓" },
  "on-track": { label: "On track", cls: "bg-primary-soft text-primary", icon: "●" },
  behind: { label: "A bit behind", cls: "bg-warn-soft text-warn", icon: "◐" },
  "not-started": { label: "Just started", cls: "bg-surface-2 text-muted", icon: "○" },
  overdue: { label: "Past deadline", cls: "bg-surface-2 text-muted", icon: "◷" },
};

export function describeLink(g: GoalView): string {
  switch (g.linkType) {
    case "metric": return `Auto · from ${g.linkMetric} logs`;
    case "workout": return `Auto · ${g.linkWorkoutType === "any" || !g.linkWorkoutType ? "all" : g.linkWorkoutType} workouts (${g.linkMeasure})`;
    case "habit": return `Auto · ${g.habitName ?? "habit"} check-ins`;
    default: return "Manual updates";
  }
}
