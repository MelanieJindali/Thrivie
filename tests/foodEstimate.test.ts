import { describe, expect, it } from "vitest";
import { estimateFood, estimateFromFoods } from "@/lib/nutrition/foodEstimate";

describe("food estimates", () => {
  it("adds up recognised foods at typical servings", () => {
    const r = estimateFromFoods("2 eggs and toast with avocado")!;
    expect(r.parts).toEqual(["2 eggs", "1 slice toast", "½ avocado"]);
    // 2 large eggs ≈ 143 kcal, 1 slice whole-wheat ≈ 81, ½ avocado ≈ 109
    expect(r.macros.calories).toBeGreaterThan(300);
    expect(r.macros.calories).toBeLessThan(360);
    expect(r.macros.proteinG).toBeGreaterThan(14);
  });

  it("prefers longer food names (peanut butter, sweet potato, brown rice)", () => {
    expect(estimateFromFoods("peanut butter")!.parts).toEqual(["2 tbsp peanut butter"]);
    expect(estimateFromFoods("sweet potato")!.parts).toEqual(["1 sweet potato"]);
    expect(estimateFromFoods("brown rice")!.parts).toEqual(["1 cup cooked brown rice"]);
  });

  it("lists foods in the order they were typed", () => {
    expect(estimateFromFoods("150g chicken with brown rice and broccoli")!.parts).toEqual(["150 g chicken", "1 cup cooked brown rice", "½ cup broccoli"]);
  });

  it("uses grams and ounces when given", () => {
    const r = estimateFromFoods("150g chicken")!;
    expect(r.macros.calories).toBe(250); // 165 kcal/100 g × 1.5, rounded to 5
    expect(estimateFromFoods("6 oz salmon")!.macros.proteinG).toBeGreaterThan(30);
  });

  it("uses your own past entry first", () => {
    const e = estimateFood("Turkey and hummus wrap", [{ name: "turkey and hummus wrap", calories: "480", proteinG: "32", carbsG: "40", fatG: "18" }])!;
    expect(e).toMatchObject({ source: "history", calories: 480, proteinG: 32 });
  });

  it("matches the meal library for a recipe name", () => {
    const e = estimateFood("oatmeal with blueberries and walnuts")!;
    expect(e.source).toBe("library");
    expect(e.calories).toBeGreaterThan(300);
  });

  it("suggests nothing for unknown or very short text", () => {
    expect(estimateFood("ab")).toBeNull();
    expect(estimateFood("mystery dish from the office party")).toBeNull();
  });
});
