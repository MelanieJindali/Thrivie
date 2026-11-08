"use client";

import { useEffect, useState } from "react";
import { useOfflineAction } from "@/components/OfflineSync";
import { Field, FormStatus, numOrNull, useAction } from "@/components/ui";
import { MEAL_EMOJI, MEAL_LABELS, MEAL_SLOTS, type MealSlot } from "@/lib/constants";

export type MealDraft = {
  id?: string;
  date: string;
  slot: MealSlot;
  name: string;
  calories: string;
  proteinG: string;
  carbsG: string;
  fatG: string;
  notes: string;
};
export type RecentMeal = Omit<MealDraft, "id" | "date" | "notes">;

/** A sensible default for the time of day (the user can change it with one tap). */
function slotNow(): MealSlot {
  const h = new Date().getHours();
  return h < 11 ? "breakfast" : h < 16 ? "lunch" : h < 21 ? "dinner" : "snack";
}

const blank = (date: string, slot: MealSlot): MealDraft => ({ date, slot, name: "", calories: "", proteinG: "", carbsG: "", fatG: "", notes: "" });

export function MealForm({ today, recent, editing, onDone }: { today: string; recent: RecentMeal[]; editing: MealDraft | null; onDone: () => void }) {
  const [m, setM] = useState<MealDraft>(editing ?? blank(today, "lunch"));
  const { pending, error, message, run } = useAction();
  const offline = useOfflineAction();
  const set = <K extends keyof MealDraft>(k: K, v: MealDraft[K]) => setM((x) => ({ ...x, [k]: v }));

  // The time of day is only known on the device, so pick the slot after mount.
  useEffect(() => {
    if (!editing) setM((x) => ({ ...x, slot: slotNow() }));
  }, [editing]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!m.name.trim()) return run(async () => ({ ok: false, error: "Add what you ate." }));
    const cal = numOrNull(m.calories);
    run(
      () =>
        offline("saveMeal", {
          id: m.id,
          date: m.date,
          slot: m.slot,
          name: m.name,
          calories: cal != null ? Math.round(cal) : null,
          proteinG: numOrNull(m.proteinG),
          carbsG: numOrNull(m.carbsG),
          fatG: numOrNull(m.fatG),
          notes: m.notes,
        }),
      {
        success: m.id ? "Meal updated ✓" : "Meal saved ✓",
        onOk: () => {
          setM(blank(today, m.slot));
          onDone();
        },
      },
    );
  }

  return (
    <form onSubmit={submit} className="card space-y-4" aria-labelledby="meal-form-h">
      <h2 id="meal-form-h" className="h2">{m.id ? "Edit meal" : "Log a meal"}</h2>

      <fieldset>
        <legend className="label">Meal</legend>
        <div className="flex flex-wrap gap-2">
          {MEAL_SLOTS.map((s) => (
            <button key={s} type="button" className={`chip ${m.slot === s ? "chip-on" : ""}`} aria-pressed={m.slot === s} onClick={() => set("slot", s)}>
              <span aria-hidden>{MEAL_EMOJI[s]}</span> {MEAL_LABELS[s]}
            </button>
          ))}
        </div>
      </fieldset>

      {!m.id && recent.length > 0 && (
        <div>
          <p className="label">Have it again</p>
          <div className="flex flex-wrap gap-2">
            {recent.map((r) => (
              <button
                key={`${r.slot}-${r.name}`}
                type="button"
                className="chip max-w-full"
                onClick={() => setM((x) => ({ ...x, ...r, slot: x.slot }))}
                title={`Fill in ${r.name}`}
              >
                <span className="truncate">{r.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <Field label="What did you have?">
          <input className="input" value={m.name} onChange={(e) => set("name", e.target.value)} maxLength={200} placeholder="e.g. Greek yogurt with berries" autoComplete="off" required />
        </Field>
        <Field label="Date">
          <input className="input" type="date" value={m.date} max={today} onChange={(e) => set("date", e.target.value)} required />
        </Field>
      </div>

      <div>
        <p className="mb-1.5 text-xs text-muted">Numbers are optional. Add what you know.</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Calories">
            <input className="input" inputMode="numeric" value={m.calories} onChange={(e) => set("calories", e.target.value)} placeholder="kcal" />
          </Field>
          <Field label="Protein (g)">
            <input className="input" inputMode="decimal" value={m.proteinG} onChange={(e) => set("proteinG", e.target.value)} />
          </Field>
          <Field label="Carbs (g)">
            <input className="input" inputMode="decimal" value={m.carbsG} onChange={(e) => set("carbsG", e.target.value)} />
          </Field>
          <Field label="Fat (g)">
            <input className="input" inputMode="decimal" value={m.fatG} onChange={(e) => set("fatG", e.target.value)} />
          </Field>
        </div>
      </div>

      <Field label="Note (private)">
        <input className="input" value={m.notes} onChange={(e) => set("notes", e.target.value)} maxLength={2000} placeholder="How it felt, where you ate…" />
      </Field>

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : m.id ? "Update meal" : "Save meal"}</button>
        {m.id && <button type="button" className="btn-ghost" onClick={() => { setM(blank(today, m.slot)); onDone(); }}>Cancel</button>}
        <FormStatus error={error} message={message} />
      </div>
    </form>
  );
}
