import { describe, expect, it } from "vitest";
import { parseNotes, segmentByDay, type ParseContext } from "@/lib/import/parser";
import { cleanText, editDistance, fixTypo } from "@/lib/import/cleanText";
import { createIncrementalParser } from "@/lib/import/incremental";
import { NOTES } from "./fixtures/notes";
import { DEV2 } from "./fixtures/dev2";
import { HELDOUT } from "./fixtures/heldout";

const TODAY = "2026-11-07"; // Saturday
const base: ParseContext = { today: TODAY, units: "imperial", habits: ["Meditate", "No sugar", "Stretch", "Push-ups", "Read 20 min"], goals: [] };
const entries = (t: string, ctx = base) => parseNotes(t, ctx).entries;
const health = (t: string, ctx = base) => entries(t, ctx).find((e) => e.kind === "health") as Extract<ReturnType<typeof entries>[number], { kind: "health" }> | undefined;

describe("Layer 1: cleaning", () => {
  it("fixes shorthand and one-letter typos, but leaves real words alone", () => {
    expect(fixTypo("slp")).toBe("slept");
    expect(fixTypo("excercise")).toBe("exercise");
    expect(fixTypo("yestrday")).toBe("yesterday");
    expect(fixTypo("wieght")).toBe("weight");
    expect(fixTypo("height")).toBeNull();
    expect(fixTypo("great")).toBeNull();
    expect(editDistance("meditaed", "meditated")).toBe(1);
  });
  it("turns spoken numbers and h+m into digits", () => {
    expect(cleanText("slept 5 and a half hours")).toBe("slept 5.5 hours");
    expect(cleanText("slept 6 1/2 hrs")).toBe("slept 6.5 hrs");
    expect(cleanText("played for an hour")).toBe("played for 1 hour");
    expect(cleanText("slept 7h 15m")).toBe("slept 7.25h");
    expect(cleanText("gym 1h15")).toBe("gym 1.25h");
    expect(cleanText("6h 75 pushups")).toBe("6h 75 pushups"); // 75 can't be minutes
    expect(cleanText("walked two miles")).toBe("walked 2 miles");
    expect(cleanText("- meditated ✅\n• 8 glasses water\n2. yoga")).toBe("meditated ✅\n8 glasses water\nyoga");
    expect(cleanText("64oz H2O")).toBe("64oz water");
  });
});

describe("Layer 1: dates", () => {
  it("reads weekday headers written any way", () => {
    for (const [t, d] of [["MON 11/2\nslept 7h", "2026-11-02"], ["fri 6.5h sleep", "2026-11-06"], ["Wed 11/4: mood 5", "2026-11-04"], ["tuesday exercise: rows 3x10", "2026-11-03"], ["SAT - SLEPT 6H", "2026-11-07"]] as const) {
      expect(segmentByDay(cleanText(t), TODAY)[0].date, t).toBe(d);
    }
  });
  it("doesn't mistake ordinary words for days", () => {
    expect(segmentByDay("sun is out, walked 2 miles", TODAY)[0].date).toBe(TODAY);
    expect(segmentByDay("sat with friends after a 5k", TODAY)[0].date).toBe(TODAY);
  });
});

describe("Layer 1: extractors", () => {
  it("reads sets written number-first and generic session labels", () => {
    const w = entries("great workout: 5x5 squats @ 205, deadlift 3x5 225. 1hr").find((e) => e.kind === "workout");
    expect(w && w.kind === "workout" ? w.exercises.map((e) => `${e.name} ${e.sets}x${e.reps}`) : []).toEqual(["Squats 5x5", "Deadlift 3x5"]);
    expect(w && w.kind === "workout" ? w.duration_min : 0).toBe(60);
  });
  it("attaches a lone duration to the session before it", () => {
    const w = entries("leg day. squats 4x8, lunges 3x12, 50 min").find((e) => e.kind === "workout");
    expect(w && w.kind === "workout" ? w.duration_min : 0).toBe(50);
  });
  it("reads steps label-first, water as glasses or H2O, and never reads 1000m as minutes", () => {
    expect(health("Steps 10,450")?.steps).toBe(10450);
    expect(health("drank 64oz H2O")?.water).toEqual({ value: 64, unit: "oz" });
    const swim = entries("swam 1000m 35 min").find((e) => e.kind === "workout");
    expect(swim && swim.kind === "workout" ? swim.duration_min : 0).toBe(35);
  });
  it("matches habits by stem, compact spelling, or a checkmark", () => {
    const habit = (t: string) => entries(t).filter((e) => e.kind === "habit").map((e) => (e.kind === "habit" ? e.matched_habit : null));
    expect(habit("stretched")).toEqual(["Stretch"]);
    expect(habit("15 min meditation ✅")).toEqual(["Meditate"]);
    expect(habit("pushups done")).toEqual(["Push-ups"]);
    expect(habit("read a book about history and felt inspired")).toEqual([]);
  });
  it("ignores emoji-only lines and keeps follow-on journal sentences", () => {
    expect(entries("💪🔥😴").filter((e) => e.kind === "habit")).toHaveLength(0);
    const j = entries("stressed about money, need to budget better").find((e) => e.kind === "journal");
    expect(j && j.kind === "journal" ? j.content : "").toContain("budget");
  });
});

describe("Layer 2: personal knowledge", () => {
  it("reads a bare weight in the unit closest to recent weights", () => {
    expect(health("weight 172", { ...base, personal: { recentWeightKg: 78 } })?.weight).toEqual({ value: 172, unit: "lb" });
    expect(health("weight 78", { ...base, personal: { recentWeightKg: 78 } })?.weight).toEqual({ value: 78, unit: "kg" });
  });
  it("uses a learned unit preference when there's no history", () => {
    expect(health("weight 80", { ...base, aliases: [{ kind: "metric", alias: "weight-unit", target: "kg" }] })?.weight).toEqual({ value: 80, unit: "kg" });
  });
  it("matches the user's own exercise names and learned shorthand", () => {
    const ex = (t: string, ctx: Parameters<typeof parseNotes>[1]) => entries(t, ctx).flatMap((e) => (e.kind === "workout" ? e.exercises.map((x) => x.name) : []));
    expect(ex("goblet sq 3x10", { ...base, personal: { exerciseNames: ["Goblet squat"] } })).toEqual(["Goblet squat"]);
    expect(ex("bb 3x8", { ...base, aliases: [{ kind: "exercise", alias: "bb", target: "Bench press" }] })).toEqual(["Bench press"]);
  });
});

describe("incremental parsing", () => {
  it("gives exactly the same result as a full parse on every fixture note", () => {
    const inc = createIncrementalParser();
    for (const n of [...NOTES, ...DEV2, ...HELDOUT]) {
      const ctx = { ...base, habits: ["Meditate", "No sugar", "Read 20 min", "Stretch", "Journal", "Drink water"] };
      const strip = (o: ReturnType<typeof parseNotes>) => o.entries.map((e) => ({ ...e, source_text: null, confidence: 0 }));
      expect(strip(inc(n.text, ctx)), n.text).toEqual(strip(parseNotes(n.text, ctx)));
    }
  });
  it("only re-parses the day that changed", () => {
    const inc = createIncrementalParser();
    const days = Array.from({ length: 6 }, (_, i) => `11/${i + 1}: slept 7h, walked 30 min`).join("\n");
    inc(days, base);
    const t0 = performance.now(); inc(days + " extra", base); const changed = performance.now() - t0;
    expect(changed).toBeLessThan(50);
  });
});
