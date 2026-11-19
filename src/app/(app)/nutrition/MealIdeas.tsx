"use client";

import { useEffect, useId, useState } from "react";
import { ChevronDown, Salad, UtensilsCrossed } from "lucide-react";
import { OPEN_IDEAS_EVENT } from "./DayLeft";

type Part = "next" | "plan";
const KEY = (p: Part) => `thrivie-fold:meal-ideas-${p}`;

/** One folding part of the Meal ideas card. Closed by default; the open state is remembered on this device. */
function Fold({ part, title, summary, icon, tone, children }: { part: Part; title: string; summary: string; icon: React.ReactNode; tone: string; children: React.ReactNode }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try { if (localStorage.getItem(KEY(part)) === "1") setOpen(true); } catch {}
    const onOpen = (e: Event) => { if ((e as CustomEvent).detail === part) set(true); };
    window.addEventListener(OPEN_IDEAS_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_IDEAS_EVENT, onOpen);
  }, [part]); // eslint-disable-line react-hooks/exhaustive-deps
  function set(v: boolean) {
    setOpen(v);
    try { if (v) localStorage.setItem(KEY(part), "1"); else localStorage.removeItem(KEY(part)); } catch {}
  }
  return (
    <div className="rounded-2xl border border-border">
      <h3>
        <button type="button" className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left" aria-expanded={open} aria-controls={id} onClick={() => set(!open)}>
          <span className={`grid h-9 w-9 flex-none place-items-center rounded-xl ${tone}`} aria-hidden>{icon}</span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold">{title}</span>
            <span className="block text-xs text-muted">{summary}</span>
          </span>
          <ChevronDown size={20} className={`flex-none text-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`} aria-hidden />
        </button>
      </h3>
      <div id={id} hidden={!open} className="t-acc px-3 pb-3">{children}</div>
    </div>
  );
}

/** "Meal ideas": what to eat next and today's meal plan, folded away at the bottom of the Nutrition page. */
export function MealIdeas({ nextSummary, planSummary, next, plan }: { nextSummary: string; planSummary: string; next: React.ReactNode; plan: React.ReactNode }) {
  return (
    <section id="meal-ideas" className="card scroll-mt-6 space-y-3" aria-labelledby="meal-ideas-h">
      <h2 id="meal-ideas-h" className="h2">Meal ideas</h2>
      <Fold part="next" title="What to eat next" summary={nextSummary} icon={<UtensilsCrossed size={17} />} tone="bg-gold-soft text-gold-ink">{next}</Fold>
      <Fold part="plan" title="Today's meal plan" summary={planSummary} icon={<Salad size={17} />} tone="bg-clay-soft text-clay-ink">{plan}</Fold>
    </section>
  );
}
