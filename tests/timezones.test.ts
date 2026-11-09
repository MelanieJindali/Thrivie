import { describe, expect, it } from "vitest";
import { CURATED_ZONES, formatOffset, getCuratedGroups, getOffsetMinutes, getTimeZoneLabel, getTimeZoneOption, normalizeQuery, regionFromId, searchTimeZones } from "@/lib/timezones";

const JAN = new Date("2026-01-15T12:00:00Z");
const JUL = new Date("2026-07-15T12:00:00Z");

describe("offsets and labels", () => {
  it("formats offsets with a true minus sign and half hours", () => {
    expect(formatOffset(0)).toBe("UTC");
    expect(formatOffset(-300)).toBe("UTC−5");
    expect(formatOffset(330)).toBe("UTC+5:30");
    expect(formatOffset(345)).toBe("UTC+5:45");
  });
  it("includes daylight saving time", () => {
    expect(getOffsetMinutes("America/New_York", JAN)).toBe(-300);
    expect(getOffsetMinutes("America/New_York", JUL)).toBe(-240);
    expect(getOffsetMinutes("Australia/Sydney", JAN)).toBe(660); // southern summer
    expect(getOffsetMinutes("Asia/Kolkata", JUL)).toBe(330);
  });
  it("builds friendly labels", () => {
    expect(getTimeZoneLabel("America/New_York", JAN)).toBe("Eastern Time (New York) · UTC−5");
    expect(getTimeZoneLabel("America/New_York", JUL)).toBe("Eastern Time (New York) · UTC−4");
    expect(getTimeZoneLabel("Asia/Kolkata", JAN)).toBe("India Standard Time · UTC+5:30"); // no "(India)" repeat
    expect(getTimeZoneLabel("Not/AZone")).toBe("Not/AZone");
  });
});

describe("curated list", () => {
  it("is short and grouped by region, west to east", () => {
    expect(CURATED_ZONES.length).toBeGreaterThanOrEqual(22);
    expect(CURATED_ZONES.length).toBeLessThanOrEqual(30);
    const groups = getCuratedGroups(JAN);
    expect(groups.map((g) => g.region)).toEqual(["North America", "South America", "Europe", "Africa", "Asia", "Oceania"]);
    for (const g of groups) expect(g.options.map((o) => o.offsetMinutes)).toEqual([...g.options.map((o) => o.offsetMinutes)].sort((a, b) => a - b));
  });
  it("always includes the user's own zone, in the right region", () => {
    const lima = getCuratedGroups(JAN, "America/Lima").find((g) => g.region === "South America")!;
    expect(lima.options.some((o) => o.id === "America/Lima")).toBe(true);
    expect(regionFromId("America/Santiago")).toBe("South America");
    expect(regionFromId("America/Toronto")).toBe("North America");
    expect(regionFromId("Europe/Oslo")).toBe("Europe");
  });
});

describe("search", () => {
  it("finds zones by city, country, abbreviation and zone name", () => {
    expect(searchTimeZones("tokyo", JAN)[0].id).toBe("Asia/Tokyo");
    expect(searchTimeZones("japan", JAN)[0].id).toBe("Asia/Tokyo");
    expect(searchTimeZones("india", JAN)[0].id).toBe("Asia/Kolkata");
    expect(searchTimeZones("est", JAN)[0].id).toBe("America/New_York");
    expect(searchTimeZones("pacific", JAN).some((o) => o.id === "America/Los_Angeles")).toBe(true);
  });
  it("reaches zones outside the curated list", () => {
    expect(searchTimeZones("reykjavik", JAN)[0].id).toBe("Atlantic/Reykjavik");
    expect(searchTimeZones("kathmandu", JAN)[0].offsetLabel).toBe("UTC+5:45");
  });
  it("ignores accents and case, and returns nothing for an empty query", () => {
    expect(normalizeQuery("São_Paulo")).toBe("sao paulo");
    expect(searchTimeZones("SÃO PAULO", JAN)[0].id).toBe("America/Sao_Paulo");
    expect(searchTimeZones("  ", JAN)).toEqual([]);
  });
  it("merges zones with identical rules and respects the limit", () => {
    const eastern = searchTimeZones("eastern", JAN, 50);
    const keys = eastern.map((o) => `${o.name}|${o.offsetMinutes}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(searchTimeZones("a", JAN, 5)).toHaveLength(5);
  });
  it("keeps one cached option per zone across daylight saving", () => {
    expect(getTimeZoneOption("Europe/London", JAN).offsetLabel).toBe("UTC");
    expect(getTimeZoneOption("Europe/London", JUL).offsetLabel).toBe("UTC+1");
  });
});
