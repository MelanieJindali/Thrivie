"use client";

import { UndoDeleteButton } from "@/components/Toast";
import { useState } from "react";
import { deleteWorkout } from "@/app/actions";
import { Empty } from "@/components/ui";
import { ListControls, NoMatches, ShowMoreButton, ShowMoreText, useListView } from "@/components/ListControls";
import { WORKOUT_LABELS, WORKOUT_TYPES } from "@/lib/constants";
import { relativeLabel } from "@/lib/dates";
import type { Units } from "@/lib/units";
import { WorkoutForm, type WorkoutDraft } from "./WorkoutForm";

export type WorkoutRow = { id: string; date: string; summary: string; draft: WorkoutDraft; exercises: string[] };

export function WorkoutsView({ today, units, rows, exerciseNames, lastSummary }: { today: string; units: Units; rows: WorkoutRow[]; exerciseNames: string[]; lastSummary: string | null }) {
  const [editing, setEditing] = useState<WorkoutDraft | null>(null);
  const view = useListView(rows, {
    searchText: (r) => `${r.summary} ${r.exercises.join(" ")} ${r.draft.notes}`,
    sorts: [
      { key: "new", label: "Newest", compare: (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0) },
      { key: "old", label: "Oldest", compare: (a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : 0) },
      { key: "long", label: "Longest", compare: (a, b) => Number(b.draft.durationMin) - Number(a.draft.durationMin) },
      { key: "short", label: "Shortest", compare: (a, b) => Number(a.draft.durationMin) - Number(b.draft.durationMin) },
    ],
    filters: WORKOUT_TYPES.filter((t) => rows.some((r) => r.draft.type === t)).map((t) => ({ key: t, label: WORKOUT_LABELS[t].label, test: (r) => r.draft.type === t })),
    pageSize: 15,
  });
  return (
    <>
      <div id="log" className="scroll-mt-6">
        <WorkoutForm key={editing?.id ?? "new"} today={today} units={units} exerciseNames={exerciseNames} lastSummary={lastSummary} editing={editing} onDone={() => setEditing(null)} />
      </div>
      <section className="card">
        <h2 className="h2 mb-3">History</h2>
        {rows.length > 0 && <ListControls view={view} label="workouts" searchPlaceholder="Search workouts and exercises" />}
        <NoMatches view={view} />
        {rows.length ? (
          <>
          <ul className="divide-y divide-border">
            {view.visible.map((r) => (
              <li key={r.id} className="flex items-start gap-3 py-3 text-sm">
                <span className="hidden w-20 shrink-0 text-muted sm:block">{relativeLabel(r.date, today)}</span>
                <div className="min-w-0 flex-1">
                  {/* On a narrow phone the date goes above the summary, so the text keeps the full width. */}
                  <div className="text-xs text-muted sm:hidden">{relativeLabel(r.date, today)}</div>
                  <div className="font-medium">{r.summary}</div>
                  {r.exercises.length > 0 && <ShowMoreText lines={2} className="mt-0.5 text-xs text-muted">{r.exercises.join(" · ")}</ShowMoreText>}
                </div>
                <button className="btn-ghost px-2 py-1 text-xs" onClick={() => { setEditing(r.draft); document.getElementById("log")?.scrollIntoView({ behavior: "smooth" }); }}>
                  Edit
                </button>
                <UndoDeleteButton what="Workout" action={() => deleteWorkout(r.id)} />
              </li>
            ))}
          </ul>
          <ShowMoreButton view={view} noun="more workouts" />
          </>
        ) : (
          <Empty>No workouts yet. Log your first one above.</Empty>
        )}
      </section>
    </>
  );
}
