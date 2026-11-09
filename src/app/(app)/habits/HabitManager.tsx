"use client";

import { UndoDeleteButton } from "@/components/Toast";
import { useState } from "react";
import { archiveHabit, deleteHabit, saveHabit } from "@/app/actions";
import { Field, FormStatus, useAction } from "@/components/ui";
import { DEFAULT_SCHEDULE, type HabitSchedule } from "@/lib/habits/schedule";
import { FrequencyPicker } from "./FrequencyPicker";
import { ListControls, NoMatches, ShowMoreButton, useListView } from "@/components/ListControls";

export type HabitRow = { id: string; name: string; emoji: string | null; schedule: HabitSchedule; summary: string; archived: boolean };
type H = HabitRow;

function HabitForm({ initial, onDone }: { initial?: H; onDone?: () => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [emoji, setEmoji] = useState(initial?.emoji ?? "");
  // The picker owns the editing state; we keep its latest valid output (null while incomplete).
  const start = initial?.schedule ?? DEFAULT_SCHEDULE;
  const [schedule, setSchedule] = useState<HabitSchedule | null>(start);
  const [round, setRound] = useState(0); // remounts the picker after a new habit is added
  const { pending, error, message, run } = useAction();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!schedule) return;
        run(() => saveHabit({ id: initial?.id, name, emoji, schedule }), {
          success: initial ? "Saved ✓" : "Habit added ✓",
          onOk: () => { if (!initial) { setName(""); setEmoji(""); setSchedule(DEFAULT_SCHEDULE); setRound((r) => r + 1); } onDone?.(); },
        });
      }}
    >
      <div className="grid grid-cols-[4rem_1fr] gap-2">
        <Field label="Emoji"><input className="input text-center" maxLength={4} placeholder="🌱" value={emoji} onChange={(e) => setEmoji(e.target.value)} /></Field>
        <Field label="Habit"><input className="input" placeholder="e.g. Meditate" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      </div>
      <FrequencyPicker key={`${initial?.id ?? "new"}-${round}`} value={start} onChange={setSchedule} />
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={pending || !name.trim() || !schedule}>{initial ? "Save" : "Add habit"}</button>
        {initial && <button type="button" className="btn-ghost" onClick={onDone}>Cancel</button>}
        <FormStatus error={error} message={message} />
      </div>
    </form>
  );
}

export function HabitManager({ habits, archived }: { habits: H[]; archived: H[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const all = [...habits, ...archived];
  const view = useListView(all, {
    searchText: (h) => `${h.name} ${h.summary}`,
    filters: [{ key: "active", label: "Active", test: (h) => !h.archived }, { key: "archived", label: "Archived", test: (h) => h.archived }],
    pageSize: 15,
  });
  const { run } = useAction();
  return (
    <section className="card scroll-mt-6 space-y-5" id="manage">
      <div>
        <h2 className="h2 mb-3" id="new">New habit</h2>
        <HabitForm />
      </div>
      {(habits.length > 0 || archived.length > 0) && (
        <div>
          <h2 className="h2 mb-2">Manage habits</h2>
          {all.length > 4 && <ListControls view={view} label="habits" searchPlaceholder="Search habits" />}
          <NoMatches view={view} />
          <ul className="divide-y divide-border">
            {view.visible.map((h) => (
              <li key={h.id} className="py-2.5">
                {editing === h.id ? (
                  <HabitForm initial={h} onDone={() => setEditing(null)} />
                ) : (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className={`flex-1 ${h.archived ? "text-muted line-through" : ""}`}>{h.emoji} {h.name} <span className="text-xs text-muted">· {h.summary}</span></span>
                    <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setEditing(h.id)}>Edit</button>
                    <button className="btn-ghost px-2 py-1 text-xs" onClick={() => run(() => archiveHabit(h.id, !h.archived))}>{h.archived ? "Restore" : "Archive"}</button>
                    <UndoDeleteButton what="Habit" action={() => deleteHabit(h.id)} />
                  </div>
                )}
              </li>
            ))}
          </ul>
          <ShowMoreButton view={view} noun="more habits" />
          <p className="mt-2 text-xs text-muted">Archiving hides a habit but keeps its history. Deleting removes its check-ins too.</p>
        </div>
      )}
    </section>
  );
}
