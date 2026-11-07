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
    <ul className="space-y-2">
      {list.map((h) => (
        <li key={h.id}>
          <button
            onClick={() => start(async () => { flip(h.id); await toggleHabit(h.id); })}
            className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition active:scale-[0.99] ${
              h.checkedToday ? "border-primary/40 bg-primary-soft" : "border-border bg-surface hover:bg-surface-2"
            }`}
            aria-pressed={h.checkedToday}
          >
            <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 transition ${h.checkedToday ? "border-primary bg-primary text-primary-text" : "border-border"}`}>
              {h.checkedToday && <Check size={16} strokeWidth={3} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className={`block truncate text-sm font-medium ${h.checkedToday ? "text-primary" : ""}`}>
                {h.emoji ? `${h.emoji} ` : ""}{h.name}
              </span>
              <span className="block text-xs text-muted">
                {h.frequency === "weekly" ? `${h.thisWeek}/${h.timesPerWeek} this week` : "Daily"}
                {h.atRisk && !h.checkedToday && <span className="ml-2 text-warn">· keep your streak going</span>}
              </span>
            </span>
            {h.streak > 0 && (
              <span className="flex items-center gap-1 text-xs text-accent" title={`${h.streak} ${h.frequency === "weekly" ? "week" : "day"} streak`}>
                <Flame size={14} /> {h.streak}{h.frequency === "weekly" ? "w" : ""}
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
