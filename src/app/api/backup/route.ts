import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { restoreBackup } from "@/lib/backup";

export const runtime = "nodejs";

// POST /api/backup  body: a Thrivie JSON backup. Replaces all current data.
export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "That file isn't valid JSON." }, { status: 400 });
  }
  try {
    const counts = await restoreBackup(json);
    revalidatePath("/", "layout");
    return NextResponse.json({ ok: true, counts });
  } catch (e) {
    if (e instanceof ZodError) {
      const i = e.issues[0];
      return NextResponse.json({ error: `This doesn't look like a Thrivie backup (${i.path.join(".") || "root"}: ${i.message}). Nothing was changed.` }, { status: 400 });
    }
    console.error(e);
    return NextResponse.json({ error: "Restore failed — nothing was changed." }, { status: 500 });
  }
}
