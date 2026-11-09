// Pure stat helpers (no DB access) so they are easy to test and reuse.
import { diffDays, type DateStr } from "./dates";


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
