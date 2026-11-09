// Realistic sample data (~30 days) loaded into ONE user's account.
// Used by the seed script (demo login) and the "Explore with sample data"
// button on the welcome screen.
import type { ScopedDb } from "./db";
import { addDays, todayInTz, weekdayOf } from "./dates";

export async function loadSampleData(db: ScopedDb, userId: string, timezone: string, days = 30, variant = 0) {
  // Deterministic PRNG so the sample looks the same every time.
  let s = 42 + variant * 7919;
  const rand = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
  const between = (a: number, b: number) => a + rand() * (b - a);
  const chance = (p: number) => rand() < p;
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const DAYS = days;
  const today = todayInTz(timezone);
  const start = addDays(today, -(DAYS - 1));

  // --- Habits -------------------------------------------------------------
  const habits = await Promise.all(
    [
      { name: "Meditate", emoji: "🧘", schedule: { type: "daily" }, order: 0 },
      { name: "No sugar", emoji: "🍎", schedule: { type: "daily" }, order: 1 },
      { name: "Read 20 min", emoji: "📚", schedule: { type: "times_per_period", count: 5, period: "week" }, order: 2 },
      { name: "Stretch", emoji: "🤸", schedule: { type: "specific_days", days: [1, 3, 5] }, order: 3 },
      { name: "Glasses of water", emoji: "💧", schedule: { type: "times_per_period", count: 8, period: "day" }, order: 4 },
    ].map((h) => db.habit.create({ data: { userId, ...h, createdAt: new Date(Date.now() - 40 * 86400000) } })),
  );
  const [meditate, noSugar, read, stretch, water] = habits;

  // --- Workouts -----------------------------------------------------------
  // Mon: strength, Tue: run, Thu: strength, Sat: long run, Sun sometimes yoga.
  const workoutDays = new Set<string>();
  let weight = 79.2;
  for (let i = 0; i < DAYS; i++) {
    const date = addDays(start, i);
    const wd = weekdayOf(date);
    const isToday = date === today;

    let workedOut = false;
    if (!isToday) {
      if (wd === 1 || wd === 4) {
        if (chance(0.9)) {
          workedOut = true;
          const base = 1 + i / 60;
          await db.workout.create({
            data: {
              userId,
              date,
              type: "strength",
              title: wd === 1 ? "Upper body" : "Lower body",
              durationMin: Math.round(between(40, 60)),
              intensity: chance(0.5) ? 4 : 3,
              exercises: {
                create:
                  wd === 1
                    ? [
                        { name: "Bench press", sets: 3, reps: 8, weightKg: r1(60 * base), order: 0 },
                        { name: "Pull-ups", sets: 3, reps: 8, order: 1 },
                        { name: "Overhead press", sets: 3, reps: 10, weightKg: r1(35 * base), order: 2 },
                        { name: "Push-ups", sets: 3, reps: 15, order: 3 },
                      ]
                    : [
                        { name: "Squat", sets: 4, reps: 6, weightKg: r1(80 * base), order: 0 },
                        { name: "Romanian deadlift", sets: 3, reps: 10, weightKg: r1(60 * base), order: 1 },
                        { name: "Lunges", sets: 3, reps: 12, weightKg: 12, order: 2 },
                      ],
              },
            },
          });
        }
      } else if (wd === 2 || wd === 6) {
        if (chance(0.85)) {
          workedOut = true;
          const km = wd === 6 ? r1(between(8, 12)) : r1(between(4.5, 6.5));
          const pace = r1(between(5.3, 6.0));
          await db.workout.create({
            data: {
              userId,
              date,
              type: "cardio",
              title: wd === 6 ? "Long run" : "Easy run",
              durationMin: Math.round(km * pace),
              intensity: wd === 6 ? 4 : 3,
              distanceKm: km,
              paceMinKm: pace,
            },
          });
        }
      } else if (wd === 0 && chance(0.6)) {
        workedOut = true;
        await db.workout.create({
          data: { userId, date, type: "mobility", title: "Yoga flow", durationMin: 30, intensity: 2 },
        });
      } else if (wd === 3 && chance(0.3)) {
        workedOut = true;
        await db.workout.create({
          data: { userId, date, type: "sport", title: "Tennis", durationMin: 60, intensity: 4 },
        });
      }
    }
    if (workedOut) workoutDays.add(date);

    // --- Health (skip a few days; today partially logged) ----------------
    weight += between(-0.15, 0.08);
    if (!chance(0.1) || isToday) {
      const sleep = r1(between(6.0, 7.4) + (workoutDays.has(addDays(date, 0)) ? 0.8 : 0));
      await db.healthLog.create({
        data: isToday
          ? { userId, date, sleepHours: 7.5, sleepQuality: 4, mood: 4 }
          : {
              userId,
              date,
              weightKg: chance(0.8) ? r1(weight) : null,
              sleepHours: sleep,
              sleepQuality: Math.max(1, Math.min(5, Math.round((sleep - 4.5) * 1.2))),
              waterMl: Math.round(between(1400, 2600) / 100) * 100,
              mood: Math.max(1, Math.min(5, Math.round(between(2.6, 4.6) + (workedOut ? 0.3 : 0)))),
              energy: Math.max(1, Math.min(5, Math.round(between(2.4, 4.4) + (sleep > 7 ? 0.4 : 0)))),
              steps: Math.round(between(5500, 11500) + (workedOut && (wd === 2 || wd === 6) ? 6000 : 0)),
              custom: chance(0.5) ? JSON.stringify({ "Resting HR": Math.round(between(55, 62)) }) : null,
            },
      });
    }

    // --- Habit check-ins ------------------------------------------------
    if (!isToday) {
      // Meditation: steady streak for the last 12 days, patchy before that
      const daysAgo = DAYS - 1 - i;
      if (daysAgo <= 12 || chance(0.6)) await db.habitCheckin.create({ data: { habitId: meditate.id, date } });
      if (chance(0.75)) await db.habitCheckin.create({ data: { habitId: noSugar.id, date } });
      if (chance(0.7)) await db.habitCheckin.create({ data: { habitId: read.id, date } });
      if ((wd === 1 || wd === 3 || wd === 5) && chance(0.85)) await db.habitCheckin.create({ data: { habitId: stretch.id, date } });
      await db.habitCheckin.create({ data: { habitId: water.id, date, count: 5 + Math.floor(rand() * 4) } });
    } else {
      await db.habitCheckin.create({ data: { habitId: meditate.id, date } });
      await db.habitCheckin.create({ data: { habitId: water.id, date, count: 3 } });
    }
  }

  // --- Goals --------------------------------------------------------------
  const yearEnd = `${today.slice(0, 4)}-12-31`;
  await db.goal.create({
    data: {
      userId,
      title: "Run 60 miles",
      target: 60 * 1.609344, // stored in km
      unit: "mi",
      startDate: start,
      deadline: yearEnd,
      linkType: "workout",
      linkWorkoutType: "cardio",
      linkMeasure: "distance",
    },
  });
  await db.goal.create({
    data: {
      userId,
      title: "Meditate 60 times",
      target: 60,
      unit: "sessions",
      startDate: start,
      deadline: addDays(start, 75),
      linkType: "habit",
      linkHabitId: meditate.id,
    },
  });
  await db.goal.create({
    data: {
      userId,
      title: "Reach 168 lb",
      target: 168 * 0.45359237, // stored in kg
      unit: "lb",
      startValue: 79.2,
      startDate: start,
      deadline: addDays(today, 60),
      linkType: "metric",
      linkMetric: "weight",
    },
  });
  await db.goal.create({
    data: {
      userId,
      title: "Read 6 books",
      target: 6,
      unit: "books",
      startDate: start,
      deadline: addDays(today, 50),
      linkType: "manual",
      progress: {
        create: [
          { date: addDays(start, 8), value: 1, note: "Finished 'Atomic Habits'" },
          { date: addDays(start, 21), value: 1, note: "Finished a novel" },
        ],
      },
    },
  });

  // --- Journal ------------------------------------------------------------
  const entries: [number, string, number | null, string | null][] = [
    [27, "First week back at a routine. Legs are sore from squats but I feel more awake in the mornings.", 4, "How do you feel today?"],
    [24, "Work was a lot today. Took a 10 minute walk at lunch which helped more than I expected.", 3, null],
    [21, "Long run felt easy for once! Kept a steady pace and finished with energy to spare.", 5, "What went well today?"],
    [18, "Slept badly, skipped the gym. That's okay — rested and read instead.", 2, null],
    [15, "Grateful for a slow Sunday morning, coffee, and yoga on the balcony.", 4, "What are you grateful for?"],
    [12, "Started meditating every morning before checking my phone. Noticing I'm calmer in meetings.", 4, null],
    [9, "Tough conversation with a friend, but I'm glad we talked it through.", 3, "What's on your mind?"],
    [6, "New personal best on bench press. Small wins add up.", 5, "What went well today?"],
    [3, "Feeling a bit stressed about the project deadline. Planning to keep workouts short this week.", 3, null],
    [1, "Good day overall. Hit my step goal and went to bed early.", 4, "What went well today?"],
  ];
  for (const [ago, content, mood, prompt] of entries) {
    await db.journalEntry.create({ data: { userId, date: addDays(today, -ago), content, mood, prompt } });
  }

  // --- Meals (last 10 days, a few with macros) -------------------------------
  const MENU: [string, string, number, number, number, number][] = [
    ["breakfast", "Greek yogurt with berries and granola", 380, 24, 48, 10],
    ["breakfast", "Oatmeal with banana and peanut butter", 450, 14, 66, 15],
    ["lunch", "Chicken salad with avocado", 520, 40, 18, 32],
    ["lunch", "Turkey and hummus wrap", 480, 32, 46, 18],
    ["dinner", "Salmon, rice and broccoli", 640, 42, 60, 22],
    ["dinner", "Veggie stir-fry with tofu", 560, 28, 64, 20],
    ["snack", "Apple and almonds", 210, 6, 22, 12],
  ];
  const mealRows = [];
  for (let ago = 9; ago >= 0; ago--) {
    const date = addDays(today, -ago);
    for (const slot of ago === 0 ? ["breakfast", "lunch"] : ["breakfast", "lunch", "dinner", "snack"]) {
      if (slot === "snack" && !chance(0.6)) continue;
      const options = MENU.filter((m) => m[0] === slot);
      const [, name, calories, proteinG, carbsG, fatG] = options[Math.floor(rand() * options.length)];
      mealRows.push({ userId, date, slot, name, calories, proteinG, carbsG, fatG });
    }
  }
  for (const data of mealRows) await db.meal.create({ data });

  // --- Body & Goals (so the sample shows a meal plan) ------------------------
  await db.bodyProfile.create({ data: { userId, data: JSON.stringify({ heightCm: 172, weightKg: 78, age: 35, sex: "unspecified", pregnantOrBreastfeeding: false, activity: "light", goal: "maintain", diet: "none", allergies: [] }) } });

}
