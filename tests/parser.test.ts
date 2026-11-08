import { describe, expect, it } from "vitest";
import { parseNotes, segmentByDay, splitClauses } from "@/lib/import/parser";
import { normalizeEntries, type ReviewItem } from "@/lib/import/normalize";
import { NOTES, type Fact } from "./fixtures/notes";
import { HELDOUT } from "./fixtures/heldout";

const TODAY = "2026-11-07";
const HABITS = ["Meditate", "No sugar", "Read 20 min", "Stretch", "Journal", "Drink water"];
const ctx = { today: TODAY, units: "imperial" as const, habits: HABITS, goals: [{ title: "Read 6 books", unit: "books" }] };
const habitList = HABITS.map((name, i) => ({ id: `h${i}`, name }));
const LB = 0.45359237, MI = 1.609344, OZ = 29.5735;
const near = (a: number | null | undefined, b: number, tol = 0.05) => a != null && Math.abs(a - b) <= Math.max(tol, Math.abs(b) * 0.02);

function check(items: ReviewItem[], f: Fact): boolean {
  const on = items.filter((i) => i.date === f.date);
  switch (f.k) {
    case "h": {
      const h = on.find((i) => i.kind === "health");
      if (h?.kind !== "health") return false;
      const d = h.data;
      if (f.field === "weightLb") return near(d.weightKg, f.value * LB, 0.1);
      if (f.field === "waterOz") return near(d.waterMl, f.value * OZ, 5);
      return near(d[f.field] as number | null, f.value);
    }
    case "w":
      return on.some((i) => i.kind === "workout" && i.data.type === f.type && (f.minutes == null || near(i.data.durationMin, f.minutes, 1)) && (f.miles == null || near(i.data.distanceKm, f.miles * MI, 0.05)));
    case "ex":
      return on.some((i) => i.kind === "workout" && i.data.exercises.some((e) => e.name === f.name && e.sets === f.sets && e.reps === f.reps));
    case "hab":
      return on.some((i) => i.kind === "habit" && i.data.habitId === habitList.find((h) => h.name === f.habit)?.id) === f.done;
    case "newhab":
      return on.some((i) => i.kind === "habit" && i.data.habitId === null && i.data.habitName.toLowerCase() === f.name.toLowerCase());
    case "j":
      return on.some((i) => i.kind === "journal" && i.data.content.toLowerCase().includes(f.contains.toLowerCase()));
    case "g":
      return on.some((i) => i.kind === "goal_update" && i.data.goalName === f.goal && i.data.value === f.value);
  }
}

describe("Tier 1 parser accuracy on messy notes", () => {
  const results = NOTES.map((n) => {
    const out = parseNotes(n.text, ctx);
    const items = normalizeEntries(out.entries, { today: TODAY, units: "imperial", habits: habitList, goals: [{ id: "g1", name: "Read 6 books" }] });
    const misses = n.facts.filter((f) => !check(items, f));
    return { text: n.text, total: n.facts.length, hit: n.facts.length - misses.length, misses };
  });
  const total = results.reduce((a, r) => a + r.total, 0);
  const hit = results.reduce((a, r) => a + r.hit, 0);
  const accuracy = hit / total;

  it(`finds at least 85% of expected facts (got ${(accuracy * 100).toFixed(1)}%: ${hit}/${total} across ${NOTES.length} notes)`, () => {
    for (const r of results) if (r.misses.length) console.log(`MISSED in "${r.text.slice(0, 50)}…":`, JSON.stringify(r.misses));
    console.log(`PARSER ACCURACY: ${(accuracy * 100).toFixed(1)}% (${hit}/${total} facts, ${NOTES.length} notes)`);
    expect(accuracy).toBeGreaterThanOrEqual(0.85);
  });
});

describe("Tier 1 parser on held-out notes (not used for tuning)", () => {
  const facts = HELDOUT.map((n) => {
    const out = parseNotes(n.text, ctx);
    const items = normalizeEntries(out.entries, { today: TODAY, units: "imperial", habits: habitList, goals: [{ id: "g1", name: "Read 6 books" }] });
    return { text: n.text, total: n.facts.length, misses: n.facts.filter((f) => !check(items, f)) };
  });
  const total = facts.reduce((a, r) => a + r.total, 0);
  const hit = total - facts.reduce((a, r) => a + r.misses.length, 0);
  it(`generalizes to unseen notes (got ${((hit / total) * 100).toFixed(1)}%: ${hit}/${total})`, () => {
    for (const r of facts) if (r.misses.length) console.log(`HELD-OUT MISSED in "${r.text.slice(0, 50)}…":`, JSON.stringify(r.misses));
    console.log(`HELD-OUT ACCURACY: ${((hit / total) * 100).toFixed(1)}% (${hit}/${total} facts, ${HELDOUT.length} notes)`);
    expect(hit / total).toBeGreaterThanOrEqual(0.7);
  });
});

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
