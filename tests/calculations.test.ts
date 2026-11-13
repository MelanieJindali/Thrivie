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

describe("fat loss goal", () => {
  const fl = (p: Partial<BodyProfile> = {}) => calculateTargets({ ...base, weightKg: 80, heightCm: 178, sex: "male", activity: "moderate", ...p });
  const targets = (p: Partial<BodyProfile> = {}) => { const r = fl(p); if (!r.ok) throw new Error(r.reason); return r.targets; };
  it("sets a deficit of 20% of daily needs, never more than 500 kcal", () => {
    const small = targets({ goal: "fat_loss", sex: "female", weightKg: 62, heightCm: 165, activity: "light" });
    expect(small.tdee - small.calories).toBeGreaterThan(0);
    expect(Math.abs(small.tdee - small.calories - 0.2 * small.tdee)).toBeLessThanOrEqual(6); // rounding to 10 kcal
    const big = targets({ goal: "fat_loss", weightKg: 110, heightCm: 190, activity: "active" });
    expect(big.tdee - big.calories).toBeGreaterThanOrEqual(495);
    expect(big.tdee - big.calories).toBeLessThanOrEqual(505);
  });
  it("puts protein first: more than any other goal, and less fat than plain weight loss", () => {
    const f = targets({ goal: "fat_loss" });
    for (const goal of ["lose", "maintain", "gain"] as const) expect(f.proteinG).toBeGreaterThan(targets({ goal }).proteinG);
    expect(f.proteinG).toBe(160); // 2.0 g per kg
    expect(f.fatG * 9 / f.calories).toBeCloseTo(0.25, 1);
    expect(Math.abs(f.proteinG * 4 + f.carbsG * 4 + f.fatG * 9 - f.calories)).toBeLessThanOrEqual(10);
  });
  it("keeps the same safety rules as weight loss", () => {
    expect(fl({ goal: "fat_loss", heightCm: 180, weightKg: 55 })).toMatchObject({ ok: false, reason: "underweight_weight_loss" });
    expect(fl({ goal: "fat_loss", age: 16 })).toMatchObject({ ok: false, reason: "under_18" });
    expect(targets({ goal: "fat_loss", sex: "female", heightCm: 150, weightKg: 50, age: 70, activity: "sedentary" }).calories).toBeGreaterThanOrEqual(1200);
    const r = fl({ goal: "fat_loss" });
    expect(r.ok && r.notes.some((n) => n.includes("keep muscle"))).toBe(true);
  });
});

describe("goal notes", () => {
  it("gives every goal its own note under the target", async () => {
    const { GOAL_NOTE, GOALS } = await import("@/lib/nutrition/calculations");
    const adult: BodyProfile = { ...base, weightKg: 80, heightCm: 178, sex: "male", activity: "moderate" };
    for (const goal of GOALS) {
      const r = calculateTargets({ ...adult, goal });
      expect(r.ok && r.notes.filter((n) => Object.values(GOAL_NOTE).includes(n)), goal).toEqual([GOAL_NOTE[goal]]);
    }
    expect(new Set(Object.values(GOAL_NOTE)).size).toBe(4);
    expect(GOAL_NOTE.fat_loss).toBe("Protein is set higher on this goal to help you keep muscle during a calorie deficit. Regular strength training helps too.");
  });
});
