// Example phrasings for Smart Import, built from the user's own habits and goals
// so the hints look like their notes. Pure; runs on the device.
import type { Units } from "../units";

/** A short example note using the user's own habit and goal names. */
export function personalExample(habits: string[], goals: { name: string; unit: string }[], units: Units): string {
  const w = units === "imperial" ? "weight 172" : "weight 78 kg";
  const h = habits.slice(0, 2).map((n) => `${n.toLowerCase()} ✅`).join(" ");
  const g = goals[0] ? `\n${goals[0].name.toLowerCase()} +1` : "";
  return `Mon - slept 7h, ran 3 ${units === "imperial" ? "miles" : "km"} in 30 min. ${h || "meditated ✅"}. ${w}.
lunch: chicken salad 520 cal, 40g protein${g}
Tues: rest day, 8h sleep, journaled about work`;
}

const HINTS: [RegExp, (u: Units) => string][] = [
  [/sle?e?p|nap|bed|woke/i, () => "slept 7.5h"],
  [/water|drank|hydrat|glass|bottle/i, (u) => (u === "imperial" ? "water 64 oz" : "water 2 L")],
  [/weigh|scale|\blbs?\b|\bkg\b/i, (u) => (u === "imperial" ? "weight 172" : "weight 78 kg")],
  [/run|ran|jog|walk|bike|cycl|swim|hike|row/i, (u) => (u === "imperial" ? "ran 3 miles in 30 min" : "ran 5 km in 30 min")],
  [/gym|lift|press|squat|curl|deadlift|push|pull|plank|yoga|stretch|workout/i, () => "squats 3x10 at 135"],
  [/ate|eat|breakfast|lunch|dinner|snack|meal|cal|protein/i, () => "lunch: chicken salad 520 cal"],
  [/step/i, () => "8,500 steps"],
  [/mood|felt|feel|happy|sad|tired|stress|anxious|energy/i, () => "mood 4/5, energy 3/5"],
];

/** One example phrasing for a line Thrivie couldn't read, matched to what it seems to be about. */
export function hintFor(text: string, units: Units): string | null {
  for (const [re, f] of HINTS) if (re.test(text)) return f(units);
  return null; // not about anything Thrivie tracks, so no hint
}
