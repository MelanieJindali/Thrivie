import { describe, expect, it } from "vitest";
import { IngestSchema, normalizeIngest } from "@/lib/ingest";

const TODAY = "2026-11-07";
const parse = (o: unknown) => IngestSchema.parse(o);

describe("health sync ingest", () => {
  it("converts U.S. units and coerces Shortcuts' string numbers", () => {
    const r = normalizeIngest(parse({ steps: "9,120", sleepMinutes: "444", weight: "171.6", water: 64 }), TODAY, "imperial");
    expect(r.date).toBe(TODAY);
    expect(r.health).toMatchObject({ steps: 9120, sleepHours: 7.4, waterMl: 1893 });
    expect(r.health.weightKg).toBeCloseTo(77.84, 2);
  });
  it("honours explicit units and ISO datetimes", () => {
    const r = normalizeIngest(parse({ date: "2026-11-05T21:00:00-05:00", weight: 80, weightUnit: "kg" }), TODAY, "imperial");
    expect(r.date).toBe("2026-11-05");
    expect(r.health.weightKg).toBe(80);
  });
  it("maps Apple workout names to Thrivie types and computes pace", () => {
    const r = normalizeIngest(parse({ workouts: [{ type: "Running", durationMin: "31", distance: 3.1 }, { type: "Yoga", durationMin: 20 }, { type: "Skydiving", durationMin: 0 }] }), TODAY, "imperial");
    expect(r.workouts).toHaveLength(2);
    expect(r.workouts[0]).toMatchObject({ type: "cardio", title: "Running", durationMin: 31 });
    expect(r.workouts[0].distanceKm).toBeCloseTo(4.99, 2);
    expect(r.workouts[1].type).toBe("mobility");
  });
  it("puts resting heart rate in custom metrics and ignores blanks", () => {
    const r = normalizeIngest(parse({ restingHeartRate: "58.4", steps: "", mood: 9 }), TODAY, "metric");
    expect(r.custom).toEqual({ "Resting HR": 58 });
    expect(r.health).toEqual({ mood: 5 });
  });
  it("rejects negative values", () => {
    expect(() => parse({ steps: -5 })).toThrow();
  });
});
