import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/auth";
import { loadSettings } from "@/lib/settings";
import { todayInTz } from "@/lib/dates";
import { AiError, complete } from "@/lib/ai";
import { IMPORT_SYSTEM_PROMPT, buildImportUserMessage, parseImportResponse } from "@/lib/import/schema";
import { normalizeEntries } from "@/lib/import/normalize";
import { detectDuplicates } from "@/lib/import/server";

export const runtime = "nodejs";

const Body = z.object({ text: z.string().trim().min(1, "Paste some notes first.").max(20000, "That's a lot of text — paste up to ~20,000 characters at a time.") });

export async function POST(req: Request) {
  const auth = await apiUser();
  if (!auth) return NextResponse.json({ error: "Please sign in.", retryable: false }, { status: 401 });
  const { db } = auth;
  const body = Body.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: body.error.issues[0].message, retryable: false }, { status: 400 });

  const settings = await loadSettings(db, auth.user.id);
  const today = todayInTz(settings.timezone);
  const [habits, goals] = await Promise.all([
    db.habit.findMany({ where: { archived: false }, select: { id: true, name: true } }),
    db.goal.findMany({ where: { archived: false }, select: { id: true, title: true, unit: true } }),
  ]);

  let raw: string;
  try {
    raw = await complete({
      system: IMPORT_SYSTEM_PROMPT,
      user: buildImportUserMessage({
        text: body.data.text,
        today,
        timezone: settings.timezone,
        habits: habits.map((h) => h.name),
        goals: goals.map((g) => ({ title: g.title, unit: g.unit })),
      }),
      maxTokens: 16000,
      effort: "medium",
    });
  } catch (e) {
    const err = e instanceof AiError ? e : new AiError("Unexpected error contacting the AI.");
    return NextResponse.json({ error: err.message, retryable: err.retryable }, { status: 502 });
  }

  const parsed = parseImportResponse(raw);
  if (!parsed.ok) {
    console.warn("Import parse failure:", parsed.error, parsed.detail);
    return NextResponse.json({ error: `${parsed.error} This happens occasionally — please retry.`, detail: parsed.detail, retryable: true }, { status: 422 });
  }

  const items = normalizeEntries(parsed.entries, {
    today,
    units: settings.units,
    habits: habits.map((h) => ({ id: h.id, name: h.name })),
    goals: goals.map((g) => ({ id: g.id, name: g.title })),
  });
  const withDup = await detectDuplicates(db, items, settings.units);
  return NextResponse.json({ today, items: withDup, unparsed: parsed.unparsed, dropped: parsed.dropped });
}
