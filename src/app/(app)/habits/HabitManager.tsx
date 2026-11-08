"use client";

import { UndoDeleteButton } from "@/components/Toast";
import { useState } from "react";
import { archiveHabit, deleteHabit, saveHabit } from "@/app/actions";
import { Field, FormStatus, useAction } from "@/components/ui";

type H = { id: string; name: string; emoji: string | null; frequency: string; timesPerWeek: number; archived: boolean };

export function HabitForm({ initial, onDone }: { initial?: H; onDone?: () => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [emoji, setEmoji] = useState(initial?.emoji ?? "");
  const [freq, setFreq] = useState<"daily" | "weekly">(initial?.frequency === "weekly" ? "weekly" : "daily");
  const [times, setTimes] = useState(initial?.frequency === "weekly" ? initial.timesPerWeek : 3);
  const { pending, error, message, run } = useAction();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveHabit({ id: initial?.id, name, emoji, frequency: freq, timesPerWeek: times }), {
          success: initial ? "Saved ✓" : "Habit added ✓",
          onOk: () => { if (!initial) { setName(""); setEmoji(""); } onDone?.(); },
        });
      }}
    >
      <div className="grid grid-cols-[4rem_1fr] gap-2">
        <Field label="Emoji"><input className="input text-center" maxLength={4} placeholder="🌱" value={emoji} onChange={(e) => setEmoji(e.target.value)} /></Field>
        <Field label="Habit"><input className="input" placeholder="e.g. Meditate" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={`chip ${freq === "daily" ? "chip-on" : ""}`} onClick={() => setFreq("daily")}>Daily</button>
        <button type="button" className={`chip ${freq === "weekly" ? "chip-on" : ""}`} onClick={() => setFreq("weekly")}>Times per week</button>
        {freq === "weekly" && (
          <select className="input w-auto py-1.5" value={times} onChange={(e) => setTimes(Number(e.target.value))} aria-label="Times per week">
            {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}× / week</option>)}
          </select>
        )}
      </div>
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={pending || !name.trim()}>{initial ? "Save" : "Add habit"}</button>
        {initial && <button type="button" className="btn-ghost" onClick={onDone}>Cancel</button>}
        <FormStatus error={error} message={message} />
      </div>
    </form>
  );
}

export function HabitManager({ habits, archived }: { habits: H[]; archived: H[] }) {
  const [editing, setEditing] = useState<string | null>(null);
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
          <ul className="divide-y divide-border">
            {[...habits, ...archived].map((h) => (
              <li key={h.id} className="py-2.5">
                {editing === h.id ? (
                  <HabitForm initial={h} onDone={() => setEditing(null)} />
                ) : (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className={`flex-1 ${h.archived ? "text-muted line-through" : ""}`}>{h.emoji} {h.name} <span className="text-xs text-muted">· {h.frequency === "weekly" ? `${h.timesPerWeek}×/week` : "daily"}</span></span>
                    <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setEditing(h.id)}>Edit</button>
                    <button className="btn-ghost px-2 py-1 text-xs" onClick={() => run(() => archiveHabit(h.id, !h.archived))}>{h.archived ? "Restore" : "Archive"}</button>
                    <UndoDeleteButton what="Habit" action={() => deleteHabit(h.id)} />
                  </div>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">Archiving hides a habit but keeps its history. Deleting removes its check-ins too.</p>
        </div>
      )}
    </section>
  );
}
