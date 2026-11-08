import { NextResponse } from "next/server";
import { apiUser } from "@/lib/auth";
import { isDateStr } from "@/lib/dates";
import type { Existing } from "@/lib/import/duplicates";

export const runtime = "nodejs";

// GET /api/import/existing?dates=2026-11-02,2026-11-03
// Returns only the signed-in user's own entries for those dates, so the
// device can check for duplicates. No pasted text is ever sent here.
export async function GET(req: Request) {
  const auth = await apiUser();
  if (!auth) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const dates = [...new Set((new URL(req.url).searchParams.get("dates") ?? "").split(",").filter((d) => isDateStr(d)))].slice(0, 60);
  const { db } = auth;
  const [health, workouts, meals, checkins, journal, progress, goals] = await Promise.all([
    db.healthLog.findMany({ where: { date: { in: dates } }, select: { date: true, weightKg: true, sleepHours: true, sleepQuality: true, waterMl: true, mood: true, energy: true, steps: true } }),
    db.workout.findMany({ where: { date: { in: dates } }, select: { date: true, type: true, title: true, durationMin: true } }),
    db.meal.findMany({ where: { date: { in: dates } }, select: { date: true, slot: true, name: true } }),
    db.habitCheckin.findMany({ where: { date: { in: dates } }, select: { habitId: true, date: true } }),
    db.journalEntry.findMany({ where: { date: { in: dates } }, select: { date: true, content: true } }),
    db.goalProgress.findMany({ where: { date: { in: dates } }, select: { goalId: true, date: true, value: true } }),
    db.goal.findMany({ where: { archived: false }, select: { id: true, title: true, linkType: true } }),
  ]);
  const body: Existing = { health, workouts, meals, checkins, journal: journal.map((j) => ({ date: j.date, start: j.content.slice(0, 200) })), progress, goals };
  return NextResponse.json(body);
}
