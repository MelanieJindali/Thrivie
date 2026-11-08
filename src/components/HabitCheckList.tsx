"use client";

import { useOptimistic, useTransition } from "react";
import { Check, Flame } from "lucide-react";
import { toggleHabit } from "@/app/actions";
import type { HabitView } from "@/lib/queries";
import { Empty } from "./ui";
import Link from "next/link";

/** One-tap habit check-off list (optimistic). */
export function HabitCheckList({ habits, showAll = false }: { habits: HabitView[]; showAll?: boolean }) {
  const [, start] = useTransition();
  const [optimistic, flip] = useOptimistic(habits, (state, id: string) =>
    state.map((h) => (h.id === id ? { ...h, checkedToday: !h.checkedToday, thisWeek: h.thisWeek + (h.checkedToday ? -1 : 1) } : h)),
  );
  const list = showAll ? optimistic : optimistic.filter((h) => h.dueToday);
  if (!habits.length)
    return (
      <Empty>
        No habits yet. <Link className="text-primary underline" href="/habits">Add your first habit</Link>
      </Empty>
    );
  if (!list.length) return <p className="text-sm text-muted">All weekly targets met — nice work! 🎉</p>;

  return (
    <ul className="space-y-2.5">
      {list.map((h) => (
        <li key={h.id}>
          <button
            onClick={() => start(async () => { flip(h.id); await toggleHabit(h.id); })}
            className={`group flex w-full items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition duration-200 active:scale-[0.98] ${
              h.checkedToday
                ? "border-transparent bg-linear-to-r from-emerald-soft to-teal-soft"
                : "border-border/70 bg-surface hover:-translate-y-0.5 hover:border-emerald/30 hover:shadow-soft"
            }`}
            aria-pressed={h.checkedToday}
          >
            <span
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition duration-300 ${
                h.checkedToday
                  ? "scale-105 bg-linear-to-br from-emerald to-teal text-white shadow-md shadow-emerald/30"
                  : "border-2 border-border text-transparent group-hover:border-emerald/50 group-hover:text-emerald/40"
              }`}
            >
              <Check size={18} strokeWidth={3} />
            </span>
            {h.emoji && <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-2/70 text-lg" aria-hidden>{h.emoji}</span>}
            <span className="min-w-0 flex-1">
              <span className={`block truncate text-sm font-semibold ${h.checkedToday ? "text-emerald" : ""}`}>{h.name}</span>
              <span className="block text-xs text-muted">
                {h.frequency === "weekly" ? `${h.thisWeek}/${h.timesPerWeek} this week` : "Daily"}
                {h.atRisk && !h.checkedToday && <span className="ml-2 font-medium text-amber">· keep your streak going</span>}
              </span>
            </span>
            {h.streak > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-amber-soft px-2.5 py-1 text-xs font-bold text-amber" title={`${h.streak} ${h.frequency === "weekly" ? "week" : "day"} streak`}>
                <Flame size={14} /> {h.streak}{h.frequency === "weekly" ? "w" : ""}
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
