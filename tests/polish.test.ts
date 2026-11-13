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
  it("keeps quoted goal names word for word", () => {
    const o = "0 of 1 goals are on track; “Do Zumba 100 times” could use a little attention.";
    expect(acceptRewrite(o, "0 of 1 goals are on track, and “Do Zumba 100 times” could use some love.")).not.toBeNull();
    expect(acceptRewrite(o, "0 of 1 goals are on track, and your Zumba goal could use some love.")).toBeNull();
  });
  it("rejects weight, food and medical language that wasn't there", () => {
    expect(acceptRewrite("You slept 8 hours.", "You slept 8 hours, so watch your weight.")).toBeNull();
    expect(acceptRewrite("Your weight is 172.", "Your weight is steady at 172 today.")).not.toBeNull();
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
