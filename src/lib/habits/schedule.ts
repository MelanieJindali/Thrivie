// Habit schedules: "every day", specific weekdays, or N times per day/week/month.
// Pure module (no DB, no browser APIs) shared by server and client.
// Weeks start on Monday, matching the rest of the app.
import { addDays, addMonths, isDateStr, startOfMonth, startOfWeek, weekdayOf, type DateStr } from "../dates";

export type Period = "day" | "week" | "month";
/** 0 = Sunday … 6 = Saturday */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type HabitSchedule =
  | { type: "daily" }
  | { type: "specific_days"; days: Weekday[] }
  | { type: "times_per_period"; count: number; period: Period };

/** One row per habit per day; `count` > 1 only for "N times a day" habits. */
export type HabitLog = { date: DateStr; count: number };

export type HabitStatus = {
  /** Show on Today? Day habits when scheduled; week/month habits until the target is met (and on the day they were done). */
  showToday: boolean;
  /** Completions in the current window (today, this week or this month). */
  done: number;
  target: number;
  complete: boolean;
  window: Period;
  /** "N times a day" habits use a tap counter instead of a checkbox. */
  usesCounter: boolean;
  /** Completions logged today. */
  todayCount: number;
};

export type Streak = { current: number; best: number; unit: Period };

export const DEFAULT_SCHEDULE: HabitSchedule = { type: "daily" };
export const MAX_COUNT: Record<Period, number> = { day: 20, week: 21, month: 31 };
export const WEEKDAYS_MON_FIRST: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 0];
export const WEEKDAY_SET: readonly Weekday[] = [1, 2, 3, 4, 5];
export const WEEKEND_SET: readonly Weekday[] = [6, 0];
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

// ------------------------------------------------------------- validation --

export class InvalidScheduleError extends Error {}

/** Validates untrusted input (form data, backups, the database) into a schedule. Mirrors the SQL CHECK constraint. */
export function parseSchedule(input: unknown): HabitSchedule {
  if (typeof input !== "object" || input === null) throw new InvalidScheduleError("Schedule must be an object.");
  const v = input as Record<string, unknown>;
  switch (v.type) {
    case "daily":
      return { type: "daily" };
    case "specific_days": {
      if (!Array.isArray(v.days) || v.days.length === 0) throw new InvalidScheduleError("Pick at least one day.");
      if (!v.days.every((d) => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6)) throw new InvalidScheduleError("Days must be 0 (Sun) to 6 (Sat).");
      const days = [...new Set(v.days as Weekday[])].sort((a, b) => a - b);
      return days.length === 7 ? { type: "daily" } : { type: "specific_days", days };
    }
    case "times_per_period": {
      const { count, period } = v;
      if (period !== "day" && period !== "week" && period !== "month") throw new InvalidScheduleError("Period must be day, week or month.");
      if (!Number.isInteger(count) || (count as number) < 1 || (count as number) > MAX_COUNT[period]) {
        throw new InvalidScheduleError(`Times per ${period} must be a whole number from 1 to ${MAX_COUNT[period]}.`);
      }
      if (period === "day" && count === 1) return { type: "daily" }; // "once a day" is every day
      return { type: "times_per_period", count: count as number, period };
    }
    default:
      throw new InvalidScheduleError("Unknown schedule type.");
  }
}

/** Never throws: anything unreadable behaves like "every day". */
export function readSchedule(input: unknown): HabitSchedule {
  try {
    return parseSchedule(typeof input === "string" ? JSON.parse(input) : input);
  } catch {
    return DEFAULT_SCHEDULE;
  }
}

/** The pre-2026-11 model ("daily" or "weekly" with times per week). Used for old backups; the SQL migration does the same. */
export function scheduleFromLegacy(frequency: string, timesPerWeek: number): HabitSchedule {
  if (frequency !== "weekly") return { type: "daily" };
  const n = Math.min(7, Math.max(1, Math.round(timesPerWeek || 1)));
  return { type: "times_per_period", count: n, period: "week" };
}

// ------------------------------------------------------------ descriptions --

const sameDays = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((d) => b.includes(d));
const times = (n: number) => (n === 1 ? "Once" : n === 2 ? "Twice" : `${n} times`);

/** Plain-language summary, e.g. "Every day", "Weekdays", "Mon, Wed, Fri", "3 times a week". */
export function describeSchedule(s: HabitSchedule): string {
  switch (s.type) {
    case "daily":
      return "Every day";
    case "specific_days":
      if (sameDays(s.days, WEEKDAY_SET)) return "Weekdays";
      if (sameDays(s.days, WEEKEND_SET)) return "Weekends";
      return WEEKDAYS_MON_FIRST.filter((d) => s.days.includes(d)).map((d) => DAY_SHORT[d]).join(", ");
    case "times_per_period":
      return `${times(s.count)} a ${s.period}`;
  }
}

// -------------------------------------------------------------- scheduling --

export const windowOf = (s: HabitSchedule): Period => (s.type === "times_per_period" ? s.period : "day");
export const targetOf = (s: HabitSchedule): number => (s.type === "times_per_period" ? s.count : 1);
export const usesCounter = (s: HabitSchedule): boolean => s.type === "times_per_period" && s.period === "day" && s.count > 1;
export const isScheduledOn = (s: HabitSchedule, date: DateStr): boolean => (s.type === "specific_days" ? s.days.includes(weekdayOf(date) as Weekday) : true);

function windowStart(w: Period, d: DateStr): DateStr {
  return w === "week" ? startOfWeek(d) : w === "month" ? startOfMonth(d) : d;
}
function nextWindow(w: Period, start: DateStr): DateStr {
  return w === "week" ? addDays(start, 7) : w === "month" ? addMonths(start, 1) : addDays(start, 1);
}

/** Sums logs per date (tolerates duplicates) and ignores malformed rows. */
export function indexLogs(logs: readonly HabitLog[]): Map<DateStr, number> {
  const by = new Map<DateStr, number>();
  for (const l of logs) {
    if (!isDateStr(l.date) || !Number.isFinite(l.count) || l.count <= 0) continue;
    by.set(l.date, (by.get(l.date) ?? 0) + l.count);
  }
  return by;
}

function sumRange(by: Map<DateStr, number>, start: DateStr, endExclusive: DateStr): number {
  let total = 0;
  for (let d = start; d < endExclusive; d = addDays(d, 1)) total += by.get(d) ?? 0;
  return total;
}

// ------------------------------------------------------------------- today --

export function getHabitStatus(s: HabitSchedule, logs: readonly HabitLog[], today: DateStr): HabitStatus {
  const by = indexLogs(logs);
  const window = windowOf(s);
  const target = targetOf(s);
  const start = windowStart(window, today);
  const done = sumRange(by, start, nextWindow(window, start));
  const todayCount = by.get(today) ?? 0;
  const complete = done >= target;
  const showToday = window === "day" ? isScheduledOn(s, today) : !complete || todayCount > 0;
  return { showToday, done, target, complete, window, usesCounter: usesCounter(s), todayCount };
}

// ----------------------------------------------------------------- streaks --

/**
 * - Day habits: consecutive *scheduled* days that met the target; unscheduled days never break it.
 * - Week/month habits: consecutive periods that met the target.
 * - The current day/period is in progress: finishing it extends the streak, not finishing it yet never breaks it.
 */
export function computeStreak(s: HabitSchedule, logs: readonly HabitLog[], today: DateStr): Streak {
  const window = windowOf(s);
  const target = targetOf(s);
  const by = indexLogs(logs);
  let first = today;
  for (const d of by.keys()) if (d < first) first = d;
  const currentStart = windowStart(window, today);
  let current = 0;
  let best = 0;
  for (let start = windowStart(window, first); start <= currentStart; start = nextWindow(window, start)) {
    if (window === "day" && !isScheduledOn(s, start)) continue;
    if (sumRange(by, start, nextWindow(window, start)) >= target) {
      current++;
      best = Math.max(best, current);
    } else if (start !== currentStart) {
      current = 0;
    }
  }
  return { current, best, unit: window };
}

/**
 * Is a streak worth a nudge today? Day habits: scheduled today, not done, streak ≥ 2.
 * Week/month habits: what's left needs at least one completion on every remaining day.
 */
export function streakAtRisk(s: HabitSchedule, logs: readonly HabitLog[], today: DateStr): boolean {
  const st = getHabitStatus(s, logs, today);
  if (st.complete) return false;
  if (st.window === "day") return st.showToday && computeStreak(s, logs, today).current >= 2;
  if (st.todayCount > 0) return false;
  const start = windowStart(st.window, today);
  let daysLeft = 0;
  for (let d = today; d < nextWindow(st.window, start); d = addDays(d, 1)) daysLeft++;
  return st.target - st.done >= daysLeft;
}

/** Done vs expected over an inclusive date range (used by the weekly review). */
export function progressInRange(s: HabitSchedule, logs: readonly HabitLog[], start: DateStr, end: DateStr): { done: number; target: number } {
  const by = indexLogs(logs);
  const endEx = addDays(end, 1);
  if (s.type === "times_per_period" && s.period !== "day") {
    // Weekly target over one week; monthly target prorated to the days covered.
    let days = 0;
    for (let d = start; d < endEx; d = addDays(d, 1)) days++;
    const target = s.period === "week" ? Math.ceil((s.count * Math.min(days, 7)) / 7) : Math.ceil((s.count * days) / 30);
    return { done: sumRange(by, start, endEx), target: Math.max(1, target) };
  }
  // Day habits: each scheduled day counts once its daily target is met.
  let done = 0, target = 0;
  for (let d = start; d < endEx; d = addDays(d, 1)) {
    if (!isScheduledOn(s, d)) continue;
    target++;
    if ((by.get(d) ?? 0) >= targetOf(s)) done++;
  }
  return { done, target };
}

export const streakUnitLabel = (unit: Period, n: number) => `${unit}${n === 1 ? "" : "s"}`;
