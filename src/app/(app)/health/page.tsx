import { getSettings } from "@/lib/settings";
import { requireUser } from "@/lib/auth";
import { todayInTz, formatDate, relativeLabel } from "@/lib/dates";
import { getHealthRange } from "@/lib/queries";
import { healthTrendSpecs } from "@/lib/trends";
import { kgToDisplay, mlToDisplay, waterUnit, weightUnit } from "@/lib/units";
import { TrendGroup } from "@/components/charts";
import { HealthForm, type HealthPrefill } from "./HealthForm";
import { HealthRowActions } from "./HealthRowActions";
import { MOOD_EMOJI } from "@/lib/constants";
import { PageHeader } from "@/components/ui";
import { HeartPulse } from "lucide-react";

export default async function HealthPage() {
  const settings = await getSettings();
  const { db, user } = await requireUser();
  const today = todayInTz(settings.timezone);
  const logs = await getHealthRange(db, today, 90);
  const u = settings.units;

  const prefill: Record<string, HealthPrefill> = {};
  const customKeys = new Set<string>();
  for (const l of logs) {
    const custom = l.custom ? (JSON.parse(l.custom) as Record<string, number>) : {};
    Object.keys(custom).forEach((k) => customKeys.add(k));
    prefill[l.date] = {
      weight: l.weightKg != null ? kgToDisplay(l.weightKg, u) : null,
      sleepHours: l.sleepHours,
      sleepQuality: l.sleepQuality,
      water: l.waterMl != null ? mlToDisplay(l.waterMl, u) : null,
      mood: l.mood,
      energy: l.energy,
      steps: l.steps,
      custom,
      notes: l.notes,
    };
  }
  // Fall back to the most recent weight so it's quick to re-log.
  const lastWeight = [...logs].reverse().find((l) => l.weightKg != null);
  const total = await db.healthLog.count();

  return (
    <div className="space-y-6">
      <PageHeader theme="health" icon={<HeartPulse size={26} />} eyebrow="Body & mind" title="Health" subtitle="Log just what you know — every field is optional." />
      <HealthForm
        today={today}
        units={u}
        prefill={prefill}
        lastWeight={lastWeight?.weightKg != null ? kgToDisplay(lastWeight.weightKg, u) : null}
        customKeys={[...customKeys]}
      />
      <TrendGroup specs={healthTrendSpecs(logs, today, u, ["weight", "sleep", "mood", "energy", "steps", "water"])} />
      <section className="card">
        <h2 className="h2 mb-3">Recent logs <span className="text-sm font-normal text-muted">({total} total)</span></h2>
        <ul className="divide-y divide-border">
          {[...logs].reverse().slice(0, 21).map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-sm">
              <span className="w-24 font-medium">{relativeLabel(l.date, today)}</span>
              {l.weightKg != null && <span>{kgToDisplay(l.weightKg, u)} {weightUnit(u)}</span>}
              {l.sleepHours != null && <span>😴 {l.sleepHours}h{l.sleepQuality ? ` · ${l.sleepQuality}/5` : ""}</span>}
              {l.mood != null && <span>{MOOD_EMOJI[l.mood - 1]} mood {l.mood}</span>}
              {l.energy != null && <span>⚡ {l.energy}</span>}
              {l.steps != null && <span>👟 {l.steps.toLocaleString()}</span>}
              {l.waterMl != null && <span>💧 {mlToDisplay(l.waterMl, u)} {waterUnit(u)}</span>}
              <span className="ml-auto"><HealthRowActions id={l.id} /></span>
            </li>
          ))}
          {!logs.length && <li className="py-4 text-sm text-muted">Nothing logged yet. Start with today above.</li>}
        </ul>
        {logs.length > 21 && <p className="mt-2 text-xs text-muted">Showing the last 21 entries since {formatDate(logs[0].date)}. Export from Settings for everything.</p>}
      </section>
    </div>
  );
}
