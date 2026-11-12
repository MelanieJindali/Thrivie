import { NextResponse } from "next/server";
import { apiUser, rateLimit } from "@/lib/auth";
import { systemDb } from "@/lib/db";
import { parseBarcode } from "@/lib/nutrition/barcode";
import { lookupBarcode } from "@/lib/nutrition/foodStore";

export const runtime = "nodejs";

// GET /api/foods/barcode/5449000000996
// Looks a product up by barcode: your own foods, then Thrivie's shared product cache, then
// Open Food Facts. Only the barcode number is passed on, with nothing that identifies you.
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const auth = await apiUser();
  if (!auth) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const parsed = parseBarcode((await params).code);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const result = await lookupBarcode(auth.db, systemDb(), parsed.lookup, {
    // Stay well inside Open Food Facts' limit of 100 product lookups a minute; cached products don't count.
    allowFetch: async () => (await rateLimit(`off:${auth.user.id}`, 30, 60)) && (await rateLimit("off:all", 80, 60)),
  });
  return NextResponse.json({ barcode: parsed.lookup, ...result }, { headers: { "Cache-Control": "private, no-store" } });
}
