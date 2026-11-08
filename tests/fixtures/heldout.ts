// Held-out notes written AFTER the parser was tuned on notes.ts. Never tune
// the parser against these; they measure how well it generalizes.
import type { Fact } from "./notes";

export const HELDOUT: { text: string; facts: Fact[] }[] = [
  { text: "Tues — 7 hrs sleep. walked the dog 30 mins. no sugar ✅", facts: [
    { k: "h", date: "2026-11-03", field: "sleepHours", value: 7 },
    { k: "w", date: "2026-11-03", type: "cardio", minutes: 30 },
    { k: "hab", date: "2026-11-03", habit: "No sugar", done: true },
  ] },
  { text: "11/4: 175.2 lb, 6,780 steps, drank 3 bottles of water", facts: [
    { k: "h", date: "2026-11-04", field: "weightLb", value: 175.2 },
    { k: "h", date: "2026-11-04", field: "steps", value: 6780 },
  ] },
  { text: "Friday:\n• squats 5x5\n• bench 4x6\n• felt strong today, proud of the progress", facts: [
    { k: "ex", date: "2026-11-06", name: "Squats", sets: 5, reps: 5 },
    { k: "ex", date: "2026-11-06", name: "Bench press", sets: 4, reps: 6 },
    { k: "j", date: "2026-11-06", contains: "proud" },
  ] },
  { text: "yesterday ran 4 miles in 38 min. slept badly, maybe 5.5h", facts: [
    { k: "w", date: "2026-11-06", type: "cardio", minutes: 38, miles: 4 },
    { k: "h", date: "2026-11-06", field: "sleepHours", value: 5.5 },
  ] },
  { text: "Mon: meditate ✓ stretch ✓ read 20 min ✗", facts: [
    { k: "hab", date: "2026-11-02", habit: "Meditate", done: true },
    { k: "hab", date: "2026-11-02", habit: "Stretch", done: true },
  ] },
  { text: "Thu. mood 3/5, energy 2/5. cycled 15 km 50 minutes", facts: [
    { k: "h", date: "2026-11-05", field: "mood", value: 3 },
    { k: "h", date: "2026-11-05", field: "energy", value: 2 },
    { k: "w", date: "2026-11-05", type: "cardio", minutes: 50 },
  ] },
  { text: "today - 45 min yoga, 2L water, grateful for my friends", facts: [
    { k: "w", date: "2026-11-07", type: "mobility", minutes: 45 },
    { k: "h", date: "2026-11-07", field: "waterOz", value: 67.6 },
    { k: "j", date: "2026-11-07", contains: "grateful" },
  ] },
  { text: "Sunday - golf 18 holes about 4 hours. 14k steps", facts: [
    { k: "w", date: "2026-11-01", type: "sport", minutes: 240 },
    { k: "h", date: "2026-11-01", field: "steps", value: 14000 },
  ] },
  { text: "Wed: deadlifts 3x5 @ 245, rows 3x10. 8.5h sleep, great sleep", facts: [
    { k: "ex", date: "2026-11-04", name: "Deadlift", sets: 3, reps: 5 },
    { k: "ex", date: "2026-11-04", name: "Rows", sets: 3, reps: 10 },
    { k: "h", date: "2026-11-04", field: "sleepHours", value: 8.5 },
    { k: "h", date: "2026-11-04", field: "sleepQuality", value: 5 },
  ] },
  { text: "Tue: finished a book. drink water done. weight 168.4", facts: [
    { k: "g", date: "2026-11-03", goal: "Read 6 books", value: 1 },
    { k: "hab", date: "2026-11-03", habit: "Drink water", done: true },
    { k: "h", date: "2026-11-03", field: "weightLb", value: 168.4 },
  ] },
  { text: "Saturday: hiking 5 mi. Felt really happy and calm afterwards", facts: [
    { k: "w", date: "2026-11-07", type: "cardio", miles: 5 },
    { k: "h", date: "2026-11-07", field: "mood", value: 4 },
  ] },
  { text: "fri — rough day at work, felt overwhelmed. skipped the gym. 6h sleep", facts: [
    { k: "j", date: "2026-11-06", contains: "overwhelmed" },
    { k: "h", date: "2026-11-06", field: "sleepHours", value: 6 },
  ] },
];
