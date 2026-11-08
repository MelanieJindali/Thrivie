import { describe, expect, it } from "vitest";
import { dayTotals, groupByDay, macroLine } from "@/lib/nutrition";
import { parseNotes } from "@/lib/import/parser";
import { normalizeEntries } from "@/lib/import/normalize";

const meal = (date: string, calories: number | null, proteinG: number | null = null) => ({ date, calories, proteinG, carbsG: null, fatG: null });
const ctx = { today: "2026-11-08", units: "imperial" as const, habits: [], goals: [] };
const meals = (text: string) => parseNotes(text, ctx).entries.filter((e) => e.kind === "meal");

describe("nutrition totals", () => {
  it("adds only the numbers that were recorded", () => {
    expect(dayTotals([meal("d", 400, 20.25), meal("d", null, 10)])).toEqual({ meals: 2, calories: 400, proteinG: 30.3, carbsG: null, fatG: null });
    expect(dayTotals([meal("d", null)]).calories).toBeNull(); // untracked is not zero
  });

  it("groups by day, newest first", () => {
    const g = groupByDay([meal("2026-11-01", 100), meal("2026-11-03", 200), meal("2026-11-01", 50)]);
    expect(g.map((d) => [d.date, d.totals.calories])).toEqual([["2026-11-03", 200], ["2026-11-01", 150]]);
  });

  it("formats a short macro line", () => {
    expect(macroLine({ calories: 1520, proteinG: 40 })).toBe("1,520 kcal · 40g protein");
    expect(macroLine({ calories: null, proteinG: null })).toBe("");
  });
});

describe("Smart Import meals", () => {
  it("reads a meal line without splitting the food on 'and' or commas", () => {
    const [m] = meals("Mon:\nbreakfast: oatmeal and berries, 350 cal");
    expect(m).toMatchObject({ slot: "breakfast", name: "Oatmeal and berries", calories: 350, date: "2026-11-02" });
  });

  it("reads calories and macros in either order", () => {
    const [a] = meals("lunch - chicken salad with avocado 520 kcal 40g protein");
    expect(a).toMatchObject({ slot: "lunch", name: "Chicken salad with avocado", calories: 520, protein_g: 40 });
    const [b] = meals("dinner: pasta. protein 30g, carbs 80g, fat 15g");
    expect(b).toMatchObject({ slot: "dinner", name: "Pasta", protein_g: 30, carbs_g: 80, fat_g: 15 });
  });

  it("finds 'had X for dinner' inside a longer line and keeps the rest", () => {
    const r = parseNotes("slept 7h, had salmon and rice for dinner, ran 3 miles", ctx);
    expect(r.entries.find((e) => e.kind === "meal")).toMatchObject({ slot: "dinner", name: "Salmon and rice" });
    expect(r.entries.some((e) => e.kind === "workout")).toBe(true);
    expect(r.entries.some((e) => e.kind === "health")).toBe(true);
  });

  it("maps brunch, supper and dessert to the four meal slots", () => {
    expect(meals("brunch = eggs benedict")[0].slot).toBe("lunch");
    expect(meals("supper: soup")[0].slot).toBe("dinner");
    expect(meals("dessert: ice cream")[0].slot).toBe("snack");
  });

  it("does not treat a social mention as a meal", () => {
    expect(meals("lunch with Sarah was lovely")).toHaveLength(0);
  });

  it("normalizes meals for review", () => {
    const items = normalizeEntries(meals("snack: apple + almonds (210 cal)"), { today: ctx.today, units: "imperial", habits: [], goals: [] });
    expect(items[0]).toMatchObject({ kind: "meal", data: { slot: "snack", name: "Apple + almonds", calories: 210, proteinG: null } });
  });
});
