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

// 25 more held-out notes written on 2026-11-09, before the Smart Import rework.
// Never tune against these: they measure how the parser does on notes it has never seen.
const M = "2026-11-02", T = "2026-11-03", W = "2026-11-04", R = "2026-11-05", Fr = "2026-11-06", S = "2026-11-07", Su = "2026-11-01";
HELDOUT.push(
  { text: "monday\nslept 6 1/2 hrs\nwent on a 45 min walk\nno sugar ✅", facts: [
    { k: "h", date: M, field: "sleepHours", value: 6.5 }, { k: "w", date: M, type: "cardio", minutes: 45 }, { k: "hab", date: M, habit: "No sugar", done: true }] },
  { text: "Tue 11/3 gym 1h15 — squat 3x10, bench press 3x10, pull ups 3x6", facts: [
    { k: "w", date: T, type: "strength", minutes: 75 }, { k: "ex", date: T, name: "Squats", sets: 3, reps: 10 }, { k: "ex", date: T, name: "Bench press", sets: 3, reps: 10 }, { k: "ex", date: T, name: "Pull-ups", sets: 3, reps: 6 }] },
  { text: "W: 172.6lbs this am. 9.5k steps. 2 litres water", facts: [
    { k: "h", date: W, field: "weightLb", value: 172.6 }, { k: "h", date: W, field: "steps", value: 9500 }, { k: "h", date: W, field: "waterOz", value: 67.6 }] },
  { text: "thurs - felt great today!! ran 4 miles in 36 mins 🏃", facts: [
    { k: "h", date: R, field: "mood", value: 5 }, { k: "w", date: R, type: "cardio", minutes: 36, miles: 4 }] },
  { text: "Friday: meditated 10 min ✅, read 20 min ✅, journal ✅", facts: [
    { k: "hab", date: Fr, habit: "Meditate", done: true }, { k: "hab", date: Fr, habit: "Read 20 min", done: true }, { k: "hab", date: Fr, habit: "Journal", done: true }] },
  { text: "yesterday — 5.5 hours sleep, exhausted, energy 1/5", facts: [
    { k: "h", date: Fr, field: "sleepHours", value: 5.5 }, { k: "h", date: Fr, field: "energy", value: 1 }] },
  { text: "today: biked 20km in 50min, weight 171", facts: [
    { k: "w", date: S, type: "cardio", minutes: 50, miles: 12.43 }, { k: "h", date: S, field: "weightLb", value: 171 }] },
  { text: "Sun 11/1 - long walk 90 mins, 15,000 steps, mood 4", facts: [
    { k: "w", date: Su, type: "cardio", minutes: 90 }, { k: "h", date: Su, field: "steps", value: 15000 }, { k: "h", date: Su, field: "mood", value: 4 }] },
  { text: "Mon:\n* yoga 45m\n* 8 glasses of water\n* stretch ✓", facts: [
    { k: "w", date: M, type: "mobility", minutes: 45 }, { k: "h", date: M, field: "waterOz", value: 64 }, { k: "hab", date: M, habit: "Stretch", done: true }] },
  { text: "tues: woke up at 6, slept 7 hours. did 50 push-ups and 3x12 dips", facts: [
    { k: "h", date: T, field: "sleepHours", value: 7 }, { k: "ex", date: T, name: "Dips", sets: 3, reps: 12 }] },
  { text: "WEDNESDAY — RAN 6 MILES 54 MIN. WEIGHT 170.2", facts: [
    { k: "w", date: W, type: "cardio", minutes: 54, miles: 6 }, { k: "h", date: W, field: "weightLb", value: 170.2 }] },
  { text: "Thu: no workout today, rest. 7h45m sleep. mood: 4/5", facts: [
    { k: "h", date: R, field: "sleepHours", value: 7.75 }, { k: "h", date: R, field: "mood", value: 4 }] },
  { text: "fri: 30 min swim, 2000 yards", facts: [{ k: "w", date: Fr, type: "cardio", minutes: 30 }] },
  { text: "today i feel anxious about the doctor appointment. slept 6h", facts: [
    { k: "j", date: S, contains: "doctor" }, { k: "h", date: S, field: "sleepHours", value: 6 }] },
  { text: "Monday: deadlifts 5x3 @ 275, rows 4x10, 1 hr total", facts: [
    { k: "ex", date: M, name: "Deadlift", sets: 5, reps: 3 }, { k: "ex", date: M, name: "Rows", sets: 4, reps: 10 }, { k: "w", date: M, type: "strength", minutes: 60 }] },
  { text: "11/4 — drank 100 oz water, 12k steps!", facts: [
    { k: "h", date: W, field: "waterOz", value: 100 }, { k: "h", date: W, field: "steps", value: 12000 }] },
  { text: "Thurs: played basketball for an hour, energy 4", facts: [
    { k: "w", date: R, type: "sport", minutes: 60 }, { k: "h", date: R, field: "energy", value: 4 }] },
  { text: "fri\n- meditate ✅\n- no sugar ✅\n- read ❌", facts: [
    { k: "hab", date: Fr, habit: "Meditate", done: true }, { k: "hab", date: Fr, habit: "No sugar", done: true }, { k: "hab", date: Fr, habit: "Read 20 min", done: false }] },
  { text: "yesterday: 8h sleep, good sleep, hiked 5 miles in 2 hours", facts: [
    { k: "h", date: Fr, field: "sleepHours", value: 8 }, { k: "w", date: Fr, type: "cardio", minutes: 120, miles: 5 }] },
  { text: "Tues: 3 mile run 27:30, felt good", facts: [
    { k: "w", date: T, type: "cardio", minutes: 27.5, miles: 3 }, { k: "h", date: T, field: "mood", value: 4 }] },
  { text: "today: weight 74.5 kg", facts: [{ k: "h", date: S, field: "weightLb", value: 164.2 }] },
  { text: "Wed: stretched for 15 min, walked 2.5 miles", facts: [
    { k: "hab", date: W, habit: "Stretch", done: true }, { k: "w", date: W, type: "cardio", miles: 2.5 }] },
  { text: "Mon — breakfast: eggs and toast. lunch: salad. dinner: salmon with rice", facts: [
    { k: "meal", date: M, slot: "breakfast", contains: "eggs" }, { k: "meal", date: M, slot: "lunch", contains: "salad" }, { k: "meal", date: M, slot: "dinner", contains: "salmon" }] },
  { text: "Thursday: 7 hrs of sleep, 6,500 steps, journaled about my week", facts: [
    { k: "h", date: R, field: "sleepHours", value: 7 }, { k: "h", date: R, field: "steps", value: 6500 }, { k: "j", date: R, contains: "week" }] },
  { text: "sat: lifted 45 min (bench 4x6, ohp 3x8)", facts: [
    { k: "w", date: S, type: "strength", minutes: 45 }, { k: "ex", date: S, name: "Bench press", sets: 4, reps: 6 }, { k: "ex", date: S, name: "Overhead press", sets: 3, reps: 8 }] },
);
