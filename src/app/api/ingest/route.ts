import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma, scopedDb } from "@/lib/db";
import { sha256 } from "@/lib/auth";
import { loadSettings } from "@/lib/settings";
import { todayInTz } from "@/lib/dates";
import { IngestSchema, normalizeIngest } from "@/lib/ingest";

export const runtime = "nodejs";

// POST /api/ingest   Authorization: Bearer thr_…   (a personal token from Settings → Health sync)
// Body: { date?, steps?, sleepHours?, weight?, water?, mood?, energy?, restingHeartRate?, workouts?: [...] }
export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token?.startsWith("thr_")) return NextResponse.json({ error: "Missing or invalid token." }, { status: 401 });
  const row = await prisma.apiToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!row) return NextResponse.json({ error: "Missing or invalid token." }, { status: 401 });

  const body = IngestSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    const i = body.error.issues[0];
    return NextResponse.json({ error: `Invalid body (${i.path.join(".") || "root"}: ${i.message}).` }, { status: 400 });
  }
  const db = scopedDb(row.userId); // everything below is confined to the token owner
  const settings = await loadSettings(db, row.userId);
  const { date, health, custom, workouts } = normalizeIngest(body.data, todayInTz(settings.timezone), settings.units);

  let healthUpdated = false;
  if (Object.keys(health).length || Object.keys(custom).length) {
    const ex = await db.healthLog.findUnique({ where: { userId_date: { userId: row.userId, date } } });
    const mergedCustom = { ...(ex?.custom ? (JSON.parse(ex.custom) as Record<string, number>) : {}), ...custom };
    const data = { ...health, ...(Object.keys(mergedCustom).length ? { custom: JSON.stringify(mergedCustom) } : {}) };
    await db.healthLog.upsert({ where: { userId_date: { userId: row.userId, date } }, update: data, create: { userId: row.userId, date, ...data } });
    healthUpdated = true;
  }

  let added = 0;
  for (const w of workouts) {
    // Skip if the same synced workout was already sent (shortcuts often run twice).
    const dup = await db.workout.findFirst({ where: { date, type: w.type, durationMin: w.durationMin, source: "sync" } });
    if (dup) continue;
    await db.workout.create({ data: { userId: row.userId, date, ...w, source: "sync" } });
    added++;
  }
  await prisma.apiToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } });
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true, date, healthUpdated, fields: Object.keys(health), workoutsAdded: added });
}
