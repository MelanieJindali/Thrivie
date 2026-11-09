import { describe, expect, it } from "vitest";
import { composeBrief, type BriefFacts } from "@/lib/briefText";

const base: BriefFacts = {
  seed: "u1:2026-11-07", weekday: "Saturday", name: "Alex",
  yesterday: { sleepHours: 7.4, workouts: [{ type: "cardio", minutes: 32 }], habitsDone: 3, logged: true },
  atRisk: [{ name: "Meditate", streak: 12, unit: "day" }], openToday: 2,
  goals: { total: 3, onTrack: 2, behind: ["Read 6 books"] }, week: { sleep: 7.2, workouts: 3, steps: 8200 },
};
const sentences = (s: string) => s.split(/(?<=[.!])\s+(?=[A-Z“])/).filter(Boolean);

describe("template daily brief", () => {
  it("covers recap, streak at risk, goals and one suggestion in 3–5 sentences", () => {
    const b = composeBrief(base);
    expect(sentences(b).length).toBeGreaterThanOrEqual(3);
    expect(sentences(b).length).toBeLessThanOrEqual(5);
    expect(b).toMatch(/7\.4 hours/);
    expect(b).toMatch(/meditate|Meditate/);
    expect(b).toMatch(/2 of 3 goals/);
  });
  it("is stable for the same day and varies across days", () => {
    expect(composeBrief(base)).toBe(composeBrief(base));
    const variants = new Set(Array.from({ length: 30 }, (_, i) => composeBrief({ ...base, seed: `u1:day${i}` })));
    expect(variants.size).toBeGreaterThan(3);
  });
  it("stays kind when nothing was logged", () => {
    const b = composeBrief({ ...base, yesterday: { sleepHours: null, workouts: [], habitsDone: 0, logged: false }, atRisk: [], openToday: 0, goals: { total: 0, onTrack: 0, behind: [] }, week: { sleep: null, workouts: 0, steps: null } });
    expect(b).not.toMatch(/fail|bad|should|lazy|missed/i);
    expect(sentences(b).length).toBeGreaterThanOrEqual(2);
  });
  it("never mentions weight or gives medical advice", () => {
    for (let i = 0; i < 40; i++) {
      const b = composeBrief({ ...base, seed: `s${i}`, week: { sleep: i % 2 ? 6.1 : 7.5, workouts: i % 3, steps: i % 4 ? 4000 : 9000 } });
      expect(b).not.toMatch(/weight|lbs?\b|kg\b|calorie|diet|diagnos|doctor|medication/i);
    }
  });
});
