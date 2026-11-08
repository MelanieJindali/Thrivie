import { describe, expect, it } from "vitest";
import { buildImportUserMessage, extractJson, parseImportResponse } from "@/lib/import/schema";
import { matchByName, normalizeEntries } from "@/lib/import/normalize";

const TODAY = "2026-11-07"; // Saturday

// A realistic model response for the example in the spec.
const SAMPLE = {
  entries: [
    { kind: "health", date_text: "Mon", date: "2026-11-02", confidence: 0.9, sleep_hours: 6, energy: 2, weight: { value: 172, unit: null }, field_confidence: { weight: 0.6 }, source_text: "weight 172" },
    { kind: "workout", date_text: "Mon", date: "2026-11-02", confidence: 0.95, type: "cardio", title: "Run", duration_min: 28, distance: { value: 5, unit: "km" }, exercises: [] },
    { kind: "workout", date_text: "Mon", date: "2026-11-02", confidence: 0.85, type: "strength", title: "Push-ups", duration_min: null, exercises: [{ name: "Push-ups", sets: 3, reps: 15, weight: null }] },
    { kind: "habit", date_text: "Mon", date: "2026-11-02", confidence: 0.9, habit_name: "No sugar", matched_habit: "No sugar", completed: true },
    { kind: "habit", date_text: "Mon", date: "2026-11-02", confidence: 0.9, habit_name: "Meditated", matched_habit: null, completed: true },
    { kind: "health", date_text: "Tues", date: "2026-11-03", confidence: 0.9, sleep_hours: 8 },
    { kind: "habit", date_text: "Tues", date: "2026-11-03", confidence: 0.8, habit_name: "Journaling", matched_habit: null, completed: true },
    { kind: "journal", date_text: "Tues", date: "2026-11-03", confidence: 0.7, content: "Journaled about work stress.", mood: null },
  ],
  unparsed: [],
};

const HABITS = [
  { id: "h1", name: "Meditate" },
  { id: "h2", name: "No sugar" },
  { id: "h3", name: "Read 20 min" },
];

describe("extractJson", () => {
  it("strips code fences and surrounding prose", () => {
    expect(extractJson('Here you go:\n```json\n{"entries": []}\n```\nThanks')).toBe('{"entries": []}');
    expect(extractJson('Sure! {"entries": [1]} done')).toBe('{"entries": [1]}');
  });
  it("returns null when there's no object", () => {
    expect(extractJson("I couldn't find anything")).toBeNull();
  });
});

describe("parseImportResponse", () => {
  it("parses a valid response", () => {
    const r = parseImportResponse(JSON.stringify(SAMPLE));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.entries).toHaveLength(8);
      expect(r.dropped).toBe(0);
    }
  });

  it("reports invalid JSON with a clear error", () => {
    const r = parseImportResponse('{"entries": [ {"kind": "health", }');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/JSON/);
  });

  it("reports a response with no JSON at all", () => {
    const r = parseImportResponse("Sorry, I can't help with that.");
    expect(r).toMatchObject({ ok: false });
  });

  it("rejects a response missing the entries array", () => {
    const r = parseImportResponse('{"items": []}');
    expect(r.ok).toBe(false);
  });

  it("drops individual invalid entries but keeps valid ones", () => {
    const r = parseImportResponse(JSON.stringify({
      entries: [
        { kind: "journal", date: TODAY, confidence: 0.9, content: "ok" },
        { kind: "journal", date: TODAY, confidence: 0.9 }, // missing content
        { kind: "spaceship", date: TODAY }, // unknown kind
      ],
    }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.entries).toHaveLength(1);
      expect(r.dropped).toBe(2);
    }
  });

  it("fails when every entry is invalid", () => {
    const r = parseImportResponse(JSON.stringify({ entries: [{ kind: "nope" }] }));
    expect(r.ok).toBe(false);
  });

  it("coerces numeric strings, percent confidences and out-of-range ratings", () => {
    const r = parseImportResponse(JSON.stringify({
      entries: [{ kind: "health", date: TODAY, confidence: "85", steps: "10,500", mood: 7, sleep_hours: "7.5" }],
    }));
    expect(r.ok).toBe(true);
    if (r.ok && r.entries[0].kind === "health") {
      expect(r.entries[0].confidence).toBeCloseTo(0.85);
      expect(r.entries[0].steps).toBe(10500);
      expect(r.entries[0].mood).toBe(5);
      expect(r.entries[0].sleep_hours).toBe(7.5);
    }
  });

  it("maps unknown workout types to 'other' and accepts a bare array", () => {
    const r = parseImportResponse(JSON.stringify([{ kind: "workout", date: TODAY, confidence: 1, type: "Pilates", duration_min: 40 }]));
    expect(r.ok).toBe(true);
    if (r.ok && r.entries[0].kind === "workout") expect(r.entries[0].type).toBe("other");
  });
});

describe("matchByName", () => {
  it("matches exact, hinted, stemmed and partial names", () => {
    expect(matchByName("No sugar", HABITS)).toBe("h2");
    expect(matchByName("something", HABITS, "Meditate")).toBe("h1");
    expect(matchByName("meditated", HABITS)).toBe("h1");
    expect(matchByName("reading", HABITS)).toBe("h3");
    expect(matchByName("no-sugar ✅", HABITS)).toBe("h2");
  });
  it("returns null for unrelated habits", () => {
    expect(matchByName("Journaling", HABITS)).toBeNull();
    expect(matchByName("Cold shower", HABITS)).toBeNull();
    expect(matchByName("x", [])).toBeNull();
  });
});

describe("normalizeEntries", () => {
  const r = parseImportResponse(JSON.stringify(SAMPLE));
  if (!r.ok) throw new Error("sample failed to parse");
  const items = normalizeEntries(r.entries, { today: TODAY, units: "imperial", habits: HABITS, goals: [] });

  it("resolves weekday dates against today", () => {
    expect(new Set(items.map((i) => i.date))).toEqual(new Set(["2026-11-02", "2026-11-03"]));
  });

  it("treats a bare weight as the user's units (lb) and stores kg", () => {
    const h = items.find((i) => i.kind === "health" && i.date === "2026-11-02");
    expect(h?.kind).toBe("health");
    if (h?.kind === "health") {
      expect(h.data.weightKg).toBeCloseTo(78.02, 1);
      expect(h.data.sleepHours).toBe(6);
      expect(h.lowFields).toContain("weight");
    }
  });

  it("converts distance and computes pace", () => {
    const w = items.find((i) => i.kind === "workout" && i.data.type === "cardio");
    if (w?.kind !== "workout") throw new Error("missing workout");
    expect(w.data.distanceKm).toBe(5);
    expect(w.data.durationMin).toBe(28);
    expect(w.data.paceMinKm).toBeCloseTo(5.6);
  });

  it("defaults a missing workout duration and flags it", () => {
    const w = items.find((i) => i.kind === "workout" && i.data.type === "strength");
    if (w?.kind !== "workout") throw new Error("missing workout");
    expect(w.data.durationMin).toBe(30);
    expect(w.lowFields).toContain("duration");
    expect(w.data.exercises[0]).toMatchObject({ name: "Push-ups", sets: 3, reps: 15 });
  });

  it("matches known habits and leaves unknown ones as new-habit suggestions", () => {
    const habits = items.filter((i) => i.kind === "habit");
    const byName = Object.fromEntries(habits.map((h) => [h.kind === "habit" ? h.data.habitName : "", h.kind === "habit" ? h.data.habitId : null]));
    expect(byName["No sugar"]).toBe("h2");
    expect(byName["Meditated"]).toBe("h1");
    expect(byName["Journaling"]).toBeNull();
  });

  it("merges multiple health entries for the same day", () => {
    const res = parseImportResponse(JSON.stringify({ entries: [
      { kind: "health", date: TODAY, confidence: 0.9, sleep_hours: 7 },
      { kind: "health", date: TODAY, confidence: 0.6, steps: 9000, custom: [{ name: "Resting HR", value: 58 }] },
    ] }));
    if (!res.ok) throw new Error();
    const out = normalizeEntries(res.entries, { today: TODAY, units: "metric", habits: [], goals: [] });
    expect(out).toHaveLength(1);
    if (out[0].kind !== "health") throw new Error();
    expect(out[0].data).toMatchObject({ sleepHours: 7, steps: 9000, custom: { "Resting HR": 58 } });
    expect(out[0].confidence).toBe(0.6);
  });

  it("drops explicitly missed habits and empty health entries", () => {
    const res = parseImportResponse(JSON.stringify({ entries: [
      { kind: "habit", date: TODAY, confidence: 0.9, habit_name: "Meditate", completed: false },
      { kind: "health", date: TODAY, confidence: 0.9 },
    ] }));
    if (!res.ok) throw new Error();
    expect(normalizeEntries(res.entries, { today: TODAY, units: "metric", habits: HABITS, goals: [] })).toHaveLength(0);
  });

  it("converts miles and per-mile pace for imperial users", () => {
    const res = parseImportResponse(JSON.stringify({ entries: [
      { kind: "workout", date: TODAY, confidence: 0.9, type: "cardio", distance: { value: 3, unit: "mi" }, pace_min_per_unit: 9 },
    ] }));
    if (!res.ok) throw new Error();
    const [w] = normalizeEntries(res.entries, { today: TODAY, units: "imperial", habits: [], goals: [] });
    if (w.kind !== "workout") throw new Error();
    expect(w.data.distanceKm).toBeCloseTo(4.83, 2);
    expect(w.data.durationMin).toBe(27);
    expect(w.data.paceMinKm).toBeCloseTo(5.59, 2);
  });
});

describe("buildImportUserMessage", () => {
  it("includes today, weekday, timezone, habits and goals", () => {
    const msg = buildImportUserMessage({ text: "ran 5k", today: TODAY, timezone: "America/New_York", habits: ["Meditate"], goals: [{ title: "Read 6 books", unit: "books" }] });
    expect(msg).toContain("TODAY: 2026-11-07 (Saturday)");
    expect(msg).toContain("America/New_York");
    expect(msg).toContain('["Meditate"]');
    expect(msg).toContain("ran 5k");
  });
});
