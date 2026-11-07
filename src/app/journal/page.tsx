import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { todayInTz } from "@/lib/dates";
import { JournalComposer, JournalList } from "./JournalClient";

export default async function JournalPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const settings = await getSettings();
  const today = todayInTz(settings.timezone);
  const query = q.trim();
  const entries = await prisma.journalEntry.findMany({
    where: query ? { OR: [{ content: { contains: query } }, { prompt: { contains: query } }] } : {},
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: query ? 200 : 60,
  });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="h1">Journal</h1>
        <p className="mt-1 text-sm text-muted">A few lines is plenty.</p>
      </div>
      <JournalComposer today={today} />
      <JournalList today={today} query={query} entries={entries.map(({ id, date, content, mood, prompt }) => ({ id, date, content, mood, prompt }))} />
    </div>
  );
}
