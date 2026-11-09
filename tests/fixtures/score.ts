// Shared scoring for Smart Import accuracy: per-field results for a set of notes.
import { parseNotes } from "@/lib/import/parser";
import { normalizeEntries, type ReviewItem } from "@/lib/import/normalize";
import type { Fact } from "./notes";

export const TODAY = "2026-11-07";
export const HABITS = ["Meditate", "No sugar", "Read 20 min", "Stretch", "Journal", "Drink water"];
export const habitList = HABITS.map((name, i) => ({ id: `h${i}`, name }));
export const ctx = { today: TODAY, units: "imperial" as const, habits: HABITS, goals: [{ title: "Read 6 books", unit: "books" }] };
const LB = 0.45359237, MI = 1.609344, OZ = 29.5735;
const near = (a: number | null | undefined, b: number, tol = 0.05) => a != null && Math.abs(a - b) <= Math.max(tol, Math.abs(b) * 0.02);

export type Parse = (text: string) => ReviewItem[];
export const tier1: Parse = (text) => normalizeEntries(parseNotes(text, ctx).entries, { today: TODAY, units: "imperial", habits: habitList, goals: [{ id: "g1", name: "Read 6 books" }] });

export function check(items: ReviewItem[], f: Fact, anyDate = false): boolean {
  const on = anyDate ? items : items.filter((i) => i.date === f.date);
  switch (f.k) {
    case "h":
      return on.some((h) => {
        if (h.kind !== "health") return false;
        const d = h.data;
        if (f.field === "weightLb") return near(d.weightKg, f.value * LB, 0.1);
        if (f.field === "waterOz") return near(d.waterMl, f.value * OZ, 30);
        return near(d[f.field] as number | null, f.value);
      });
    case "w":
      return on.some((i) => i.kind === "workout" && i.data.type === f.type && (f.minutes == null || near(i.data.durationMin, f.minutes, 1)) && (f.miles == null || near(i.data.distanceKm, f.miles * MI, 0.1)));
    case "ex":
      return on.some((i) => i.kind === "workout" && i.data.exercises.some((e) => e.name === f.name && e.sets === f.sets && e.reps === f.reps));
    case "hab":
      return on.some((i) => i.kind === "habit" && i.data.habitId === habitList.find((h) => h.name === f.habit)?.id) === f.done;
    case "newhab":
      return on.some((i) => i.kind === "habit" && i.data.habitId === null && i.data.habitName.toLowerCase() === f.name.toLowerCase());
    case "j":
      return on.some((i) => i.kind === "journal" && i.data.content.toLowerCase().includes(f.contains.toLowerCase()));
    case "g":
      return on.some((i) => i.kind === "goal_update" && i.data.goalName === f.goal && i.data.value === f.value);
    case "meal":
      return on.some((i) => i.kind === "meal" && i.data.slot === f.slot && i.data.name.toLowerCase().includes(f.contains));
  }
}

const FIELD: Record<string, string> = { sleepHours: "sleep", sleepQuality: "sleep", weightLb: "weight", waterOz: "water", steps: "steps", mood: "mood/energy", energy: "mood/energy" };
export const fieldOf = (f: Fact) => (f.k === "h" ? FIELD[f.field] : ({ w: "workouts", ex: "sets/reps", hab: "habits", newhab: "habits", j: "journal text", g: "goal progress", meal: "meals" } as const)[f.k]);

export type Score = { hit: number; total: number; pct: number; fields: Record<string, { hit: number; total: number }>; dates: { hit: number; found: number }; misses: { text: string; fact: Fact }[] };

export function score(notes: { text: string; facts: Fact[] }[], parse: Parse = tier1): Score {
  const fields: Score["fields"] = {};
  const misses: Score["misses"] = [];
  let hit = 0, total = 0, dHit = 0, dFound = 0;
  for (const n of notes) {
    const items = parse(n.text);
    for (const f of n.facts) {
      const k = fieldOf(f);
      fields[k] ??= { hit: 0, total: 0 };
      fields[k].total++; total++;
      const ok = check(items, f);
      if (ok) { fields[k].hit++; hit++; } else misses.push({ text: n.text, fact: f });
      // Date accuracy: of the values found on any day, how many were on the right day.
      if ((f.k !== "hab" || f.done) && check(items, f, true)) { dFound++; if (ok) dHit++; }
    }
  }
  return { hit, total, pct: total ? hit / total : 1, fields, dates: { hit: dHit, found: dFound }, misses };
}

export function report(name: string, s: Score): string {
  const lines = [`${name}: ${(s.pct * 100).toFixed(1)}% (${s.hit}/${s.total}) · dates right ${((s.dates.hit / Math.max(1, s.dates.found)) * 100).toFixed(1)}%`];
  for (const [k, v] of Object.entries(s.fields).sort()) lines.push(`  ${k.padEnd(14)} ${((v.hit / v.total) * 100).toFixed(0).padStart(4)}%  (${v.hit}/${v.total})`);
  return lines.join("\n");
}
