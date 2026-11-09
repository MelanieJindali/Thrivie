// Development set 2: the 26 notes written for the Smart Import audit (2026-11-09).
// Before any changes, Tier 1 found 58.7% of these facts. Allowed for tuning.
import type { Fact } from "./notes";

const M = "2026-11-02", T = "2026-11-03", W = "2026-11-04", R = "2026-11-05", Fr = "2026-11-06", S = "2026-11-07", Su = "2026-11-01";
export const DEV2: { text: string; facts: Fact[]; tags: string[] }[] = [
  { tags: ["bullets", "shorthand", "time"], text: "MON 11/2\n- slp 7h\n- ran 3.1mi in 29:40\n- meditated ✅\n- weight 171.4", facts: [
    { k: "h", date: M, field: "sleepHours", value: 7 }, { k: "w", date: M, type: "cardio", minutes: 30, miles: 3.1 }, { k: "hab", date: M, habit: "Meditate", done: true }, { k: "h", date: M, field: "weightLb", value: 171.4 }] },
  { tags: ["typo", "shorthand"], text: "tuesday excercise: bb 3x8 135, rows 3x10, 45 min. no sugar - done", facts: [
    { k: "ex", date: T, name: "Bench press", sets: 3, reps: 8 }, { k: "ex", date: T, name: "Rows", sets: 3, reps: 10 }, { k: "w", date: T, type: "strength", minutes: 45 }, { k: "hab", date: T, habit: "No sugar", done: true }] },
  { tags: ["words-numbers", "emoji"], text: "Wed: woke up tired, only slept like 5 and a half hours 😩 drank 6 glasses water", facts: [
    { k: "h", date: W, field: "sleepHours", value: 5.5 }, { k: "h", date: W, field: "energy", value: 2 }, { k: "h", date: W, field: "waterOz", value: 48 }] },
  { tags: ["bullets", "unicode-check"], text: "Thurs\n• Yoga 20m\n• Steps 10,450\n• Mood: 3\n• Read 20 min ✔️", facts: [
    { k: "w", date: R, type: "mobility", minutes: 20 }, { k: "h", date: R, field: "steps", value: 10450 }, { k: "h", date: R, field: "mood", value: 3 }, { k: "hab", date: R, habit: "Read 20 min", done: true }] },
  { tags: ["strength"], text: "fri - weighed in at 170.8. great workout: 5x5 squats @ 205, deadlift 3x5 225. 1hr", facts: [
    { k: "h", date: Fr, field: "weightLb", value: 170.8 }, { k: "ex", date: Fr, name: "Squats", sets: 5, reps: 5 }, { k: "ex", date: Fr, name: "Deadlift", sets: 3, reps: 5 }, { k: "w", date: Fr, type: "strength", minutes: 60 }] },
  { tags: ["prose"], text: "Yesterday I felt really anxious about the presentation but I went for a 25 min jog and felt better after.", facts: [
    { k: "j", date: Fr, contains: "presentation" }, { k: "w", date: Fr, type: "cardio", minutes: 25 }] },
  { tags: ["metric-mix"], text: "today: 8 hrs sleep, 2L water, stretched ✅, swam 1000m 35 min", facts: [
    { k: "h", date: S, field: "sleepHours", value: 8 }, { k: "h", date: S, field: "waterOz", value: 67.6 }, { k: "hab", date: S, habit: "Stretch", done: true }, { k: "w", date: S, type: "cardio", minutes: 35 }] },
  { tags: ["caps", "missed"], text: "SAT - SLEPT 6H. MEDITATED ✅ NO SUGAR ❌", facts: [
    { k: "h", date: S, field: "sleepHours", value: 6 }, { k: "hab", date: S, habit: "Meditate", done: true }, { k: "hab", date: S, habit: "No sugar", done: false }] },
  { tags: ["numeric-date"], text: "11/5 walked 4,000 steps only, 7.5 hrs sleep, energy 2/5", facts: [
    { k: "h", date: R, field: "steps", value: 4000 }, { k: "h", date: R, field: "sleepHours", value: 7.5 }, { k: "h", date: R, field: "energy", value: 2 }] },
  { tags: ["strength"], text: "mon — leg day. squats 4x8, lunges 3x12, 50 min", facts: [
    { k: "ex", date: M, name: "Squats", sets: 4, reps: 8 }, { k: "ex", date: M, name: "Lunges", sets: 3, reps: 12 }, { k: "w", date: M, type: "strength", minutes: 50 }] },
  { tags: ["parens"], text: "Tue: cycled 12 miles (52 min). water 80oz", facts: [
    { k: "w", date: T, type: "cardio", minutes: 52, miles: 12 }, { k: "h", date: T, field: "waterOz", value: 80 }] },
  { tags: ["meals", "h-m"], text: "Wednesday\nbreakfast: oatmeal w/ berries\nlunch - turkey sandwich 450 cal\nslept 7h 15m", facts: [
    { k: "meal", date: W, slot: "breakfast", contains: "oatmeal" }, { k: "meal", date: W, slot: "lunch", contains: "turkey" }, { k: "h", date: W, field: "sleepHours", value: 7.25 }] },
  { tags: ["spaced-sets", "habits"], text: "thu: pushups 4 x 20, situps 3x25. meditate ✅ journal ✅", facts: [
    { k: "ex", date: R, name: "Push-ups", sets: 4, reps: 20 }, { k: "ex", date: R, name: "Sit-ups", sets: 3, reps: 25 }, { k: "hab", date: R, habit: "Meditate", done: true }, { k: "hab", date: R, habit: "Journal", done: true }] },
  { tags: ["slashes", "prose"], text: "fri 6.5h sleep // mood 2 // stressed about money, need to budget better", facts: [
    { k: "h", date: Fr, field: "sleepHours", value: 6.5 }, { k: "h", date: Fr, field: "mood", value: 2 }, { k: "j", date: Fr, contains: "budget" }] },
  { tags: ["k-steps", "sport"], text: "yday: tennis 90 min!! 8k steps", facts: [
    { k: "w", date: Fr, type: "sport", minutes: 90 }, { k: "h", date: Fr, field: "steps", value: 8000 }] },
  { tags: ["comma-decimal"], text: "today weight 168,5 lb", facts: [{ k: "h", date: S, field: "weightLb", value: 168.5 }] },
  { tags: ["other-language"], text: "Lunes: corrí 5 km, dormí 7 horas", facts: [
    { k: "w", date: M, type: "cardio", miles: 3.11 }, { k: "h", date: M, field: "sleepHours", value: 7 }] },
  { tags: ["unknown-activity"], text: "11/3 - hiit 20 min, then stretched. drank 10 cups of water. weight: 172 lbs", facts: [
    { k: "w", date: T, type: "cardio", minutes: 20 }, { k: "hab", date: T, habit: "Stretch", done: true }, { k: "h", date: T, field: "waterOz", value: 80 }, { k: "h", date: T, field: "weightLb", value: 172 }] },
  { tags: ["no-marks"], text: "Thursday: 7h sleep. Read 20 min. no sugar", facts: [
    { k: "h", date: R, field: "sleepHours", value: 7 }, { k: "hab", date: R, habit: "Read 20 min", done: true }, { k: "hab", date: R, habit: "No sugar", done: true }] },
  { tags: ["parens", "mood-word"], text: "Mon. Slept badly (4h). Skipped the gym. Feeling meh", facts: [
    { k: "h", date: M, field: "sleepHours", value: 4 }, { k: "h", date: M, field: "mood", value: 3 }] },
  { tags: ["synonym"], text: "Fri: drank 64oz H2O, walked 3mi in 55 minutes, 11,200 steps", facts: [
    { k: "h", date: Fr, field: "waterOz", value: 64 }, { k: "w", date: Fr, type: "cardio", minutes: 55, miles: 3 }, { k: "h", date: Fr, field: "steps", value: 11200 }] },
  { tags: ["habit-phrase"], text: "today: did 30 minutes of pilates and 15 min meditation ✅", facts: [
    { k: "w", date: S, type: "mobility", minutes: 30 }, { k: "hab", date: S, habit: "Meditate", done: true }] },
  { tags: ["quarter-hours"], text: "Wed 11/4: rhr 58, slept 8.25h, mood 5, energy 4", facts: [
    { k: "h", date: W, field: "sleepHours", value: 8.25 }, { k: "h", date: W, field: "mood", value: 5 }, { k: "h", date: W, field: "energy", value: 4 }] },
  { tags: ["no-apostrophe", "meal-phrase"], text: "yesterday was rough. didnt sleep much maybe 5h. ate pizza for dinner", facts: [
    { k: "h", date: Fr, field: "sleepHours", value: 5 }, { k: "meal", date: Fr, slot: "dinner", contains: "pizza" }] },
  { tags: ["no-marks"], text: "Tuesday - meditated, stretched, read 20 min", facts: [
    { k: "hab", date: T, habit: "Meditate", done: true }, { k: "hab", date: T, habit: "Stretch", done: true }, { k: "hab", date: T, habit: "Read 20 min", done: true }] },
  { tags: ["hms", "mood-word"], text: "sun: long run 10 mi 1:32:00, felt amazing", facts: [
    { k: "w", date: Su, type: "cardio", minutes: 92, miles: 10 }, { k: "h", date: Su, field: "mood", value: 5 }] },
];
