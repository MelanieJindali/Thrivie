"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, Minus, Plus } from "lucide-react";
import type { HabitView } from "@/lib/queries";
import { addDays, formatDate, relativeLabel } from "@/lib/dates";
import { isScheduledOn, usesCounter } from "@/lib/habits/schedule";
import { useOfflineAction } from "./OfflineSync";
import { useToast } from "./Toast";
import { HabitCheckList } from "./HabitCheckList";
import { Empty } from "./ui";

const DAYS_SHOWN = 7;
const EARLIEST_DAYS = 365;

/**
 * Habit logging for any day up to today: a strip of the last seven days plus a date field for
 * earlier ones. Today uses the usual one-tap list; past days use the same check-ins, so
 * streaks and the calendar update from them like any other entry.
 */
export function HabitDayLogger({ habits, today, showAll = false, plain = false }: { habits: HabitView[]; today: string; showAll?: boolean; /** plain: no live page data behind it (the quick-log sheet), so every day uses the simple list */ plain?: boolean }) {
  const [date, setDate] = useState(today);
  const days = useMemo(() => Array.from({ length: DAYS_SHOWN }, (_, i) => addDays(today, -i)), [today]);
  const inStrip = days.includes(date);
  const label = (d: string) => (d === today ? "Today" : d === days[1] ? "Yesterday" : formatDate(d, { weekday: "short", day: "numeric" }));
  if (!habits.length) return <Empty>No habits yet. Add your first one on the Habits page.</Empty>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Day to log">
        {days.map((d) => (
          <button key={d} type="button" role="radio" aria-checked={date === d} onClick={() => setDate(d)}
            className={`min-h-12 rounded-full border px-3.5 text-xs font-bold transition ${date === d ? "border-primary bg-primary text-primary-text" : "border-border bg-surface text-text hover:border-primary"}`}>
            {label(d)}
          </button>
        ))}
        <label className={`relative inline-flex min-h-12 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-xs font-bold ${!inStrip ? "border-primary bg-primary text-primary-text" : "border-border bg-surface text-text"}`}>
          <CalendarDays size={14} aria-hidden />
          {inStrip ? "Earlier" : formatDate(date, { month: "short", day: "numeric" })}
          <span className="sr-only">: pick an earlier day</span>
          <input type="date" className="absolute inset-0 h-full w-full cursor-pointer opacity-0" value={date} max={today} min={addDays(today, -EARLIEST_DAYS)}
            onChange={(e) => { const v = e.target.value; if (v && v <= today && v >= addDays(today, -EARLIEST_DAYS)) setDate(v); }} />
        </label>
      </div>
      {date === today && !plain ? <HabitCheckList habits={habits} today={today} showAll={showAll} /> : <DayList habits={habits} date={date} today={today} />}
    </div>
  );
}

/** Check-ins for one chosen day. */
function DayList({ habits, date, today }: { habits: HabitView[]; date: string; today: string }) {
  const run = useOfflineAction();
  const toast = useToast();
  const fromLogs = () => Object.fromEntries(habits.map((h) => [h.id, h.logs.find((l) => l.date === date)?.count ?? 0]));
  const [counts, setCounts] = useState<Record<string, number>>(fromLogs);
  // Follow the chosen day, and fresh data when the page reloads it after a save.
  useEffect(() => setCounts(fromLogs()), [date, habits]); // eslint-disable-line react-hooks/exhaustive-deps

  async function set(h: HabitView, count: number) {
    const before = counts[h.id] ?? 0;
    setCounts((c) => ({ ...c, [h.id]: count }));
    const r = usesCounter(h.schedule) ? await run("setHabitCount", h.id, date, count) : await run("setHabitCheck", h.id, date, count > 0);
    if (!r.ok) { setCounts((c) => ({ ...c, [h.id]: before })); toast({ message: r.error, tone: "error" }); }
    else if (r.queued) toast({ message: "Saved on this device. It will sync when you're back online." });
  }
  const when = date === today ? "today" : relativeLabel(date, today).toLowerCase();

  return (
    <div className="space-y-2.5">
      {date !== today && <p className="text-xs text-muted">Logging for <b className="text-text">{formatDate(date, { weekday: "long", month: "long", day: "numeric" })}</b>. Streaks and the calendar update to match.</p>}
      <ul className="space-y-2.5">
        {habits.map((h) => {
          const n = counts[h.id] ?? 0;
          const counter = usesCounter(h.schedule);
          const target = h.status.target;
          const done = counter ? n >= target : n > 0;
          const off = !isScheduledOn(h.schedule, date);
          const shell = `flex min-h-16 w-full flex-wrap items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-left transition duration-200 ${done ? "border-transparent bg-sage-soft" : "border-border bg-surface"}`;
          const text = (
            <span className="min-w-[min(9rem,100%)] flex-1">
              <span className={`block truncate text-sm font-bold ${done ? "text-sage-ink" : ""}`}>{h.emoji ? `${h.emoji} ` : ""}{h.name}</span>
              <span className="block text-xs text-muted">{off ? "Not scheduled this day" : h.summary}</span>
            </span>
          );
          if (counter) {
            return (
              <li key={h.id} className={shell}>
                {text}
                <div className="ml-auto flex items-center gap-1.5" role="group" aria-label={`${h.name} count for ${when}`}>
                  <button type="button" className="grid h-12 w-12 place-items-center rounded-full border border-line bg-surface disabled:opacity-40" aria-label={`Remove one: ${h.name}`} disabled={n <= 0} onClick={() => set(h, Math.max(0, n - 1))}><Minus size={18} aria-hidden /></button>
                  <output className="min-w-10 text-center text-sm font-bold tabular-nums" aria-live="polite">{n}/{target}</output>
                  <button type="button" className={`grid h-12 w-12 place-items-center rounded-full ${done ? "bg-sage-ink text-surface" : "bg-primary text-primary-text"} disabled:opacity-40`} aria-label={`Add one: ${h.name}`} disabled={n >= 100} onClick={() => set(h, n + 1)}><Plus size={18} aria-hidden /></button>
                </div>
              </li>
            );
          }
          return (
            <li key={h.id}>
              <button type="button" aria-pressed={n > 0} aria-label={`${h.name}, ${when}`} onClick={() => set(h, n > 0 ? 0 : 1)} className={`${shell} active:scale-[0.98]`}>
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition ${n > 0 ? "pop t-check bg-sage-ink text-surface" : "border-2 border-line text-transparent"}`} aria-hidden><Check size={18} strokeWidth={3} /></span>
                {text}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
