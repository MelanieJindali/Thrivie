// Smart Import, Layer 1 pre-pass: makes free-form notes easier to read without
// changing their meaning. Pure, deterministic and on-device.
//
// - strips list bullets ("- ", "• ", "* ", "1. ")
// - fixes common typos and shorthand for the words the extractors look for
//   ("slp" -> "slept", "excercise" -> "exercise", "H2O" -> "water"), plus a
//   one-typo fuzzy match against a short keyword list
// - turns spoken numbers into digits ("5 and a half hours" -> "5.5 hours",
//   "6 1/2 hrs" -> "6.5 hrs", "an hour" -> "1 hour", "two miles" -> "2 miles")
// - joins hour+minute durations ("7h 15m" -> "7.25h", "1h15" -> "1.25h")

/** Exact shorthand and frequent misspellings (whole words, case-insensitive). */
const SHORTHAND: Record<string, string> = {
  slp: "slept", slpt: "slept", slpet: "slept", sleeped: "slept", sleept: "slept", slep: "slept", sleeep: "sleep", sleap: "sleep",
  excercise: "exercise", excersize: "exercise", exersize: "exercise", exercize: "exercise", excercize: "exercise", excersise: "exercise", exercise: "exercise", workedout: "worked out",
  wieght: "weight", weigth: "weight", wieghed: "weighed", weighted: "weighed", wt: "weight",
  yestrday: "yesterday", yesterdy: "yesterday", ystrday: "yesterday", yesteday: "yesterday", yesturday: "yesterday", yday: "yesterday", ytd: "yesterday",
  tdy: "today", tday: "today", tonite: "tonight",
  h2o: "water", watr: "water", wtr: "water",
  stps: "steps", setps: "steps",
  medidated: "meditated", meditaded: "meditated", meditatated: "meditated", strethced: "stretched", stretchd: "stretched",
  mins: "min", minuts: "minutes", minuites: "minutes", hrs: "hrs", hr: "hr",
  didnt: "didn't", wasnt: "wasn't", couldnt: "couldn't", dont: "don't",
};

/** Words worth catching with a one-letter typo (only words of 6+ letters, to avoid false hits). */
const KEYWORDS = ["yesterday", "exercise", "weight", "weighed", "stretched", "meditated", "meditation", "breakfast", "dinner", "workout", "minutes", "slept", "walked", "journaled", "steps"];
/** Real words that happen to be one edit away from a keyword. */
const NOT_TYPOS = new Set(["height", "weights", "eight", "dinners", "minute", "stretches", "workouts", "slepts", "sleeps", "walker", "walks", "weighs", "stepped"]);

/** Damerau-Levenshtein distance, capped at 2 (we only care about 0, 1 or "more"). */
export function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return Math.min(2, d[a.length][b.length]);
}

/** The canonical keyword for a likely typo, or null. */
export function fixTypo(word: string): string | null {
  const w = word.toLowerCase();
  if (SHORTHAND[w]) return SHORTHAND[w];
  if (w.length < 6 || NOT_TYPOS.has(w) || KEYWORDS.includes(w)) return null;
  for (const k of KEYWORDS) if (k.length >= 5 && editDistance(w, k) === 1) return k;
  return null;
}

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, ninety: 90 };
const UNIT = "(?:h|hr|hrs|hours?|min|minutes?|mi|miles?|km|k|glasses|cups?|bottles?|times|sets|reps|laps|lbs?|pounds|kg|oz)";

export function cleanText(input: string): string {
  let t = input.replace(/\r\n?/g, "\n");
  // Bullets at the start of a line (keep the line itself).
  t = t.replace(/^[ \t]*(?:[-*•·▪◦‣>]+|\d{1,2}[.)])[ \t]+/gm, "");
  // Spoken numbers.
  t = t.replace(/\b(\d+)\s+and\s+(?:a\s+)?half\b/gi, (_, n) => `${n}.5`);
  t = t.replace(/\b(\d+)\s+1\/2\b/g, (_, n) => `${n}.5`);
  t = t.replace(/\b(\d+)\s*½/g, (_, n) => `${n}.5`);
  t = t.replace(/\bhalf\s+an?\s+hour\b/gi, "30 min");
  t = t.replace(/\b(?:an|a|one)\s+hour\b/gi, "1 hour");
  t = t.replace(/\ban?\s+hour\s+and\s+(?:a\s+)?half\b/gi, "1.5 hours");
  t = t.replace(new RegExp(`\\b(${Object.keys(NUMBER_WORDS).join("|")})(?=\\s+${UNIT}\\b)`, "gi"), (w) => String(NUMBER_WORDS[w.toLowerCase()]));
  // Hours + minutes into decimal hours: "7h 15m", "7h45m", "1h15", "8 hrs 30 min".
  t = t.replace(/\b(\d{1,2})\s*(?:h|hr|hrs|hours?)\s*(\d{1,2})\s*(?:m|min|mins|minutes)?\b(?!\s*(?:mi|miles?)\b)/gi, (all, h, m) => {
    if (Number(m) > 59) return all;
    const v = Number(h) + Number(m) / 60;
    return `${Math.round(v * 100) / 100}h`;
  });
  t = t.replace(/\bh2o\b/gi, "water");
  // Shorthand and typos, word by word (letters only, keeps punctuation and emoji).
  t = t.replace(/[A-Za-z][A-Za-z']*/g, (w) => {
    const fixed = fixTypo(w);
    if (!fixed) return w;
    return w === w.toUpperCase() && w.length > 1 ? fixed.toUpperCase() : fixed;
  });
  return t;
}
