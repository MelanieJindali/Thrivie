import "server-only";
import { prisma } from "./db";
import { todayInTz } from "./dates";
import type { Units } from "./units";

export const ALL_MODULES = ["health", "workouts", "habits", "goals", "journal"] as const;
export type ModuleKey = (typeof ALL_MODULES)[number];

export type AppSettings = {
  name: string;
  units: Units;
  timezone: string;
  visibleModules: ModuleKey[];
};

export async function getSettings(): Promise<AppSettings> {
  const s = await prisma.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  return {
    name: s.name,
    units: s.units === "imperial" ? "imperial" : "metric",
    timezone: s.timezone,
    visibleModules: s.visibleModules
      .split(",")
      .map((m) => m.trim())
      .filter((m): m is ModuleKey => (ALL_MODULES as readonly string[]).includes(m)),
  };
}

export async function getToday(): Promise<string> {
  const s = await getSettings();
  return todayInTz(s.timezone);
}
