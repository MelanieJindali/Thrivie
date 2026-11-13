// Safety checks for the optional on-device "rewrite" of the daily brief. Pure, so it is easy to test.
// A rewrite is used one sentence at a time, and only if it keeps every number and quoted phrase and
// adds no weight, food or medical language that wasn't already in that sentence.

const WORD_NUMBERS: Record<string, string> = { zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10" };
/** Every number in the text, digits or number words, as a sorted list so order doesn't matter. */
export const numbersIn = (s: string) =>
  (s.toLowerCase().replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten)\b/g, (w) => WORD_NUMBERS[w]).match(/\d+(?:\.\d+)?/g) ?? []).sort().join(",");

const SENSITIVE = /weight|calori|diet|doctor|diagnos|medic/gi;

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
  const allowed = new Set((original.match(SENSITIVE) ?? []).map((w) => w.toLowerCase()));
  if ((out.match(SENSITIVE) ?? []).some((w) => !allowed.has(w.toLowerCase()))) return null;
  for (const q of original.match(/[“"][^”"]+[”"]/g) ?? []) if (!out.includes(q.slice(1, -1))) return null;
  return out;
}
