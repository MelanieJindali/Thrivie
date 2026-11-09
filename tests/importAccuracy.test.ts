import { describe, expect, it } from "vitest";
import { NOTES } from "./fixtures/notes";
import { DEV2 } from "./fixtures/dev2";
import { HELDOUT } from "./fixtures/heldout";
import { report, score } from "./fixtures/score";

// Smart Import accuracy (Layers 1-2, no AI). Development sets may be used for tuning;
// the held-out set never is. Per-field numbers are printed on every run.
const FLOORS = { tuning: 0.85, dev2: 0.5, heldout: 0.5 };

describe("Smart Import accuracy, per field", () => {
  it("covers at least 75 notes", () => expect(NOTES.length + DEV2.length + HELDOUT.length).toBeGreaterThanOrEqual(75));
  for (const [name, set, floor] of [["Tuning set", NOTES, FLOORS.tuning], ["Development set 2", DEV2, FLOORS.dev2], ["Held-out set", HELDOUT, FLOORS.heldout]] as const) {
    it(`${name} (${set.length} notes)`, () => {
      const s = score(set);
      console.log(report(`${name} (${set.length} notes)`, s));
      expect(s.pct).toBeGreaterThanOrEqual(floor);
    });
  }
});
