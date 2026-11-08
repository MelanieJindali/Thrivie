import { getSettings } from "@/lib/settings";
import { requireUser } from "@/lib/auth";
import { todayInTz } from "@/lib/dates";
import { JournalComposer, JournalList } from "./JournalClient";
import { PageHeader } from "@/components/ui";
import { NotebookPen } from "lucide-react";

export default async function JournalPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const settings = await getSettings();
  const { db, user } = await requireUser();
  const today = todayInTz(settings.timezone);
  const query = q.trim();
  const entries = await db.journalEntry.findMany({
    where: query ? { OR: [{ content: { contains: query } }, { prompt: { contains: query } }] } : {},
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: query ? 200 : 60,
  });
  return (
    <div className="space-y-6">
      <PageHeader theme="journal" icon={<NotebookPen size={26} />} eyebrow="Reflections" title="Journal" subtitle="A few lines is plenty." />
      <JournalComposer today={today} />
      <JournalList today={today} query={query} entries={entries.map(({ id, date, content, mood, prompt }) => ({ id, date, content, mood, prompt }))} />
    </div>
  );
}
