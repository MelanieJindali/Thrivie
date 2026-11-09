import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import { Client } from "pg";
import { addDays } from "@/lib/dates";
import {
  computeStreak,
  describeSchedule,
  getHabitStatus,
  InvalidScheduleError,
  parseSchedule,
  progressInRange,
  scheduleFromLegacy,
  streakAtRisk,
  type HabitLog,
  type HabitSchedule,
} from "@/lib/habits/schedule";

// 2026-11-02 is a Monday (weeks start on Monday).
const logs = (...dates: string[]): HabitLog[] => dates.map((date) => ({ date, count: 1 }));
const daily: HabitSchedule = { type: "daily" };
const mwf: HabitSchedule = { type: "specific_days", days: [1, 3, 5] };
const gym3: HabitSchedule = { type: "times_per_period", count: 3, period: "week" };
const water8: HabitSchedule = { type: "times_per_period", count: 8, period: "day" };

describe("parseSchedule", () => {
  it("accepts valid schedules and normalizes equivalents", () => {
    expect(parseSchedule({ type: "specific_days", days: [5, 1, 3, 1] })).toEqual(mwf);
    expect(parseSchedule({ type: "specific_days", days: [0, 1, 2, 3, 4, 5, 6] })).toEqual(daily);
    expect(parseSchedule({ type: "times_per_period", count: 1, period: "day" })).toEqual(daily);
  });
  it("rejects invalid input", () => {
    for (const bad of [null, "daily", { type: "specific_days", days: [] }, { type: "specific_days", days: [7] }, { type: "times_per_period", count: 0, period: "week" },
      { type: "times_per_period", count: 2.5, period: "week" }, { type: "times_per_period", count: 22, period: "week" }, { type: "times_per_period", count: 3, period: "year" }]) {
      expect(() => parseSchedule(bad), JSON.stringify(bad)).toThrow(InvalidScheduleError);
    }
  });
});

describe("describeSchedule", () => {
  it("writes plain-language summaries", () => {
    expect(describeSchedule(daily)).toBe("Every day");
    expect(describeSchedule({ type: "specific_days", days: [1, 2, 3, 4, 5] })).toBe("Weekdays");
    expect(describeSchedule({ type: "specific_days", days: [0, 6] })).toBe("Weekends");
    expect(describeSchedule({ type: "specific_days", days: [0, 1, 3] })).toBe("Mon, Wed, Sun");
    expect(describeSchedule(gym3)).toBe("3 times a week");
    expect(describeSchedule({ type: "times_per_period", count: 2, period: "month" })).toBe("Twice a month");
    expect(describeSchedule(water8)).toBe("8 times a day");
  });
});

describe("Today status", () => {
  it("shows specific-day habits only on their days", () => {
    expect(getHabitStatus(mwf, [], "2026-11-02").showToday).toBe(true); // Mon
    expect(getHabitStatus(mwf, [], "2026-11-03").showToday).toBe(false); // Tue
  });
  it("counts taps for times-per-day habits", () => {
    expect(getHabitStatus(water8, [{ date: "2026-11-02", count: 5 }], "2026-11-02")).toMatchObject({ done: 5, target: 8, complete: false, usesCounter: true, todayCount: 5 });
  });
  it("keeps weekly habits visible until the target is met (and on the day it was met)", () => {
    expect(getHabitStatus(gym3, logs("2026-11-02", "2026-11-04"), "2026-11-05")).toMatchObject({ done: 2, target: 3, showToday: true, window: "week" });
    const met = logs("2026-11-02", "2026-11-03", "2026-11-04");
    expect(getHabitStatus(gym3, met, "2026-11-04").showToday).toBe(true);
    expect(getHabitStatus(gym3, met, "2026-11-06").showToday).toBe(false);
  });
  it("ignores other weeks and malformed rows", () => {
    expect(getHabitStatus(gym3, [...logs("2026-11-01"), { date: "bad", count: 1 }, { date: "2026-11-03", count: -2 }], "2026-11-03").done).toBe(0);
  });
});

describe("streaks", () => {
  it("counts consecutive days; an unchecked today doesn't break it", () => {
    expect(computeStreak(daily, logs("2026-11-02", "2026-11-03", "2026-11-04"), "2026-11-05")).toEqual({ current: 3, best: 3, unit: "day" });
    expect(computeStreak(daily, logs("2026-11-01", "2026-11-02", "2026-11-03", "2026-11-05"), "2026-11-05")).toEqual({ current: 1, best: 3, unit: "day" });
  });
  it("only counts scheduled days for specific-day habits", () => {
    expect(computeStreak(mwf, logs("2026-11-02", "2026-11-04", "2026-11-06"), "2026-11-08").current).toBe(3);
    expect(computeStreak(mwf, logs("2026-11-02", "2026-11-06"), "2026-11-08").current).toBe(1); // missed Wed
  });
  it("needs the daily target for counter habits", () => {
    const l = [{ date: "2026-11-02", count: 8 }, { date: "2026-11-03", count: 9 }, { date: "2026-11-04", count: 3 }];
    expect(computeStreak(water8, l, "2026-11-04")).toEqual({ current: 2, best: 2, unit: "day" }); // today in progress
  });
  it("counts weekly periods across a month boundary", () => {
    const h = logs("2026-10-19", "2026-10-21", "2026-10-27", "2026-11-01", "2026-11-02");
    // Week of Oct 26 spans into November (Oct 27 + Nov 1) and counts as one week.
    expect(computeStreak({ type: "times_per_period", count: 2, period: "week" }, h, "2026-11-03")).toEqual({ current: 2, best: 2, unit: "week" });
  });
  it("breaks a weekly streak after a missed week", () => {
    const h = logs("2026-10-12", "2026-10-13", "2026-10-27", "2026-10-28");
    expect(computeStreak({ type: "times_per_period", count: 2, period: "week" }, h, "2026-11-03")).toEqual({ current: 1, best: 1, unit: "week" });
  });
  it("counts months, including across a year boundary", () => {
    const monthly: HabitSchedule = { type: "times_per_period", count: 2, period: "month" };
    expect(computeStreak(monthly, logs("2026-11-03", "2026-11-20", "2026-12-01", "2026-12-31", "2027-01-05"), "2027-01-06")).toEqual({ current: 2, best: 2, unit: "month" });
    expect(computeStreak(monthly, logs("2026-11-03", "2026-11-20", "2027-01-01", "2027-01-02"), "2027-01-06").current).toBe(1); // December missed
  });
});

// Behaviour of the old model, checked against migrated schedules: nothing changes for existing habits.
describe("existing habits after migration", () => {
  const TODAY = "2026-11-07"; // Saturday
  const ago = (...n: number[]) => logs(...n.map((x) => addDays(TODAY, -x)));
  const oldDaily = scheduleFromLegacy("daily", 7);
  const oldWeekly3 = scheduleFromLegacy("weekly", 3);

  it("maps daily and N-per-week habits", () => {
    expect(oldDaily).toEqual(daily);
    expect(oldWeekly3).toEqual(gym3);
    expect(scheduleFromLegacy("weekly", 9)).toEqual({ type: "times_per_period", count: 7, period: "week" });
  });
  it("keeps daily streaks", () => {
    expect(computeStreak(oldDaily, ago(0, 1, 2), TODAY).current).toBe(3);
    expect(computeStreak(oldDaily, ago(1, 2, 3), TODAY).current).toBe(3);
    expect(computeStreak(oldDaily, ago(2, 3), TODAY).current).toBe(0);
    expect(computeStreak(oldDaily, ago(0, 1, 5, 6, 7, 8), TODAY).best).toBe(4);
  });
  it("keeps weekly streaks, visibility and at-risk nudges", () => {
    const d = logs("2026-11-02", "2026-11-03", "2026-11-04", "2026-10-26", "2026-10-28", "2026-10-30", "2026-10-20");
    expect(computeStreak(oldWeekly3, d, TODAY)).toMatchObject({ current: 2, best: 2 });
    expect(getHabitStatus(oldWeekly3, logs("2026-11-02", "2026-11-03", "2026-11-04"), TODAY).showToday).toBe(false);
    expect(getHabitStatus(oldWeekly3, logs("2026-11-02"), TODAY).showToday).toBe(true);
    expect(streakAtRisk(oldDaily, ago(1, 2), TODAY)).toBe(true);
    expect(streakAtRisk(oldDaily, ago(0, 1, 2), TODAY)).toBe(false);
    expect(streakAtRisk(oldWeekly3, logs("2026-11-02"), TODAY)).toBe(true); // Sat, 1 of 3, 2 days left
  });
});

describe("weekly review progress", () => {
  it("compares done against what was scheduled", () => {
    expect(progressInRange(mwf, logs("2026-11-02", "2026-11-04"), "2026-11-02", "2026-11-08")).toEqual({ done: 2, target: 3 });
    expect(progressInRange(gym3, logs("2026-11-02"), "2026-11-02", "2026-11-08")).toEqual({ done: 1, target: 3 });
    expect(progressInRange(water8, [{ date: "2026-11-02", count: 8 }, { date: "2026-11-03", count: 2 }], "2026-11-02", "2026-11-03")).toEqual({ done: 1, target: 2 });
  });
});

// The SQL migration, run against Postgres: same mapping as scheduleFromLegacy, and a CHECK that agrees with parseSchedule.
describe("habit schedule migration (Postgres)", () => {
  let db: Client;
  const sql = fs.readFileSync("prisma/migrations/20261109000000_habit_schedule/migration.sql", "utf8");
  const backfill = sql.slice(sql.indexOf("-- BACKFILL-START"), sql.indexOf("-- BACKFILL-END"));
  beforeAll(async () => {
    db = new Client({ connectionString: process.env.POSTGRES_PRISMA_URL });
    await db.connect();
  });
  afterAll(async () => db?.end());

  it("backfills old habits exactly like scheduleFromLegacy", async () => {
    await db.query(`CREATE TEMP TABLE legacy_habit ("frequency" text, "timesPerWeek" int, "schedule" jsonb NOT NULL DEFAULT '{"type":"daily"}')`);
    const rows: [string, number][] = [["daily", 7], ["weekly", 3], ["weekly", 5], ["weekly", 7], ["weekly", 0], ["weekly", 12], ["something-else", 2]];
    for (const [f, t] of rows) await db.query(`INSERT INTO legacy_habit VALUES ($1, $2)`, [f, t]);
    await db.query(backfill.replace(/"Habit"/g, "legacy_habit"));
    const out = await db.query(`SELECT "frequency", "timesPerWeek", "schedule" FROM legacy_habit`);
    for (const r of out.rows) expect(r.schedule, `${r.frequency}/${r.timesPerWeek}`).toEqual(scheduleFromLegacy(r.frequency, r.timesPerWeek));
  });

  it("CHECK constraint agrees with parseSchedule", async () => {
    const cases = [daily, mwf, gym3, water8, { type: "times_per_period", count: 31, period: "month" }, { type: "specific_days", days: [] },
      { type: "specific_days", days: [8] }, { type: "times_per_period", count: 0, period: "week" }, { type: "times_per_period", count: 21, period: "day" }, { type: "weekly" }];
    for (const c of cases) {
      const ok = (await db.query(`SELECT thrivie_valid_schedule($1::jsonb) AS ok`, [JSON.stringify(c)])).rows[0].ok;
      let valid = true;
      try { parseSchedule(c); } catch { valid = false; }
      expect(ok, JSON.stringify(c)).toBe(valid);
    }
  });
});
