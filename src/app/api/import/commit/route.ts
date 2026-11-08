import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { CommitBody, commitItems } from "@/lib/import/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = CommitBody.safeParse(await req.json().catch(() => ({})));
  if (!body.success) {
    const issue = body.error.issues[0];
    return NextResponse.json({ error: `Some entries are invalid (${issue.path.join(".")}: ${issue.message}). Please fix them and try again.` }, { status: 400 });
  }
  try {
    const result = await commitItems(body.data.items);
    revalidatePath("/", "layout");
    return NextResponse.json(result);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Saving failed — nothing was changed. Please try again." }, { status: 500 });
  }
}
