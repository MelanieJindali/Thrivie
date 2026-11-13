// Template-based daily brief (pure, testable). 3–5 sentences:
// yesterday's recap, streaks at risk, goal status, one gentle suggestion.
// Tone rules: warm, never judgmental, no weight talk, no medical advice.

export type BriefFacts = {
  seed: string; // stable per user per day, so the brief doesn't change on refresh
  weekday: string;
  name: string;
  yesterday: { sleepHours: number | null; workouts: { type: string; minutes: number }[]; habitsDone: number; logged: boolean };
  atRisk: { name: string; streak: number; unit: "day" | "week" | "month" }[];
  openToday: number;
  goals: { total: number; onTrack: number; behind: string[] };
  week: { sleep: number | null; workouts: number; steps: number | null };
};

/** Small deterministic PRNG from a string seed. */
function picker(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return <T,>(xs: T[]): T => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    return xs[h % xs.length];
  };
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const WORKOUT_WORD: Record<string, string> = { strength: "strength session", cardio: "cardio session", mobility: "mobility session", sport: "game", other: "workout" };

export function composeBrief(f: BriefFacts): string {
  const pick = picker(f.seed);
  const out: string[] = [];

  // 1. Yesterday
  const bits: string[] = [];
  if (f.yesterday.sleepHours != null) bits.push(pick([`slept ${f.yesterday.sleepHours} hours`, `got ${f.yesterday.sleepHours} hours of sleep`]));
  const w = f.yesterday.workouts;
  if (w.length === 1) bits.push(pick([`fit in a ${w[0].minutes}-minute ${WORKOUT_WORD[w[0].type] ?? "workout"}`, `moved for ${w[0].minutes} minutes`]));
  else if (w.length > 1) bits.push(`did ${plural(w.length, "workout")} (${w.reduce((a, x) => a + x.minutes, 0)} minutes)`);
  if (f.yesterday.habitsDone) bits.push(`checked off ${plural(f.yesterday.habitsDone, "habit")}`);
  if (bits.length) {
    const list = bits.length > 1 ? `${bits.slice(0, -1).join(", ")} and ${bits.at(-1)}` : bits[0];
    out.push(pick([`Yesterday you ${list}.`, `Quick look back: yesterday you ${list}.`, `You ${list} yesterday. Nice.`]));
  } else {
    out.push(pick(["Yesterday was quiet in your log, and that's completely fine.", "No entries yesterday. Rest days are part of the rhythm.", "A fresh start today; yesterday stayed off the log."]));
  }

  // 2. Streaks at risk
  if (f.atRisk.length) {
    const s = f.atRisk[0];
    const unit = s.unit;
    out.push(pick([
      `Your ${s.name.toLowerCase()} streak (${plural(s.streak, unit)}) is waiting for today's check-in.`,
      `${s.name} is on a ${s.streak}-${unit} run. One tap keeps it going.`,
    ]));
  } else if (f.openToday > 0) {
    out.push(pick([`${plural(f.openToday, "habit")} still open today.`, `You have ${plural(f.openToday, "habit")} left for today.`]));
  }

  // 3. Goals
  if (f.goals.total) {
    if (f.goals.onTrack === f.goals.total) out.push(pick([`All ${plural(f.goals.total, "goal")} are on track.`, `Every goal is on pace. Steady wins.`]));
    else if (f.goals.behind.length) out.push(`${f.goals.onTrack} of ${f.goals.total} goals are on track; “${f.goals.behind[0]}” could use a little attention.`);
    else out.push(`${f.goals.onTrack} of ${f.goals.total} goals are on track.`);
  }

  // 4. One gentle suggestion
  if (f.week.sleep != null && f.week.sleep < 7) out.push(pick(["If it suits you, an earlier wind-down tonight could help.", "You could try putting the phone away 20 minutes earlier tonight."]));
  else if (f.week.workouts === 0) out.push(pick(["A short walk today could be an easy win.", "Even ten minutes of movement counts today."]));
  else if (f.week.steps != null && f.week.steps < 6000) out.push("A walk after a meal is a gentle way to add steps.");
  else out.push(pick([`Enjoy your ${f.weekday}. Keep doing what feels good.`, "Small steps add up; keep going at your pace.", `Make some room for rest this ${f.weekday} too.`]));

  return out.slice(0, 5).join(" ");
}

/** The same facts as the brief, as plain label and value pairs, for people who'd rather see the numbers. */
export function briefNumbers(f: BriefFacts): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  const y = f.yesterday;
  if (y.sleepHours != null) out.push({ label: "Sleep last night", value: `${y.sleepHours} h` });
  if (y.workouts.length) out.push({ label: "Workouts yesterday", value: `${y.workouts.length} (${y.workouts.reduce((s, w) => s + w.minutes, 0)} min)` });
  if (y.habitsDone) out.push({ label: "Habits yesterday", value: String(y.habitsDone) });
  if (f.openToday) out.push({ label: "Habits open today", value: String(f.openToday) });
  for (const s of f.atRisk.slice(0, 2)) out.push({ label: `${s.name} streak`, value: plural(s.streak, s.unit) });
  if (f.goals.total) out.push({ label: "Goals on track", value: `${f.goals.onTrack} of ${f.goals.total}` });
  if (f.week.sleep != null) out.push({ label: "Average sleep, 7 days", value: `${f.week.sleep} h` });
  if (f.week.workouts) out.push({ label: "Workouts, 7 days", value: String(f.week.workouts) });
  if (f.week.steps != null) out.push({ label: "Average steps, 7 days", value: Math.round(f.week.steps).toLocaleString("en-US") });
  return out;
}
