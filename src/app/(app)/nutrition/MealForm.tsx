"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Search, Sparkles } from "lucide-react";
import type { FoodEstimate } from "@/lib/nutrition/foodEstimate";
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
export type RecentMeal = Omit<MealDraft, "id" | "date" | "notes"> & { times?: number };

/** A sensible default for the time of day (the user can change it with one tap). */
function slotNow(): MealSlot {
  const h = new Date().getHours();
  return h < 11 ? "breakfast" : h < 16 ? "lunch" : h < 21 ? "dinner" : "snack";
}

const blank = (date: string, slot: MealSlot): MealDraft => ({ date, slot, name: "", calories: "", proteinG: "", carbsG: "", fatG: "", notes: "" });

export function MealForm({ today, recent, allMeals = recent, editing, onDone }: { today: string; recent: RecentMeal[]; allMeals?: RecentMeal[]; editing: MealDraft | null; onDone: () => void }) {
  const [m, setM] = useState<MealDraft>(editing ?? blank(today, "lunch"));
  const { pending, error, message, run } = useAction();
  const offline = useOfflineAction();
  const set = <K extends keyof MealDraft>(k: K, v: MealDraft[K]) => setM((x) => ({ ...x, [k]: v }));

  // Suggested numbers for what's typed. The estimator (and its food data) loads only once typing starts.
  const [estimator, setEstimator] = useState<{ estimateFood: (n: string, p: RecentMeal[]) => FoodEstimate | null } | null>(null);
  useEffect(() => {
    if (!estimator && m.name.trim().length >= 3) import("@/lib/nutrition/foodEstimate").then((mod) => setEstimator({ estimateFood: mod.estimateFood })).catch(() => {});
  }, [m.name, estimator]);
  const est = useMemo(() => estimator?.estimateFood(m.name, allMeals) ?? null, [estimator, m.name, allMeals]);
  const blankNums = (["calories", "proteinG", "carbsG", "fatG"] as const).filter((k) => m[k].trim() === "");
  const showEst = est && blankNums.length > 0;
  const applyEst = (keys: readonly ("calories" | "proteinG" | "carbsG" | "fatG")[]) => est && setM((x) => ({ ...x, ...Object.fromEntries(keys.map((k) => [k, String(est[k])])) }));

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
                onClick={() => setM((x) => ({ ...x, ...fill(r), slot: x.slot }))}
                title={`Fill in ${r.name}`}
              >
                <span className="truncate">{r.name}</span>
              </button>
            ))}
          </div>
          {allMeals.length > recent.length && <AllMeals meals={allMeals} onPick={(r) => setM((x) => ({ ...x, ...fill(r), slot: x.slot }))} />}
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
        <p className="mb-1.5 text-xs text-muted">Numbers are optional. Add what you know{est ? ", or use the suggestions" : ""}.</p>
        {showEst && (
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl bg-seaglass-soft/70 px-3.5 py-2.5 text-sm" aria-live="polite">
            <Sparkles size={16} className="shrink-0 text-primary" aria-hidden />
            <p className="min-w-0 flex-1 basis-52">
              <span className="font-semibold">Suggested: {est.calories} kcal · {est.proteinG} g protein · {est.carbsG} g carbs · {est.fatG} g fat</span>
              <span className="block text-xs text-muted">Based on {est.basis}. Approximate; adjust to your portion.</span>
            </p>
            <button type="button" className="btn-soft min-h-11 shrink-0 px-3 text-xs" onClick={() => applyEst(blankNums)}>Use all</button>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {([["calories", "Calories", "numeric", "kcal"], ["proteinG", "Protein (g)", "decimal", ""], ["carbsG", "Carbs (g)", "decimal", ""], ["fatG", "Fat (g)", "decimal", ""]] as const).map(([k, label, mode, ph]) => (
            <div key={k} className="min-w-0">
              <Field label={label}>
                <input className="input" inputMode={mode} value={m[k]} onChange={(e) => set(k, e.target.value)} placeholder={ph || undefined} />
              </Field>
              {showEst && m[k].trim() === "" && (
                <button type="button" className="mt-1 flex min-h-9 max-w-full flex-wrap items-center gap-x-1 text-left text-xs text-muted" onClick={() => applyEst([k])}>
                  Suggested <b className="font-semibold text-text">{est[k]}{k === "calories" ? "" : " g"}</b> <span className="font-bold text-primary underline">Use<span className="sr-only"> for {label.replace(" (g)", "").toLowerCase()}</span></span>
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <Field label="Note (private)">
        <input className="input" value={m.notes} onChange={(e) => set("notes", e.target.value)} maxLength={2000} placeholder="How it felt, where you ate…" />
      </Field>

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={pending} aria-busy={pending}>{pending ? "Saving…" : m.id ? "Update meal" : "Save meal"}</button>
        {m.id && <button type="button" className="btn-ghost" onClick={() => { setM(blank(today, m.slot)); onDone(); }}>Cancel</button>}
        <FormStatus error={error} message={message} />
      </div>
    </form>
  );
}

const fill = ({ times: _times, ...r }: RecentMeal) => r;

/** Every meal you've logged in the past year, searchable, for re-entering repeat meals in one tap. */
function AllMeals({ meals, onPick }: { meals: RecentMeal[]; onPick: (m: RecentMeal) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const id = useId();
  const query = q.trim().toLowerCase();
  const shown = (query ? meals.filter((m) => m.name.toLowerCase().includes(query)) : meals).slice(0, 60);
  return (
    <div className="mt-2">
      <button type="button" className="inline-flex min-h-11 items-center gap-1 text-sm font-bold text-primary" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        {open ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
        {open ? "Hide past meals" : `See all past meals (${meals.length})`}
      </button>
      {open && (
        <div id={id} className="mt-2 space-y-2 rounded-2xl bg-surface-2/60 p-3">
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" aria-hidden />
            <label htmlFor={`${id}-q`} className="sr-only">Search past meals</label>
            <input id={`${id}-q`} type="search" className="input min-h-11 py-2 pl-9 text-sm" placeholder="Search past meals" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
          </div>
          <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-xl bg-surface" aria-label="Past meals">
            {shown.map((r) => (
              <li key={`${r.slot}-${r.name}`}>
                <button type="button" className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-surface-2"
                  onClick={() => { onPick(r); setOpen(false); setQ(""); }}>
                  <span aria-hidden>{MEAL_EMOJI[r.slot]}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{r.name}</span>
                    <span className="block text-xs text-muted">
                      {MEAL_LABELS[r.slot]}{r.calories && ` · ${r.calories} kcal`}{r.times && r.times > 1 ? ` · had ${r.times} times` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-bold text-primary">Use</span>
                </button>
              </li>
            ))}
            {!shown.length && <li className="px-3 py-3 text-sm text-muted">No past meals match “{q}”.</li>}
          </ul>
          {meals.length > 60 && !query && <p className="text-xs text-muted">Showing your 60 most recent. Search to find older meals.</p>}
        </div>
      )}
    </div>
  );
}
