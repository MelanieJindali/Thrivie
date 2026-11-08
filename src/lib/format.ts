import type { Workout } from "@prisma/client";
import { WORKOUT_LABELS, type WorkoutType } from "./constants";
import { distanceUnit, formatPace, kmToDisplay, paceToDisplay, paceUnit, type Units } from "./units";

export function describeWorkout(w: Pick<Workout, "type" | "title" | "durationMin" | "distanceKm" | "paceMinKm">, u: Units): string {
  const meta = WORKOUT_LABELS[w.type as WorkoutType] ?? WORKOUT_LABELS.other;
  const parts = [`${meta.emoji} ${w.title || meta.label}`, `${w.durationMin} min`];
  if (w.distanceKm) parts.push(`${kmToDisplay(w.distanceKm, u)} ${distanceUnit(u)}`);
  if (w.paceMinKm) parts.push(`${formatPace(paceToDisplay(w.paceMinKm, u))} ${paceUnit(u)}`);
  return parts.join(" · ");
}
