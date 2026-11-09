// 26 messy, realistic notes-app snippets with the facts a person would expect
// Smart Import to find. Used to measure parser accuracy (see parser.test.ts).
// "Today" for all of them is Saturday 2026-11-07; units are U.S. (imperial).

export type Fact =
  | { k: "h"; date: string; field: "sleepHours" | "weightLb" | "waterOz" | "steps" | "mood" | "energy" | "sleepQuality"; value: number }
  | { k: "w"; date: string; type: string; minutes?: number; miles?: number }
  | { k: "ex"; date: string; name: string; sets: number; reps: number }
  | { k: "hab"; date: string; habit: string; done: boolean }
  | { k: "newhab"; date: string; name: string }
  | { k: "j"; date: string; contains: string }
  | { k: "g"; date: string; goal: string; value: number }
  | { k: "meal"; date: string; slot: string; contains: string };

export const NOTES: { text: string; facts: Fact[] }[] = [
  {
    text: "Mon - ran 5k 28min, slept 6h felt tired. pushups 3x15. no sugar ✅ meditated ✅. weight 172. Tues: rest day, 8h sleep, journaled about work stress",
    facts: [
      { k: "w", date: "2026-11-02", type: "cardio", minutes: 28, miles: 3.11 },
      { k: "h", date: "2026-11-02", field: "sleepHours", value: 6 },
      { k: "h", date: "2026-11-02", field: "energy", value: 2 },
      { k: "ex", date: "2026-11-02", name: "Push-ups", sets: 3, reps: 15 },
      { k: "hab", date: "2026-11-02", habit: "No sugar", done: true },
      { k: "hab", date: "2026-11-02", habit: "Meditate", done: true },
      { k: "h", date: "2026-11-02", field: "weightLb", value: 172 },
      { k: "h", date: "2026-11-03", field: "sleepHours", value: 8 },
      { k: "j", date: "2026-11-03", contains: "work stress" },
    ],
  },
  { text: "yesterday: walked 2 miles 40 min, 9,200 steps, 64 oz water", facts: [
    { k: "w", date: "2026-11-06", type: "cardio", minutes: 40, miles: 2 },
    { k: "h", date: "2026-11-06", field: "steps", value: 9200 },
    { k: "h", date: "2026-11-06", field: "waterOz", value: 64 },
  ] },
  { text: "today - yoga 30 min, mood 4/5, energy 3. stretch ✅", facts: [
    { k: "w", date: "2026-11-07", type: "mobility", minutes: 30 },
    { k: "h", date: "2026-11-07", field: "mood", value: 4 },
    { k: "h", date: "2026-11-07", field: "energy", value: 3 },
    { k: "hab", date: "2026-11-07", habit: "Stretch", done: true },
  ] },
  { text: "Wed: gym - bench 3x8 @ 135, squats 4x6 185lb, 50 min. slept 7.5 hours, good sleep", facts: [
    { k: "ex", date: "2026-11-04", name: "Bench press", sets: 3, reps: 8 },
    { k: "ex", date: "2026-11-04", name: "Squats", sets: 4, reps: 6 },
    { k: "h", date: "2026-11-04", field: "sleepHours", value: 7.5 },
    { k: "h", date: "2026-11-04", field: "sleepQuality", value: 4 },
  ] },
  { text: "11/5 weighed 170.8 lbs. meditate ❌ (no time). read 20 min ✅", facts: [
    { k: "h", date: "2026-11-05", field: "weightLb", value: 170.8 },
    { k: "hab", date: "2026-11-05", habit: "Read 20 min", done: true },
  ] },
  { text: "Thursday\n- slept 5h, felt awful\n- 3k steps\n- feeling stressed about the deadline, need to slow down", facts: [
    { k: "h", date: "2026-11-05", field: "sleepHours", value: 5 },
    { k: "h", date: "2026-11-05", field: "steps", value: 3000 },
    { k: "j", date: "2026-11-05", contains: "deadline" },
  ] },
  { text: "Fri: tennis 60 min, then 12k steps total. drank 8 glasses of water", facts: [
    { k: "w", date: "2026-11-06", type: "sport", minutes: 60 },
    { k: "h", date: "2026-11-06", field: "steps", value: 12000 },
  ] },
  { text: "Sun. long run 10 miles 1:32:00, legs dead. 8h sleep", facts: [
    { k: "w", date: "2026-11-01", type: "cardio", minutes: 92, miles: 10 },
    { k: "h", date: "2026-11-01", field: "sleepHours", value: 8 },
  ] },
  { text: "Mon: pull ups 4x8, dips 3x10, planks 3x1. no sugar done", facts: [
    { k: "ex", date: "2026-11-02", name: "Pull-ups", sets: 4, reps: 8 },
    { k: "ex", date: "2026-11-02", name: "Dips", sets: 3, reps: 10 },
    { k: "hab", date: "2026-11-02", habit: "No sugar", done: true },
  ] },
  { text: "Grateful for a slow morning with coffee and the ocean. Felt calm all day.", facts: [
    { k: "j", date: "2026-11-07", contains: "Grateful" },
    { k: "h", date: "2026-11-07", field: "mood", value: 4 },
  ] },
  { text: "Tue - biked 12 mi 45 min easy. hrv 62. water 80 oz", facts: [
    { k: "w", date: "2026-11-03", type: "cardio", minutes: 45, miles: 12 },
    { k: "h", date: "2026-11-03", field: "waterOz", value: 80 },
  ] },
  { text: "yday swam 30 minutes. finished a book!", facts: [
    { k: "w", date: "2026-11-06", type: "cardio", minutes: 30 },
    { k: "g", date: "2026-11-06", goal: "Read 6 books", value: 1 },
  ] },
  { text: "Wed:\nmeditated ✅\ncold shower ✅\nno sugar ❌\nslept 7h", facts: [
    { k: "hab", date: "2026-11-04", habit: "Meditate", done: true },
    { k: "newhab", date: "2026-11-04", name: "Cold shower" },
    { k: "h", date: "2026-11-04", field: "sleepHours", value: 7 },
  ] },
  { text: "Nov 3: weight 171, 10k steps, felt great", facts: [
    { k: "h", date: "2026-11-03", field: "weightLb", value: 171 },
    { k: "h", date: "2026-11-03", field: "steps", value: 10000 },
    { k: "h", date: "2026-11-03", field: "mood", value: 5 },
  ] },
  { text: "Saturday - hiked 6 miles with friends, about 3 hours. so happy to be outside", facts: [
    { k: "w", date: "2026-11-07", type: "cardio", minutes: 180, miles: 6 },
    { k: "h", date: "2026-11-07", field: "mood", value: 4 },
  ] },
  { text: "fri: lunges 3x12, deadlift 5x5 @ 225. 45 min leg day", facts: [
    { k: "ex", date: "2026-11-06", name: "Lunges", sets: 3, reps: 12 },
    { k: "ex", date: "2026-11-06", name: "Deadlift", sets: 5, reps: 5 },
  ] },
  { text: "Thurs - pilates 45 min. stretch done. journaled about my sister's visit", facts: [
    { k: "w", date: "2026-11-05", type: "mobility", minutes: 45 },
    { k: "hab", date: "2026-11-05", habit: "Stretch", done: true },
    { k: "j", date: "2026-11-05", contains: "sister" },
  ] },
  { text: "Monday: slept 6.5 hrs, rough night. jogged 3 mi 30 min", facts: [
    { k: "h", date: "2026-11-02", field: "sleepHours", value: 6.5 },
    { k: "h", date: "2026-11-02", field: "sleepQuality", value: 2 },
    { k: "w", date: "2026-11-02", type: "cardio", minutes: 30, miles: 3 },
  ] },
  { text: "read 40 pages tonight. drink water ✅ meditate ✅", facts: [
    { k: "hab", date: "2026-11-07", habit: "Drink water", done: true },
    { k: "hab", date: "2026-11-07", habit: "Meditate", done: true },
  ] },
  { text: "Tue: resting hr 58, 7h sleep, energy 4", facts: [
    { k: "h", date: "2026-11-03", field: "sleepHours", value: 7 },
    { k: "h", date: "2026-11-03", field: "energy", value: 4 },
  ] },
  { text: "11/2 - 8,412 steps\n11/3 - 11,020 steps\n11/4 - 6,300 steps", facts: [
    { k: "h", date: "2026-11-02", field: "steps", value: 8412 },
    { k: "h", date: "2026-11-03", field: "steps", value: 11020 },
    { k: "h", date: "2026-11-04", field: "steps", value: 6300 },
  ] },
  { text: "Wed. Felt anxious this morning but a walk helped. walked 25 min", facts: [
    { k: "w", date: "2026-11-04", type: "cardio", minutes: 25 },
    { k: "j", date: "2026-11-04", contains: "anxious" },
  ] },
  { text: "sun - rowing 20 min hard intervals, 4k steps, weight 169.6", facts: [
    { k: "w", date: "2026-11-01", type: "cardio", minutes: 20 },
    { k: "h", date: "2026-11-01", field: "steps", value: 4000 },
    { k: "h", date: "2026-11-01", field: "weightLb", value: 169.6 },
  ] },
  { text: "today: basketball 1 hr. no sugar ✔ journal ✔", facts: [
    { k: "w", date: "2026-11-07", type: "sport", minutes: 60 },
    { k: "hab", date: "2026-11-07", habit: "No sugar", done: true },
    { k: "hab", date: "2026-11-07", habit: "Journal", done: true },
  ] },
  { text: "Mon: situps 3x20, burpees 3x10. Proud of myself for showing up even though I was exhausted", facts: [
    { k: "ex", date: "2026-11-02", name: "Sit-ups", sets: 3, reps: 20 },
    { k: "ex", date: "2026-11-02", name: "Burpees", sets: 3, reps: 10 },
    { k: "j", date: "2026-11-02", contains: "Proud" },
    { k: "h", date: "2026-11-02", field: "energy", value: 1 },
  ] },
  { text: "Fri - slept 9h!! great sleep. spin class 45 min", facts: [
    { k: "h", date: "2026-11-06", field: "sleepHours", value: 9 },
    { k: "h", date: "2026-11-06", field: "sleepQuality", value: 5 },
    { k: "w", date: "2026-11-06", type: "cardio", minutes: 45 },
  ] },
];
