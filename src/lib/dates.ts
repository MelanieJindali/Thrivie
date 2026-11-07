// Date helpers. A "day" in Thrivie is a plain "YYYY-MM-DD" string in the
// user's timezone. Arithmetic is done in UTC on those strings so DST and the
// server's own timezone never shift a day.

export type DateStr = string;

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateStr(s: unknown): boolean {
  if (typeof s !== "string" || !ISO_RE.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Today's date in the given IANA timezone. Falls back to UTC on bad input. */
export function todayInTz(timeZone: string, now: Date = new Date()): DateStr {
  try {
    // en-CA formats as YYYY-MM-DD
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function toUtc(d: DateStr): Date {
  return new Date(d + "T00:00:00Z");
}

function fromUtc(d: Date): DateStr {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: DateStr, n: number): DateStr {
  const x = toUtc(d);
  x.setUTCDate(x.getUTCDate() + n);
  return fromUtc(x);
}

/** b - a in whole days */
export function diffDays(a: DateStr, b: DateStr): number {
  return Math.round((toUtc(b).getTime() - toUtc(a).getTime()) / 86_400_000);
}

/** 0 = Sunday … 6 = Saturday */
export function weekdayOf(d: DateStr): number {
  return toUtc(d).getUTCDay();
}

/** Monday of the week containing d */
export function startOfWeek(d: DateStr): DateStr {
  const wd = weekdayOf(d);
  return addDays(d, -((wd + 6) % 7));
}

/** Inclusive list of the `n` days ending at `end` (oldest first). */
export function lastNDays(end: DateStr, n: number): DateStr[] {
  return Array.from({ length: n }, (_, i) => addDays(end, i - (n - 1)));
}

export function formatDate(d: DateStr, opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }): string {
  return toUtc(d).toLocaleDateString("en-US", { timeZone: "UTC", ...opts });
}

export function relativeLabel(d: DateStr, today: DateStr): string {
  const diff = diffDays(d, today);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff === -1) return "Tomorrow";
  return formatDate(d);
}

// ---------------------------------------------------------------------------
// Relative date resolution for AI Notes Import.
//
// The model is asked to echo the raw date reference it saw ("Mon", "yesterday",
// "11/3") alongside its own resolved ISO date. We resolve the raw text here,
// deterministically, and only fall back to the model's date when we can't.
// Rules:
//  - Weekday names resolve to the most recent such day on or before today
//    (notes are written about the past). "last <weekday>" is strictly before
//    today. "next <weekday>" is strictly after.
//  - Numeric dates are read as M/D (US) unless the first part is > 12.
//    Missing years pick the most recent occurrence not in the future.
// ---------------------------------------------------------------------------

const WEEKDAYS: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12,
};

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, a: 1, an: 1,
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function buildDate(y: number, m: number, d: number): DateStr | null {
  const s = `${y}-${pad(m)}-${pad(d)}`;
  return isDateStr(s) ? s : null;
}

/** For a month/day without a year, pick the latest occurrence that is not after today. */
function closestPast(m: number, d: number, today: DateStr): DateStr | null {
  const y = Number(today.slice(0, 4));
  const thisYear = buildDate(y, m, d);
  if (thisYear && thisYear <= today) return thisYear;
  return buildDate(y - 1, m, d) ?? thisYear;
}

export function resolveRelativeDate(raw: string | null | undefined, today: DateStr): DateStr | null {
  if (!raw) return null;
  const text = raw
    .toLowerCase()
    .replace(/[.,:;!]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;

  if (isDateStr(text)) return text;

  if (["today", "tonight", "this morning", "this evening", "this afternoon", "now"].includes(text)) return today;
  if (["yesterday", "yday", "yest", "last night"].includes(text)) return addDays(today, -1);
  if (["day before yesterday", "the day before yesterday"].includes(text)) return addDays(today, -2);
  if (text === "tomorrow") return addDays(today, 1);

  // "3 days ago", "two days ago", "a week ago"
  const ago = text.match(/^(\d+|[a-z]+) (day|days|week|weeks) ago$/);
  if (ago) {
    const n = /^\d+$/.test(ago[1]) ? Number(ago[1]) : NUMBER_WORDS[ago[1]];
    if (n !== undefined) return addDays(today, -(ago[2].startsWith("week") ? n * 7 : n));
  }

  // Weekday names, optionally prefixed with last/this/next/on
  const wdMatch = text.match(/^(last |this |next |on |past )?([a-z]+)$/);
  if (wdMatch && WEEKDAYS[wdMatch[2]] !== undefined) {
    const target = WEEKDAYS[wdMatch[2]];
    const todayWd = weekdayOf(today);
    const prefix = (wdMatch[1] ?? "").trim();
    if (prefix === "next") {
      const forward = ((target - todayWd + 7) % 7) || 7;
      return addDays(today, forward);
    }
    let back = (todayWd - target + 7) % 7;
    if (prefix === "last" && back === 0) back = 7;
    return addDays(today, -back);
  }

  // Numeric: M/D, M/D/YY, M/D/YYYY, also with "-" or "."
  const num = text.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/);
  if (num) {
    let a = Number(num[1]);
    let b = Number(num[2]);
    if (a > 12 && b <= 12) [a, b] = [b, a]; // D/M
    const [m, d] = [a, b];
    if (num[3]) {
      let y = Number(num[3]);
      if (y < 100) y += 2000;
      return buildDate(y, m, d);
    }
    return closestPast(m, d, today);
  }

  // "Nov 3", "November 3rd", "3 Nov", optional year
  const md = text.match(/^([a-z]+)\.? (\d{1,2})(?:st|nd|rd|th)?(?:,? (\d{4}))?$/);
  if (md && MONTHS[md[1]]) {
    return md[3] ? buildDate(Number(md[3]), MONTHS[md[1]], Number(md[2])) : closestPast(MONTHS[md[1]], Number(md[2]), today);
  }
  const dm = text.match(/^(\d{1,2})(?:st|nd|rd|th)? ([a-z]+)\.?(?:,? (\d{4}))?$/);
  if (dm && MONTHS[dm[2]]) {
    return dm[3] ? buildDate(Number(dm[3]), MONTHS[dm[2]], Number(dm[1])) : closestPast(MONTHS[dm[2]], Number(dm[1]), today);
  }

  return null;
}

/**
 * Pick the final date for an imported entry: deterministic resolution of the
 * raw text first, then the model's ISO date, then today. Dates more than a
 * day in the future are clamped to today (notes describe the past).
 */
export function pickEntryDate(
  dateText: string | null | undefined,
  modelDate: string | null | undefined,
  today: DateStr,
): { date: DateStr; resolvedBy: "text" | "model" | "default" } {
  const fromText = resolveRelativeDate(dateText, today);
  if (fromText && diffDays(today, fromText) <= 1) return { date: fromText, resolvedBy: "text" };
  if (modelDate && isDateStr(modelDate) && diffDays(today, modelDate) <= 1) return { date: modelDate, resolvedBy: "model" };
  return { date: today, resolvedBy: "default" };
}
