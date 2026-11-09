import { describe, expect, it } from "vitest";
import { normalizeEntries, type ReviewItem } from "@/lib/import/normalize";
import { parseNotes } from "@/lib/import/parser";
import { flagDuplicates, flagRepeats, NO_EXISTING } from "@/lib/import/duplicates";
import { repeatKey, verifyItem } from "@/lib/import/verify";
import { hintFor, personalExample } from "@/lib/import/hints";

const TODAY = "2026-11-09";
const habits = [{ id: "h1", name: "Meditate" }, { id: "h2", name: "No sugar" }];
const items = (text: string, units: "imperial" | "metric" = "imperial") =>
  normalizeEntries(parseNotes(text, { today: TODAY, units, habits: habits.map((h) => h.name), goals: [] }).entries, { today: TODAY, units, habits, goals: [] });
const health = (text: string) => items(text).find((i) => i.kind === "health") as Extract<ReviewItem, { kind: "health" }>;
const ctx = { today: TODAY, units: "imperial" as const };

describe("verification", () => {
  it("flags sleep given in minutes and offers hours", () => {
    const h = health("yesterday: slept 7h");
    const it0 = { ...h, data: { ...h.data, sleepHours: 450 } };
    const issues = verifyItem(it0, ctx);
    expect(issues[0].field).toBe("sleep_hours");
    expect(issues[0].blocking).toBe(true);
    expect(issues[0].fix?.data).toEqual({ sleepHours: 7.5 });
  });

  it("leaves a normal day alone", () => {
    expect(verifyItem(health("yesterday: slept 7h, weight 171"), { ...ctx, lastWeight: { kg: 172 * 0.45359237, date: "2026-11-05" } })).toEqual([]);
  });

  it("catches a weight read in the wrong unit", () => {
    const h = health("yesterday: weight 78"); // 78 lb, but they meant kg
    const issues = verifyItem(h, { ...ctx, lastWeight: { kg: 78.4, date: "2026-11-06" } });
    expect(issues[0].field).toBe("weight");
    expect(issues[0].fix?.data?.weightKg).toBeCloseTo(78, 0);
  });

  it("flags a big weight jump without guessing when no unit explains it", () => {
    const issues = verifyItem(health("yesterday: weight 190"), { ...ctx, lastWeight: { kg: 172 * 0.45359237, date: "2026-11-06" } });
    expect(issues).toHaveLength(1);
    expect(issues[0].fix).toBeUndefined();
  });

  it("blocks future dates with a one-tap fix", () => {
    const h = { ...health("slept 7h"), date: "2026-11-12" };
    const [issue] = verifyItem(h, ctx);
    expect(issue).toMatchObject({ field: "date", blocking: true, fix: { date: TODAY } });
  });

  it("reports same-day conflicts instead of dropping them silently", () => {
    const h = health("Mon: weight 170\nMon: weight 175");
    expect(h.conflicts?.[0]?.field).toBe("weightKg");
    const issues = verifyItem(h, ctx);
    expect(issues.some((x) => x.field === "weight" && x.fix)).toBe(true);
  });

  it("flags very long workouts", () => {
    const w = items("yesterday: ran 400 min").find((i) => i.kind === "workout")!;
    expect(verifyItem(w, ctx).some((x) => x.field === "duration")).toBe(true);
  });
});

describe("repeats within one paste", () => {
  it("keeps the first and skips the repeat", () => {
    const list = items("Mon: meditated ✅\nMon: meditated ✅").filter((i) => i.kind === "habit");
    const flagged = flagRepeats(flagDuplicates(list, NO_EXISTING, "imperial"), repeatKey);
    expect(flagged.map((i) => i.decision)).toEqual(["add", "skip"]);
  });

  it("gives every item a key that survives edits elsewhere in the note", () => {
    const a = items("Mon: slept 7h, meditated ✅").map((i) => i.key);
    const b = items("Sun: slept 8h\nMon: slept 7h, meditated ✅").map((i) => i.key);
    for (const k of a) expect(b).toContain(k);
  });
});

describe("hints", () => {
  it("suggests a phrasing that the parser itself reads", () => {
    for (const t of ["sleep was bad", "drank a bunch of water", "weighed in", "went for a jog", "gym day", "ate a big lunch", "lots of steps", "felt anxious"]) {
      const hint = hintFor(t, "imperial")!;
      expect(parseNotes(`Mon - ${hint}`, { today: TODAY, units: "imperial", habits: [], goals: [] }).entries.length, `${t} -> ${hint}`).toBeGreaterThan(0);
    }
  });

  it("builds the example from the user's own habits", () => {
    const ex = personalExample(["Meditate", "No sugar"], [{ name: "Read books", unit: "pages" }], "imperial");
    expect(ex).toContain("meditate ✅");
    expect(ex).toContain("read books +1");
    const parsed = parseNotes(ex, { today: TODAY, units: "imperial", habits: ["Meditate", "No sugar"], goals: [{ title: "Read books", unit: "pages" }] });
    expect(parsed.entries.some((e) => e.kind === "habit")).toBe(true);
  });
});

describe("hints for unrelated text", () => {
  it("stays quiet when a line isn't about anything tracked", () => {
    expect(hintFor("bluetooth headphones broke", "imperial")).toBeNull();
  });
});

describe("meals without 'ate'", () => {
  it("reads 'turkey wrap 480 cal for lunch' as a meal", () => {
    const e = parseNotes("Sun: slept 7h, turkey wrap 480 cal for lunch", { today: TODAY, units: "imperial", habits: [], goals: [] }).entries;
    expect(e.find((x) => x.kind === "meal")).toMatchObject({ slot: "lunch", calories: 480 });
    expect(e.some((x) => x.kind === "journal")).toBe(false);
  });
});
