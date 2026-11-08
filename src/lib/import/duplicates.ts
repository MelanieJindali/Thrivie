// Duplicate detection for Smart Import, run on the device. The server only
// returns the user's own existing entries for the dates involved; the parsed
// candidates are compared here and never sent anywhere before approval.
import { kgToDisplay, mlToDisplay, waterUnit, weightUnit, type Units } from "../units";
import type { ReviewItem } from "./normalize";

export type Decision = "add" | "merge" | "overwrite" | "replace" | "skip";
export type ReviewItemWithDup = ReviewItem & { decision: Decision; dup: { message: string; options: Decision[] } | null };

export type Existing = {
  health: { date: string; weightKg: number | null; sleepHours: number | null; sleepQuality: number | null; waterMl: number | null; mood: number | null; energy: number | null; steps: number | null }[];
  workouts: { date: string; type: string; title: string | null; durationMin: number }[];
  meals: { date: string; slot: string; name: string }[];
  checkins: { habitId: string; date: string }[];
  journal: { date: string; start: string }[];
  progress: { goalId: string; date: string; value: number }[];
  goals: { id: string; title: string; linkType: string }[];
};

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const similar = (a: string, b: string) => {
  const x = norm(a), y = norm(b);
  return x === y || x.includes(y.slice(0, 60)) || y.includes(x.slice(0, 60));
};

export function flagDuplicates(items: ReviewItem[], ex: Existing, units: Units): ReviewItemWithDup[] {
  return items.map((item): ReviewItemWithDup => {
    switch (item.kind) {
      case "health": {
        const e = ex.health.find((h) => h.date === item.date);
        if (!e) return { ...item, decision: "add", dup: null };
        const conflicts: string[] = [];
        const cmp = (label: string, a: number | null, b: number | null, fmt = (v: number) => String(v)) => {
          if (a != null && b != null && fmt(a) !== fmt(b)) conflicts.push(`${label} ${fmt(b)} → ${fmt(a)}`);
        };
        cmp("weight", item.data.weightKg, e.weightKg, (v) => `${kgToDisplay(v, units)} ${weightUnit(units)}`);
        cmp("sleep", item.data.sleepHours, e.sleepHours, (v) => `${v}h`);
        cmp("sleep quality", item.data.sleepQuality, e.sleepQuality);
        cmp("water", item.data.waterMl, e.waterMl, (v) => `${mlToDisplay(v, units)} ${waterUnit(units)}`);
        cmp("mood", item.data.mood, e.mood);
        cmp("energy", item.data.energy, e.energy);
        cmp("steps", item.data.steps, e.steps);
        if (!conflicts.length) return { ...item, decision: "merge", dup: { message: "You already have a check-in for this day. New values will be added to it.", options: ["merge", "skip"] } };
        return { ...item, decision: "merge", dup: { message: `This day already has different values (${conflicts.join(", ")}). Keep yours, or replace them?`, options: ["merge", "overwrite", "skip"] } };
      }
      case "workout": {
        const e = ex.workouts.find((w) => w.date === item.date && w.type === item.data.type);
        if (!e) return { ...item, decision: "add", dup: null };
        return { ...item, decision: "skip", dup: { message: `There's already a ${e.type} workout this day (${e.title ?? e.type}, ${e.durationMin} min). Same one?`, options: ["skip", "add", "replace"] } };
      }
      case "meal": {
        const e = ex.meals.find((m) => m.date === item.date && m.slot === item.data.slot && similar(m.name, item.data.name));
        if (!e) return { ...item, decision: "add", dup: null };
        return { ...item, decision: "skip", dup: { message: `You already logged “${e.name}” for this ${e.slot}. Same one?`, options: ["skip", "add"] } };
      }
      case "habit":
        if (item.data.habitId && ex.checkins.some((c) => c.habitId === item.data.habitId && c.date === item.date)) {
          return { ...item, decision: "skip", dup: { message: "Already checked off for this day.", options: ["skip"] } };
        }
        return { ...item, decision: item.data.habitId ? "add" : "skip", dup: null };
      case "goal_update": {
        const g = ex.goals.find((x) => x.id === item.data.goalId);
        if (g && g.linkType !== "manual") return { ...item, decision: "skip", dup: { message: `“${g.title}” updates itself from your logs, so this isn't needed.`, options: ["skip"] } };
        if (ex.progress.some((p) => p.goalId === item.data.goalId && p.date === item.date && Math.abs(p.value - item.data.value) < 1e-9)) {
          return { ...item, decision: "skip", dup: { message: "The same progress update already exists for this day.", options: ["skip", "add"] } };
        }
        return { ...item, decision: item.data.goalId ? "add" : "skip", dup: null };
      }
      case "journal":
        if (ex.journal.some((j) => j.date === item.date && similar(j.start, item.data.content))) {
          return { ...item, decision: "skip", dup: { message: "A very similar journal entry already exists for this day.", options: ["skip", "add"] } };
        }
        return { ...item, decision: "add", dup: null };
    }
  });
}
