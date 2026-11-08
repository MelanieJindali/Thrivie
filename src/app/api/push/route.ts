import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiUser } from "@/lib/auth";

export const runtime = "nodejs";

const Sub = z.object({ endpoint: z.string().url().max(1000), keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }) });

export async function GET() {
  return NextResponse.json({ publicKey: process.env.VAPID_PUBLIC_KEY ?? null });
}

/** Save this device's push subscription for the signed-in user. */
export async function POST(req: Request) {
  const auth = await apiUser();
  if (!auth) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const sub = Sub.safeParse(await req.json().catch(() => null));
  if (!sub.success) return NextResponse.json({ error: "Invalid subscription." }, { status: 400 });
  // A device that switches accounts should only notify the current account.
  await prisma.pushSubscription.deleteMany({ where: { endpoint: sub.data.endpoint } });
  await auth.db.pushSubscription.create({ data: { userId: auth.user.id, endpoint: sub.data.endpoint, p256dh: sub.data.keys.p256dh, auth: sub.data.keys.auth } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const auth = await apiUser();
  if (!auth) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const { endpoint } = (await req.json().catch(() => ({}))) as { endpoint?: string };
  if (endpoint) await auth.db.pushSubscription.deleteMany({ where: { endpoint } });
  return NextResponse.json({ ok: true });
}
