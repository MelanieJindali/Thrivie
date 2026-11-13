"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Plus, ScanBarcode, SlidersHorizontal } from "lucide-react";
import { MEAL_LABELS, type MealSlot } from "@/lib/constants";
import { MACROS, MACRO_LABEL, shareWords, type DayTargets, type Suggestion, type Totals } from "@/lib/nutrition/dayFit";
import { formatPortion } from "@/lib/nutrition/mealPlan";
import { adjustTodayPlan, logSuggestion } from "@/app/foodActions";
import { useToast } from "@/components/Toast";

const TONE = { calories: "bg-clay", proteinG: "bg-sage", carbsG: "bg-gold", fatG: "bg-ocean" } as const;
const UNIT = { calories: "kcal", proteinG: "g", carbsG: "g", fatG: "g" } as const;

export type PlanGap = { plannedKcal: number; openMeals: number } | null;

/** What's left of today's targets, a few things that fit, and how the rest of the plan compares. */
export function DayLeft({ targets, eaten, left, hideCalories, slot, suggestions, planGap }: {
  targets: DayTargets; eaten: Totals; left: DayTargets; hideCalories: boolean; slot: MealSlot; suggestions: Suggestion[]; planGap: PlanGap;
}) {
  const [pending, start] = useTransition();
  const [logged, setLogged] = useState<string[]>([]);
  const toast = useToast();
  const shown = MACROS.filter((k) => targets[k] != null && !(hideCalories && k === "calories"));
  const log = (s: Suggestion) => start(async () => {
    const r = await logSuggestion(s.kind === "library" ? { kind: "library", mealId: s.mealId, portion: s.portion, slot } : { kind: "recent", name: s.name, slot });
    if (r.ok) { setLogged((x) => [...x, s.name]); toast({ message: `${s.name} added to ${MEAL_LABELS[slot].toLowerCase()}` }); } else toast({ message: r.error, tone: "error" });
  });
  const adjust = () => start(async () => {
    const r = await adjustTodayPlan();
    toast(r.ok ? { message: r.changed ? "The rest of today's plan is resized to fit." : "Today's plan already fits what's left." } : { message: r.error, tone: "error" });
  });
  // Offer to resize when the planned meals still to come differ from what's left by more than a tenth of the day.
  const gap = planGap && left.calories != null && targets.calories ? planGap.plannedKcal - left.calories : 0;
  const offerAdjust = !!planGap && planGap.openMeals > 0 && !!targets.calories && Math.abs(gap) > targets.calories * 0.1;

  return (
    <section className="card space-y-4" aria-labelledby="left-h">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="left-h" className="h2">Left today</h2>
        <Link href="/nutrition/scan" className="btn-soft"><ScanBarcode size={16} aria-hidden /> Scan food</Link>
      </div>
      {shown.length === 0 ? (
        <p className="text-sm text-muted">{hideCalories && targets.calories != null ? "Calorie numbers are hidden. Log what you eat and Thrivie keeps track quietly." : <>Set up <Link href="/me/body" className="font-semibold text-primary underline">Body &amp; Goals</Link> to see what&apos;s left each day and get suggestions that fit.</>}</p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] gap-3">
          {shown.map((k) => {
            const t = targets[k]!, l = left[k]!;
            const pct = t > 0 ? Math.min(100, Math.round((eaten[k] / t) * 100)) : 0;
            return (
              <li key={k} className="rounded-2xl bg-surface-2/60 p-3">
                <p className="text-[11px] font-bold tracking-[0.12em] text-muted uppercase">{MACRO_LABEL[k]}</p>
                <p className="mt-0.5">
                  {hideCalories ? <span className="text-sm font-semibold">{l === 0 ? "Target reached" : `${shareWords(l / t)} to go`.replace(/^./, (c) => c.toUpperCase())}</span>
                    : <><span className="font-display text-xl font-semibold">{l.toLocaleString("en-US")}</span> <span className="text-xs text-muted">{UNIT[k]} left of {t.toLocaleString("en-US")}</span></>}
                </p>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label={`${MACRO_LABEL[k]} toward today's target`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
                  <div className={`h-full rounded-full ${TONE[k]}`} style={{ width: `${pct}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {offerAdjust && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-seaglass-soft/70 px-4 py-3 text-sm">
          <p className="min-w-0 flex-1 basis-56">
            {hideCalories ? `Your plan's remaining ${planGap!.openMeals === 1 ? "meal is" : "meals are"} ${gap > 0 ? "a little bigger" : "a little smaller"} than what's left today.`
              : `Your plan still has about ${planGap!.plannedKcal.toLocaleString("en-US")} kcal to come, and about ${left.calories!.toLocaleString("en-US")} kcal are left today.`}
          </p>
          <button type="button" className="btn-soft" disabled={pending} aria-busy={pending} onClick={adjust}><SlidersHorizontal size={16} aria-hidden /> Resize the rest of today&apos;s plan</button>
        </div>
      )}

      {suggestions.length > 0 && (
        <div>
          <h3 className="mb-1 font-bold">What to eat next <span className="text-sm font-normal text-muted">· ideas for {MEAL_LABELS[slot].toLowerCase()}</span></h3>
          <ul className="divide-y divide-border">
            {suggestions.map((s) => (
              <li key={`${s.kind}-${s.name}`} className="flex flex-wrap items-center gap-3 py-2.5">
                <div className="min-w-[min(12rem,100%)] flex-1">
                  <p className="font-semibold">{s.name}</p>
                  <p className="text-xs text-muted">
                    {s.kind === "library" ? formatPortion(s.portion) : "As you had it before"}
                    {!hideCalories && s.nutrients.calories != null && ` · ${s.nutrients.calories} kcal`}{!hideCalories && s.nutrients.proteinG != null && ` · ${Math.round(s.nutrients.proteinG)} g protein`} · {s.reason}
                  </p>
                </div>
                {logged.includes(s.name) ? <span className="px-2 text-xs font-bold text-sage-ink">Logged</span>
                  : <button type="button" className="btn-soft px-3 text-xs" disabled={pending} aria-busy={pending} onClick={() => log(s)} aria-label={`Log it: ${s.name}`}><Plus size={14} aria-hidden /> Log it</button>}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-muted">Ideas only, based on what&apos;s left today and your diet and allergies. Eat what suits you.</p>
        </div>
      )}
    </section>
  );
}
