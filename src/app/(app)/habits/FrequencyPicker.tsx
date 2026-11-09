"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  describeSchedule,
  MAX_COUNT,
  WEEKDAY_SET,
  WEEKDAYS_MON_FIRST,
  WEEKEND_SET,
  type HabitSchedule,
  type Period,
  type Weekday,
} from "@/lib/habits/schedule";

type Mode = HabitSchedule["type"];
type Draft = { mode: Mode; days: Weekday[]; count: string; period: Period };

const MODES: { mode: Mode; label: string }[] = [
  { mode: "daily", label: "Every day" },
  { mode: "specific_days", label: "Specific days" },
  { mode: "times_per_period", label: "Times per period" },
];
const DAY_LETTER: Record<Weekday, string> = { 0: "S", 1: "M", 2: "T", 3: "W", 4: "T", 5: "F", 6: "S" };
const DAY_NAME: Record<Weekday, string> = { 0: "Sunday", 1: "Monday", 2: "Tuesday", 3: "Wednesday", 4: "Thursday", 5: "Friday", 6: "Saturday" };

function fromSchedule(s: HabitSchedule, prev?: Draft): Draft {
  return {
    mode: s.type,
    days: s.type === "specific_days" ? s.days : prev?.days ?? [1, 3, 5],
    count: s.type === "times_per_period" ? String(s.count) : prev?.count ?? "3",
    period: s.type === "times_per_period" ? s.period : prev?.period ?? "week",
  };
}

/** Turns the editable draft into a schedule, or an error message if it isn't valid yet. */
function toSchedule(d: Draft): { schedule: HabitSchedule | null; error: string | null } {
  if (d.mode === "daily") return { schedule: { type: "daily" }, error: null };
  if (d.mode === "specific_days") {
    if (!d.days.length) return { schedule: null, error: "Pick at least one day." };
    return { schedule: d.days.length === 7 ? { type: "daily" } : { type: "specific_days", days: [...d.days].sort((a, b) => a - b) }, error: null };
  }
  const n = Number(d.count);
  if (!Number.isInteger(n) || n < 1 || n > MAX_COUNT[d.period]) return { schedule: null, error: `Enter a number from 1 to ${MAX_COUNT[d.period]}.` };
  return { schedule: n === 1 && d.period === "day" ? { type: "daily" } : { type: "times_per_period", count: n, period: d.period }, error: null };
}

/**
 * Every day / specific days / N times per day-week-month, with a live summary.
 * Controlled: follows `value` when it changes from outside, and reports `null` while the input is incomplete.
 */
export function FrequencyPicker({ value, onChange }: { value: HabitSchedule; onChange: (s: HabitSchedule | null) => void }) {
  const id = useId();
  const [draft, setDraft] = useState<Draft>(() => fromSchedule(value));
  const lastEmitted = useRef(JSON.stringify(value));

  // Follow external changes (e.g. the habit finished loading) without clobbering edits in progress.
  useEffect(() => {
    const incoming = JSON.stringify(value);
    if (incoming !== lastEmitted.current) {
      lastEmitted.current = incoming;
      setDraft((d) => fromSchedule(value, d));
    }
  }, [value]);

  function update(patch: Partial<Draft>) {
    const next = { ...draft, ...patch };
    setDraft(next);
    const { schedule } = toSchedule(next);
    lastEmitted.current = JSON.stringify(schedule);
    onChange(schedule);
  }

  const { schedule, error } = toSchedule(draft);
  const toggleDay = (d: Weekday) => update({ days: draft.days.includes(d) ? draft.days.filter((x) => x !== d) : [...draft.days, d] });

  return (
    <fieldset className="min-w-0 space-y-3">
      <legend className="label">How often</legend>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="How often">
        {MODES.map((m) => (
          <button key={m.mode} type="button" role="radio" aria-checked={draft.mode === m.mode} className={`chip min-h-11 ${draft.mode === m.mode ? "chip-on" : ""}`} onClick={() => update({ mode: m.mode })}>
            {m.label}
          </button>
        ))}
      </div>

      {draft.mode === "specific_days" && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Days of the week">
            {WEEKDAYS_MON_FIRST.map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={draft.days.includes(d)}
                aria-label={DAY_NAME[d]}
                onClick={() => toggleDay(d)}
                className={`grid h-11 w-11 place-items-center rounded-full border text-sm font-bold transition ${draft.days.includes(d) ? "border-primary bg-primary text-primary-text" : "border-line bg-surface text-text hover:bg-surface-2"}`}
              >
                {DAY_LETTER[d]}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-ghost min-h-11 px-3 text-xs" onClick={() => update({ days: [...WEEKDAY_SET] })}>Weekdays</button>
            <button type="button" className="btn-ghost min-h-11 px-3 text-xs" onClick={() => update({ days: [...WEEKEND_SET] })}>Weekends</button>
          </div>
        </div>
      )}

      {draft.mode === "times_per_period" && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label htmlFor={`${id}-count`} className="sr-only">Number of times</label>
          <input
            id={`${id}-count`}
            className="input w-20 text-center"
            inputMode="numeric"
            pattern="[0-9]*"
            value={draft.count}
            onChange={(e) => update({ count: e.target.value.replace(/\D/g, "").slice(0, 2) })}
            aria-invalid={!!error || undefined}
            aria-describedby={`${id}-summary`}
          />
          <span>times per</span>
          <label htmlFor={`${id}-period`} className="sr-only">Period</label>
          <select id={`${id}-period`} className="input w-auto" value={draft.period} onChange={(e) => update({ period: e.target.value as Period })}>
            <option value="day">day</option>
            <option value="week">week</option>
            <option value="month">month</option>
          </select>
        </div>
      )}

      <p id={`${id}-summary`} className={`text-sm ${error ? "text-terracotta-ink" : "text-muted"}`} aria-live="polite">
        {error ?? (schedule ? describeSchedule(schedule) : "")}
        {schedule?.type === "times_per_period" && schedule.period === "day" && !error ? " · tap to count up" : ""}
      </p>
    </fieldset>
  );
}
