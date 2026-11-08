import { NextResponse } from "next/server";
import { getOrCreateBrief } from "@/lib/brief";

export const runtime = "nodejs";

// POST /api/brief            → cached brief for today (generated on first call)
// POST /api/brief {refresh}  → regenerate
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { refresh?: boolean };
  try {
    return NextResponse.json(await getOrCreateBrief(!!body.refresh));
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Couldn't build today's brief." }, { status: 500 });
  }
}
