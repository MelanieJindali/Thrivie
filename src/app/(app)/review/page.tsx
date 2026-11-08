import Link from "next/link";
import { CalendarHeart, ChevronLeft, ChevronRight } from "lucide-react";
import { getSettings } from "@/lib/settings";
import { requireUser } from "@/lib/auth";
import { addDays, startOfWeek, todayInTz } from "@/lib/dates";
import { getReview, weekFromParam } from "@/lib/review";
import { PageHeader, ProgressBar } from "@/components/ui";
import { WORKOUT_LABELS, type WorkoutType } from "@/lib/constants";
import { ReviewCard } from "./ReviewCard";

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const { week } = await searchParams;
  const settings = await getSettings();
  const { db, user } = await requireUser();
  const today = todayInTz(settings.timezone);
  const weekStart = weekFromParam(week, today);
  const { stats: s, review, source } = await getReview(db, user.id, weekStart, false);
  const isLatest = weekStart >= startOfWeek(today);
  const tiles = [
    { label: "Workouts", value: String(s.workouts), sub: `${s.minutes} min`, tone: "bg-sapphire-soft text-sapphire" },
    { label: "Avg sleep", value: s.sleep != null ? `${s.sleep}h` : "—", sub: `${s.daysLogged} days logged`, tone: "bg-plum-soft text-plum" },
    { label: "Avg mood", value: s.mood != null ? `${s.mood}/5` : "—", sub: s.energy != null ? `energy ${s.energy}/5` : "", tone: "bg-amber-soft text-amber" },
    { label: "Steps / day", value: s.steps != null ? Math.round(s.steps).toLocaleString("en-US") : "—", sub: s.distance ?? "", tone: "bg-emerald-soft text-emerald" },
  ];
  return (
    <div className="space-y-6">
      <PageHeader theme="today" icon={<CalendarHeart size={26} />} eyebrow={s.complete ? "Week in review" : "This week so far"} title={s.label}>
        <Link href={`/review?week=${addDays(weekStart, -7)}`} className="btn-ghost px-3" aria-label="Previous week"><ChevronLeft size={18} /></Link>
        {!isLatest && <Link href={`/review?week=${addDays(weekStart, 7)}`} className="btn-ghost px-3" aria-label="Next week"><ChevronRight size={18} /></Link>}
      </PageHeader>

      <ReviewCard weekStart={weekStart} review={review} source={source} />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className={`rounded-3xl p-4 ${t.tone}`}>
            <div className="text-[10px] font-bold tracking-[0.12em] uppercase">{t.label}</div>
            <div className="mt-1 font-display text-2xl font-semibold text-text">{t.value}</div>
            <div className="text-xs text-muted">{t.sub}</div>
          </div>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card space-y-3">
          <h2 className="h2">Habits</h2>
          {s.habits.length ? s.habits.map((h) => (
            <div key={h.name}>
              <div className="mb-1 flex justify-between text-sm"><span>{h.emoji} {h.name}</span><span className="text-muted">{h.done}/{h.target}</span></div>
              <ProgressBar pct={h.pct} />
            </div>
          )) : <p className="text-sm text-muted">No habits yet.</p>}
        </section>
        <section className="card space-y-3">
          <h2 className="h2">Movement</h2>
          {Object.keys(s.byType).length ? Object.entries(s.byType).map(([t, m]) => (
            <div key={t} className="flex justify-between text-sm"><span>{WORKOUT_LABELS[t as WorkoutType]?.emoji} {WORKOUT_LABELS[t as WorkoutType]?.label ?? t}</span><span className="font-semibold">{m} min</span></div>
          )) : <p className="text-sm text-muted">No workouts logged this week — rest is part of the plan too.</p>}
          {s.prevMinutes > 0 && <p className="text-xs text-muted">Previous week: {s.prevMinutes} min</p>}
          <p className="text-xs text-muted">Journaled on {s.journalDays} day{s.journalDays === 1 ? "" : "s"}.</p>
        </section>
      </div>

      {s.goals.length > 0 && (
        <section className="card space-y-3">
          <h2 className="h2">Goals</h2>
          {s.goals.map((g) => (
            <div key={g.title}>
              <div className="mb-1 flex justify-between text-sm"><span>{g.title}</span><span className="text-muted">{g.current} / {g.target} {g.unit}</span></div>
              <ProgressBar pct={g.pct} tone={g.status === "behind" ? "warn" : "primary"} />
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
