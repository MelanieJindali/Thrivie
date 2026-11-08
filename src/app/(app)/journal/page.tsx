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
  // Entries are encrypted at rest, so search decrypts this user's entries and filters here.
  const all = await db.journalEntry.findMany({
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: query ? 2000 : 60,
    include: { attachments: { select: { id: true, kind: true, durationS: true }, orderBy: { createdAt: "asc" } } },
  });
  const needle = query.toLowerCase();
  const entries = query ? all.filter((e) => e.content.toLowerCase().includes(needle) || (e.prompt ?? "").toLowerCase().includes(needle)).slice(0, 200) : all;

  return (
    <div className="space-y-6">
      <PageHeader theme="journal" icon={<NotebookPen size={26} />} eyebrow="Reflections" title="Journal" subtitle="A few lines is plenty." />
      <JournalComposer today={today} />
      <JournalList today={today} query={query} entries={entries.map(({ id, date, content, mood, prompt, attachments }) => ({ id, date, content, mood, prompt, attachments }))} />
    </div>
  );
}
