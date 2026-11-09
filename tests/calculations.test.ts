import { describe, expect, it } from "vitest";
import { BodyProfileSchema, calculateBmr, calculateTargets, cmToFtIn, ftInToCm, lbToKg, type BodyProfile } from "@/lib/nutrition/calculations";

const base: BodyProfile = { heightCm: 165, weightKg: 60, age: 30, sex: "female", pregnantOrBreastfeeding: false, activity: "sedentary", goal: "maintain", diet: "none", allergies: [] };
const t = (p: Partial<BodyProfile>) => calculateTargets({ ...base, ...p });
const cal = (p: Partial<BodyProfile>) => { const r = t(p); if (!r.ok) throw new Error(r.reason); return r.targets; };

describe("calorie math", () => {
  it("uses Mifflin-St Jeor", () => {
    // 10×60 + 6.25×165 − 5×30 − 161 = 1320.25
    expect(calculateBmr(base)).toBeCloseTo(1320.25, 2);
    expect(calculateBmr({ ...base, sex: "male" })).toBeCloseTo(1486.25, 2);
    expect(calculateBmr({ ...base, sex: "unspecified" })).toBeCloseTo(1403.25, 2); // neutral average
  });
  it("multiplies by the activity factor and rounds to 10", () => {
    expect(cal({})).toMatchObject({ bmr: 1320, tdee: 1584, calories: 1580, floorApplied: false });
    expect(cal({ activity: "moderate" }).calories).toBe(2050); // 1320.25 × 1.55 = 2046.4
  });
  it("caps goal adjustments at ±500 kcal", () => {
    const man = { sex: "male" as const, heightCm: 180, weightKg: 85, activity: "active" as const };
    const maintain = cal({ ...man }).calories;
    expect(maintain - cal({ ...man, goal: "lose" }).calories).toBeLessThanOrEqual(500);
    expect(cal({ ...man, goal: "gain" }).calories - maintain).toBeLessThanOrEqual(500);
  });
  it("splits macros sensibly and adds up", () => {
    const m = cal({ activity: "moderate", goal: "gain" });
    expect(m.proteinG).toBe(Math.min(Math.round(1.8 * 60), Math.round((m.calories * 0.35) / 4)));
    expect(Math.abs(m.proteinG * 4 + m.carbsG * 4 + m.fatG * 9 - m.calories)).toBeLessThan(15);
  });
  it("converts units", () => {
    expect(ftInToCm(5, 6)).toBeCloseTo(167.64, 2);
    expect(cmToFtIn(167.64)).toEqual({ ft: 5, in: 6 });
    expect(lbToKg(150)).toBeCloseTo(68.04, 2);
  });
});

describe("safety floors", () => {
  it("never goes below 1,200 kcal for women", () => {
    const small = cal({ heightCm: 150, weightKg: 50, age: 70, goal: "lose" });
    expect(small.calories).toBeGreaterThanOrEqual(1200);
    expect(small.floorApplied).toBe(true);
  });
  it("never goes below 1,500 kcal for men, or for 'prefer not to say'", () => {
    for (const sex of ["male", "unspecified"] as const) expect(cal({ sex, heightCm: 155, weightKg: 52, age: 75, goal: "lose" }).calories).toBeGreaterThanOrEqual(1500);
  });
  it("never goes below BMR", () => {
    const big = { sex: "male" as const, heightCm: 200, weightKg: 140, age: 25, goal: "lose" as const };
    const r = cal(big);
    expect(r.calories).toBeGreaterThanOrEqual(calculateBmr({ ...base, ...big }));
  });
});

describe("safety blocks", () => {
  it("no plans for under-18s", () => {
    for (const goal of ["lose", "maintain", "gain"] as const) expect(t({ age: 16, goal })).toMatchObject({ ok: false, reason: "under_18" });
  });
  it("no plans during pregnancy or breastfeeding, with a kind message", () => {
    const r = t({ pregnantOrBreastfeeding: true });
    expect(r).toMatchObject({ ok: false, reason: "pregnant_or_breastfeeding" });
    if (!r.ok) expect(r.message).toMatch(/doctor|midwife|dietitian/);
    expect(t({ sex: "unspecified", pregnantOrBreastfeeding: true }).ok).toBe(false);
  });
  it("no weight loss when BMI is under 18.5, but maintain/gain are allowed", () => {
    const thin = { heightCm: 170, weightKg: 50 }; // BMI 17.3
    expect(t({ ...thin, goal: "lose" })).toMatchObject({ ok: false, reason: "underweight_weight_loss" });
    const ok = t({ ...thin, goal: "maintain" });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.notes.join(" ")).toMatch(/dietitian/);
  });
});

describe("profile validation", () => {
  it("rejects anything outside the allowed values", () => {
    for (const bad of [{ sex: "x" }, { diet: "keto" }, { allergies: "nuts" }, { allergies: ["nuts", "bees"] }, { activity: "extreme" }, { age: 12 }, { age: 30.5 }, { heightCm: 300 }, { weightKg: NaN }]) {
      expect(BodyProfileSchema.safeParse({ ...base, ...bad }).success, JSON.stringify(bad)).toBe(false);
    }
  });
  it("de-duplicates allergies", () => {
    expect(BodyProfileSchema.parse({ ...base, allergies: ["nuts", "nuts", "soy"] }).allergies).toEqual(["nuts", "soy"]);
  });
});
