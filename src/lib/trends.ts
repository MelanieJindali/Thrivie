import type { HealthLog, Workout } from "@prisma/client";
import { lastNDays, startOfWeek, addDays, type DateStr } from "./dates";
import { kgToDisplay, mlToDisplay, waterUnit, weightUnit, type Units } from "./units";
import type { TrendSpec, WeekVolume } from "@/components/charts";

export function healthTrendSpecs(logs: HealthLog[], today: DateStr, units: Units, which: string[] = ["weight", "sleep", "mood"]): TrendSpec[] {
  const byDate = new Map(logs.map((l) => [l.date, l]));
  const days = lastNDays(today, 90);
  const series = (fn: (l: HealthLog) => number | null) => days.map((date) => {
    const l = byDate.get(date);
    return { date, value: l ? fn(l) : null };
  });
  const all: Record<string, TrendSpec> = {
    weight: { key: "weight", title: "Weight", unit: weightUnit(units), summary: "latest", color: "var(--rose)", data: series((l) => (l.weightKg != null ? kgToDisplay(l.weightKg, units) : null)) },
    sleep: { key: "sleep", title: "Sleep", unit: "h", data: series((l) => l.sleepHours), color: "var(--sapphire)" },
    mood: { key: "mood", title: "Mood", unit: "/ 5", decimals: 1, domain: [1, 5], data: series((l) => l.mood), color: "var(--plum)" },
    energy: { key: "energy", title: "Energy", unit: "/ 5", decimals: 1, domain: [1, 5], data: series((l) => l.energy), color: "var(--amber)" },
    steps: { key: "steps", title: "Steps", decimals: 0, data: series((l) => l.steps), color: "var(--emerald)" },
    water: { key: "water", title: "Water", unit: waterUnit(units), decimals: 0, data: series((l) => (l.waterMl != null ? mlToDisplay(l.waterMl, units) : null)), color: "var(--teal)" },
  };
  return which.map((k) => all[k]).filter(Boolean);
}

export function weeklyVolume(workouts: Pick<Workout, "date" | "type" | "durationMin">[], today: DateStr, weeks = 8): WeekVolume[] {
  const first = addDays(startOfWeek(today), -(weeks - 1) * 7);
  const rows: WeekVolume[] = Array.from({ length: weeks }, (_, i) => ({ week: addDays(first, i * 7) }));
  for (const w of workouts) {
    const idx = Math.floor((Date.parse(startOfWeek(w.date)) - Date.parse(first)) / (7 * 86400000));
    if (idx < 0 || idx >= weeks) continue;
    rows[idx][w.type] = Number(rows[idx][w.type] ?? 0) + w.durationMin;
  }
  return rows;
}
