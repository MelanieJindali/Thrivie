// Smart Import verification, run on the device after parsing. Pure and deterministic.
// Flags values that look implausible for a person's day, same-day conflicts and
// things outside what can be saved, and offers one-tap "Did you mean…" fixes.
// Nothing here changes a value by itself: fixes are suggestions the user taps.
import { diffDays, formatDate, type DateStr } from "../dates";
import { kgToDisplay, weightUnit, type Units } from "../units";
import type { ReviewItem } from "./normalize";

export type Fix = { label: string; date?: DateStr; data?: Record<string, unknown> };
/** `blocking` issues keep an item out of the save until it's fixed or edited. */
export type Issue = { field: string; message: string; fix?: Fix; blocking?: boolean };

export type VerifyContext = {
  today: DateStr;
  units: Units;
  /** The user's most recent logged weight, to catch unit slips and typos. */
  lastWeight?: { kg: number; date: DateStr } | null;
};

const LB = 0.45359237;
const r1 = (n: number) => Math.round(n * 10) / 10;

export function verifyItem(item: ReviewItem, ctx: VerifyContext): Issue[] {
  const out: Issue[] = [];
  if (diffDays(ctx.today, item.date) > 0) {
    out.push({ field: "date", message: `${formatDate(item.date)} is in the future.`, fix: { label: "Use today", date: ctx.today }, blocking: true });
  } else if (item.dateResolvedBy === "default" && item.dateText) {
    out.push({ field: "date", message: `Couldn't place “${item.dateText}” on a past date, so this is set to today.` });
  } else if (diffDays(item.date, ctx.today) > 180 && item.dateText && !/\b(19|20)\d{2}\b/.test(item.dateText)) {
    out.push({ field: "date", message: `Read “${item.dateText}” as ${formatDate(item.date, { month: "short", day: "numeric", year: "numeric" })}. Is that the right year?` });
  }

  for (const c of item.conflicts ?? []) {
    out.push({ field: fieldName(c.field), message: `Your notes give two values for ${label(c.field)} this day. Kept ${show(c.field, c.kept, ctx.units)}.`, fix: { label: `Use ${show(c.field, c.other, ctx.units)}`, data: { [c.field]: c.other } } });
  }

  switch (item.kind) {
    case "health": {
      const d = item.data;
      if (d.sleepHours != null && d.sleepHours > 16) {
        const fix = d.sleepHours >= 60 && d.sleepHours <= 960 ? { label: `Did you mean ${r1(d.sleepHours / 60)} h?`, data: { sleepHours: r1(d.sleepHours / 60) } } : undefined;
        out.push({ field: "sleep_hours", message: `${d.sleepHours} hours of sleep is more than usual.`, fix, blocking: d.sleepHours > 24 });
      }
      if (d.weightKg != null && ctx.lastWeight) {
        const last = ctx.lastWeight.kg;
        const days = Math.max(1, Math.abs(diffDays(ctx.lastWeight.date, item.date)));
        // About 1% a week is a fast but real change; allow 3% plus that.
        const allowed = 0.03 + 0.01 * (days / 7);
        if (Math.abs(d.weightKg - last) / last > allowed) {
          const asLb = d.weightKg * LB; // typed in lb but read as kg
          const asKg = d.weightKg / LB; // typed in kg but read as lb
          const near = (v: number) => Math.abs(v - last) / last <= allowed;
          const fix = near(asLb) ? { label: `Did you mean ${kgToDisplay(asLb, ctx.units)} ${weightUnit(ctx.units)}?`, data: { weightKg: Math.round(asLb * 100) / 100 } }
            : near(asKg) ? { label: `Did you mean ${kgToDisplay(asKg, ctx.units)} ${weightUnit(ctx.units)}?`, data: { weightKg: Math.round(asKg * 100) / 100 } }
            : undefined;
          out.push({ field: "weight", message: `That's a big change from your last weight (${kgToDisplay(last, ctx.units)} ${weightUnit(ctx.units)} on ${formatDate(ctx.lastWeight.date)}).`, fix });
        }
      } else if (d.weightKg != null && (d.weightKg < 25 || d.weightKg > 300)) {
        out.push({ field: "weight", message: "That weight looks unusual. Check the number and unit." });
      }
      if (d.waterMl != null && d.waterMl > 8000) out.push({ field: "water", message: "That's a lot of water for one day. Check the amount and unit." });
      if (d.steps != null && d.steps > 80000) out.push({ field: "steps", message: "That's an unusually high step count." });
      break;
    }
    case "workout": {
      const d = item.data;
      if (d.durationMin > 360) {
        out.push({ field: "duration", message: `${d.durationMin} minutes is a long workout.`, blocking: d.durationMin > 1440 });
      }
      if (d.distanceKm != null && d.distanceKm > 250) out.push({ field: "distance", message: "That distance looks unusually long." });
      if (d.paceMinKm != null && d.distanceKm && (d.paceMinKm < 1.5 || d.paceMinKm > 30) && d.type === "cardio") {
        out.push({ field: "duration", message: "The time and distance don't add up to a usual pace. Check both." });
      }
      break;
    }
    case "meal":
      if (item.data.calories != null && item.data.calories > 3000) out.push({ field: "calories", message: "That's a lot of calories for one meal. Check the number." });
      break;
    case "goal_update":
      if (item.data.value <= 0) out.push({ field: "value", message: "Progress should be more than zero.", blocking: true });
      break;
  }
  return out;
}

export function verifyItems<T extends ReviewItem>(items: T[], ctx: VerifyContext): (T & { issues: Issue[] })[] {
  return items.map((i) => ({ ...i, issues: verifyItem(i, ctx) }));
}

/** Same thing written twice for the same day in one paste ("meditated ✅ … meditated ✅"). */
export function repeatKey(item: ReviewItem): string | null {
  switch (item.kind) {
    case "habit": return item.data.habitId ? `habit|${item.date}|${item.data.habitId}` : `habit|${item.date}|${item.data.habitName.toLowerCase()}`;
    case "meal": return `meal|${item.date}|${item.data.slot}|${item.data.name.toLowerCase().replace(/\s+/g, " ").trim()}`;
    case "workout": return `workout|${item.date}|${item.data.type}|${item.data.durationMin}|${item.data.distanceKm ?? ""}`;
    case "journal": return `journal|${item.date}|${item.data.content.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 120)}`;
    case "goal_update": return `goal|${item.date}|${item.data.goalId ?? item.data.goalName}|${item.data.value}`;
    default: return null;
  }
}

const FIELD: Record<string, string> = { weightKg: "weight", sleepHours: "sleep_hours", waterMl: "water", sleepQuality: "sleep_quality" };
const fieldName = (k: string) => FIELD[k] ?? k;
const label = (k: string) => ({ weightKg: "weight", sleepHours: "sleep", waterMl: "water", sleepQuality: "sleep quality" } as Record<string, string>)[k] ?? k;
function show(k: string, v: number, units: Units) {
  if (k === "weightKg") return `${kgToDisplay(v, units)} ${weightUnit(units)}`;
  if (k === "sleepHours") return `${v} h`;
  return String(v);
}

