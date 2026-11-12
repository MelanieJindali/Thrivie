import "server-only";
import type { ScopedDb } from "../db";
import type { DateStr } from "../dates";
import { calculateTargets, type Allergen, type DietType } from "./calculations";
import { remaining, sum, type DayTargets } from "./dayFit";
import { loadBodyProfile } from "./profile";

export type DayContext = {
  /** From Body & Goals when set up; otherwise the optional targets on the Nutrition page. */
  targets: DayTargets;
  eaten: { calories: number; proteinG: number; carbsG: number; fatG: number };
  left: DayTargets;
  hasTargets: boolean;
  diet: DietType;
  allergies: Allergen[];
};

/** Today's targets, what's been logged, and what's left, for the signed-in person. */
export async function loadDay(db: ScopedDb, userId: string, today: DateStr, settings: { calorieTarget: number | null; proteinTargetG: number | null }): Promise<DayContext> {
  const [profile, meals] = await Promise.all([
    loadBodyProfile(db, userId),
    db.meal.findMany({ where: { date: today }, select: { calories: true, proteinG: true, carbsG: true, fatG: true } }),
  ]);
  const result = profile ? calculateTargets(profile) : null;
  const targets: DayTargets = result?.ok
    ? { calories: result.targets.calories, proteinG: result.targets.proteinG, carbsG: result.targets.carbsG, fatG: result.targets.fatG }
    : { calories: settings.calorieTarget, proteinG: settings.proteinTargetG, carbsG: null, fatG: null };
  const eaten = sum(meals);
  return { targets, eaten, left: remaining(targets, eaten), hasTargets: targets.calories != null || targets.proteinG != null, diet: profile?.diet ?? "none", allergies: profile?.allergies ?? [] };
}
