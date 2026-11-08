import { NextResponse } from "next/server";
import { runReminders } from "@/lib/push";
import { safeEqual } from "@/lib/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Hit this hourly from a scheduler (cron-job.org, GitHub Actions, Vercel Cron).
// Auth: "Authorization: Bearer <CRON_SECRET>" (Vercel Cron sends this) or ?secret=<CRON_SECRET>.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const url = new URL(req.url);
  const given = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? url.searchParams.get("secret");
  if (!secret || !given || !safeEqual(given, secret)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await runReminders());
}
