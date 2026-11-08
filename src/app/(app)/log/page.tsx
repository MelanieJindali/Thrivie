import Link from "next/link";
import { HeartPulse, Dumbbell, CircleCheck, Target, NotebookPen, ClipboardPaste, ChevronRight } from "lucide-react";
import { getSettings } from "@/lib/settings";
import { requireUser } from "@/lib/auth";
import { relativeLabel, todayInTz } from "@/lib/dates";
import { describeWorkout } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { Tip } from "@/components/Tip";

const TILES = [
  { href: "/health#log", module: "health", label: "Check-in", sub: "Mood, energy, sleep, water, steps, weight", icon: HeartPulse, tone: "bg-terracotta-soft text-terracotta-ink" },
  { href: "/workouts#log", module: "workouts", label: "Workout", sub: "Type, time, intensity — or repeat last", icon: Dumbbell, tone: "bg-ocean-soft text-ocean" },
  { href: "/habits#today", module: "habits", label: "Habits", sub: "One tap to check off", icon: CircleCheck, tone: "bg-sage-soft text-sage-ink" },
  { href: "/goals#progress", module: "goals", label: "Goal progress", sub: "Linked goals update by themselves", icon: Target, tone: "bg-gold-soft text-gold-ink" },
  { href: "/journal#new", module: "journal", label: "Journal", sub: "A few lines, a photo or a voice note", icon: NotebookPen, tone: "bg-iris-soft text-iris" },
] as const;

export default async function LogPage() {
  const settings = await getSettings();
  const { db } = await requireUser();
  const today = todayInTz(settings.timezone);
  const [workouts, journal, health] = await Promise.all([
    db.workout.findMany({ orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 4 }),
    db.journalEntry.findMany({ orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 3, select: { id: true, date: true, content: true } }),
    db.healthLog.findMany({ orderBy: { date: "desc" }, take: 3 }),
  ]);
  const recent = [
    ...workouts.map((w) => ({ key: `w${w.id}`, date: w.date, text: describeWorkout(w, settings.units), href: "/workouts" })),
    ...journal.map((j) => ({ key: `j${j.id}`, date: j.date, text: `📝 ${j.content.slice(0, 70)}${j.content.length > 70 ? "…" : ""}`, href: "/journal" })),
    ...health.map((h) => ({ key: `h${h.id}`, date: h.date, text: `🩺 Check-in${h.sleepHours != null ? ` · ${h.sleepHours}h sleep` : ""}${h.mood ? ` · mood ${h.mood}/5` : ""}`, href: "/health" })),
  ].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 8);

  return (
    <div className="space-y-6">
      <PageHeader theme="today" eyebrow="Log" title="What would you like to log?" />
      <Tip id="log" seen={settings.tipsSeen}>Every field is optional. Log just what you know; you can always come back to it.</Tip>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {TILES.filter((t) => settings.visibleModules.includes(t.module)).map(({ href, label, sub, icon: Icon, tone }) => (
          <li key={href}>
            <Link href={href} className="lift flex min-h-24 items-center gap-4 rounded-3xl border border-border/70 bg-surface p-5 shadow-soft">
              <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${tone}`} aria-hidden><Icon size={22} /></span>
              <span className="min-w-0 flex-1"><span className="block font-display text-lg font-semibold">{label}</span><span className="block text-sm text-muted">{sub}</span></span>
              <ChevronRight size={18} className="text-muted" aria-hidden />
            </Link>
          </li>
        ))}
        <li>
          <Link href="/import" className="lift flex min-h-24 items-center gap-4 rounded-3xl border border-dashed border-driftwood p-5">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-seaglass-soft text-primary" aria-hidden><ClipboardPaste size={22} /></span>
            <span className="min-w-0 flex-1"><span className="block font-display text-lg font-semibold">Paste notes</span><span className="block text-sm text-muted">Turn notes from any app into entries</span></span>
          </Link>
        </li>
      </ul>
      {recent.length > 0 && (
        <section className="card" aria-labelledby="recent-h">
          <h2 id="recent-h" className="h2 mb-3">Recently logged</h2>
          <ul className="divide-y divide-border">
            {recent.map((r) => (
              <li key={r.key}>
                <Link href={r.href} className="flex min-h-12 items-center gap-3 py-2 text-sm">
                  <span className="w-20 shrink-0 text-muted">{relativeLabel(r.date, today)}</span>
                  <span className="min-w-0 flex-1 truncate">{r.text}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
