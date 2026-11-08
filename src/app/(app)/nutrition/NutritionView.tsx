"use client";

import { useState } from "react";
import { deleteMeal, saveNutritionTargets } from "@/app/actions";
import { UndoDeleteButton } from "@/components/Toast";
import { Empty, Field, FormStatus, numOrNull, useAction } from "@/components/ui";
import { relativeLabel } from "@/lib/dates";
import { MEAL_EMOJI, MEAL_LABELS } from "@/lib/constants";
import { macroLine } from "@/lib/nutrition";
import { MealForm, type MealDraft, type RecentMeal } from "./MealForm";

export type MealRow = MealDraft & { id: string };
export type DayGroup = { date: string; calories: number | null; proteinG: number | null; meals: MealRow[] };

const n = (s: string) => (s === "" ? null : Number(s));

export function NutritionView({ today, days, recent }: { today: string; days: DayGroup[]; recent: RecentMeal[] }) {
  const [editing, setEditing] = useState<MealDraft | null>(null);
  return (
    <>
      <div id="log" className="scroll-mt-6">
        <MealForm key={editing?.id ?? "new"} today={today} recent={recent} editing={editing} onDone={() => setEditing(null)} />
      </div>
      <section className="card" aria-labelledby="meal-history-h">
        <h2 id="meal-history-h" className="h2 mb-3">Recent meals</h2>
        {days.length ? (
          <div className="space-y-5">
            {days.map((d) => (
              <div key={d.date}>
                <h3 className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-1.5 text-sm font-bold">
                  {relativeLabel(d.date, today)}
                  <span className="text-xs font-medium text-muted">{macroLine({ calories: d.calories, proteinG: d.proteinG })}</span>
                </h3>
                <ul className="divide-y divide-border">
                  {d.meals.map((m) => {
                    const line = macroLine({ calories: n(m.calories), proteinG: n(m.proteinG), carbsG: n(m.carbsG), fatG: n(m.fatG) });
                    return (
                    <li key={m.id} className="flex items-start gap-3 py-2.5 text-sm">
                      <span aria-hidden className="mt-0.5 text-lg">{MEAL_EMOJI[m.slot]}</span>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{m.name}</p>
                        <p className="text-xs text-muted">{MEAL_LABELS[m.slot]}{line && ` · ${line}`}</p>
                      </div>
                      <button className="btn-ghost px-2 py-1 text-xs" onClick={() => { setEditing(m); document.getElementById("log")?.scrollIntoView({ behavior: "smooth" }); }}>
                        Edit<span className="sr-only"> {m.name}</span>
                      </button>
                      <UndoDeleteButton what="Meal" action={() => deleteMeal(m.id)} />
                    </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <Empty>No meals yet. Log your first one above, or paste notes like “lunch: chicken salad 520 cal”.</Empty>
        )}
      </section>
    </>
  );
}

export function TargetsForm({ calorieTarget, proteinTargetG }: { calorieTarget: number | null; proteinTargetG: number | null }) {
  const [cal, setCal] = useState(calorieTarget?.toString() ?? "");
  const [pro, setPro] = useState(proteinTargetG?.toString() ?? "");
  const { pending, error, message, run } = useAction();
  return (
    <form
      className="card space-y-3"
      aria-labelledby="targets-h"
      onSubmit={(e) => {
        e.preventDefault();
        const c = numOrNull(cal);
        const p = numOrNull(pro);
        run(() => saveNutritionTargets({ calorieTarget: c != null ? Math.round(c) : null, proteinTargetG: p != null ? Math.round(p) : null }), { success: "Targets saved ✓" });
      }}
    >
      <h2 id="targets-h" className="h2">Daily targets</h2>
      <p className="text-sm text-muted">Optional. Leave them empty to just keep a food diary. If you&apos;re unsure what&apos;s right for you, a doctor or dietitian can help.</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Calories">
          <input className="input" inputMode="numeric" value={cal} onChange={(e) => setCal(e.target.value)} placeholder="Off" />
        </Field>
        <Field label="Protein (g)">
          <input className="input" inputMode="numeric" value={pro} onChange={(e) => setPro(e.target.value)} placeholder="Off" />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-outline" disabled={pending}>{pending ? "Saving…" : "Save targets"}</button>
        <FormStatus error={error} message={message} />
      </div>
    </form>
  );
}
