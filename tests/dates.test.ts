import { describe, expect, it } from "vitest";
import { addDays, isDateStr, pickEntryDate, resolveRelativeDate, startOfWeek, todayInTz } from "@/lib/dates";

// 2026-11-07 is a Saturday.
const TODAY = "2026-11-07";

describe("todayInTz", () => {
  const instant = new Date("2026-11-08T03:30:00Z");
  it("uses the user's timezone, not UTC", () => {
    expect(todayInTz("UTC", instant)).toBe("2026-11-08");
    expect(todayInTz("America/New_York", instant)).toBe("2026-11-07");
    expect(todayInTz("America/Los_Angeles", instant)).toBe("2026-11-07");
    expect(todayInTz("Asia/Tokyo", instant)).toBe("2026-11-08");
  });
  it("falls back to UTC for an invalid timezone", () => {
    expect(todayInTz("Not/AZone", instant)).toBe("2026-11-08");
  });
});

describe("date arithmetic", () => {
  it("adds days across month/year/DST boundaries", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09"); // US DST start
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
  });
  it("finds Monday as start of week", () => {
    expect(startOfWeek(TODAY)).toBe("2026-11-02");
    expect(startOfWeek("2026-11-02")).toBe("2026-11-02");
    expect(startOfWeek("2026-11-08")).toBe("2026-11-02"); // Sunday
  });
  it("validates ISO dates", () => {
    expect(isDateStr("2026-02-30")).toBe(false);
    expect(isDateStr("2026-2-3")).toBe(false);
    expect(isDateStr("2026-02-03")).toBe(true);
  });
});

describe("resolveRelativeDate", () => {
  const cases: [string, string | null][] = [
    ["today", "2026-11-07"],
    ["Today.", "2026-11-07"],
    ["tonight", "2026-11-07"],
    ["yesterday", "2026-11-06"],
    ["last night", "2026-11-06"],
    ["day before yesterday", "2026-11-05"],
    ["3 days ago", "2026-11-04"],
    ["two days ago", "2026-11-05"],
    ["a week ago", "2026-10-31"],
    // weekdays → most recent on or before today
    ["Mon", "2026-11-02"],
    ["monday", "2026-11-02"],
    ["Tues", "2026-11-03"],
    ["Tue:", "2026-11-03"],
    ["Wed", "2026-11-04"],
    ["thurs", "2026-11-05"],
    ["Fri", "2026-11-06"],
    ["Sat", "2026-11-07"], // today is Saturday
    ["Sun", "2026-11-01"],
    ["last saturday", "2026-10-31"],
    ["last friday", "2026-11-06"],
    ["on Monday", "2026-11-02"],
    ["next monday", "2026-11-09"],
    // numeric
    ["11/3", "2026-11-03"],
    ["11/03/2026", "2026-11-03"],
    ["11/3/26", "2026-11-03"],
    ["12/25", "2025-12-25"], // no year + would be in the future → last year
    ["25/12", "2025-12-25"], // D/M when first part > 12
    ["2026-10-15", "2026-10-15"],
    // month names
    ["Nov 3", "2026-11-03"],
    ["November 3rd", "2026-11-03"],
    ["3 Nov", "2026-11-03"],
    ["Dec 1", "2025-12-01"],
    ["Oct 5, 2025", "2025-10-05"],
    // unresolvable
    ["sometime", null],
    ["", null],
    ["2/30", null],
  ];
  it.each(cases)("%s → %s", (input, expected) => {
    expect(resolveRelativeDate(input, TODAY)).toBe(expected);
  });

  it("handles a Monday 'today' for weekday names", () => {
    expect(resolveRelativeDate("Mon", "2026-11-09")).toBe("2026-11-09");
    expect(resolveRelativeDate("last mon", "2026-11-09")).toBe("2026-11-02");
    expect(resolveRelativeDate("Sun", "2026-11-09")).toBe("2026-11-08");
  });

  it("handles year boundaries", () => {
    expect(resolveRelativeDate("yesterday", "2027-01-01")).toBe("2026-12-31");
    expect(resolveRelativeDate("Dec 30", "2027-01-02")).toBe("2026-12-30");
  });
});

describe("pickEntryDate", () => {
  it("prefers deterministic resolution of the raw text over the model's date", () => {
    expect(pickEntryDate("Mon", "2026-11-09", TODAY)).toEqual({ date: "2026-11-02", resolvedBy: "text" });
  });
  it("falls back to the model's date when the text is unparseable", () => {
    expect(pickEntryDate("the morning after the party", "2026-11-01", TODAY)).toEqual({ date: "2026-11-01", resolvedBy: "model" });
  });
  it("rejects far-future model dates and defaults to today", () => {
    expect(pickEntryDate(null, "2027-05-01", TODAY)).toEqual({ date: TODAY, resolvedBy: "default" });
    expect(pickEntryDate(null, "not a date", TODAY)).toEqual({ date: TODAY, resolvedBy: "default" });
  });
});
