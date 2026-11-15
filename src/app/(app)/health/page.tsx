import { getSettings } from "@/lib/settings";
import { requireUser } from "@/lib/auth";
import { todayInTz } from "@/lib/dates";
import { getHealthRange } from "@/lib/queries";
import { healthTrendSpecs } from "@/lib/trends";
import { kgToDisplay, mlToDisplay, waterUnit, weightUnit } from "@/lib/units";
import { TrendGroup } from "@/components/LazyCharts";
import { HealthForm } from "./HealthForm";
import { healthFormData } from "@/lib/formData";
import { HealthHistory } from "./HealthHistory";
import { MOOD_EMOJI } from "@/lib/constants";
import { PageHeader } from "@/components/ui";
import { HeartPulse } from "lucide-react";

export default async function HealthPage() {
  const settings = await getSettings();
  const { db } = await requireUser();
  const today = todayInTz(settings.timezone);
  const logs = await getHealthRange(db, today, 90);
  const u = settings.units;

  const form = healthFormData(logs, u);
  const total = await db.healthLog.count();

  return (
    <div className="space-y-6">
      <PageHeader theme="health" icon={<HeartPulse size={26} />} eyebrow="Body & mind" title="Health" crumbs={[{ href: "/log", label: "Log" }]} subtitle="Log just what you know. Every field is optional." />
      <HealthForm
        today={today}
        units={u}
        prefill={form.prefill}
        lastWeight={form.lastWeight}
        customKeys={form.customKeys}
      />
      <TrendGroup specs={healthTrendSpecs(logs, today, u, ["weight", "sleep", "mood", "energy", "steps", "water"])} />
      <section className="card">
        <h2 className="h2 mb-3">Recent logs <span className="text-sm font-normal text-muted">({total} total)</span></h2>
        <HealthHistory today={today} rows={[...logs].reverse().map((l) => ({
          id: l.id, date: l.date,
          weight: l.weightKg != null ? `${kgToDisplay(l.weightKg, u)} ${weightUnit(u)}` : null,
          sleep: l.sleepHours != null ? `${l.sleepHours}h${l.sleepQuality ? ` · ${l.sleepQuality}/5` : ""}` : null, sleepHours: l.sleepHours,
          mood: l.mood != null ? `${MOOD_EMOJI[l.mood - 1]} mood ${l.mood}` : null, moodValue: l.mood,
          energy: l.energy, steps: l.steps, water: l.waterMl != null ? `${mlToDisplay(l.waterMl, u)} ${waterUnit(u)}` : null, notes: l.notes,
        }))} />
      </section>
    </div>
  );
}
