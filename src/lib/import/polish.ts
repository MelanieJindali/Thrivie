// Prompts and safety checks for the optional on-device AI (daily brief rewrite, Smart Import
// "Enhance"). Pure, so it is easy to test. The model's words are never trusted as they come:
// a brief rewrite is shown only if it invents no numbers and adds no weight, food or medical
// language, and an enhanced note is used only if it is one clean line.

const WORD_NUMBERS: Record<string, string> = { zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10" };
/** Every number in the text, digits or number words, as a sorted list so order doesn't matter. */
export const numbersIn = (s: string) =>
  (s.toLowerCase().replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten)\b/g, (w) => WORD_NUMBERS[w]).match(/\d+(?:\.\d+)?/g) ?? []).sort().join(",");

const SENSITIVE = /weight|calori|diet|doctor|diagnos|medic/gi;
// Day words carry facts too: "yesterday" must not become "tomorrow".
const DAY_WORDS = /\b(yesterday|today|tonight|tomorrow|morning|evening|monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|weekend|month)\b/gi;
const dayWords = (s: string) => [...new Set((s.match(DAY_WORDS) ?? []).map((w) => w.toLowerCase()))].sort().join(",");

/** Splits a brief into sentences without cutting at decimal points ("7.5 hours"). */
export function splitSentences(text: string): string[] {
  const safe = text.replace(/(\d)\.(\d)/g, "$1\u0000$2");
  const parts = safe.match(/[^.!?]+(?:[.!?]+["”)]*|$)\s*/g) ?? [safe];
  return parts.map((p) => p.replace(/\u0000/g, ".").trim()).filter(Boolean);
}

/** The rewritten sentence if it is safe to show, otherwise null (the original sentence stays). */
export function acceptRewrite(original: string, candidate: string): string | null {
  let out = candidate.split("\n").find((l) => l.trim()) ?? "";
  out = out.replace(/\s+/g, " ").trim();
  if (/^["“].*["”]$/.test(out) && !/^["“]/.test(original)) out = out.slice(1, -1).trim();
  if (!out || out === original) return null;
  if (out.length > Math.max(80, original.length * 2.2) || out.length < original.length * 0.4) return null;
  if (!/[.!?]["”)]?$/.test(out)) return null; // cut off mid-sentence
  if (numbersIn(out) !== numbersIn(original)) return null;
  if (dayWords(out) !== dayWords(original)) return null;
  const allowed = new Set((original.match(SENSITIVE) ?? []).map((w) => w.toLowerCase()));
  if ((out.match(SENSITIVE) ?? []).some((w) => !allowed.has(w.toLowerCase()))) return null;
  for (const q of original.match(/[“"][^”"]+[”"]/g) ?? []) if (!out.includes(q.slice(1, -1))) return null;
  return out;
}

export const BRIEF_SYSTEM = "You are a supportive wellness assistant. Rewrite the provided user stats into a concise, warm, friendly, and encouraging daily summary (2-4 sentences). Keep all factual numbers accurate, avoid robotic phrasing, and do not include meta-commentary.";
/**
 * The brief is rewritten one sentence at a time: a small model given the whole brief tends to move
 * facts between sentences (a streak credited to the wrong habit), while one sentence is easy to
 * check exactly with `acceptRewrite`.
 */
export const BRIEF_EXAMPLES = [
  { input: "You slept 8 hours and did 2 workouts (20 minutes) yesterday.", output: "Nice work yesterday: 8 hours of sleep and 2 workouts (20 minutes)." },
  { input: "Your nighttime skincare streak (2 days) is waiting for today's check-in.", output: "Your nighttime skincare streak is at 2 days, and today's check-in keeps it going." },
  { input: "2 of 3 goals are on track; “Run 50 miles” could use a little attention.", output: "2 of 3 goals are on track, and “Run 50 miles” would love a little attention." },
  { input: "Make some room for rest this Thursday too.", output: "Save a little time for rest this Thursday, too." },
];
export const BRIEF_SENTENCE_SYSTEM = `${BRIEF_SYSTEM} You will be given one sentence of the summary at a time: rewrite only that sentence, as one sentence, keeping its numbers and anything in quotation marks exactly.`;

export const ENHANCE_SYSTEM = `You are a health and habit log parser. Convert the user's unrecognized natural-language note into a clean, structured log entry that matches this app's format (e.g., '1/2/26 - snack: apple (~95 cal)'). Estimate reasonable nutritional or activity metrics if missing, and return only the corrected entry text.
Formats the app reads:
slept 7h
ran 3 miles in 30 min
walked 45 min
yoga 20 min
lunch: chicken salad (~520 cal)
snack: apple (~95 cal)
water 64 oz
8,500 steps
mood 4/5`;

/** Worked examples for Enhance, in formats the note reader understands. */
export const ENHANCE_EXAMPLES = [
  { input: "munched on an apple mid afternoon", output: "snack: apple (~95 cal)" },
  { input: "big bowl of oatmeal with berries first thing", output: "breakfast: oatmeal with berries (~350 cal)" },
  { input: "went for a jog round the block, maybe 20 mins", output: "ran 20 min" },
  { input: "crashed early, got like 9 hours", output: "slept 9h" },
  { input: "drank loads of water, probably 2 litres", output: "water 2 L" },
];

/** One clean line from the model's reply (no date prefix, quotes or commentary), or null. */
export function acceptEnhance(original: string, candidate: string): string | null {
  let out = candidate.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  out = out.replace(/^[-*•]\s*/, "").replace(/^["'“‘](.*)["'”’]$/, "$1").trim();
  // The line keeps its place under the day it was written for, so a date the model adds is dropped.
  out = out.replace(/^(?:\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\d{4}-\d{2}-\d{2}|today|yesterday|(?:mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|sat(?:ur)?|sun)(?:day)?)\s*[-–:,]\s*/i, "").trim();
  if (!out || out.length > 160 || out.toLowerCase() === original.trim().toLowerCase()) return null;
  if (/^(sure|here|i |sorry|note:|okay|certainly)/i.test(out)) return null;
  return out;
}
