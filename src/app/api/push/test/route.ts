import { NextResponse } from "next/server";
import { apiUser } from "@/lib/auth";
import { pushConfigured, sendToUser } from "@/lib/push";

export const runtime = "nodejs";

export async function POST() {
  const auth = await apiUser();
  if (!auth) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!pushConfigured()) return NextResponse.json({ error: "Push isn't configured on this server (VAPID keys missing)." }, { status: 503 });
  const sent = await sendToUser(auth.user.id, { title: "Thrivie 🌿", body: "Reminders are working. See you later!", url: "/" });
  return NextResponse.json({ sent });
}
