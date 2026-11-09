// Smart Import, Tier 1: a rule-based parser that runs entirely on the user's
// device (no network). It turns messy notes into ImportEntry objects (the same
// shape the review screen already understands), each with confidence scores.
//
// Pure module: safe for the browser and for unit tests.
import * as chrono from "chrono-node";
import Fuse from "fuse.js";
import { addDays, isDateStr, resolveRelativeDate, type DateStr } from "../dates";
import type { Units } from "../units";
import type { ImportEntry } from "./schema";
import { cleanText } from "./cleanText";

export type AliasRule = { kind: "exercise" | "habit" | "workout" | "metric"; alias: string; target: string };
export type ParseContext = {
  today: DateStr;
  units: Units;
  habits: string[]; // existing habit names
  goals: { title: string; unit: string }[]; // existing manual goals
  aliases?: AliasRule[];
  /** Layer 2: the user's own recent values and names (no note text). */
  personal?: { recentWeightKg?: number | null; exerciseNames?: string[]; workoutTitles?: string[] };
};
/** `uncertain` lists snippets (with their date) that Tier 1 could not read confidently; only these go to the optional on-device AI. */
export type ParseOutput = { entries: ImportEntry[]; unparsed: string[]; uncertain: { text: string; date: DateStr }[]; segments: number };

// --------------------------------------------------------------- vocabulary --

const WEEKDAY = "(?:mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday|s)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)";
const MONTH = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const REL = "today|tonight|yesterday|yday|last night";
const NUMDATE = `\\d{1,2}[/.-]\\d{1,2}(?:[/.-]\\d{2,4})?|${MONTH}\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?|\\d{4}-\\d{2}-\\d{2}`;
const DAYNAME = `(?:(?:last|this|on)\\s+)?${WEEKDAY}`;
// A weekday needs a separator after it ("Mon -", "Tues:", "Sun.", "Thursday⏎") so "sun is out" isn't a date.
const SEP = `\\s*(?:[:\\-–—)]|,(?=\\s)|\\.(?=\\s)|\\n|$)`;
// At the start of a line, relative words and numeric dates may be followed by just a space ("yday swam", "11/5 weighed").
const LINE_MARKER = new RegExp(`(?:^|\\n)[ \\t>*-]*(?<marker>(?:${REL}|${NUMDATE})(?=[\\s:,.\\-–—)]|$)|${DAYNAME}(?:[ \\t,]+(?:${NUMDATE}))?(?=${SEP}|[ \\t]))[ \\t]*(?:[:\\-–—),.](?!\\d))?`, "gi");
/** Bare "sat", "sun" and "wed" are also English words; as a line-start header they need a date, a separator or capitals after them. */
const AMBIGUOUS_DAY = /^(?:sat|sun|wed)$/i;
const MID_MARKER = new RegExp(`(?:[.;!?]\\s+|\\s{2,})(?<marker>${REL}|${NUMDATE}|${DAYNAME})${SEP}`, "gi");

const CHECK_DONE = /(✅|✔️?|☑️?|✓|\[x\]|\(x\)|\bdone\b|\bcompleted?\b|\bchecked\b)/i;
const CHECK_MISSED = /(❌|✗|✘|✖️?|\[ \]|\bmissed\b|\bskipped\b|\bdidn'?t\b|\bno\s+(?:time\s+)?(?:to|for)\b)/i;

const CARDIO: Record<string, string> = {
  ran: "Run", run: "Run", running: "Run", jog: "Jog", jogged: "Jog", jogging: "Jog", walked: "Walk", walk: "Walk", walking: "Walk",
  hiked: "Hike", hike: "Hike", hiking: "Hike", biked: "Bike ride", bike: "Bike ride", cycled: "Bike ride", cycling: "Bike ride", rode: "Bike ride",
  swam: "Swim", swim: "Swim", swimming: "Swim", hiit: "HIIT", circuits: "Circuits", circuit: "Circuits", zumba: "Zumba", dance: "Dance", danced: "Dance", dancing: "Dance", stairmaster: "Stair climber", rowed: "Row", rowing: "Row", elliptical: "Elliptical", spin: "Spin class", spinning: "Spin class",
};
const MOBILITY: Record<string, string> = { yoga: "Yoga", pilates: "Pilates", stretching: "Stretching", stretched: "Stretching", mobility: "Mobility" };
const SPORT: Record<string, string> = { tennis: "Tennis", soccer: "Soccer", football: "Football", basketball: "Basketball", golf: "Golf", climbing: "Climbing", climbed: "Climbing", skiing: "Skiing", skied: "Skiing", snowboarding: "Snowboarding", surfing: "Surfing", surfed: "Surfing", kayaking: "Kayaking", kayaked: "Kayaking", pickleball: "Pickleball", volleyball: "Volleyball", boxing: "Boxing" };
const STRENGTH_WORDS = /\b(gym|lifted|lifting|weights|strength|leg day|legs day|push day|pull day|upper body|lower body|full body|deadlifts?|squats?|bench(?:ed)?|crossfit)\b/i;
const EXERCISE_NAMES: Record<string, string> = {
  pushups: "Push-ups", pushup: "Push-ups", "push ups": "Push-ups", "push-ups": "Push-ups", situps: "Sit-ups", "sit ups": "Sit-ups", pullups: "Pull-ups", "pull ups": "Pull-ups",
  squats: "Squats", squat: "Squats", lunges: "Lunges", lunge: "Lunges", planks: "Plank", plank: "Plank", burpees: "Burpees", crunches: "Crunches", dips: "Dips",
  bench: "Bench press", "bench press": "Bench press", bp: "Bench press", deadlift: "Deadlift", deadlifts: "Deadlift", dl: "Deadlift", ohp: "Overhead press", rows: "Rows", curls: "Curls",
};

const MOOD_WORDS: [RegExp, number][] = [
  [/\b(awful|terrible|miserable|horrible)\b/i, 1],
  [/\b(sad|down|low|stressed|anxious|overwhelmed|grumpy|irritable|frustrated|upset)\b/i, 2],
  [/\b(ok|okay|meh|fine|alright|so-so)\b/i, 3],
  [/\b(good|happy|calm|content|positive|relaxed|grateful)\b/i, 4],
  [/\b(great|amazing|fantastic|awesome|wonderful|excellent|joyful|ecstatic)\b/i, 5],
];
const ENERGY_WORDS: [RegExp, number][] = [
  [/\b(exhausted|drained|wiped|burnt out|burned out)\b/i, 1],
  [/\b(tired|sleepy|sluggish|groggy|fatigued|low energy)\b/i, 2],
  [/\b(energi[sz]ed|energetic|refreshed|rested|pumped|wired)\b/i, 4],
];
const SLEEP_QUALITY_WORDS: [RegExp, number][] = [
  [/\b(terrible|awful|barely)\b/i, 1],
  [/\b(poor|bad|restless|rough|tossed|woke up a lot|broken)\b/i, 2],
  [/\b(ok|okay|decent|fine)\b/i, 3],
  [/\b(good|solid|well)\b/i, 4],
  [/\b(great|amazing|deep|best)\b/i, 5],
];
const STRONG_MOOD = /\b(happy|sad|stressed|anxious|calm|awful|miserable|overwhelmed|grateful|joyful|upset|frustrated|content)\b/i;
const REFLECTIVE = /\b(journal(?:ed|led|ing)?\s+about|felt|feel(?:ing)?|grateful|thankful|thinking about|worried|proud|realized|reflect(?:ed|ing)?|stress(?:ed)?\s+(?:about|over)|excited about|struggled)\b/i;

const NUM = "(\\d+(?:[.,]\\d+)?)";

// Meals: "lunch: chicken salad 520 cal, 40g protein" or "had salmon for dinner".
const MEAL_WORD = "(breakfast|brunch|lunch|dinner|supper|snacks?|dessert)";
const MEAL_LINE = new RegExp(`^[ \\t>*•-]*${MEAL_WORD}\\s*[:\\-–—=]\\s*(.+)$`, "i");
const MEAL_ATE = new RegExp(`\\b(?:had|ate|eaten)\\s+([^,;.!?\\n]+?)\\s+(?:for|at)\\s+${MEAL_WORD}\\b([^,;!?\\n]*)`, "gi");
const MACROS: [keyof Pick<Meal, "calories" | "protein_g" | "carbs_g" | "fat_g">, RegExp[]][] = [
  ["calories", [/(\d{2,4}(?:,\d{3})?)\s*(?:kcals?|cals?|calories)\b/i, /\b(?:kcal|cals?|calories)\s*[:=]?\s*(\d{2,4})/i]],
  ["protein_g", [/(\d{1,3}(?:\.\d)?)\s*g(?:rams?)?\s*(?:of\s+)?protein\b/i, /\bprotein\s*[:=]?\s*(\d{1,3}(?:\.\d)?)\s*g?\b/i]],
  ["carbs_g", [/(\d{1,3}(?:\.\d)?)\s*g(?:rams?)?\s*(?:of\s+)?carbs?\b/i, /\bcarbs?\s*[:=]?\s*(\d{1,3}(?:\.\d)?)\s*g?\b/i]],
  ["fat_g", [/(\d{1,3}(?:\.\d)?)\s*g(?:rams?)?\s*(?:of\s+)?fats?\b/i, /\bfats?\s*[:=]?\s*(\d{1,3}(?:\.\d)?)\s*g?\b/i]],
];
const MEAL_SLOT: Record<string, Meal["slot"]> = { breakfast: "breakfast", brunch: "lunch", lunch: "lunch", dinner: "dinner", supper: "dinner", snack: "snack", snacks: "snack", dessert: "snack" };
const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const num = (s: string) => Number(s.replace(",", "."));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ------------------------------------------------------------------- dates --

function resolveMarker(marker: string, today: DateStr): { date: DateStr | null; text: string } {
  const text = clean(marker).replace(/[.:,\-–—)]+$/, "");
  const numeric = text.match(new RegExp(`(${NUMDATE})$`, "i"));
  if (numeric && numeric[1] !== text) return { ...resolveMarker(numeric[1], today), text };
  const det = resolveRelativeDate(text, today);
  if (det) return { date: det, text };
  const parsed = chrono.parseDate(text, new Date(`${today}T12:00:00`), { forwardDate: false });
  if (parsed) {
    const iso = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
    if (isDateStr(iso) && iso <= addDays(today, 1)) return { date: iso, text };
  }
  return { date: null, text };
}

export type Segment = { dateText: string | null; date: DateStr; body: string; dateConfidence: number };

/** Split notes into day segments at date markers ("Mon -", "Tues:", "11/3", "yesterday,"). */
export function segmentByDay(input: string, today: DateStr): Segment[] {
  const text = input.replace(/\r\n?/g, "\n");
  const marks: { index: number; end: number; marker: string }[] = [];
  for (const re of [LINE_MARKER, MID_MARKER]) {
    for (const m of text.matchAll(re)) {
      const marker = m.groups!.marker;
      if (re === LINE_MARKER && AMBIGUOUS_DAY.test(marker.trim())) {
        const after = text.slice(m.index! + m[0].length, m.index! + m[0].length + 2);
        const sep = /[:\-–—).,]/.test(m[0].slice(m[0].indexOf(marker) + marker.length)) || /^\s*($|\n|\d)/.test(after);
        if (!sep && marker !== marker.toUpperCase()) continue; // "sun is out", "sat with friends"
      }
      const start = m.index! + m[0].indexOf(marker);
      if (!marks.some((x) => Math.abs(x.index - start) < 3)) marks.push({ index: start, end: m.index! + m[0].length, marker });
    }
  }
  marks.sort((a, b) => a.index - b.index);
  const segs: Segment[] = [];
  const head = text.slice(0, marks[0]?.index ?? text.length).trim();
  if (head) segs.push({ dateText: null, date: today, body: head, dateConfidence: 0.7 });
  marks.forEach((mk, i) => {
    const body = text.slice(mk.end, marks[i + 1]?.index ?? text.length).trim();
    const r = resolveMarker(mk.marker, today);
    if (!body) return;
    segs.push({ dateText: r.text, date: r.date ?? today, body, dateConfidence: r.date ? 0.95 : 0.4 });
  });
  return segs;
}

/** Split a day's text into short clauses. Keeps decimals ("7.5h") and "3x15" intact. */
export function splitClauses(body: string): string[] {
  return body
    // Each checkmark ends an item ("no sugar ✅ meditated ✅").
    .replace(/(✅|✔️?|☑️?|✓|❌|✗|✘|✖️?)/g, "$1\n")
    .split(/\n|[;•·]|[.!?]+(?=\s|$)|,(?!\d{3}\b)(?=\s)|\s+-\s+|\s+(?:and|then|also|plus)\s+(?=[a-z])|\s+(?:and|then|plus)\s+(?=\d+(?:\.\d+)?\s*(?:min|mins|minutes|h|hr|hrs|hours?|mi|miles?|km|k)\b\s+(?:of\s+)?[a-z])/i)
    .map(clean)
    .filter((c) => c.length > 0);
}

// -------------------------------------------------------------- extractors --

type Health = Extract<ImportEntry, { kind: "health" }>;
type Workout = Extract<ImportEntry, { kind: "workout" }>;
type Meal = Extract<ImportEntry, { kind: "meal" }>;

/** Reads one meal: slot word, what was eaten, and any calories/macros written with it. */
export function parseMeal(slotWord: string, text: string, base: { date_text: string | null; date: string }, raw: string, dateConfidence: number): Meal | null {
  let name = text;
  const out: Meal = {
    kind: "meal", ...base, source_text: raw, confidence: Math.min(dateConfidence, 0.9), field_confidence: {},
    slot: MEAL_SLOT[slotWord.toLowerCase()] ?? "snack", name: "", calories: null, protein_g: null, carbs_g: null, fat_g: null,
  };
  for (const [field, patterns] of MACROS) {
    for (const re of patterns) {
      const m = name.match(re);
      if (!m) continue;
      const v = Number(m[1].replace(/,/g, ""));
      if (Number.isFinite(v)) out[field] = v;
      name = name.replace(m[0], " ");
      break;
    }
  }
  name = clean(name.replace(/\(\s*[,;·]*\s*\)/g, " ").replace(/\s*[,;·(]\s*(?=[,;·)]|$)/g, "").replace(/^[\s,;:·-]+|[\s,;:·.(-]+$/g, ""));
  if (!name && out.calories == null) return null;
  out.name = name ? cap(name).slice(0, 200) : cap(out.slot);
  if (!name) out.field_confidence.name = 0.4;
  if (out.calories != null && (out.calories < 10 || out.calories > 5000)) { out.field_confidence.calories = 0.4; }
  return out;
}

function wordScore(clause: string, table: [RegExp, number][]): number | null {
  for (const [re, v] of table) if (re.test(clause)) return v;
  return null;
}

const HABIT_STOP = new Set(["min", "mins", "minutes", "the", "a", "an", "my", "to", "of", "for", "daily"]);
/** Matches a clause to one of the user's habits by word stem ("stretched" -> Stretch, "15 min meditation" -> Meditate). */
function makeStemMatcher(habits: string[]) {
  const sig = (s: string) => s.toLowerCase().split(/[^a-z']+/).filter((w) => w && !HABIT_STOP.has(w) && !/^\d/.test(w));
  const list = habits.map((name) => ({ name, words: sig(name) })).filter((h) => h.words.length);
  const same = (hw: string, cw: string) => {
    if (hw.length <= 4) return cw === hw || cw === hw + "s" || cw === hw + "ing" || cw === hw + "ed";
    const root = hw.replace(/(e|es|ed|ing|s)$/, "");
    return cw.startsWith(root.slice(0, Math.max(5, root.length - 1))) && cw.length <= hw.length + 5;
  };
  const compact = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  return (text: string): string | null => {
    const flat = compact(text.replace(/\d+\s*(?:min|mins|minutes|x)?/gi, ""));
    const exact = habits.find((h) => compact(h) && (compact(h) === flat || compact(h) === flat.replace(/(ed|ing|s)$/, "")));
    if (exact) return exact;
    const cw = sig(text);
    if (!cw.length || cw.length > 5) return null;
    const hit = list.find((h) => h.words.every((w) => cw.some((c) => same(w, c))) && cw.length <= h.words.length + 2);
    return hit?.name ?? null;
  };
}

export function parseNotes(text: string, ctx: ParseContext): ParseOutput {
  const segments = segmentByDay(cleanText(text.slice(0, 20000)), ctx.today);
  return finishParse([parseSegments(segments, ctx)], ctx, segments.length);
}

export type SegmentResult = { entries: ImportEntry[]; unparsed: string[]; uncertain: { text: string; date: DateStr }[] };

/** Merge per-segment results into the final output (shared by the full and incremental parsers). */
export function finishParse(parts: SegmentResult[], ctx: ParseContext, segments: number): ParseOutput {
  const entries = parts.flatMap((p) => p.entries);
  const unparsed = parts.flatMap((p) => p.unparsed);
  const uncertain = parts.flatMap((p) => p.uncertain);
  for (const e of entries) if (e.confidence < 0.7 && e.source_text && !uncertain.some((u) => u.text === e.source_text)) uncertain.push({ text: e.source_text, date: e.date ?? ctx.today });
  return { entries, unparsed, uncertain: uncertain.slice(0, 20), segments };
}

/** Read already-segmented day blocks. */
export function parseSegments(segments: Segment[], ctx: ParseContext): SegmentResult {
  const stemHabit = makeStemMatcher(ctx.habits);
  // Layer 2: the user's own exercise names ("bench" -> their "Bench press"), matched leniently.
  const exFuse = new Fuse((ctx.personal?.exerciseNames ?? []).map((name) => ({ name })), { keys: ["name"], threshold: 0.3, ignoreLocation: true, includeScore: true });
  const ownExercise = (raw: string): string | null => {
    if (raw.length < 3) return null;
    const hit = exFuse.search(raw)[0];
    return hit && (hit.score ?? 1) < 0.3 ? hit.item.name : null;
  };
  const entries: ImportEntry[] = [];
  const unparsed: string[] = [];
  const uncertain: { text: string; date: DateStr }[] = [];
  const aliasMap = new Map((ctx.aliases ?? []).map((a) => [`${a.kind}:${a.alias.toLowerCase()}`, a.target]));
  const habitFuse = new Fuse(ctx.habits.map((name) => ({ name })), { keys: ["name"], threshold: 0.38, ignoreLocation: true, includeScore: true });
  const goalFuse = new Fuse(ctx.goals, { keys: ["title", "unit"], threshold: 0.35, ignoreLocation: true, includeScore: true });

  for (const seg of segments) {
    const base = { date_text: seg.dateText, date: seg.date, source_text: null as string | null };
    const health: Health = {
      kind: "health", ...base, confidence: seg.dateConfidence, field_confidence: {},
      weight: null, sleep_hours: null, sleep_quality: null, water: null, mood: null, energy: null, steps: null, custom: [],
    };
    const strength: Workout = {
      kind: "workout", ...base, confidence: Math.min(0.9, seg.dateConfidence), field_confidence: {},
      type: "strength", title: null, duration_min: null, intensity: null, distance: null, pace_min_per_unit: null, exercises: [],
    };
    const journal: string[] = [];
    let journalOpen = false;
    let healthTouched = false;
    let lastWorkout: Workout | null = null;

    // Whole lines that describe a meal are read first, so "and"/commas inside them don't split the food.
    const body = seg.body.split("\n").filter((line) => {
      const m = line.match(MEAL_LINE);
      const meal = m && parseMeal(m[1], m[2], base, clean(line), seg.dateConfidence);
      if (meal) entries.push(meal);
      return !meal;
    }).join("\n").replace(MEAL_ATE, (all, food: string, slot: string, rest: string) => {
      const meal = parseMeal(slot, `${food} ${rest}`, base, clean(all), seg.dateConfidence);
      if (!meal) return all;
      entries.push(meal);
      return "";
    });

    for (const raw of splitClauses(body)) {
      let clause = raw;
      const lc = clause.toLowerCase();
      let used = false;
      const setH = <K extends keyof Health>(k: K, v: Health[K], conf: number) => {
        if (health[k] == null) {
          health[k] = v;
          healthTouched = true;
          if (conf < 0.9) health.field_confidence[k as string] = conf;
        }
      };

      if (/\brest day\b|\bday off\b/i.test(lc)) { used = true; continue; }

      // A meal later in a line: "slept 7h, lunch: salad 400 cal"
      const mealHit = clause.match(MEAL_LINE);
      const meal = mealHit && parseMeal(mealHit[1], mealHit[2], base, raw, seg.dateConfidence);
      if (meal) { entries.push(meal); continue; }

      // Sleep: "slept 6h", "8h sleep", "sleep 7.5 hrs", "slept 6 hours felt tired"
      const sleep = lc.match(new RegExp(`(?:slept|sleep|sleeping|bed)\\D{0,12}?${NUM}\\s*(?:h|hr|hrs|hours?)\\b`)) ?? lc.match(new RegExp(`${NUM}\\s*(?:h|hr|hrs|hours?)\\s*(?:of\\s+)?(?:sleep|slept)`));
      if (sleep) {
        const h = num(sleep[1]);
        if (h > 0 && h <= 16) { setH("sleep_hours", h, 0.95); used = true; }
        const q = wordScore(lc.replace(sleep[0], ""), SLEEP_QUALITY_WORDS);
        if (q) setH("sleep_quality", q, 0.6);
      }

      // Sleep quality on its own ("good sleep", "rough night", "great sleep")
      if (!sleep && /\b(sleep|slept|night)\b/.test(lc) && !/\d/.test(lc)) {
        const q = wordScore(lc, SLEEP_QUALITY_WORDS);
        if (q) { setH("sleep_quality", q, 0.7); used = true; continue; }
      }

      // Weight: "weight 172", "weighed 171.4 lb", "78.2kg"
      const weight = lc.match(new RegExp(`\\b(?:weight|weighed|wt|scale)\\s*(?:in\\s+at|is|was|:|=)?\\s*${NUM}\\s*(lbs?|pounds|kg|kgs)?`)) ?? lc.match(new RegExp(`\\b${NUM}\\s*(lbs?|pounds|kg|kgs)\\b(?!.*\\b(?:bench|squat|deadlift|press|row|curl)\\b)`));
      if (weight) {
        const v = num(weight[1]);
        let unit: "kg" | "lb" | null = weight[2] ? (weight[2].startsWith("k") ? "kg" : "lb") : null;
        let conf = unit ? 0.95 : 0.8;
        if (!unit) {
          // Layer 2: a bare number is read in whichever unit lands closest to the user's recent weights,
          // then their learned preference, then their unit setting.
          const recent = ctx.personal?.recentWeightKg;
          const pref = aliasMap.get("metric:weight-unit");
          if (recent) {
            const asLb = v * 0.45359237, asKg = v;
            const near = (x: number) => Math.abs(x - recent) / recent;
            unit = near(asLb) <= near(asKg) ? "lb" : "kg";
            conf = Math.min(near(asLb), near(asKg)) <= 0.1 ? 0.92 : 0.6;
          } else if (pref === "kg" || pref === "lb") {
            unit = pref;
            conf = 0.9;
          }
        }
        const eff = unit ?? (ctx.units === "imperial" ? "lb" : "kg");
        const plausible = eff === "kg" ? v >= 30 && v <= 250 : v >= 70 && v <= 550;
        if (plausible && !/\d\s*[x×]\s*\d/.test(lc)) {
          setH("weight", { value: v, unit }, conf);
          used = true;
        }
      }

      // Water: "64 oz water", "water 2L", "8 glasses of water"
      const water = lc.match(new RegExp(`${NUM}\\s*(oz|ounces|ml|l|liters?|litres?|glasses|glass|cups?|bottles?)\\s*(?:of\\s+)?water`)) ?? lc.match(new RegExp(`water\\s*:?\\s*${NUM}\\s*(oz|ounces|ml|l|liters?|litres?|glasses|cups?)?`));
      if (water) {
        let v = num(water[1]);
        let unit: string | null = water[2] ?? null;
        if (unit && /bottle/.test(unit)) { v = v * 500; unit = "ml"; }
        if (unit === "ounces") unit = "oz";
        setH("water", { value: v, unit: unit && /glass|cup/.test(unit) ? "glasses" : unit }, unit ? 0.9 : 0.65);
        used = true;
      }

      // Steps: "10k steps", "8,500 steps"
      const steps = lc.match(/(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?k?)\s*steps/) ?? lc.match(/\bsteps?\s*[:=]?\s*(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?k?)\b/);
      if (steps) {
        const s = steps[1].replace(/,/g, "");
        const v = s.endsWith("k") ? Math.round(num(s.slice(0, -1)) * 1000) : Math.round(num(s));
        if (v > 0 && v < 150000) { setH("steps", v, 0.95); used = true; }
      }

      // Custom metrics: resting HR, HRV
      const hr = lc.match(/\b(resting hr|rhr|resting heart rate|hrv)\s*:?\s*(\d{2,3})/);
      if (hr) {
        health.custom.push({ name: hr[1].startsWith("hrv") ? "HRV" : "Resting HR", value: num(hr[2]) });
        healthTouched = true;
        used = true;
      }

      // Explicit mood/energy scores: "mood 4/5", "energy: 3"
      const moodNum = lc.match(/\bmood\s*:?\s*(\d+)\s*(?:\/\s*(5|10))?/);
      if (moodNum) { const n = num(moodNum[1]); setH("mood", moodNum[2] === "10" || n > 5 ? Math.round(n / 2) : n, 0.95); used = true; }
      const energyNum = lc.match(/\benergy\s*:?\s*(\d+)\s*(?:\/\s*(5|10))?/);
      if (energyNum) { const n = num(energyNum[1]); setH("energy", energyNum[2] === "10" || n > 5 ? Math.round(n / 2) : n, 0.95); used = true; }

      // Habits: checkmarks or a fuzzy match to an existing habit
      const done = CHECK_DONE.test(clause);
      const missed = CHECK_MISSED.test(clause) && !done;
      const habitText = clean(clause.replace(CHECK_DONE, "").replace(CHECK_MISSED, "").replace(/[:\-–—]+$/, ""));
      const aliasHabit = aliasMap.get(`habit:${habitText.toLowerCase()}`);
      const fuzzy = habitText.length >= 3 && habitText.split(" ").length <= 6 ? habitFuse.search(aliasHabit ?? habitText)[0] : undefined;
      const isWorkoutish = Object.keys({ ...CARDIO, ...SPORT }).some((w) => new RegExp(`\\b${w}\\b`).test(lc)) || /\d\s*[x×]\s*\d/.test(lc);
      if ((done || missed) && habitText && !isWorkoutish) {
        entries.push({
          kind: "habit", ...base, source_text: raw, confidence: Math.min(seg.dateConfidence, fuzzy ? 0.9 : 0.8), field_confidence: {},
          habit_name: cap(aliasHabit ?? stemHabit(habitText) ?? habitText), matched_habit: aliasHabit ?? (fuzzy && (fuzzy.score ?? 1) < 0.38 ? fuzzy.item.name : stemHabit(habitText)), completed: !missed,
        });
        used = true;
        continue;
      }
      const byStem = !isWorkoutish && !REFLECTIVE.test(lc) && habitText.split(" ").length <= 6 ? stemHabit(habitText) : null;
      if (fuzzy && (fuzzy.score ?? 1) < 0.22 && habitText.split(" ").length <= 4 && !isWorkoutish && !REFLECTIVE.test(lc)) {
        entries.push({ kind: "habit", ...base, source_text: raw, confidence: 0.6, field_confidence: { habit_name: 0.6 }, habit_name: cap(habitText), matched_habit: fuzzy.item.name, completed: true });
        used = true;
      } else if (byStem) {
        entries.push({ kind: "habit", ...base, source_text: raw, confidence: 0.7, field_confidence: { habit_name: 0.7 }, habit_name: byStem, matched_habit: byStem, completed: true });
        used = true;
        // "stretched" is the habit; only also log a workout when a duration was written.
        if (!/\d/.test(lc)) continue;
      }

      // Strength sets: "pushups 3x15", "bench 3x8 @ 135", "bb 5x5 185lb"
      let named = 0;
      for (const m of clause.matchAll(new RegExp(`([a-z][a-z' -]{1,30}?)\\s*:?\\s*(\\d{1,2})\\s*[x×]\\s*(\\d{1,3})(?:\\s*(?:@|at|w\\/|with)?\\s*${NUM}\\s*(lbs?|kg)?)?`, "gi"))) {
        const rawName = clean(m[1].toLowerCase().replace(/^(did|then|and|some)\s+/, ""));
        // "great workout: 5x5 squats" names the session, not the exercise; the name comes after the numbers.
        if (/\b(workout|session|gym|lifting|lifted|training|today)$/.test(rawName)) continue;
        named++;
        const known = aliasMap.get(`exercise:${rawName}`) ?? EXERCISE_NAMES[rawName] ?? ownExercise(rawName);
        const name = known ?? cap(rawName);
        strength.exercises.push({ name, sets: num(m[2]), reps: num(m[3]), weight: m[4] ? { value: num(m[4]), unit: m[5] ? (m[5].startsWith("k") ? "kg" : "lb") : null } : null });
        if (!known) strength.field_confidence[`exercises.${strength.exercises.length - 1}`] = 0.65;
        used = true;
      }
      if (!named) {
        for (const m of clause.matchAll(new RegExp(`(?<![\\w.])(\\d{1,2})\\s*[x×]\\s*(\\d{1,3})\\s+(?:of\\s+)?([a-z][a-z' -]{2,30}?)(?:\\s*(?:@|at|w\\/|with)\\s*${NUM}\\s*(lbs?|kg)?)?(?=$|[,.;]|\\s+\\d)`, "gi"))) {
          const rawName = clean(m[3].toLowerCase());
          const known = aliasMap.get(`exercise:${rawName}`) ?? EXERCISE_NAMES[rawName] ?? ownExercise(rawName);
          const name = known ?? cap(rawName);
          strength.exercises.push({ name, sets: num(m[1]), reps: num(m[2]), weight: m[4] ? { value: num(m[4]), unit: m[5] ? (m[5].startsWith("k") ? "kg" : "lb") : null } : null });
          if (!known) strength.field_confidence[`exercises.${strength.exercises.length - 1}`] = 0.65;
          used = true;
        }
      }
      // A duration on its own right after exercises ("squats 4x8, lunges 3x12, 50 min") belongs to that session.
      const lone = lc.match(/^(?:about|around|for|took|in|total|~)?\s*(\d{1,3}(?:\.\d+)?)\s*(min|mins|minutes|m|h|hr|hrs|hours?)\b(?:\s+total)?$/);
      if (lone && !used && (strength.exercises.length || strength.title) && strength.duration_min == null && (!lastWorkout || lastWorkout.duration_min != null)) {
        strength.duration_min = /^h/.test(lone[2]) ? Math.round(num(lone[1]) * 60) : num(lone[1]);
        used = true;
        continue;
      }
      if (STRENGTH_WORDS.test(lc)) {
        strength.title ??= cap(lc.match(STRENGTH_WORDS)![1]);
        const dur = lc.match(/(?<![\d.])(\d{1,3})\s*(?:min|mins|minutes|m)\b(?!\s*(?:i|ile|iles))/);
        if (dur) strength.duration_min = num(dur[1]);
        used = true;
      }

      // Cardio / mobility / sport sessions
      const words = lc.match(/[a-z]+/g) ?? [];
      const verb = words.find((w) => CARDIO[w] || MOBILITY[w] || SPORT[w] || aliasMap.has(`workout:${w}`));
      const hasNumbers = /\d/.test(lc);
      if (verb && !(MOBILITY[verb] && done) && !/\d\s*[x×]\s*\d/.test(lc) && (hasNumbers || words.length <= 5)) {
        const aliased = aliasMap.get(`workout:${verb}`);
        const type = CARDIO[verb] ? "cardio" : MOBILITY[verb] ? "mobility" : SPORT[verb] ? "sport" : "other";
        const dist = lc.match(new RegExp(`${NUM}\\s*(k|km|kms|mi|mile|miles|m|meters|metres)\\b(?!\\s*(?:steps|min))`));
        const durMin = lc.match(/(?<![\d.])(\d{1,3})\s*(?:min|mins|minutes|m)\b(?!\s*(?:i|ile|iles))/);
        const durH = lc.match(new RegExp(`${NUM}\\s*(?:h|hr|hrs|hours?)\\b`));
        const hhmm = lc.match(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/);
        let duration: number | null = durMin ? num(durMin[1]) : durH && !sleep ? Math.round(num(durH[1]) * 60) : null;
        if (duration == null && hhmm) duration = hhmm[3] ? num(hhmm[1]) * 60 + num(hhmm[2]) : num(hhmm[1]) + num(hhmm[2]) / 60 > 3 ? num(hhmm[1]) : num(hhmm[1]) * 60 + num(hhmm[2]);
        const intensity = /\b(easy|light|gentle|recovery)\b/.test(lc) ? 2 : /\b(hard|intense|tough|brutal|tempo|intervals?|sprints?)\b/.test(lc) ? 4 : /\b(max|race|all out|pr)\b/.test(lc) ? 5 : null;
        let unit: string | null = dist ? dist[2] : null;
        if (unit === "k" || unit === "kms") unit = "km";
        if (unit === "mile" || unit === "miles") unit = "mi";
        if (unit === "meters" || unit === "metres") unit = "m";
        const fc: Record<string, number> = {};
        if (duration == null) fc.duration = 0.5;
        lastWorkout = {
          kind: "workout", ...base, source_text: raw, confidence: Math.min(seg.dateConfidence, duration != null || dist ? 0.9 : 0.7), field_confidence: fc,
          type: (aliased ? "other" : type) as Workout["type"], title: aliased ?? CARDIO[verb] ?? MOBILITY[verb] ?? SPORT[verb] ?? cap(verb),
          duration_min: duration, intensity, distance: dist ? { value: num(dist[1]), unit } : null, pace_min_per_unit: null, exercises: [],
        };
        entries.push(lastWorkout);
        used = true;
      } else if (lastWorkout && lastWorkout.duration_min == null && !verb) {
        // A follow-up like "about 3 hours" or "45 min" belongs to the workout just mentioned.
        const fm = lc.match(/^(?:about|around|for|took|in|~)?\s*(\d{1,3}(?:\.\d+)?)\s*(min|mins|minutes|h|hr|hrs|hours?)\b/);
        if (fm) {
          lastWorkout.duration_min = /^h/.test(fm[2]) ? Math.round(num(fm[1]) * 60) : num(fm[1]);
          delete lastWorkout.field_confidence.duration;
          lastWorkout.field_confidence.duration = 0.75;
          used = true;
          continue;
        }
      }

      // Goal progress: "read 40 pages", "finished a book", "saved $50"
      const finished = lc.match(/\b(?:finished|completed)\s+(?:a|one|my|another|the)?\s*(book|course|chapter|puzzle|painting)/);
      const qty = lc.match(new RegExp(`${NUM}\\s+([a-z]{3,12})`));
      const goalHit =
        (finished && goalFuse.search(finished[1])[0]) ||
        (qty && ctx.goals.find((g) => g.unit && g.unit.toLowerCase().replace(/s$/, "") === qty[2].replace(/s$/, "")) && { item: ctx.goals.find((g) => g.unit.toLowerCase().replace(/s$/, "") === qty[2].replace(/s$/, ""))!, score: 0.1 });
      if (goalHit && goalHit.item) {
        const value = finished ? 1 : num(qty![1]);
        entries.push({ kind: "goal_update", ...base, source_text: raw, confidence: finished ? 0.75 : 0.8, field_confidence: finished ? { value: 0.7 } : {}, goal_name: goalHit.item.title, matched_goal: goalHit.item.title, value, unit: goalHit.item.unit, note: raw });
        used = true;
      }

      // Mood / energy words ("felt tired", "feeling great")
      if (!moodNum && !/\b(sleep|slept|night)\b/.test(lc)) {
        const m = wordScore(lc, MOOD_WORDS);
        const strong = STRONG_MOOD.test(lc);
        if (m && (strong || /\b(felt|feel|feeling|mood|day was|today was|been)\b/.test(lc))) { setH("mood", m, 0.6); used ||= !REFLECTIVE.test(lc); }
      }
      if (!energyNum) {
        const e = wordScore(lc, ENERGY_WORDS);
        if (e) { setH("energy", e, 0.65); used ||= clause.split(" ").length <= 4; }
      }

      // Journal: reflections, or longer free text nothing else claimed
      const wordCount = clause.split(" ").length;
      // Reflections become journal text, unless the clause was just a short health note ("slept 6h felt tired").
      if ((REFLECTIVE.test(lc) && (!used || wordCount >= 7 || /journal/.test(lc))) || (!used && wordCount >= 6)) {
        clause = clause.replace(/^journal(?:ed|led|ing)?\s+about\s+/i, "Journaled about ");
        journal.push(cap(clause.replace(/[.\s]+$/, "")) + ".");
        used = true;
        journalOpen = true;
        continue;
      }
      // A short follow-on sentence to a reflection ("stressed about money, need to budget better") joins it.
      if (!used && journalOpen && wordCount >= 2) {
        journal[journal.length - 1] = journal[journal.length - 1].replace(/\.$/, ", ") + clause.replace(/[.\s]+$/, "") + ".";
        continue;
      }
      journalOpen = false;
      if (!used && clause.length > 2) {
        unparsed.push(raw);
        uncertain.push({ text: raw, date: seg.date });
      }
    }

    if (healthTouched) {
      const confs = Object.values(health.field_confidence);
      health.confidence = Math.min(seg.dateConfidence, confs.length ? Math.max(0.6, Math.min(...confs) + 0.15) : 0.95);
      entries.push(health);
    }
    if (strength.exercises.length || strength.title) {
      if (!strength.title) strength.title = strength.exercises.length === 1 ? strength.exercises[0].name : "Strength";
      if (strength.duration_min == null) strength.field_confidence.duration = 0.5;
      entries.push(strength);
    }
    if (journal.length) {
      const content = journal.join(" ");
      const mood = wordScore(content, MOOD_WORDS);
      entries.push({ kind: "journal", ...base, source_text: content.slice(0, 120), confidence: Math.min(seg.dateConfidence, 0.85), field_confidence: mood ? { mood: 0.6 } : {}, content, mood });
    }
  }
  return { entries, unparsed, uncertain };
}
