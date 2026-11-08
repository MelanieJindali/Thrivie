"use client";

import { UndoDeleteButton } from "@/components/Toast";
import { useState } from "react";
import { addGoalProgress, archiveGoal, deleteGoal, saveGoal } from "@/app/actions";
import { Field, FormStatus, numOrNull, useAction } from "@/components/ui";
import { addDays } from "@/lib/dates";
import { WORKOUT_LABELS, WORKOUT_TYPES } from "@/lib/constants";
import { distanceUnit, weightUnit, type Units } from "@/lib/units";

export type GoalInit = {
  id: string;
  title: string;
  target: number;
  unit: string;
  startDate: string;
  deadline: string;
  startValue: number | null;
  linkType: string;
  linkMetric: string | null;
  linkWorkoutType: string | null;
  linkMeasure: string | null;
  linkHabitId: string | null;
  archived: boolean;
};

type LinkType = "manual" | "metric" | "workout" | "habit";

function defaultUnit(linkType: LinkType, metric: string, measure: string, units: Units): string {
  if (linkType === "metric") return ({ weight: weightUnit(units), steps: "steps", water: "L", sleep: "h avg" } as Record<string, string>)[metric] ?? "";
  if (linkType === "workout") return ({ distance: distanceUnit(units), minutes: "min", count: "workouts" } as Record<string, string>)[measure] ?? "";
  if (linkType === "habit") return "times";
  return "";
}

export function GoalForm({ habits, today, units, initial, onDone }: { habits: { id: string; name: string }[]; today: string; units: Units; initial?: GoalInit; onDone?: () => void }) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [target, setTarget] = useState(initial ? String(initial.target) : "");
  const [linkType, setLinkType] = useState<LinkType>((initial?.linkType as LinkType) ?? "manual");
  const [metric, setMetric] = useState(initial?.linkMetric ?? "steps");
  const [wType, setWType] = useState(initial?.linkWorkoutType ?? "any");
  const [measure, setMeasure] = useState(initial?.linkMeasure ?? "distance");
  const [habitId, setHabitId] = useState(initial?.linkHabitId ?? habits[0]?.id ?? "");
  const [unit, setUnit] = useState(initial?.unit ?? "");
  const [startDate, setStartDate] = useState(initial?.startDate ?? today);
  const [deadline, setDeadline] = useState(initial?.deadline ?? addDays(today, 60));
  const [startValue, setStartValue] = useState(initial?.startValue != null ? String(initial.startValue) : "");
  const { pending, error, message, run } = useAction();
  const autoUnit = defaultUnit(linkType, metric, measure, units);
  const isWeight = linkType === "metric" && metric === "weight";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = numOrNull(target);
    if (t == null) return run(async () => ({ ok: false, error: "Add a target number." }));
    run(
      () =>
        saveGoal({
          id: initial?.id,
          title,
          target: t,
          unit: unit || autoUnit,
          startDate,
          deadline,
          startValue: isWeight ? numOrNull(startValue) : null,
          linkType,
          linkMetric: linkType === "metric" ? (metric as "steps") : null,
          linkWorkoutType: linkType === "workout" ? (wType as "any") : null,
          linkMeasure: linkType === "workout" ? (measure as "count") : null,
          linkHabitId: linkType === "habit" ? habitId : null,
        }),
      {
        success: initial ? "Goal saved ✓" : "Goal added ✓",
        onOk: () => {
          if (!initial) { setTitle(""); setTarget(""); setUnit(""); }
          onDone?.();
        },
      },
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Goal">
        <input className="input" placeholder="Run 100 km by March" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <div>
        <span className="label">Track progress</span>
        <div className="flex flex-wrap gap-2">
          {(["manual", "workout", "metric", "habit"] as const).map((l) => (
            <button type="button" key={l} className={`chip ${linkType === l ? "chip-on" : ""}`} onClick={() => setLinkType(l)}>
              {{ manual: "Manually", workout: "From workouts", metric: "From health logs", habit: "From a habit" }[l]}
            </button>
          ))}
        </div>
      </div>
      {linkType === "workout" && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Workout type">
            <select className="input" value={wType} onChange={(e) => setWType(e.target.value)}>
              <option value="any">Any</option>
              {WORKOUT_TYPES.map((t) => <option key={t} value={t}>{WORKOUT_LABELS[t].label}</option>)}
            </select>
          </Field>
          <Field label="Measure">
            <select className="input" value={measure} onChange={(e) => setMeasure(e.target.value)}>
              <option value="distance">Distance</option>
              <option value="minutes">Minutes</option>
              <option value="count">Number of workouts</option>
            </select>
          </Field>
        </div>
      )}
      {linkType === "metric" && (
        <Field label="Metric">
          <select className="input" value={metric} onChange={(e) => setMetric(e.target.value)}>
            <option value="steps">Steps (total)</option>
            <option value="water">Water (total litres)</option>
            <option value="sleep">Sleep (average hours)</option>
            <option value="weight">Weight (reach a value)</option>
          </select>
        </Field>
      )}
      {linkType === "habit" && (
        <Field label="Habit">
          {habits.length ? (
            <select className="input" value={habitId} onChange={(e) => setHabitId(e.target.value)}>
              {habits.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          ) : (
            <p className="text-sm text-muted">Create a habit first.</p>
          )}
        </Field>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {isWeight && (
          <Field label={`Start (${weightUnit(units)})`}>
            <input className="input" inputMode="decimal" value={startValue} onChange={(e) => setStartValue(e.target.value)} placeholder="80" />
          </Field>
        )}
        <Field label="Target">
          <input className="input" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="100" />
        </Field>
        <Field label="Unit">
          <input className="input" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder={autoUnit || "km, books…"} disabled={isWeight || (linkType === "workout" && measure === "distance")} />
        </Field>
        <Field label="Start">
          <input type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        <Field label="Deadline">
          <input type="date" className="input" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </Field>
      </div>
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={pending || !title.trim()}>{initial ? "Save goal" : "Add goal"}</button>
        {initial && <button type="button" className="btn-ghost" onClick={onDone}>Cancel</button>}
        <FormStatus error={error} message={message} />
      </div>
    </form>
  );
}

export function GoalActions({ goal, habits, today, units = "metric" }: { goal: GoalInit; habits: { id: string; name: string }[]; today: string; units?: Units }) {
  const [mode, setMode] = useState<"none" | "edit" | "progress">("none");
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const { pending, error, message, run } = useAction();

  if (mode === "edit")
    return (
      <div className="mt-4 border-t border-border pt-4">
        <GoalForm habits={habits} today={today} units={units} initial={goal} onDone={() => setMode("none")} />
      </div>
    );

  return (
    <div className="mt-3 space-y-2">
      {mode === "progress" && (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const n = numOrNull(value);
            if (n == null) return;
            run(() => addGoalProgress(goal.id, n, note), { success: "Progress added ✓", onOk: () => { setValue(""); setNote(""); setMode("none"); } });
          }}
        >
          <input className="input w-24" inputMode="decimal" placeholder={`+ ${goal.unit}`} value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
          <input className="input min-w-0 flex-1" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="btn-primary" disabled={pending}>Add</button>
        </form>
      )}
      <div className="flex flex-wrap gap-1">
        {goal.linkType === "manual" && !goal.archived && mode !== "progress" && (
          <button className="btn-soft px-3 py-1.5 text-xs" onClick={() => setMode("progress")}>+ Add progress</button>
        )}
        <button className="btn-ghost px-2 py-1.5 text-xs" onClick={() => setMode("edit")}>Edit</button>
        <button className="btn-ghost px-2 py-1.5 text-xs" onClick={() => run(() => archiveGoal(goal.id, !goal.archived))}>{goal.archived ? "Restore" : "Archive"}</button>
        <UndoDeleteButton what="Goal" action={() => deleteGoal(goal.id)} />
        <FormStatus error={error} message={message} />
      </div>
    </div>
  );
}
