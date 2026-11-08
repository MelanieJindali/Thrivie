import { NextResponse } from "next/server";
import { logError } from "@/lib/log";
import { readJson } from "@/lib/body";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { restoreBackup } from "@/lib/backup";
import { apiUser } from "@/lib/auth";

export const runtime = "nodejs";

// POST /api/backup  body: a Thrivie JSON backup. Replaces all current data.
export async function POST(req: Request) {
  const auth = await apiUser();
  if (!auth) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const json = await readJson(req, 10_000_000);
  if (json === undefined) return NextResponse.json({ error: "That file isn't a valid backup or is larger than 10 MB." }, { status: 400 });
  try {
    const counts = await restoreBackup(auth.db, auth.user.id, json);
    revalidatePath("/", "layout");
    return NextResponse.json({ ok: true, counts });
  } catch (e) {
    if (e instanceof ZodError) {
      const i = e.issues[0];
      return NextResponse.json({ error: `This doesn't look like a Thrivie backup (${i.path.join(".") || "root"}: ${i.message}). Nothing was changed.` }, { status: 400 });
    }
    logError("backup-restore", e);
    return NextResponse.json({ error: "Restore failed — nothing was changed." }, { status: 500 });
  }
}
