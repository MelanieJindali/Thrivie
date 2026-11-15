"use client";
import { useOfflineAction } from "@/components/OfflineSync";

import { useEffect, useId, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { Field, FormStatus, MoreDetails, RatingPicker, clearDraft, numOrNull, useAction, useSheetDraft } from "@/components/ui";
import { ENERGY_EMOJI, MOOD_EMOJI } from "@/lib/constants";
import { waterUnit, weightUnit, type Units } from "@/lib/units";

import type { HealthPrefill } from "@/lib/formData";

const s = (n: number | null | undefined) => (n == null ? "" : String(n));

export function HealthForm({
  today,
  units,
  prefill,
  lastWeight,
  customKeys,
  sheet = false,
  onSaved,
}: {
  today: string;
  units: Units;
  prefill: Record<string, HealthPrefill>;
  lastWeight: number | null;
  customKeys: string[];
  /** In the quick-log sheet: the same fields, with the less-used ones under "More details". */
  sheet?: boolean;
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
  const listId = useId();
  const skipLoad = useRef(false);

  // Load the selected day's values so editing is the same as logging, and so a quick check-in
  // adds to what was logged earlier that day instead of replacing it.
  useEffect(() => {
    if (skipLoad.current) { skipLoad.current = false; return; }
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

  // What's typed in the sheet carries over to the full page.
  useSheetDraft("health", sheet, { date, weight, sleep, sleepQ, water, mood, energy, steps, notes, custom }, (d) => {
    skipLoad.current = d.date !== date;
    setDate(d.date); setWeight(d.weight); setSleep(d.sleep); setSleepQ(d.sleepQ); setWater(d.water);
    setMood(d.mood); setEnergy(d.energy); setSteps(d.steps); setNotes(d.notes); setCustom(d.custom);
  });

  const waterStep = units === "imperial" ? 8 : 250;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const customObj: Record<string, number> = {};
    for (const { k, v } of custom) {
      const n = numOrNull(v);
      if (k.trim() && n != null) customObj[k.trim()] = n;
    }
    const nothing = !existing && !Object.keys(customObj).length && !notes.trim() && mood == null && energy == null && sleepQ == null && [weight, sleep, water, steps].every((v) => numOrNull(v) == null);
    if (nothing) return run(async () => ({ ok: false, error: "Add at least one value." }));
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
          custom: customObj,
          notes,
        }),
      { success: existing ? "Check-in updated ✓" : "Check-in saved ✓", onOk: () => { clearDraft("health"); onSaved?.(); } },
    );
  }

  const dateField = <input type="date" className="input w-auto py-1.5 text-sm" value={date} max={today} onChange={(e) => setDate(e.target.value || today)} aria-label="Date" />;
  const weightField = (
    <Field label={`Weight (${weightUnit(units)})`}>
      <input className="input" inputMode="decimal" placeholder={lastWeight ? String(lastWeight) : "—"} value={weight} onChange={(e) => setWeight(e.target.value)} />
    </Field>
  );
  const sleepField = (
    <Field label="Sleep (hours)">
      <input className="input" inputMode="decimal" placeholder="7.5" value={sleep} onChange={(e) => setSleep(e.target.value)} />
    </Field>
  );
  const waterField = (
    <Field label={`Water (${waterUnit(units)})`}>
      <div className="flex gap-1">
        <input className="input" inputMode="numeric" placeholder="0" value={water} onChange={(e) => setWater(e.target.value)} />
        <button type="button" className="btn-soft px-3" aria-label="Add a glass" title={`+${waterStep}`} onClick={() => setWater(String((numOrNull(water) ?? 0) + waterStep))}>
          +💧
        </button>
      </div>
    </Field>
  );
  const stepsField = (
    <Field label="Steps">
      <input className="input" inputMode="numeric" placeholder="8000" value={steps} onChange={(e) => setSteps(e.target.value)} />
    </Field>
  );
  const moodField = <Field label="Mood"><RatingPicker name="Mood" value={mood} onChange={setMood} labels={MOOD_EMOJI} /></Field>;
  const energyField = <Field label="Energy"><RatingPicker name="Energy" value={energy} onChange={setEnergy} labels={ENERGY_EMOJI} /></Field>;
  const sleepQField = <Field label="Sleep quality"><RatingPicker name="Sleep quality" value={sleepQ} onChange={setSleepQ} /></Field>;
  const extras = (
    <div className="space-y-2">
      {custom.map((c, i) => (
        <div key={i} className="flex gap-2">
          <input className="input" placeholder="Metric (e.g. Resting HR)" aria-label="Metric name" list={listId} value={c.k} onChange={(e) => setCustom(custom.map((x, j) => (j === i ? { ...x, k: e.target.value } : x)))} />
          <input className="input w-28" inputMode="decimal" placeholder="Value" aria-label="Metric value" value={c.v} onChange={(e) => setCustom(custom.map((x, j) => (j === i ? { ...x, v: e.target.value } : x)))} />
          <button type="button" className="btn-ghost px-2" aria-label="Remove metric" onClick={() => setCustom(custom.filter((_, j) => j !== i))}>
            <X size={16} />
          </button>
        </div>
      ))}
      <datalist id={listId}>
        {customKeys.map((k) => <option key={k} value={k} />)}
      </datalist>
      <button type="button" className="btn-ghost px-2 text-xs" onClick={() => setCustom([...custom, { k: "", v: "" }])}>
        <Plus size={14} /> Add metric
      </button>
      <textarea className="input min-h-16" placeholder="Notes (optional)" aria-label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
    </div>
  );
  const actions = (
    <div className="flex flex-wrap items-center gap-3">
      <button className={`btn-primary ${sheet ? "w-full" : ""}`} disabled={pending} aria-busy={pending}>{pending ? "Saving…" : existing ? "Update check-in" : "Save check-in"}</button>
      <FormStatus error={error} message={message} />
    </div>
  );

  if (sheet) {
    return (
      <form onSubmit={submit} className="space-y-4">
        {moodField}
        <div className="grid grid-cols-2 gap-3">{sleepField}{waterField}</div>
        <MoreDetails>
          <div><span className="label">Date</span>{dateField}</div>
          {energyField}
          {sleepQField}
          <div className="grid grid-cols-2 gap-3">{stepsField}{weightField}</div>
          <div><span className="label">Custom metrics &amp; notes</span>{extras}</div>
        </MoreDetails>
        {actions}
        {existing && <p className="text-xs text-muted">You already checked in for this day. Saving updates it; nothing you logged earlier is lost.</p>}
      </form>
    );
  }

  return (
    <form onSubmit={submit} id="log" className="card scroll-mt-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="h2">{existing ? "Update log" : "Quick log"}</h2>
        {dateField}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{weightField}{sleepField}{waterField}{stepsField}</div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] gap-4">{moodField}{energyField}{sleepQField}</div>
      <details className="group" open={custom.length > 0 || !!notes}>
        <summary className="cursor-pointer text-sm text-muted select-none">Custom metrics &amp; notes</summary>
        <div className="mt-3">{extras}</div>
      </details>
      {actions}
    </form>
  );
}
