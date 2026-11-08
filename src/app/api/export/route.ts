import { NextResponse } from "next/server";
import { CSV_TABLES, exportAll, exportCsv, type CsvTable } from "@/lib/backup";
import { loadSettings } from "@/lib/settings";
import { apiUser } from "@/lib/auth";
import { todayInTz } from "@/lib/dates";

export const runtime = "nodejs";

// GET /api/export?format=json
// GET /api/export?format=csv&table=health
export async function GET(req: Request) {
  const auth = await apiUser();
  if (!auth) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "json";
  const settings = await loadSettings(auth.db, auth.user.id);
  const stamp = todayInTz(settings.timezone);

  if (format === "csv") {
    const table = url.searchParams.get("table") as CsvTable;
    if (!CSV_TABLES.includes(table)) return NextResponse.json({ error: `table must be one of ${CSV_TABLES.join(", ")}` }, { status: 400 });
    return new Response(await exportCsv(auth.db, table, settings.units), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="thrivie-${table}-${stamp}.csv"`,
      },
    });
  }
  return new Response(JSON.stringify(await exportAll(auth.db, auth.user.id), null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="thrivie-backup-${stamp}.json"`,
    },
  });
}
