"use client";
import { useOfflineAction } from "@/components/OfflineSync";

import { useEffect, useState } from "react";
import { Plus, Repeat, X } from "lucide-react";
import { repeatLastWorkout } from "@/app/actions";
import { Field, FormStatus, RatingPicker, numOrNull, useAction } from "@/components/ui";
import { WORKOUT_LABELS, WORKOUT_TYPES, type WorkoutType } from "@/lib/constants";
import { distanceUnit, paceUnit, weightUnit, type Units } from "@/lib/units";

export type WorkoutDraft = {
  id?: string;
  date: string;
  type: WorkoutType;
  title: string;
  durationMin: string;
  intensity: number;
  distance: string;
  pace: string;
  notes: string;
  exercises: { name: string; sets: string; reps: string; weight: string }[];
};

export const emptyWorkout = (today: string, type: WorkoutType = "strength"): WorkoutDraft => ({
  date: today, type, title: "", durationMin: "", intensity: 3, distance: "", pace: "", notes: "", exercises: [],
});

const INTENSITY = ["Easy", "Light", "Moderate", "Hard", "Max"];

export function WorkoutForm({
  today,
  units,
  exerciseNames,
  lastSummary,
  editing,
  onDone,
}: {
  today: string;
  units: Units;
  exerciseNames: string[];
  lastSummary: string | null;
  editing?: WorkoutDraft | null;
  onDone?: () => void;
}) {
  const [w, setW] = useState<WorkoutDraft>(editing ?? emptyWorkout(today));
  const { pending, error, message, run } = useAction();
  const offline = useOfflineAction();
  const set = <K extends keyof WorkoutDraft>(k: K, v: WorkoutDraft[K]) => setW((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    if (editing) setW(editing);
  }, [editing]);

  const showDistance = w.type === "cardio" || w.type === "sport" || w.type === "other" || !!w.distance;
  const showExercises = w.type === "strength" || w.exercises.length > 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const dur = numOrNull(w.durationMin);
    if (!dur || dur <= 0) return run(async () => ({ ok: false, error: "Add a duration in minutes." }));
    run(
      () =>
        offline("saveWorkout", {
          id: w.id,
          date: w.date,
          type: w.type,
          title: w.title,
          durationMin: Math.round(dur),
          intensity: w.intensity,
          distance: numOrNull(w.distance),
          pace: numOrNull(w.pace),
          notes: w.notes,
          exercises: w.exercises
            .filter((x) => x.name.trim())
            .map((x) => ({
              name: x.name,
              sets: numOrNull(x.sets) != null ? Math.round(numOrNull(x.sets)!) : null,
              reps: numOrNull(x.reps) != null ? Math.round(numOrNull(x.reps)!) : null,
              weight: numOrNull(x.weight),
            })),
        }),
      {
        success: w.id ? "Workout updated ✓" : "Workout saved ✓",
        onOk: () => {
          setW(emptyWorkout(today, w.type));
          onDone?.();
        },
      },
    );
  }

  return (
    <form onSubmit={submit} className="card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="h2">{w.id ? "Edit workout" : "Log a workout"}</h2>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {!w.id && lastSummary && (
            <button
              type="button"
              className="btn-soft py-1.5 text-xs"
              disabled={pending}
              aria-busy={pending}
              title={lastSummary}
              onClick={() => run(() => repeatLastWorkout(), { success: "Repeated last workout ✓" })}
            >
              <Repeat size={14} /> Repeat last
            </button>
          )}
          <input type="date" className="input w-auto py-1.5 text-sm" value={w.date} max={today} onChange={(e) => set("date", e.target.value || today)} aria-label="Date" />
        </div>
      </div>
      {!w.id && lastSummary && <p className="-mt-2 text-xs text-muted">Last: {lastSummary}</p>}

      <div className="flex flex-wrap gap-2">
        {WORKOUT_TYPES.map((t) => (
          <button type="button" key={t} onClick={() => set("type", t)} className={`chip ${w.type === t ? "chip-on" : ""}`}>
            {WORKOUT_LABELS[t].emoji} {WORKOUT_LABELS[t].label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Duration (min)">
          <div className="flex flex-wrap gap-1.5">
            <input className="input w-24" inputMode="numeric" placeholder="45" value={w.durationMin} onChange={(e) => set("durationMin", e.target.value)} />
            {[20, 30, 45, 60].map((m) => (
              <button type="button" key={m} className={`chip ${w.durationMin === String(m) ? "chip-on" : ""}`} onClick={() => set("durationMin", String(m))}>
                {m}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Title (optional)">
          <input className="input" placeholder={w.type === "cardio" ? "Easy run" : "Upper body"} value={w.title} onChange={(e) => set("title", e.target.value)} />
        </Field>
      </div>

      <Field label={`Intensity · ${INTENSITY[w.intensity - 1]}`}>
        <RatingPicker name="Intensity" value={w.intensity} onChange={(v) => set("intensity", v ?? 3)} />
      </Field>

      {showDistance && (
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Distance (${distanceUnit(units)})`}>
            <input className="input" inputMode="decimal" placeholder="5" value={w.distance} onChange={(e) => set("distance", e.target.value)} />
          </Field>
          <Field label={`Pace (${paceUnit(units)})`} hint="Leave blank to calculate">
            <input className="input" inputMode="decimal" placeholder="auto" value={w.pace} onChange={(e) => set("pace", e.target.value)} />
          </Field>
        </div>
      )}

      {showExercises && (
        <div className="space-y-2">
          <span className="label">Exercises (optional)</span>
          {w.exercises.map((x, i) => {
            const upd = (k: keyof typeof x, v: string) => set("exercises", w.exercises.map((y, j) => (j === i ? { ...y, [k]: v } : y)));
            return (
              <div key={i} className="grid grid-cols-[1fr_3.5rem_3.5rem_4.5rem_auto] gap-1.5">
                <input className="input px-2" placeholder="Exercise" list="exercise-names" value={x.name} onChange={(e) => upd("name", e.target.value)} aria-label="Exercise name" />
                <input className="input px-2" inputMode="numeric" placeholder="sets" value={x.sets} onChange={(e) => upd("sets", e.target.value)} aria-label="Sets" />
                <input className="input px-2" inputMode="numeric" placeholder="reps" value={x.reps} onChange={(e) => upd("reps", e.target.value)} aria-label="Reps" />
                <input className="input px-2" inputMode="decimal" placeholder={weightUnit(units)} value={x.weight} onChange={(e) => upd("weight", e.target.value)} aria-label="Weight" />
                <button type="button" className="btn-ghost px-1.5" aria-label="Remove exercise" onClick={() => set("exercises", w.exercises.filter((_, j) => j !== i))}>
                  <X size={16} />
                </button>
              </div>
            );
          })}
          <datalist id="exercise-names">
            {exerciseNames.map((n) => <option key={n} value={n} />)}
          </datalist>
          <button type="button" className="btn-ghost px-2 text-xs" onClick={() => set("exercises", [...w.exercises, { name: "", sets: w.exercises.at(-1)?.sets ?? "3", reps: w.exercises.at(-1)?.reps ?? "10", weight: "" }])}>
            <Plus size={14} /> Add exercise
          </button>
        </div>
      )}

      <details>
        <summary className="cursor-pointer text-sm text-muted select-none">Notes</summary>
        <textarea className="input mt-2 min-h-16" placeholder="How did it feel?" value={w.notes} onChange={(e) => set("notes", e.target.value)} />
      </details>

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={pending} aria-busy={pending}>{pending ? "Saving…" : w.id ? "Update" : "Save workout"}</button>
        {w.id && (
          <button type="button" className="btn-ghost" onClick={() => { setW(emptyWorkout(today)); onDone?.(); }}>
            Cancel
          </button>
        )}
        <FormStatus error={error} message={message} />
      </div>
    </form>
  );
}
