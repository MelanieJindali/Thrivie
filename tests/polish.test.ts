import { describe, expect, it } from "vitest";
import { acceptRewrite, numbersIn, splitSentences } from "@/lib/import/polish";

const BRIEF = "You slept 8 hours, did 2 workouts (20 minutes) and checked off 4 habits yesterday. Your nighttime skincare streak (2 days) is waiting for today's check-in. 0 of 1 goals are on track; “Do Zumba 100 times” could use a little attention. Make some room for rest this Thursday too.";

describe("brief rewrite safety", () => {
  it("splits sentences without cutting decimals or quotes", () => {
    const s = splitSentences(BRIEF);
    expect(s).toHaveLength(4);
    expect(s[2]).toContain("“Do Zumba 100 times”");
    expect(splitSentences("You slept 7.5 hours. Nice work!")).toEqual(["You slept 7.5 hours.", "Nice work!"]);
    expect(splitSentences("No ending")).toEqual(["No ending"]);
  });
  it("treats number words as the same numbers", () => {
    expect(numbersIn("two workouts and 20 minutes")).toBe(numbersIn("2 workouts and 20 minutes"));
    expect(numbersIn("three")).not.toBe(numbersIn("4"));
  });
  it("accepts a warm rewrite that keeps every number", () => {
    expect(acceptRewrite("You slept 8 hours and did 2 workouts.", "Eight hours of sleep and 2 workouts, a great start.")).not.toBeNull(); // number words count
    expect(acceptRewrite("You slept 8 hours and did 2 workouts.", "You rested for 8 hours and fit in two workouts.")).toBe("You rested for 8 hours and fit in two workouts.");
  });
  it("rejects changed, added or dropped numbers", () => {
    expect(acceptRewrite("You slept 8 hours.", "You slept 9 hours.")).toBeNull();
    expect(acceptRewrite("You slept 8 hours.", "You slept 8 hours and walked 3 miles.")).toBeNull();
    expect(acceptRewrite("0 of 1 goals are on track.", "Your goals are on track.")).toBeNull();
  });
  it("keeps day words: yesterday stays yesterday", () => {
    expect(acceptRewrite("A fresh start today; yesterday stayed off the log.", "A fresh start today, and tomorrow stays off the log.")).toBeNull();
    expect(acceptRewrite("A fresh start today; yesterday stayed off the log.", "Today is a fresh start, even though yesterday stayed off the log.")).not.toBeNull();
    expect(acceptRewrite("Enjoy your Friday.", "Have a lovely Saturday.")).toBeNull();
  });
  it("keeps quoted goal names word for word", () => {
    const o = "0 of 1 goals are on track; “Do Zumba 100 times” could use a little attention.";
    expect(acceptRewrite(o, "0 of 1 goals are on track, and “Do Zumba 100 times” could use some love.")).not.toBeNull();
    expect(acceptRewrite(o, "0 of 1 goals are on track, and your Zumba goal could use some love.")).toBeNull();
  });
  it("rejects weight, food and medical language that wasn't there", () => {
    expect(acceptRewrite("You slept 8 hours.", "You slept 8 hours, so watch your weight.")).toBeNull();
    expect(acceptRewrite("Your weight is 172.", "Your weight is a steady 172.")).not.toBeNull();
  });
  it("rejects empty, cut-off, runaway and unchanged output", () => {
    expect(acceptRewrite("You slept 8 hours.", "")).toBeNull();
    expect(acceptRewrite("You slept 8 hours.", "You slept 8 hours and")).toBeNull();
    expect(acceptRewrite("You slept 8 hours.", "You slept 8 hours. ".repeat(20))).toBeNull();
    expect(acceptRewrite("You slept 8 hours.", "You slept 8 hours.")).toBeNull();
  });
  it("takes the first line and drops wrapping quotes", () => {
    expect(acceptRewrite("You slept 8 hours.", "“You got a solid 8 hours of sleep.”\nLet me know if you want more!")).toBe("You got a solid 8 hours of sleep.");
  });
});

import { acceptEnhance } from "@/lib/import/polish";
import { isConstrainedDevice, MODELS, pickModel, startingModel } from "@/services/localAi";

describe("enhance note line", () => {
  it("takes one clean line and drops a date the model added", () => {
    expect(acceptEnhance("had the usual big bowl", "1/2/26 - breakfast: oatmeal (~300 cal)\nThis is an estimate.")).toBe("breakfast: oatmeal (~300 cal)");
    expect(acceptEnhance("two laps around the park", "\"walked 30 min\"")).toBe("walked 30 min");
  });
  it("rejects chatter, echoes and runaway text", () => {
    expect(acceptEnhance("ate stuff", "Sure! Here is the entry.")).toBeNull();
    expect(acceptEnhance("ran 3 miles", "ran 3 miles")).toBeNull();
    expect(acceptEnhance("x", "a".repeat(200))).toBeNull();
  });
});

describe("device detection", () => {
  it("treats phones, tablets and low-memory devices as constrained", () => {
    expect(isConstrainedDevice({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148" })).toBe(true);
    expect(isConstrainedDevice({ userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36" })).toBe(true);
    expect(isConstrainedDevice({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15", maxTouchPoints: 5 })).toBe(true); // iPadOS
    expect(isConstrainedDevice({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140", deviceMemory: 4 })).toBe(true);
    expect(isConstrainedDevice({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15", maxTouchPoints: 0, deviceMemory: 8 })).toBe(false);
  });
});

import { parseNotes } from "@/lib/import/parser";
import { ENHANCE_EXAMPLES } from "@/lib/import/polish";

describe("Enhance examples", () => {
  it("are all lines the note reader understands", () => {
    for (const e of ENHANCE_EXAMPLES) {
      const r = parseNotes(`Mon - ${e.output}`, { today: "2026-11-13", units: "imperial", habits: [], goals: [], aliases: [], personal: {} } as never);
      expect(r.entries.length, e.output).toBeGreaterThan(0);
      expect(r.unparsed, e.output).toEqual([]);
    }
  });
});

describe("model choice", () => {
  const iphone = { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) Mobile/15E148" };
  const ipad = { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15", maxTouchPoints: 5 };
  const bigAndroid = { userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 9) Mobile Safari/537.36", deviceMemory: 8 };
  const smallAndroid = { userAgent: "Mozilla/5.0 (Linux; Android 12) Mobile Safari/537.36", deviceMemory: 4 };
  const desktop = { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140", deviceMemory: 8 };
  it("starts iPhone, iPad and low-memory devices on the smallest model", () => {
    expect(startingModel(iphone)).toBe(MODELS.tiny);
    expect(startingModel(ipad)).toBe(MODELS.tiny);
    expect(startingModel(smallAndroid)).toBe(MODELS.tiny);
    expect(startingModel({ userAgent: "Mozilla/5.0 (Linux; Android 14) Mobile" })).toBe(MODELS.tiny); // memory unknown
    expect(startingModel(bigAndroid)).toBe(MODELS.mobile);
    expect(startingModel(desktop)).toBe(MODELS.desktop);
  });
  it("steps down after a model closed the tab, and gives up after the smallest", () => {
    expect(pickModel(desktop, [MODELS.desktop.id])).toBe(MODELS.mobile);
    expect(pickModel(desktop, [MODELS.desktop.id, MODELS.mobile.id])).toBe(MODELS.tiny);
    expect(pickModel(bigAndroid, [MODELS.mobile.id])).toBe(MODELS.tiny);
    expect(pickModel(iphone, [MODELS.tiny.id])).toBeNull();
    expect(pickModel(iphone, [MODELS.desktop.id])).toBe(MODELS.tiny); // unrelated crash
  });
  it("keeps phone downloads small", () => {
    expect(Math.max(MODELS.tiny.gpu.mb, MODELS.tiny.cpu.mb)).toBeLessThan(150);
  });
});
