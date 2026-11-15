"use client";

import { useState } from "react";
import { useOfflineAction } from "@/components/OfflineSync";
import { Field, FormStatus, MoreDetails, numOrNull, useAction } from "@/components/ui";

type GoalOption = { id: string; title: string; unit: string };

/**
 * Adds progress to a goal: an amount, an optional note and the day it happened. One form for the
 * Goals page (one goal, laid out in a row) and the quick-log sheet (pick the goal first).
 */
export function GoalProgressForm({ goals, today, sheet = false, onDone }: { goals: GoalOption[]; today: string; sheet?: boolean; onDone?: () => void }) {
  const [goalId, setGoalId] = useState(goals[0]?.id ?? "");
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(today);
  const offline = useOfflineAction();
  const { pending, error, message, run } = useAction();
  const goal = goals.find((g) => g.id === goalId) ?? goals[0];
  if (!goal) return <p className="text-sm text-muted">No goals that take manual updates yet. Goals linked to your logs update by themselves.</p>;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = numOrNull(value);
    if (n == null) return run(async () => ({ ok: false, error: "Enter a number." }));
    run(() => offline("addGoalProgress", goal.id, n, note, date), { success: "Progress added ✓", onOk: () => { setValue(""); setNote(""); setDate(today); onDone?.(); } });
  }
  const valueInput = <input className={`input ${sheet ? "" : "w-24"}`} inputMode="decimal" placeholder={`+ ${goal.unit}`} aria-label={`Amount (${goal.unit})`} value={value} onChange={(e) => setValue(e.target.value)} autoFocus={!sheet} />;
  const noteInput = <input className={`input ${sheet ? "" : "min-w-0 flex-1 basis-40"}`} placeholder="Note (optional)" aria-label="Note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />;
  const dateInput = <input type="date" className="input w-auto py-1.5 text-sm" value={date} max={today} onChange={(e) => setDate(e.target.value || today)} aria-label="Date" />;

  if (sheet) {
    return (
      <form className="space-y-4" onSubmit={submit}>
        <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
          <Field label="Goal">
            <select className="input" value={goal.id} onChange={(e) => setGoalId(e.target.value)}>{goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}</select>
          </Field>
          <Field label={`Add (${goal.unit})`}>{valueInput}</Field>
        </div>
        <MoreDetails>
          <Field label="Note">{noteInput}</Field>
          <div><span className="label">Date</span>{dateInput}</div>
        </MoreDetails>
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-primary w-full" disabled={pending} aria-busy={pending}>{pending ? "Saving…" : "Add progress"}</button>
          <FormStatus error={error} message={message} />
        </div>
      </form>
    );
  }
  return (
    <form className="flex flex-wrap items-center gap-2" onSubmit={submit}>
      {valueInput}
      {noteInput}
      {dateInput}
      <button className="btn-primary" disabled={pending} aria-busy={pending}>{pending ? "Saving…" : "Add"}</button>
      <FormStatus error={error} message={message} />
    </form>
  );
}
