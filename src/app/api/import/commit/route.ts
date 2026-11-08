import { NextResponse } from "next/server";
import { logError } from "@/lib/log";
import { readJson, tooLarge } from "@/lib/body";
import { revalidatePath } from "next/cache";
import { CommitBody, commitItems, saveAliases } from "@/lib/import/server";
import { apiUser, rateLimit } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const auth = await apiUser();
  if (!auth) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!(await rateLimit(`write:${auth.user.id}`, 600, 600))) return NextResponse.json({ error: "Too many requests. Please wait a minute." }, { status: 429 });
  const raw = await readJson(req, 1_000_000);
  if (raw === undefined) return tooLarge("1 MB");
  const body = CommitBody.safeParse(raw);
  if (!body.success) {
    const issue = body.error.issues[0];
    return NextResponse.json({ error: `Some entries are invalid (${issue.path.join(".")}: ${issue.message}). Please fix them and try again.` }, { status: 400 });
  }
  try {
    const result = await commitItems(auth.db, auth.user.id, body.data.items);
    await saveAliases(auth.db, auth.user.id, body.data.aliases);
    revalidatePath("/", "layout");
    return NextResponse.json(result);
  } catch (e) {
    logError("import-commit", e);
    return NextResponse.json({ error: "Saving failed — nothing was changed. Please try again." }, { status: 500 });
  }
}
