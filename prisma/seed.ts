/* Seeds ~30 days of realistic sample data so the dashboard looks populated.
 * Run with: npm run db:seed   (wipes existing data first)
 */
import { PrismaClient } from "@prisma/client";
import { addDays, todayInTz, weekdayOf } from "../src/lib/dates";

const prisma = new PrismaClient();

// Deterministic PRNG so the seed looks the same every time.
let s = 42;
const rand = () => {
  s = (s * 1664525 + 1013904223) % 4294967296;
  return s / 4294967296;
};
const between = (a: number, b: number) => a + rand() * (b - a);
const chance = (p: number) => rand() < p;
const r1 = (n: number) => Math.round(n * 10) / 10;

async function main() {
  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
  // Servers/containers often run in UTC; default to a U.S. zone in that case (change it in Settings).
  const timezone = process.env.SEED_TZ || (detected && detected !== "UTC" ? detected : "America/New_York");
  const today = todayInTz(timezone);
  const DAYS = 30;
  const start = addDays(today, -(DAYS - 1));

  await prisma.$transaction([
    prisma.dailyBrief.deleteMany(),
    prisma.goalProgress.deleteMany(),
    prisma.goal.deleteMany(),
    prisma.habitCheckin.deleteMany(),
    prisma.habit.deleteMany(),
    prisma.exercise.deleteMany(),
    prisma.workout.deleteMany(),
    prisma.healthLog.deleteMany(),
    prisma.journalEntry.deleteMany(),
    prisma.settings.deleteMany(),
  ]);

  await prisma.settings.create({
    data: { id: 1, name: "Alex", units: "imperial", timezone },
  });

  // --- Habits -------------------------------------------------------------
  const habits = await Promise.all(
    [
      { name: "Meditate", emoji: "🧘", frequency: "daily", timesPerWeek: 7, order: 0 },
      { name: "No sugar", emoji: "🍎", frequency: "daily", timesPerWeek: 7, order: 1 },
      { name: "Read 20 min", emoji: "📚", frequency: "weekly", timesPerWeek: 5, order: 2 },
      { name: "Stretch", emoji: "🤸", frequency: "weekly", timesPerWeek: 3, order: 3 },
    ].map((h) => prisma.habit.create({ data: { ...h, createdAt: new Date(Date.now() - 40 * 86400000) } })),
  );
  const [meditate, noSugar, read, stretch] = habits;

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
          await prisma.workout.create({
            data: {
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
          await prisma.workout.create({
            data: {
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
        await prisma.workout.create({
          data: { date, type: "mobility", title: "Yoga flow", durationMin: 30, intensity: 2 },
        });
      } else if (wd === 3 && chance(0.3)) {
        workedOut = true;
        await prisma.workout.create({
          data: { date, type: "sport", title: "Tennis", durationMin: 60, intensity: 4 },
        });
      }
    }
    if (workedOut) workoutDays.add(date);

    // --- Health (skip a few days; today partially logged) ----------------
    weight += between(-0.15, 0.08);
    if (!chance(0.1) || isToday) {
      const sleep = r1(between(6.0, 7.4) + (workoutDays.has(addDays(date, 0)) ? 0.8 : 0));
      await prisma.healthLog.create({
        data: isToday
          ? { date, sleepHours: 7.5, sleepQuality: 4, mood: 4 }
          : {
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
      if (daysAgo <= 12 || chance(0.6)) await prisma.habitCheckin.create({ data: { habitId: meditate.id, date } });
      if (chance(0.75)) await prisma.habitCheckin.create({ data: { habitId: noSugar.id, date } });
      if (chance(0.7)) await prisma.habitCheckin.create({ data: { habitId: read.id, date } });
      if (wd === 0 || wd === 3 || (chance(0.2) && wd !== 1))
        await prisma.habitCheckin.create({ data: { habitId: stretch.id, date } });
    } else {
      await prisma.habitCheckin.create({ data: { habitId: meditate.id, date } });
    }
  }

  // --- Goals --------------------------------------------------------------
  const yearEnd = `${today.slice(0, 4)}-12-31`;
  await prisma.goal.create({
    data: {
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
  await prisma.goal.create({
    data: {
      title: "Meditate 60 times",
      target: 60,
      unit: "sessions",
      startDate: start,
      deadline: addDays(start, 75),
      linkType: "habit",
      linkHabitId: meditate.id,
    },
  });
  await prisma.goal.create({
    data: {
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
  await prisma.goal.create({
    data: {
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
    await prisma.journalEntry.create({ data: { date: addDays(today, -ago), content, mood, prompt } });
  }

  console.log(`Seeded ${DAYS} days of data ending ${today} (${timezone}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
