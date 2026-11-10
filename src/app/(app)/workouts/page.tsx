import { getSettings } from "@/lib/settings";
import { requireUser } from "@/lib/auth";
import { todayInTz } from "@/lib/dates";
import { getWorkoutsRange } from "@/lib/queries";
import { weeklyVolume } from "@/lib/trends";
import { kgToDisplay, kmToDisplay, paceToDisplay } from "@/lib/units";
import { WorkoutVolumeChart } from "@/components/LazyCharts";
import { WorkoutsView, type WorkoutRow } from "./WorkoutsView";
import { describeWorkout } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { Dumbbell } from "lucide-react";

export default async function WorkoutsPage() {
  const settings = await getSettings();
  const { db, user } = await requireUser();
  const u = settings.units;
  const today = todayInTz(settings.timezone);
  const workouts = await getWorkoutsRange(db, today, 120);
  const names = await db.exercise.findMany({ distinct: ["name"], select: { name: true }, take: 200 });
  const last = workouts.at(-1);

  const rows: WorkoutRow[] = [...workouts].reverse().map((w) => ({
    id: w.id,
    date: w.date,
    summary: describeWorkout(w, u),
    draft: {
      id: w.id,
      date: w.date,
      type: w.type as WorkoutRow["draft"]["type"],
      title: w.title ?? "",
      durationMin: String(w.durationMin),
      intensity: w.intensity,
      distance: w.distanceKm != null ? String(kmToDisplay(w.distanceKm, u)) : "",
      pace: w.paceMinKm != null ? String(paceToDisplay(w.paceMinKm, u)) : "",
      notes: w.notes ?? "",
      exercises: w.exercises.map((e) => ({
        name: e.name,
        sets: e.sets != null ? String(e.sets) : "",
        reps: e.reps != null ? String(e.reps) : "",
        weight: e.weightKg != null ? String(kgToDisplay(e.weightKg, u)) : "",
      })),
    },
    exercises: w.exercises.map((e) => `${e.name}${e.sets && e.reps ? ` ${e.sets}×${e.reps}` : ""}${e.weightKg ? ` @ ${kgToDisplay(e.weightKg, u)}` : ""}`),
  }));

  const thisWeek = weeklyVolume(workouts, today, 1)[0];
  const weekMinutes = Object.entries(thisWeek).filter(([k]) => k !== "week").reduce((a, [, v]) => a + Number(v), 0);

  return (
    <div className="space-y-6">
      <PageHeader theme="workouts" icon={<Dumbbell size={26} />} eyebrow="Movement" title="Workouts" crumbs={[{ href: "/log", label: "Log" }]} subtitle={weekMinutes ? `${weekMinutes} active minutes so far this week.` : "Every bit of movement counts."} />
      <WorkoutsView today={today} units={u} rows={rows} exerciseNames={names.map((n) => n.name)} lastSummary={last ? describeWorkout(last, u) : null} />
      <section className="card">
        <h2 className="h2 mb-3">Weekly volume (minutes)</h2>
        <WorkoutVolumeChart data={weeklyVolume(workouts, today, 12)} />
      </section>
    </div>
  );
}
