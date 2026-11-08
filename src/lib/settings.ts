import "server-only";
import { cache } from "react";
import { requireUser } from "./auth";
import { todayInTz } from "./dates";
import type { ScopedDb } from "./db";
import type { Units } from "./units";

export const ALL_MODULES = ["health", "workouts", "habits", "goals", "journal"] as const;
export type ModuleKey = (typeof ALL_MODULES)[number];

export type AppSettings = {
  name: string;
  units: Units;
  timezone: string;
  visibleModules: ModuleKey[];
  remindersOn: boolean;
  reminderHour: number;
};

export async function loadSettings(db: ScopedDb, userId: string): Promise<AppSettings> {
  const s = (await db.settings.findUnique({ where: { userId } })) ?? (await db.settings.create({ data: { userId } }));
  return {
    name: s.name,
    units: s.units === "metric" ? "metric" : "imperial",
    timezone: s.timezone,
    visibleModules: s.visibleModules
      .split(",")
      .map((m) => m.trim())
      .filter((m): m is ModuleKey => (ALL_MODULES as readonly string[]).includes(m)),
    remindersOn: s.remindersOn,
    reminderHour: s.reminderHour,
  };
}

/** Settings of the signed-in user (memoized per request). */
export const getSettings = cache(async (): Promise<AppSettings> => {
  const { db, user } = await requireUser();
  return loadSettings(db, user.id);
});

export async function getToday(): Promise<string> {
  return todayInTz((await getSettings()).timezone);
}
