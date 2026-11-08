import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { apiUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser();
  if (!auth) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const a = await auth.db.attachment.findUnique({ where: { id } }); // scoped: only the owner gets a row
  if (!a) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(a.data), {
    headers: {
      "Content-Type": a.mime,
      "Content-Length": String(a.size),
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser();
  if (!auth) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const { id } = await params;
  const r = await auth.db.attachment.deleteMany({ where: { id } });
  revalidatePath("/journal");
  return NextResponse.json({ deleted: r.count });
}
