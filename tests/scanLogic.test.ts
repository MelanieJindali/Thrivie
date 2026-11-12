import { describe, expect, it } from "vitest";
import { labelIssues, parseLabel } from "@/lib/nutrition/labelParse";
import { fitNote, fitPortions, mealComparison, remaining, shareWords, suggestNext, sum, type DayTargets } from "@/lib/nutrition/dayFit";
import { MEALS } from "@/lib/nutrition/mealPlan";
import { LABELS } from "./fixtures/labels";

describe(`nutrition label reading (${LABELS.length} sample labels)`, () => {
  it("has at least 30 samples covering US and EU layouts", () => {
    expect(LABELS.length).toBeGreaterThanOrEqual(30);
    expect(LABELS.filter((l) => l.layout === "us").length).toBeGreaterThanOrEqual(15);
    expect(LABELS.filter((l) => l.layout === "eu").length).toBeGreaterThanOrEqual(10);
  });
  for (const s of LABELS) {
    it(s.name, () => {
      const r = parseLabel(s.text);
      expect(r.layout).toBe(s.layout);
      if (s.perServing) expect(r.perServing).toMatchObject(s.perServing); else if (!s.per100g) expect(r.perServing).toBeNull();
      if (s.per100g) expect(r.per100g).toMatchObject(s.per100g);
      if (s.servingGrams !== undefined) expect(r.servingGrams).toBe(s.servingGrams);
      if (s.servings !== undefined) expect(r.servingsPerContainer).toBe(s.servings);
      expect([...r.allergens].sort()).toEqual([...(s.allergens ?? [])].sort());
      expect([...r.traces].sort()).toEqual([...(s.traces ?? [])].sort());
      if (s.unsure) expect([...r.unsure].sort()).toEqual([...s.unsure].sort());
    });
  }
  it("scores field accuracy across the whole set", () => {
    let right = 0, total = 0;
    for (const s of LABELS) {
      const r = parseLabel(s.text);
      for (const [col, want] of [["perServing", s.perServing], ["per100g", s.per100g]] as const) {
        for (const [k, v] of Object.entries(want ?? {})) { total++; if ((r[col] as Record<string, number> | null)?.[k] === v) right++; }
      }
    }
    console.log(`Label fields read correctly: ${right}/${total} (${((right / total) * 100).toFixed(1)}%)`);
    expect(right / total).toBeGreaterThanOrEqual(0.97);
  });
});

describe("label checks", () => {
  it("flags calories that don't match the macros, with a one-tap fix", () => {
    const [issue] = labelIssues({ calories: 23, fatG: 8, carbsG: 37, proteinG: 3 });
    expect(issue).toMatchObject({ field: "calories", fix: { value: 230 } });
  });
  it("flags a part bigger than its whole", () => {
    expect(labelIssues({ fatG: 2, satFatG: 12 }).map((i) => i.field)).toEqual(["satFatG"]);
    expect(labelIssues({ carbsG: 10, sugarsG: 30, fiberG: 2 }).map((i) => i.field)).toEqual(["sugarsG"]);
  });
  it("stays quiet for a consistent label", () => {
    expect(labelIssues({ calories: 230, fatG: 8, satFatG: 1, carbsG: 37, fiberG: 4, sugarsG: 12, addedSugarsG: 10, proteinG: 3 })).toEqual([]);
  });
});

const targets: DayTargets = { calories: 2000, proteinG: 120, carbsG: 230, fatG: 67 };
const prefs = { diet: "none" as const, allergies: [] };

describe("what's left today", () => {
  it("adds up logged items and never goes below zero", () => {
    const eaten = sum([{ calories: 500, proteinG: 30, carbsG: 50, fatG: 20 }, { calories: 1700, proteinG: 40 }]);
    expect(eaten).toEqual({ calories: 2200, proteinG: 70, carbsG: 50, fatG: 20 });
    expect(remaining(targets, eaten)).toEqual({ calories: 0, proteinG: 50, carbsG: 180, fatG: 47 });
    expect(remaining({ calories: 1800, proteinG: null, carbsG: null, fatG: null }, { calories: 300 })).toEqual({ calories: 1500, proteinG: null, carbsG: null, fatG: null });
  });
  it("describes shares in plain words", () => {
    expect([0.05, 0.12, 0.25, 0.33, 0.5, 0.66, 0.75, 0.9, 1].map(shareWords)).toEqual(["very little", "a small part", "about a quarter", "about a third", "about half", "about two thirds", "about three quarters", "nearly all", "all"]);
  });
});

describe("fits your day", () => {
  const left: DayTargets = { calories: 900, proteinG: 60, carbsG: 100, fatG: 30 };
  it("leads with protein when the item is a real source of it", () => {
    expect(fitNote({ calories: 150, proteinG: 20 }, left)).toBe("This covers about a third of your remaining protein for today, and a small part of the calories you have left.");
  });
  it("talks about calories otherwise", () => {
    expect(fitNote({ calories: 300, proteinG: 2 }, left)).toBe("This uses about a third of the calories you have left today.");
    expect(fitNote({ calories: 20, proteinG: 0 }, left)).toBe("This barely touches what's left of today's calorie guide.");
  });
  it("stays neutral when an item goes past what's left", () => {
    const note = fitNote({ calories: 1200, proteinG: 10 }, left)!;
    expect(note).toMatch(/Guides flex/);
    expect(note).not.toMatch(/too much|over|exceed|bad|unhealthy|warning/i);
    expect(fitNote({ calories: 100 }, { ...left, calories: 0 })).toMatch(/guide, not a limit/);
  });
  it("never mentions calories when calorie numbers are hidden", () => {
    for (const item of [{ calories: 150, proteinG: 20 }, { calories: 300, proteinG: 2 }, { calories: 5000, proteinG: 1 }]) {
      const note = fitNote(item, left, { hideCalories: true });
      expect(note).not.toMatch(/calorie|kcal|\d/i);
    }
    expect(mealComparison({ calories: 600, proteinG: 40 }, "lunch", targets, { hideCalories: true })).not.toMatch(/calorie|kcal|\d/i);
  });
  it("has nothing to say without targets", () => {
    expect(fitNote({ calories: 100, proteinG: 5 }, { calories: null, proteinG: null, carbsG: null, fatG: null })).toBeNull();
  });
  it("compares a built meal with that meal's share of the day", () => {
    expect(mealComparison({ calories: 610 }, "lunch", targets)).toBe("About 610 kcal, right around a typical lunch for you (around 600).");
    expect(mealComparison({ calories: 300 }, "dinner", targets)).toMatch(/lighter than a typical dinner/);
    expect(mealComparison({ calories: 900 }, "breakfast", targets)).toMatch(/heartier than a typical breakfast/);
  });
});

describe("what to eat next", () => {
  const left: DayTargets = { calories: 700, proteinG: 70, carbsG: 60, fatG: 20 };
  it("suggests meals for this time of day that fit what's left, closest first", () => {
    const s = suggestNext({ targets, left, slot: "dinner", prefs });
    expect(s.length).toBeGreaterThan(0);
    expect(s.length).toBeLessThanOrEqual(4);
    for (const x of s) {
      expect(x.nutrients.calories!).toBeLessThanOrEqual(700 * 1.25);
      if (x.kind === "library") expect(MEALS.find((m) => m.id === x.mealId)?.slot).toBe("dinner");
    }
  });
  it("leans toward protein when protein is what's behind", () => {
    const density = (list: ReturnType<typeof suggestNext>) => list.reduce((a, x) => a + ((x.nutrients.proteinG ?? 0) * 4) / (x.nutrients.calories || 1), 0) / list.length;
    const behind = suggestNext({ targets, left: { calories: 700, proteinG: 90, carbsG: 60, fatG: 20 }, slot: "dinner", prefs });
    const even = suggestNext({ targets, left: { calories: 700, proteinG: 20, carbsG: 60, fatG: 20 }, slot: "dinner", prefs });
    expect(density(behind)).toBeGreaterThanOrEqual(density(even));
    expect(behind[0].reason).toMatch(/protein/);
  });
  it("respects diet and allergies", () => {
    const vegan = suggestNext({ targets, left, slot: "dinner", prefs: { diet: "vegan", allergies: ["soy", "nuts"] }, limit: 10 });
    for (const x of vegan) if (x.kind === "library") {
      const m = MEALS.find((mm) => mm.id === x.mealId)!;
      expect(m.diet).toBe("vegan");
      expect(m.allergens).not.toContain("soy");
      expect(m.allergens).not.toContain("nuts");
    }
  });
  it("includes recent foods, skips what's already been had, and stops when little is left", () => {
    const recents = [{ name: "Leftover chili", slot: "dinner" as const, nutrients: { calories: 650, proteinG: 40 } }, { name: "Mystery", slot: "dinner" as const, nutrients: { calories: null as unknown as number } }];
    const s = suggestNext({ targets, left, slot: "dinner", prefs, recents, limit: 10 });
    expect(s.some((x) => x.kind === "recent" && x.name === "Leftover chili")).toBe(true);
    expect(s.some((x) => x.name === "Mystery")).toBe(false);
    const first = s.find((x) => x.kind === "library")!;
    expect(suggestNext({ targets, left, slot: "dinner", prefs, exclude: [first.name], limit: 10 }).some((x) => x.name === first.name)).toBe(false);
    expect(suggestNext({ targets, left: { ...left, calories: 40 }, slot: "snack", prefs })).toEqual([]);
    expect(suggestNext({ targets: { calories: null, proteinG: null, carbsG: null, fatG: null }, left, slot: "dinner", prefs })).toEqual([]);
  });
});

describe("adjusting planned portions", () => {
  it("lands close to the goal using only the standard portions", () => {
    const items = [{ baseKcal: 500 }, { baseKcal: 200 }];
    const p = fitPortions(items, 900);
    const total = items.reduce((s, it, i) => s + it.baseKcal * p[i], 0);
    expect(Math.abs(total - 900)).toBeLessThanOrEqual(60);
    expect(p.every((x) => [0.75, 1, 1.25, 1.5, 1.75, 2].includes(x))).toBe(true);
  });
  it("uses the smallest portions when little is left and handles an empty list", () => {
    expect(fitPortions([{ baseKcal: 600 }], 200)).toEqual([0.75]);
    expect(fitPortions([], 500)).toEqual([]);
  });
});
