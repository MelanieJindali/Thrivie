"use client";

import { useState } from "react";
import { deleteWorkout } from "@/app/actions";
import { ConfirmButton, Empty, useAction } from "@/components/ui";
import { relativeLabel } from "@/lib/dates";
import type { Units } from "@/lib/units";
import { WorkoutForm, type WorkoutDraft } from "./WorkoutForm";

export type WorkoutRow = { id: string; date: string; summary: string; draft: WorkoutDraft; exercises: string[] };

export function WorkoutsView({ today, units, rows, exerciseNames, lastSummary }: { today: string; units: Units; rows: WorkoutRow[]; exerciseNames: string[]; lastSummary: string | null }) {
  const [editing, setEditing] = useState<WorkoutDraft | null>(null);
  const { run } = useAction();
  return (
    <>
      <div id="workout-form">
        <WorkoutForm key={editing?.id ?? "new"} today={today} units={units} exerciseNames={exerciseNames} lastSummary={lastSummary} editing={editing} onDone={() => setEditing(null)} />
      </div>
      <section className="card">
        <h2 className="h2 mb-3">History</h2>
        {rows.length ? (
          <ul className="divide-y divide-border">
            {rows.slice(0, 40).map((r) => (
              <li key={r.id} className="flex items-start gap-3 py-3 text-sm">
                <span className="w-20 shrink-0 text-muted">{relativeLabel(r.date, today)}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{r.summary}</div>
                  {r.exercises.length > 0 && <div className="mt-0.5 text-xs text-muted">{r.exercises.join(" · ")}</div>}
                </div>
                <button className="btn-ghost px-2 py-1 text-xs" onClick={() => { setEditing(r.draft); document.getElementById("workout-form")?.scrollIntoView({ behavior: "smooth" }); }}>
                  Edit
                </button>
                <ConfirmButton onConfirm={() => run(() => deleteWorkout(r.id))} />
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No workouts yet — log your first one above.</Empty>
        )}
      </section>
    </>
  );
}
