import { describe, expect, it } from "vitest";
import { computeGoal } from "@/lib/stats";
import { computeInsights } from "@/lib/insights";
import { addDays } from "@/lib/dates";

const TODAY = "2026-11-07"; // Saturday; week starts Mon 2026-11-02

describe("computeGoal", () => {
  const g = { target: 100, startValue: null, startDate: "2026-11-01", deadline: "2026-12-01" };
  it("is on track when progress keeps pace", () => {
    expect(computeGoal(g, 25, "2026-11-08")).toMatchObject({ status: "on-track", daysLeft: 23 });
  });
  it("is behind when well under pace", () => {
    expect(computeGoal(g, 5, "2026-11-16").status).toBe("behind");
  });
  it("is done at the target", () => {
    expect(computeGoal(g, 100, "2026-11-16")).toMatchObject({ status: "done", pct: 100 });
  });
  it("handles reach-a-value goals in either direction", () => {
    const lose = { target: 76, startValue: 80, startDate: "2026-11-01", deadline: "2026-12-01" };
    expect(computeGoal(lose, 78, "2026-11-16").pct).toBeCloseTo(50);
    const gain = { target: 10, startValue: 5, startDate: "2026-11-01", deadline: "2026-12-01" };
    expect(computeGoal(gain, 7.5, "2026-11-16").pct).toBeCloseTo(50);
  });
});

describe("computeInsights", () => {
  it("reports streak records and the sleep/workout pattern without judging weight", () => {
    const health = Array.from({ length: 20 }, (_, i) => {
      const date = addDays(TODAY, -i);
      return { date, sleepHours: i % 2 === 0 ? 8 : 7, mood: 3, energy: 3, steps: 8000, weightKg: 80 + i * 0.1 };
    });
    const workouts = health.filter((_, i) => i % 2 === 0).map((h) => ({ date: h.date, type: "cardio", durationMin: 30, distanceKm: 5 }));
    const out = computeInsights({
      today: TODAY, units: "imperial", health, workouts,
      habits: [{ name: "Meditate", streakUnit: "day", streak: 12, longest: 12, dates: [] }],
      goals: [], journalDates: [],
    });
    const text = out.map((i) => i.text).join(" | ");
    expect(text).toContain("Meditate: your longest streak yet (12 days)");
    expect(text).toContain("You sleep about 1 hour more on workout days");
    expect(text).toMatch(/mi covered/);
    expect(text).not.toMatch(/weight|lb/i);
  });
});
