import { NextResponse } from "next/server";
import { apiUser, rateLimit } from "@/lib/auth";
import { systemDb } from "@/lib/db";
import { addDays } from "@/lib/dates";
import { getToday } from "@/lib/settings";
import { cacheProducts, searchFoods, searchOffProducts } from "@/lib/nutrition/foodStore";

export const runtime = "nodejs";

// GET /api/foods/search?q=yogurt          your favorites, recents, own foods, generic foods, cached products
// GET /api/foods/search?q=yogurt&online=1 also asks Open Food Facts (only the search words are sent)
export async function GET(req: Request) {
  const auth = await apiUser();
  if (!auth) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const params = new URL(req.url).searchParams;
  const q = (params.get("q") ?? "").trim().slice(0, 80);
  const sys = systemDb();
  const local = await searchFoods(auth.db, sys, q, addDays(await getToday(), -60));
  if (params.get("online") !== "1" || q.length < 3) return NextResponse.json({ ...local, online: null }, { headers: { "Cache-Control": "private, no-store" } });
  // Open Food Facts allows about 10 searches a minute for everyone using Thrivie together.
  if (!(await rateLimit(`off-search:${auth.user.id}`, 4, 60)) || !(await rateLimit("off-search:all", 8, 60))) {
    return NextResponse.json({ ...local, online: { status: "busy" as const, foods: [] } });
  }
  try {
    const seen = new Set([...local.favorites, ...local.recents, ...local.results].map((f) => f.id));
    const foods = (await cacheProducts(sys, await searchOffProducts(q))).filter((f) => !seen.has(f.id));
    return NextResponse.json({ ...local, online: { status: "ok" as const, foods } });
  } catch {
    return NextResponse.json({ ...local, online: { status: "unavailable" as const, foods: [] } });
  }
}
