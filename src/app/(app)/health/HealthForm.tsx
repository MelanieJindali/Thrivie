"use client";
import { useOfflineAction } from "@/components/OfflineSync";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { Field, FormStatus, RatingPicker, numOrNull, useAction } from "@/components/ui";
import { ENERGY_EMOJI, MOOD_EMOJI } from "@/lib/constants";
import { waterUnit, weightUnit, type Units } from "@/lib/units";

export type HealthPrefill = {
  weight: number | null;
  sleepHours: number | null;
  sleepQuality: number | null;
  water: number | null;
  mood: number | null;
  energy: number | null;
  steps: number | null;
  custom: Record<string, number>;
  notes: string | null;
};

const s = (n: number | null | undefined) => (n == null ? "" : String(n));

export function HealthForm({
  today,
  units,
  prefill,
  lastWeight,
  customKeys,
  compact = false,
  onSaved,
}: {
  today: string;
  units: Units;
  prefill: Record<string, HealthPrefill>;
  lastWeight: number | null;
  customKeys: string[];
  compact?: boolean;
  onSaved?: () => void;
}) {
  const [date, setDate] = useState(today);
  const [weight, setWeight] = useState("");
  const [sleep, setSleep] = useState("");
  const [sleepQ, setSleepQ] = useState<number | null>(null);
  const [water, setWater] = useState("");
  const [mood, setMood] = useState<number | null>(null);
  const [energy, setEnergy] = useState<number | null>(null);
  const [steps, setSteps] = useState("");
  const [notes, setNotes] = useState("");
  const [custom, setCustom] = useState<{ k: string; v: string }[]>([]);
  const { pending, error, message, run } = useAction();
  const offline = useOfflineAction();
  const existing = prefill[date];

  // Load the selected day's values so editing is the same as logging.
  useEffect(() => {
    const p = prefill[date];
    setWeight(s(p?.weight));
    setSleep(s(p?.sleepHours));
    setSleepQ(p?.sleepQuality ?? null);
    setWater(s(p?.water));
    setMood(p?.mood ?? null);
    setEnergy(p?.energy ?? null);
    setSteps(s(p?.steps));
    setNotes(p?.notes ?? "");
    setCustom(Object.entries(p?.custom ?? {}).map(([k, v]) => ({ k, v: String(v) })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const waterStep = units === "imperial" ? 8 : 250;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const customObj: Record<string, number> = {};
    for (const { k, v } of custom) {
      const n = numOrNull(v);
      if (k.trim() && n != null) customObj[k.trim()] = n;
    }
    run(
      () =>
        offline("saveHealthLog", {
          date,
          weight: numOrNull(weight),
          sleepHours: numOrNull(sleep),
          sleepQuality: sleepQ,
          water: numOrNull(water),
          mood,
          energy,
          steps: numOrNull(steps) != null ? Math.round(numOrNull(steps)!) : null,
          custom: compact ? undefined : customObj,
          notes: compact ? undefined : notes,
        }),
      { success: existing ? "Updated ✓" : "Saved ✓", onOk: onSaved },
    );
  }

  return (
    <form onSubmit={submit} id={compact ? undefined : "log"} className={compact ? "space-y-4" : "card scroll-mt-6 space-y-4"}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {!compact && <h2 className="h2">{existing ? "Update log" : "Quick log"}</h2>}
        <input type="date" className="input w-auto py-1.5 text-sm" value={date} max={today} onChange={(e) => setDate(e.target.value || today)} aria-label="Date" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label={`Weight (${weightUnit(units)})`}>
          <input className="input" inputMode="decimal" placeholder={lastWeight ? String(lastWeight) : "—"} value={weight} onChange={(e) => setWeight(e.target.value)} />
        </Field>
        <Field label="Sleep (hours)">
          <input className="input" inputMode="decimal" placeholder="7.5" value={sleep} onChange={(e) => setSleep(e.target.value)} />
        </Field>
        <Field label={`Water (${waterUnit(units)})`}>
          <div className="flex gap-1">
            <input className="input" inputMode="numeric" placeholder="0" value={water} onChange={(e) => setWater(e.target.value)} />
            <button type="button" className="btn-soft px-3" aria-label="Add a glass" title={`+${waterStep}`} onClick={() => setWater(String((numOrNull(water) ?? 0) + waterStep))}>
              +💧
            </button>
          </div>
        </Field>
        <Field label="Steps">
          <input className="input" inputMode="numeric" placeholder="8000" value={steps} onChange={(e) => setSteps(e.target.value)} />
        </Field>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] gap-4">
        <Field label="Mood">
          <RatingPicker name="Mood" value={mood} onChange={setMood} labels={MOOD_EMOJI} />
        </Field>
        <Field label="Energy">
          <RatingPicker name="Energy" value={energy} onChange={setEnergy} labels={ENERGY_EMOJI} />
        </Field>
        <Field label="Sleep quality">
          <RatingPicker name="Sleep quality" value={sleepQ} onChange={setSleepQ} />
        </Field>
      </div>

      {!compact && (
        <details className="group" open={custom.length > 0 || !!notes}>
          <summary className="cursor-pointer text-sm text-muted select-none">Custom metrics & notes</summary>
          <div className="mt-3 space-y-2">
            {custom.map((c, i) => (
              <div key={i} className="flex gap-2">
                <input className="input" placeholder="Metric (e.g. Resting HR)" list="custom-keys" value={c.k} onChange={(e) => setCustom(custom.map((x, j) => (j === i ? { ...x, k: e.target.value } : x)))} />
                <input className="input w-28" inputMode="decimal" placeholder="Value" value={c.v} onChange={(e) => setCustom(custom.map((x, j) => (j === i ? { ...x, v: e.target.value } : x)))} />
                <button type="button" className="btn-ghost px-2" aria-label="Remove metric" onClick={() => setCustom(custom.filter((_, j) => j !== i))}>
                  <X size={16} />
                </button>
              </div>
            ))}
            <datalist id="custom-keys">
              {customKeys.map((k) => <option key={k} value={k} />)}
            </datalist>
            <button type="button" className="btn-ghost px-2 text-xs" onClick={() => setCustom([...custom, { k: "", v: "" }])}>
              <Plus size={14} /> Add metric
            </button>
            <textarea className="input min-h-16" placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </details>
      )}

      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={pending} aria-busy={pending}>{pending ? "Saving…" : existing ? "Update" : "Save"}</button>
        <FormStatus error={error} message={message} />
      </div>
    </form>
  );
}
