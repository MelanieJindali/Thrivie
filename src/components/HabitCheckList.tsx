"use client";

import { useOptimistic, useTransition } from "react";
import Link from "next/link";
import { Check, Flame, Minus, Plus } from "lucide-react";
import type { HabitView } from "@/lib/queries";
import { streakUnitLabel } from "@/lib/habits/schedule";
import { useOfflineAction } from "./OfflineSync";
import { useToast } from "./Toast";
import { Empty } from "./ui";

const MILESTONES = [7, 14, 30, 50, 100, 365];

/** Applies a new count for today to a habit view (for optimistic updates). */
function withTodayCount(h: HabitView, todayCount: number): HabitView {
  const st = h.status;
  const done = st.window === "day" ? todayCount : st.done - st.todayCount + todayCount;
  const status = { ...st, todayCount, done, complete: done >= st.target };
  const checkedToday = st.window === "day" ? status.complete : todayCount > 0;
  const streakDelta = checkedToday === h.checkedToday ? 0 : checkedToday ? 1 : -1;
  return { ...h, status, checkedToday, streak: Math.max(0, h.streak + (st.window === "day" ? streakDelta : 0)) };
}

function progressText(h: HabitView): string {
  const { window, done, target, usesCounter } = h.status;
  const when = usesCounter ? "today" : window === "week" ? "this week" : "this month";
  if (window !== "day" || usesCounter) return done >= target ? `Target met ${when} (${done} of ${target})` : `${done} of ${target} ${when}`;
  return h.summary;
}

/** One-tap habits (or a tap counter for "N times a day"). Optimistic, works offline, celebrates milestones. */
export function HabitCheckList({ habits, today, showAll = false }: { habits: HabitView[]; today: string; showAll?: boolean }) {
  const [, start] = useTransition();
  const run = useOfflineAction();
  const toast = useToast();
  const [optimistic, apply] = useOptimistic(habits, (state, u: { id: string; count: number }) => state.map((h) => (h.id === u.id ? withTodayCount(h, u.count) : h)));
  const list = showAll ? optimistic : optimistic.filter((h) => h.dueToday);
  if (!habits.length) return <Empty>No habits yet. <Link className="font-bold text-primary underline" href="/habits#new">Add your first one</Link></Empty>;
  if (!list.length) return <p className="text-sm text-muted">Nothing due today. Your weekly and monthly targets are met.</p>;

  function setCount(h: HabitView, count: number) {
    const before = h.checkedToday;
    const next = withTodayCount(h, count);
    start(async () => {
      apply({ id: h.id, count });
      const r = h.status.usesCounter ? await run("setHabitCount", h.id, today, count) : await run("setHabitCheck", h.id, today, count > 0);
      if (!r.ok) toast({ message: r.error, tone: "error" });
      else if (r.queued) toast({ message: "Saved on this device. It will sync when you're back online." });
      else if (!before && next.checkedToday && MILESTONES.includes(h.streak + 1)) toast({ message: `✦ ${h.streak + 1}-${h.streakUnit} streak: ${h.name}!` });
    });
  }

  return (
    <ul className="space-y-2.5">
      {list.map((h) => {
        const { usesCounter, todayCount, target } = h.status;
        const done = h.checkedToday;
        const label = (
          <span className="min-w-[min(9rem,100%)] flex-1">
            <span className={`block truncate text-sm font-bold ${done ? "text-sage-ink" : ""}`}>{h.name}</span>
            <span className="block text-xs text-muted">
              {progressText(h)}
              {h.atRisk && !done && <span className="ml-1 font-semibold text-terracotta-ink">· keep your streak going</span>}
            </span>
          </span>
        );
        const streak = h.streak > 0 && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-gold-soft px-2.5 py-1 text-xs font-bold text-gold-ink" aria-label={`${h.streak} ${streakUnitLabel(h.streakUnit, h.streak)} streak`}>
            <Flame size={13} aria-hidden /> {h.streak}{h.streakUnit === "day" ? "" : h.streakUnit[0]}
          </span>
        );
        const emoji = h.emoji && <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-2/70 text-lg" aria-hidden>{h.emoji}</span>;
        const shell = `flex min-h-16 w-full flex-wrap items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-left transition duration-200 ${done ? "border-transparent bg-sage-soft" : "border-border bg-surface"}`;

        if (usesCounter) {
          return (
            <li key={h.id} className={shell}>
              {emoji}
              {label}
              {streak}
              <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-1.5" role="group" aria-label={`${h.name} count`}>
                <button type="button" className="grid h-11 w-11 place-items-center rounded-full border border-line bg-surface disabled:opacity-40" aria-label={`Remove one: ${h.name}`} disabled={todayCount <= 0} onClick={() => setCount(h, Math.max(0, todayCount - 1))}>
                  <Minus size={18} aria-hidden />
                </button>
                <output className="min-w-10 text-center text-sm font-bold tabular-nums" aria-live="polite">{todayCount}/{target}</output>
                <button type="button" className={`grid h-11 w-11 place-items-center rounded-full ${done ? "bg-sage-ink text-surface" : "bg-primary text-primary-text"} disabled:opacity-40`} aria-label={`Add one: ${h.name}`} disabled={todayCount >= 100} onClick={() => setCount(h, todayCount + 1)}>
                  <Plus size={18} aria-hidden />
                </button>
              </div>
            </li>
          );
        }
        return (
          <li key={h.id}>
            <button type="button" onClick={() => setCount(h, todayCount > 0 ? 0 : 1)} aria-pressed={todayCount > 0} className={`group ${shell} active:scale-[0.98] ${done ? "" : "hover:-translate-y-0.5 hover:border-sage hover:shadow-soft"}`}>
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition duration-300 ${todayCount > 0 ? "pop t-check bg-sage-ink text-surface" : "border-2 border-line text-transparent"}`} aria-hidden>
                <Check size={18} strokeWidth={3} />
              </span>
              {emoji}
              {label}
              {streak}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
