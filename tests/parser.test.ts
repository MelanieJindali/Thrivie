import { describe, expect, it } from "vitest";
import { parseNotes, segmentByDay, splitClauses } from "@/lib/import/parser";

const TODAY = "2026-11-07";
const HABITS = ["Meditate", "No sugar", "Read 20 min", "Stretch", "Journal", "Drink water"];
const ctx = { today: TODAY, units: "imperial" as const, habits: HABITS, goals: [{ title: "Read 6 books", unit: "books" }] };

describe("segmenting and splitting", () => {
  it("splits multi-day notes at day markers", () => {
    const segs = segmentByDay("Mon - ran 5k. Tues: rest day, 8h sleep", TODAY);
    expect(segs.map((s) => s.date)).toEqual(["2026-11-02", "2026-11-03"]);
  });
  it("keeps numbers with decimals and thousands separators intact", () => {
    expect(splitClauses("slept 7.5h, 8,400 steps, felt good")).toEqual(["slept 7.5h", "8,400 steps", "felt good"]);
  });
  it("never throws on hostile or empty input and caps its work", () => {
    for (const t of ["", "   ", "✅✅✅", "<script>alert(1)</script>", "x".repeat(50000), "1x1x1x1x1", "Mon Mon Mon:::"]) {
      expect(() => parseNotes(t, ctx)).not.toThrow();
    }
  });
  it("treats markup as plain text (never HTML)", () => {
    const out = parseNotes("today: felt <b>great</b> about <img src=x onerror=alert(1)> my progress", ctx);
    const j = out.entries.find((e) => e.kind === "journal");
    expect(j && j.kind === "journal" ? j.content : "").toContain("<img");
  });
  it("applies personal aliases learned from corrections", () => {
    const out = parseNotes("Mon: bb 5x5 @ 185", { ...ctx, aliases: [{ kind: "exercise", alias: "bb", target: "Bench press" }] });
    const w = out.entries.find((e) => e.kind === "workout");
    expect(w && w.kind === "workout" ? w.exercises[0].name : "").toBe("Bench press");
  });
});
