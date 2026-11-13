import { describe, expect, it } from "vitest";
import { parseNotes } from "@/lib/import/parser";
import { briefNumbers, composeBrief, type BriefFacts } from "@/lib/briefText";

const ctx = { today: "2026-11-13", units: "imperial", habits: ["Morning skincare", "Meditate", "Take supplements"], goals: [], aliases: [], personal: {} } as never; // a Friday
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const read = (t: string) => parseNotes(t, ctx) as { entries: any[]; unparsed: string[] };

describe("smart reading rules: activities", () => {
  it("reads the notes from the bug report", () => {
    for (const t of ["Friday stretch 30 mins", "stretch 30 mins"]) {
      const r = read(t);
      expect(r.unparsed, t).toEqual([]);
      expect(r.entries[0], t).toMatchObject({ kind: "workout", type: "mobility", title: "Stretching", duration_min: 30, date: "2026-11-13" });
    }
    const bare = read("Fri - stretch");
    expect(bare.unparsed).toEqual([]);
    expect(bare.entries[0]).toMatchObject({ kind: "workout", title: "Stretching", duration_min: null });
    expect(bare.entries[0].field_confidence.duration).toBeLessThan(0.7); // asks for a look
  });
  it("reads a bare number after an activity as minutes, flagged for a look", () => {
    const w = read("yesterday pilates 45").entries[0];
    expect(w).toMatchObject({ kind: "workout", title: "Pilates", duration_min: 45, date: "2026-11-12" });
    expect(w.field_confidence.duration).toBe(0.6);
    expect(read("ran 5k").entries[0].duration_min).toBeNull(); // a distance, not minutes
    expect(read("squats 3x10").entries[0].duration_min).toBeNull();
  });
  it("treats a capitalised short day followed by an activity as a date", () => {
    expect(read("Sat hike 2 hours").entries[0]).toMatchObject({ title: "Hike", duration_min: 120, date: "2026-11-07" });
    expect(read("Sun was out so we walked 30 min").entries[0].date).toBe("2026-11-13");
    expect(read("sat with friends and walked 20 min").entries[0].date).toBe("2026-11-13");
  });
  it("folds a short remark into the workout it follows", () => {
    const r = read("Wed - spin class at the Y, brutal but fun");
    expect(r.unparsed).toEqual([]);
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0]).toMatchObject({ kind: "workout", intensity: 4 });
  });
});

describe("smart reading rules: eating", () => {
  it("reads plain eating notes as meals with an estimate to check", () => {
    const a = read("1/2/26 ate an apple");
    expect(a.unparsed).toEqual([]);
    expect(a.entries[0]).toMatchObject({ kind: "meal", name: "Apple", date: "2026-01-02" });
    expect(a.entries[0].calories).toBeGreaterThan(50);
    expect(a.entries[0].field_confidence.calories).toBe(0.5);
    expect(a.entries[0].confidence).toBeLessThan(0.7); // never saved without a look
  });
  it("keeps foods joined by 'and' together and picks the meal from the time", () => {
    const c = read("had coffee and a bagel");
    expect(c.entries).toHaveLength(1);
    expect(c.entries[0]).toMatchObject({ kind: "meal", name: "Coffee and a bagel", slot: "snack" });
    expect(read("Tues: munched on some leftover pad thai around noon").entries[0]).toMatchObject({ kind: "meal", name: "Pad thai", slot: "lunch", date: "2026-11-10" });
    expect(read("ate eggs and toast this morning").entries[0]).toMatchObject({ kind: "meal", slot: "breakfast" });
  });
  it("doesn't mistake other sentences for food", () => {
    for (const t of ["had a rough day at work and felt drained by the end of it", "had a great workout", "ate well", "drank 3 glasses of water", "grabbed my keys"]) {
      expect(read(t).entries.filter((e) => e.kind === "meal"), t).toEqual([]);
    }
    expect(read("drank 3 glasses of water").entries[0]).toMatchObject({ kind: "health" });
  });
});

describe("smart reading rules: habits", () => {
  it("matches irregular past tenses to the habit", () => {
    expect(read("took supplements").entries[0]).toMatchObject({ kind: "habit", matched_habit: "Take supplements", completed: true });
  });
});

describe("safety on odd input", () => {
  it("never throws, and treats markup as plain text", () => {
    for (const t of ["", "   ", "<script>alert(1)</script>", "<img src=x onerror=alert(1)> ate an apple", "ate ".repeat(2000), "🙂🙂🙂", "\u0000\u0001", "ate (((((", "Fri - " + "stretch ".repeat(500), "$&$1 \\ %s {{x}}"]) {
      expect(() => read(t), JSON.stringify(t).slice(0, 30)).not.toThrow();
    }
    const m = read("ate <b>apple</b>").entries.find((e) => e.kind === "meal");
    if (m) expect(typeof m.name).toBe("string"); // stored and shown as text; React escapes it on render
  });
  it("stays fast on a long note", () => {
    const note = Array.from({ length: 300 }, (_, i) => `11/${(i % 28) + 1} - slept 7h, ate an apple, stretch 20 mins, took supplements, had coffee and a bagel`).join("\n");
    const t0 = performance.now();
    read(note);
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});

describe("daily brief numbers", () => {
  const facts: BriefFacts = {
    seed: "u:2026-11-13", weekday: "Friday", name: "Mel",
    yesterday: { sleepHours: 7.5, workouts: [{ type: "mobility", minutes: 10 }], habitsDone: 5, logged: true },
    atRisk: [{ name: "Morning skincare", streak: 4, unit: "day" }], openToday: 6,
    goals: { total: 1, onTrack: 0, behind: ["Do Zumba 100 times"] }, week: { sleep: 7.8, workouts: 3, steps: null },
  };
  it("lists the same facts the summary is written from", () => {
    const n = Object.fromEntries(briefNumbers(facts).map((x) => [x.label, x.value]));
    expect(n).toMatchObject({ "Sleep last night": "7.5 h", "Workouts yesterday": "1 (10 min)", "Habits yesterday": "5", "Morning skincare streak": "4 days", "Goals on track": "0 of 1", "Workouts, 7 days": "3" });
    expect(n).not.toHaveProperty("Average steps, 7 days");
    const text = composeBrief(facts);
    expect(text).toContain("7.5");
    expect(composeBrief(facts)).toBe(text); // same every time for the same day
  });
  it("is empty when nothing is logged", () => {
    expect(briefNumbers({ ...facts, yesterday: { sleepHours: null, workouts: [], habitsDone: 0, logged: false }, atRisk: [], openToday: 0, goals: { total: 0, onTrack: 0, behind: [] }, week: { sleep: null, workouts: 0, steps: null } })).toEqual([]);
  });
});
