"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ChevronRight, HeartHandshake, RefreshCw, Salad } from "lucide-react";
import { newMealPlan, swapPlanMeal } from "@/app/actions";
import { formatPortion, getMeal, type DayPlan } from "@/lib/nutrition/mealPlan";
import { NOT_MEDICAL_ADVICE } from "@/lib/nutrition/calculations";
import { useToast } from "./Toast";

const SLOT_LABEL = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snack" } as const;

export type PlanCardState =
  | { state: "no-profile" }
  | { state: "blocked"; message: string }
  | { state: "ready"; day: DayPlan; dayIndex: number; hideCalories: boolean; warnings: string[] };

/** One day of the meal plan with one-tap swaps. `compact` is the Today-page version. */
export function MealPlanDay({ day, dayIndex, hideCalories, compact = false, title }: { day: DayPlan; dayIndex: number; hideCalories: boolean; compact?: boolean; title?: string }) {
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<number | null>(null);
  const toast = useToast();
  function swap(i: number) {
    setBusy(i);
    start(async () => {
      const r = await swapPlanMeal(dayIndex, i);
      if (!r.ok) toast({ message: r.error, tone: "error" });
      setBusy(null);
    });
  }
  return (
    <div>
      {title && (
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-bold">{title}</h3>
          {!hideCalories && <span className="text-xs text-muted">{day.totals.kcal.toLocaleString("en-US")} of {day.targetCalories.toLocaleString("en-US")} kcal</span>}
        </div>
      )}
      <ul className="divide-y divide-border">
        {day.items.map((it, i) => {
          const meal = getMeal(it.mealId);
          if (!meal) return null;
          return (
            <li key={`${it.mealId}-${i}`} className="flex flex-wrap items-start gap-3 py-3">
              <div className="min-w-[min(12rem,100%)] flex-1">
                <p className="text-[11px] font-bold tracking-[0.12em] text-muted uppercase">{SLOT_LABEL[it.slot]}</p>
                <p className="font-semibold">{meal.name}</p>
                <p className="text-xs text-muted">
                  {formatPortion(it.portion)}
                  {!hideCalories && ` · ${it.kcal} kcal · ${it.proteinG}g protein`}
                </p>
                {!compact && <p className="mt-0.5 text-xs text-muted">{meal.ingredients.map((g) => g.label).join(", ")}{it.portion !== 1 ? ` (per serving)` : ""}</p>}
              </div>
              <button type="button" className="btn-ghost min-h-11 shrink-0 px-3 text-xs" disabled={pending} onClick={() => swap(i)} aria-label={`Swap ${SLOT_LABEL[it.slot].toLowerCase()}: ${meal.name}`}>
                <RefreshCw size={14} className={busy === i ? "animate-spin" : ""} aria-hidden /> Swap
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** "Today's Meal Plan" card (Nutrition and Today pages). */
export function MealPlanCard({ plan, compact = false }: { plan: PlanCardState; compact?: boolean }) {
  return (
    <section className="card" aria-labelledby="mealplan-h">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 id="mealplan-h" className="h2 flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-clay-soft text-clay-ink" aria-hidden><Salad size={16} /></span>
          Today&apos;s meal plan
        </h2>
        {plan.state === "ready" && <Link href="/nutrition/plan" className="inline-flex min-h-11 items-center text-xs font-bold text-primary">This week <ChevronRight size={14} aria-hidden /></Link>}
      </div>
      {plan.state === "no-profile" && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">Tell us a little about you and your goal to get a simple daily meal plan.</p>
          <Link href="/me/body" className="btn-soft">Set up Body & Goals</Link>
        </div>
      )}
      {plan.state === "blocked" && (
        <div className="flex gap-3 rounded-2xl bg-iris-soft p-4 text-sm" role="note">
          <HeartHandshake size={20} className="mt-0.5 shrink-0 text-iris" aria-hidden />
          <p>{plan.message}</p>
        </div>
      )}
      {plan.state === "ready" && (
        <>
          {!plan.hideCalories && <p className="text-sm text-muted">{plan.day.totals.kcal.toLocaleString("en-US")} kcal planned for a {plan.day.targetCalories.toLocaleString("en-US")} kcal day.</p>}
          {plan.warnings.map((w) => <p key={w} className="mt-1 text-sm text-terracotta-ink">{w}</p>)}
          <MealPlanDay day={plan.day} dayIndex={plan.dayIndex} hideCalories={plan.hideCalories} compact={compact} />
          {!compact && <p className="mt-2 text-xs text-muted">{NOT_MEDICAL_ADVICE}</p>}
        </>
      )}
    </section>
  );
}

export function NewPlanButton() {
  const [pending, start] = useTransition();
  return (
    <button type="button" className="btn-soft" disabled={pending} onClick={() => start(async () => { await newMealPlan(); })}>
      <RefreshCw size={15} className={pending ? "animate-spin" : ""} aria-hidden /> New plan for this week
    </button>
  );
}

