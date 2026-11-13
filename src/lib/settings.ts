import "server-only";
import { cache } from "react";
import { requireUser } from "./auth";
import { todayInTz } from "./dates";
import type { ScopedDb } from "./db";
import type { Units } from "./units";

import { ALL_MODULES, type ModuleKey } from "./constants";

export { ALL_MODULES, type ModuleKey };

export type AppSettings = {
  name: string;
  units: Units;
  timezone: string;
  visibleModules: ModuleKey[];
  remindersOn: boolean;
  reminderHour: number;
  onboarded: boolean;
  tipsSeen: string[];
  calorieTarget: number | null;
  proteinTargetG: number | null;
  hideCalories: boolean;
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
    onboarded: s.onboarded,
    tipsSeen: s.tipsSeen.split(",").filter(Boolean),
    calorieTarget: s.calorieTarget,
    proteinTargetG: s.proteinTargetG,
    hideCalories: s.hideCalories,
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
