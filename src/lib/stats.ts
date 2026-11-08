// Pure stat helpers (no DB access) so they are easy to test and reuse.
import { addDays, diffDays, startOfWeek, type DateStr } from "./dates";

export type HabitLike = { frequency: string; timesPerWeek: number };

/** Current streak. Daily habits count days; weekly habits count weeks that hit the target. */
export function currentStreak(habit: HabitLike, dates: Set<string>, today: DateStr): number {
  if (habit.frequency !== "weekly") {
    // Today not checked yet doesn't break the streak.
    let d = dates.has(today) ? today : addDays(today, -1);
    let n = 0;
    while (dates.has(d)) {
      n++;
      d = addDays(d, -1);
    }
    return n;
  }
  const target = Math.max(1, Math.min(7, habit.timesPerWeek));
  let week = startOfWeek(today);
  let n = 0;
  // Current week counts once it reaches the target; otherwise it's "in progress".
  if (weekCount(dates, week) >= target) n++;
  week = addDays(week, -7);
  while (weekCount(dates, week) >= target) {
    n++;
    week = addDays(week, -7);
  }
  return n;
}

export function longestStreak(habit: HabitLike, dates: Set<string>): number {
  const sorted = [...dates].sort();
  if (!sorted.length) return 0;
  if (habit.frequency !== "weekly") {
    let best = 1;
    let run = 1;
    for (let i = 1; i < sorted.length; i++) {
      run = diffDays(sorted[i - 1], sorted[i]) === 1 ? run + 1 : 1;
      best = Math.max(best, run);
    }
    return best;
  }
  const target = Math.max(1, Math.min(7, habit.timesPerWeek));
  const weeks = new Map<string, number>();
  for (const d of sorted) weeks.set(startOfWeek(d), (weeks.get(startOfWeek(d)) ?? 0) + 1);
  const hit = [...weeks.entries()].filter(([, c]) => c >= target).map(([w]) => w).sort();
  let best = hit.length ? 1 : 0;
  let run = 1;
  for (let i = 1; i < hit.length; i++) {
    run = diffDays(hit[i - 1], hit[i]) === 7 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

export function weekCount(dates: Set<string>, weekStart: DateStr): number {
  let n = 0;
  for (let i = 0; i < 7; i++) if (dates.has(addDays(weekStart, i))) n++;
  return n;
}

/** Is a habit due/relevant today? Weekly habits stay visible until the weekly target is met. */
export function isDueToday(habit: HabitLike, dates: Set<string>, today: DateStr): boolean {
  if (habit.frequency !== "weekly") return true;
  if (dates.has(today)) return true;
  return weekCount(dates, startOfWeek(today)) < habit.timesPerWeek;
}

/**
 * Is a streak at risk? Daily: streak ≥ 2 and today unchecked.
 * Weekly: remaining days this week barely cover what's left to do.
 */
export function streakAtRisk(habit: HabitLike, dates: Set<string>, today: DateStr): boolean {
  if (dates.has(today)) return false;
  if (habit.frequency !== "weekly") return currentStreak(habit, dates, today) >= 2;
  const ws = startOfWeek(today);
  const remainingNeeded = habit.timesPerWeek - weekCount(dates, ws);
  const daysLeft = 7 - diffDays(ws, today); // including today
  return remainingNeeded > 0 && remainingNeeded >= daysLeft;
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

export type GoalStatus = "done" | "on-track" | "behind" | "not-started" | "overdue";

export type GoalComputed = {
  current: number;
  pct: number; // 0-100 toward target
  expectedPct: number; // where you'd be with linear progress
  status: GoalStatus;
  daysLeft: number;
};

/**
 * For accumulate goals (run 100 km) progress = current / target.
 * For "reach a value" goals with a startValue (weight 79 → 76) progress is the
 * fraction of the distance covered, in either direction.
 */
export function computeGoal(
  goal: { target: number; startValue: number | null; startDate: string; deadline: string },
  current: number,
  today: DateStr,
): GoalComputed {
  let pct: number;
  if (goal.startValue != null && goal.startValue !== goal.target) {
    pct = ((current - goal.startValue) / (goal.target - goal.startValue)) * 100;
  } else {
    pct = goal.target > 0 ? (current / goal.target) * 100 : 0;
  }
  pct = Math.max(0, Math.min(100, pct));
  const total = Math.max(1, diffDays(goal.startDate, goal.deadline));
  const elapsed = Math.max(0, Math.min(total, diffDays(goal.startDate, today)));
  const expectedPct = (elapsed / total) * 100;
  const daysLeft = diffDays(today, goal.deadline);

  let status: GoalStatus;
  if (pct >= 100) status = "done";
  else if (daysLeft < 0) status = "overdue";
  else if (elapsed === 0 && pct === 0) status = "not-started";
  // Allow a little slack so a goal isn't "behind" after one slow day.
  else if (pct + 5 >= expectedPct) status = "on-track";
  else status = "behind";

  return { current, pct, expectedPct, status, daysLeft };
}

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

export function mean(xs: number[]): number | null {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function round(n: number, dp = 1) {
  return Math.round(n * 10 ** dp) / 10 ** dp;
}
