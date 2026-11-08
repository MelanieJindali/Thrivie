import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { apiUser, rateLimit } from "@/lib/auth";

export const runtime = "nodejs";

const LIMITS = { photo: 2_500_000, audio: 3_500_000 }; // bytes (photos are resized on the device first)
const MIME = {
  photo: ["image/jpeg", "image/png", "image/webp"],
  audio: ["audio/webm", "audio/mp4", "audio/mpeg", "audio/ogg", "audio/aac", "audio/x-m4a", "audio/wav"],
};

// POST multipart: file, kind (photo|audio), journalId, durationS?
export async function POST(req: Request) {
  const auth = await apiUser();
  if (!auth) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!(await rateLimit(`upload:${auth.user.id}`, 60, 3600))) return NextResponse.json({ error: "Too many uploads. Try again later." }, { status: 429 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const kind = String(form?.get("kind") ?? "") as keyof typeof LIMITS;
  const journalId = String(form?.get("journalId") ?? "");
  if (!(file instanceof Blob) || !(kind in LIMITS)) return NextResponse.json({ error: "Missing file." }, { status: 400 });
  const mime = (file.type || "").split(";")[0];
  if (!MIME[kind].includes(mime)) return NextResponse.json({ error: `Unsupported ${kind} format (${mime || "unknown"}).` }, { status: 415 });
  if (file.size > LIMITS[kind]) return NextResponse.json({ error: `That ${kind} is too large.` }, { status: 413 });
  // The entry must belong to the signed-in user (scoped lookup returns null otherwise).
  if (!journalId || !(await auth.db.journalEntry.findUnique({ where: { id: journalId } }))) {
    return NextResponse.json({ error: "Journal entry not found." }, { status: 404 });
  }
  const durationS = Number(form?.get("durationS"));
  const row = await auth.db.attachment.create({
    data: {
      userId: auth.user.id,
      journalId,
      kind,
      mime,
      size: file.size,
      durationS: Number.isFinite(durationS) && durationS > 0 ? durationS : null,
      data: Buffer.from(await file.arrayBuffer()),
    },
    select: { id: true },
  });
  revalidatePath("/journal");
  return NextResponse.json({ id: row.id });
}
