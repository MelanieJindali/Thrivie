// Client-safe copy of the module list (settings.ts is server-only).
export const ALL_MODULES_CLIENT = ["health", "workouts", "habits", "goals", "journal"] as const;
export type ModuleKey = (typeof ALL_MODULES_CLIENT)[number];
