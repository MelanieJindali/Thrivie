"use client";

import { useOptimistic, useTransition } from "react";
import Link from "next/link";
import { Check, Flame } from "lucide-react";
import type { HabitView } from "@/lib/queries";
import { useOfflineAction } from "./OfflineSync";
import { useToast } from "./Toast";
import { Empty } from "./ui";

const MILESTONES = [7, 14, 30, 50, 100, 365];

/** One-tap habit check-off. Optimistic, works offline, celebrates milestones. */
export function HabitCheckList({ habits, today, showAll = false }: { habits: HabitView[]; today: string; showAll?: boolean }) {
  const [, start] = useTransition();
  const run = useOfflineAction();
  const toast = useToast();
  const [optimistic, flip] = useOptimistic(habits, (state, id: string) =>
    state.map((h) => (h.id === id ? { ...h, checkedToday: !h.checkedToday, thisWeek: h.thisWeek + (h.checkedToday ? -1 : 1), streak: h.streak + (h.checkedToday ? -1 : 1) } : h)),
  );
  const list = showAll ? optimistic : optimistic.filter((h) => h.dueToday);
  if (!habits.length) return <Empty>No habits yet. <Link className="font-bold text-primary underline" href="/habits#new">Add your first one</Link></Empty>;
  if (!list.length) return <p className="text-sm text-muted">All weekly targets met. Nice work.</p>;

  function tap(h: HabitView) {
    const checking = !h.checkedToday;
    start(async () => {
      flip(h.id);
      const r = await run("setHabitCheck", h.id, today, checking);
      if (!r.ok) toast({ message: r.error, tone: "error" });
      else if (r.queued) toast({ message: "Saved on this device. It will sync when you're back online." });
      else if (checking && MILESTONES.includes(h.streak + 1)) toast({ message: `✦ ${h.streak + 1}-${h.frequency === "weekly" ? "week" : "day"} streak: ${h.name}!` });
    });
  }

  return (
    <ul className="space-y-2.5">
      {list.map((h) => (
        <li key={h.id}>
          <button
            type="button"
            onClick={() => tap(h)}
            aria-pressed={h.checkedToday}
            className={`group flex min-h-16 w-full items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-left transition duration-200 active:scale-[0.98] ${
              h.checkedToday ? "border-transparent bg-sage-soft" : "border-border bg-surface hover:-translate-y-0.5 hover:border-sage hover:shadow-soft"
            }`}
          >
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition duration-300 ${h.checkedToday ? "pop bg-sage-ink text-surface" : "border-2 border-line text-transparent"}`} aria-hidden>
              <Check size={18} strokeWidth={3} />
            </span>
            {h.emoji && <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-2/70 text-lg" aria-hidden>{h.emoji}</span>}
            <span className="min-w-0 flex-1">
              <span className={`block truncate text-sm font-bold ${h.checkedToday ? "text-sage-ink" : ""}`}>{h.name}</span>
              <span className="block text-xs text-muted">
                {h.frequency === "weekly" ? `${h.thisWeek} of ${h.timesPerWeek} this week` : "Daily"}
                {h.atRisk && !h.checkedToday && <span className="ml-1 font-semibold text-terracotta-ink">· keep your streak going</span>}
              </span>
            </span>
            {h.streak > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-gold-soft px-2.5 py-1 text-xs font-bold text-gold-ink" aria-label={`${h.streak} ${h.frequency === "weekly" ? "week" : "day"} streak`}>
                <Flame size={13} aria-hidden /> {h.streak}{h.frequency === "weekly" ? "w" : ""}
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
