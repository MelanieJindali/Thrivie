import { describe, expect, it } from "vitest";
import { healthFormData } from "@/lib/formData";

// Synthetic rows shaped like getHealthRange() results.
const row = (date: string, over: Record<string, unknown> = {}) =>
  ({ date, weightKg: null, sleepHours: null, sleepQuality: null, waterMl: null, mood: null, energy: null, steps: null, custom: null, notes: null, ...over }) as never;

describe("healthFormData (shared by the Health page and the quick-log sheet)", () => {
  it("prefills every field already logged for a day, so a later check-in keeps it", () => {
    const { prefill } = healthFormData([row("2026-01-02", { weightKg: 70, sleepHours: 7.5, sleepQuality: 4, waterMl: 2000, mood: 3, energy: 5, steps: 8000, custom: '{"Resting HR":58}', notes: "ok" })], "metric");
    expect(prefill["2026-01-02"]).toEqual({ weight: 70, sleepHours: 7.5, sleepQuality: 4, water: 2000, mood: 3, energy: 5, steps: 8000, custom: { "Resting HR": 58 }, notes: "ok" });
  });

  it("converts weight and water to the person's units", () => {
    const { prefill, lastWeight } = healthFormData([row("2026-01-02", { weightKg: 70, waterMl: 2000 })], "imperial");
    expect(prefill["2026-01-02"].weight).toBeCloseTo(154.3, 0);
    expect(prefill["2026-01-02"].water).toBeGreaterThan(60);
    expect(lastWeight).toBeCloseTo(154.3, 0);
  });

  it("takes the last weight from the most recent day that has one", () => {
    const { lastWeight } = healthFormData([row("2026-01-01", { weightKg: 71 }), row("2026-01-02", { weightKg: 70 }), row("2026-01-03", { mood: 4 })], "metric");
    expect(lastWeight).toBe(70);
  });

  it("collects custom metric names once and ignores unreadable custom data", () => {
    const { customKeys, prefill } = healthFormData([row("2026-01-01", { custom: '{"HRV":40}' }), row("2026-01-02", { custom: '{"HRV":42,"BP":120}' }), row("2026-01-03", { custom: "{not json" })], "metric");
    expect(customKeys.sort()).toEqual(["BP", "HRV"]);
    expect(prefill["2026-01-03"].custom).toEqual({});
  });

  it("returns nothing to prefill when there are no logs", () => {
    expect(healthFormData([], "metric")).toEqual({ prefill: {}, lastWeight: null, customKeys: [] });
  });
});
