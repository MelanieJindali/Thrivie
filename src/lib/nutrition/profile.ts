import "server-only";
import type { ScopedDb } from "../db";
import { BodyProfileSchema, type BodyProfile } from "./calculations";

// The whole profile is one JSON blob; db.ts encrypts it (AES-256-GCM, bound to the user) before it reaches Postgres.

/** The user's profile, or null if none (or if stored data no longer validates). */
export async function loadBodyProfile(db: ScopedDb, userId: string): Promise<BodyProfile | null> {
  const row = await db.bodyProfile.findUnique({ where: { userId } });
  if (!row) return null;
  try {
    const parsed = BodyProfileSchema.safeParse(JSON.parse(row.data));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function storeBodyProfile(db: ScopedDb, userId: string, profile: BodyProfile): Promise<void> {
  const data = JSON.stringify(BodyProfileSchema.parse(profile));
  await db.bodyProfile.upsert({ where: { userId }, update: { data }, create: { userId, data } });
}

/** Most recent logged weight, to prefill the form. */
export async function latestWeightKg(db: ScopedDb): Promise<number | null> {
  const row = await db.healthLog.findFirst({ where: { weightKg: { not: null } }, orderBy: { date: "desc" }, select: { weightKg: true } });
  return row?.weightKg ?? null;
}
