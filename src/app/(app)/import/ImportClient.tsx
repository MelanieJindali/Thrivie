"use client";

import type { PersonalContext } from "@/lib/import/personal";
import { useImportParser } from "@/lib/import/useImportParser";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Check, ClipboardPaste, Lock, Trash2, Wand2, X } from "lucide-react";
import { PageHeader, numOrNull } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { ENERGY_EMOJI, MEAL_LABELS, MEAL_SLOTS, MOOD_EMOJI, WORKOUT_LABELS, WORKOUT_TYPES } from "@/lib/constants";
import {
  displayToKg, displayToKm, displayToMl, distanceUnit, kgToDisplay, kmToDisplay, mlToDisplay, waterUnit, weightUnit, type Units,
} from "@/lib/units";
import { NO_EXISTING, flagDuplicates, flagRepeats, type Decision, type Existing, type ReviewItemWithDup } from "@/lib/import/duplicates";
import { LOW_CONFIDENCE, normalizeEntries, type ReviewItem } from "@/lib/import/normalize";
import { repeatKey, verifyItem, type Fix, type Issue } from "@/lib/import/verify";
import { hintFor, personalExample } from "@/lib/import/hints";
import type { AliasRule } from "@/lib/import/parser";
import type { ImportEntry } from "@/lib/import/schema";
import { Tip } from "@/components/Tip";
import { useToast } from "@/components/Toast";
import { useOfflineAction } from "@/components/OfflineSync";
import { OnDeviceEnhance } from "./OnDeviceEnhance";

type Item = ReviewItemWithDup & { approved: boolean; issues: Issue[] };
type Opt = { id: string; name: string };
/** What the user changed on a card. Kept by the item's content key, so it survives re-parsing as they type. */
type Override = { data?: ReviewItem["data"]; date?: string; decision?: Decision; approved?: boolean; removed?: boolean };

const MAX_CHARS = 20000;
const KIND_LABEL: Record<Item["kind"], string> = { health: "Health", workout: "Workout", meal: "Meal", habit: "Habit", goal_update: "Goal progress", journal: "Journal" };
const DECISION_LABEL: Record<Decision, string> = { add: "Add anyway", merge: "Keep existing, fill gaps", overwrite: "Overwrite existing", replace: "Replace existing", skip: "Skip" };
const savable = (i: Item) => i.decision !== "skip" && !i.issues.some((x) => x.blocking);
/** Ready without a look: confident, nothing flagged, no duplicate question. */
const confident = (i: Item) => i.confidence >= LOW_CONFIDENCE && !i.lowFields.length && !i.issues.length && !i.dup && savable(i);

export function ImportClient({ today, units, habits, goals, aliases, tipsSeen, onDeviceAi, personal }: {
  today: string; units: Units; habits: Opt[]; goals: (Opt & { unit: string })[]; aliases: AliasRule[]; tipsSeen: string[]; onDeviceAi: boolean; personal: PersonalContext;
}) {
  const [text, setText] = useState("");
  const [truncated, setTruncated] = useState(false);
  const [phase, setPhase] = useState<"input" | "saving" | "done">("input");
  const [error, setError] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [existing, setExisting] = useState<{ dates: string; data: Existing } | null>(null);
  const [dupStatus, setDupStatus] = useState<"idle" | "checking" | "ok" | "failed">("idle");
  const [result, setResult] = useState<string | null>(null);
  const [enhanced, setEnhanced] = useState<ImportEntry[] | null>(null);
  const router = useRouter();
  const toast = useToast();
  const runAction = useOfflineAction();
  const example = useMemo(() => personalExample(habits.map((h) => h.name), goals, units), [habits, goals, units]);

  // Layers 1–2: parsed on this device, in a Web Worker, 250 ms after typing pauses.
  const ctx = useMemo(() => ({ today, units, habits: habits.map((h) => h.name), goals: goals.map((g) => ({ title: g.name, unit: g.unit })), aliases, personal }), [today, units, habits, goals, aliases, personal]);
  const { parsed, pending, failed, retry } = useImportParser(text, ctx);
  const entries = useMemo(() => enhanced ?? parsed?.entries ?? [], [enhanced, parsed]);
  const base = useMemo(() => normalizeEntries(entries, { today, units, habits, goals }), [entries, today, units, habits, goals]);
  useEffect(() => setEnhanced(null), [text]);

  // Background duplicate check: only the dates are sent, and your own entries for those dates come back.
  const dates = useMemo(() => [...new Set(base.map((i) => overrides[i.key]?.date ?? i.date))].sort().join(","), [base, overrides]);
  const dupReq = useRef(0);
  useEffect(() => {
    if (!dates) { setDupStatus("idle"); return; }
    if (existing?.dates === dates) return;
    const id = ++dupReq.current;
    setDupStatus("checking");
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/import/existing?dates=${encodeURIComponent(dates)}`);
        if (!res.ok) throw new Error();
        const data = (await res.json()) as Existing;
        if (id === dupReq.current) { setExisting({ dates, data }); setDupStatus("ok"); }
      } catch {
        if (id === dupReq.current) setDupStatus("failed");
      }
    }, 600);
    return () => clearTimeout(t);
  }, [dates, existing?.dates]);

  // Edits → duplicate check → repeats in this paste → plausibility checks → ready or needs a look.
  const items: Item[] = useMemo(() => {
    const edited = base
      .filter((i) => !overrides[i.key]?.removed)
      .map((i) => {
        const o = overrides[i.key];
        return o ? ({ ...i, data: o.data ?? i.data, date: o.date ?? i.date } as ReviewItem) : i;
      });
    const flagged = flagRepeats(flagDuplicates(edited, existing?.data ?? NO_EXISTING, units), repeatKey);
    return flagged.map((i) => {
      const o = overrides[i.key];
      const withDecision = { ...i, decision: o?.decision ?? i.decision };
      const issues = verifyItem(withDecision, { today, units, lastWeight: personal.lastWeight });
      const item = { ...withDecision, issues, approved: false } as Item;
      // Anything the user touched counts as looked at; otherwise only confident items start ready.
      return { ...item, approved: o?.approved ?? (o?.data || o?.date ? true : confident(item)) };
    });
  }, [base, overrides, existing, units, today, personal.lastWeight]);

  const toSave = items.filter((i) => i.approved && savable(i));
  const needsLook = items.filter((i) => !i.approved && savable(i)).length;
  const originals = useMemo(() => Object.fromEntries(base.map((i) => [i.key, i])), [base]);

  function onText(v: string) {
    setTruncated(v.length > MAX_CHARS);
    setText(v.slice(0, MAX_CHARS));
  }

  async function pasteFromClipboard() {
    try {
      const t = await navigator.clipboard.readText();
      if (t) onText(text ? `${text}\n${t}` : t);
    } catch {
      toast({ message: "Clipboard access was blocked. Long-press the box and choose Paste instead.", tone: "error" });
    }
  }

  function update(key: string, fn: (i: Item) => Item) {
    const cur = items.find((x) => x.key === key);
    if (!cur) return;
    const next = fn(cur);
    setOverrides((o) => {
      const prev = o[key] ?? {};
      return {
        ...o,
        [key]: {
          ...prev,
          ...(next.data !== cur.data && { data: next.data }),
          ...(next.date !== cur.date && { date: next.date }),
          ...(next.decision !== cur.decision && { decision: next.decision }),
          ...(next.approved !== cur.approved && { approved: next.approved }),
        },
      };
    });
  }
  const applyFix = (key: string, fix: Fix) =>
    update(key, (i) => ({ ...i, approved: true, ...(fix.date && { date: fix.date }), ...(fix.data && { data: { ...i.data, ...fix.data } }) }) as Item);
  const remove = (key: string) => setOverrides((o) => ({ ...o, [key]: { ...o[key], removed: true } }));
  const includeAll = () => setOverrides((o) => {
    const n = { ...o };
    for (const i of items) if (savable(i)) n[i.key] = { ...n[i.key], approved: true };
    return n;
  });

  /** Corrections become personal shorthand ("bb" → "Bench press") for next time. */
  function learnedAliases() {
    const out: { kind: AliasRule["kind"]; alias: string; target: string }[] = [];
    for (const it of toSave) {
      const o = originals[it.key];
      if (!o) continue;
      if (it.kind === "habit" && o.kind === "habit" && !o.data.habitId && it.data.habitId) {
        const target = habits.find((h) => h.id === it.data.habitId)?.name;
        if (target) out.push({ kind: "habit", alias: o.data.habitName.toLowerCase().slice(0, 40), target });
      }
      // A corrected weight that's the original read in the other unit teaches the preferred unit.
      if (it.kind === "health" && o.kind === "health" && it.data.weightKg && o.data.weightKg && Math.abs(it.data.weightKg - o.data.weightKg) > 1) {
        const r = it.data.weightKg / o.data.weightKg;
        if (Math.abs(r - 0.45359237) < 0.01) out.push({ kind: "metric", alias: "weight-unit", target: "lb" });
        else if (Math.abs(r - 1 / 0.45359237) < 0.03) out.push({ kind: "metric", alias: "weight-unit", target: "kg" });
      }
      if (it.kind === "workout" && o.kind === "workout") {
        it.data.exercises.forEach((e, idx) => {
          const before = o.data.exercises[idx]?.name;
          if (before && e.name && before !== e.name) out.push({ kind: "exercise", alias: before.toLowerCase().slice(0, 40), target: e.name.slice(0, 60) });
        });
      }
    }
    return out.slice(0, 50);
  }

  function reset() {
    setText(""); setOverrides({}); setTruncated(false); setExisting(null);
  }

  async function save() {
    setPhase("saving");
    setError(null);
    try {
      const r = (await runAction("importCommit", { items: toSave.map(({ kind, date, data, decision }) => ({ kind, date, data, decision })), aliases: learnedAliases() })) as
        { ok: true; queued?: boolean; saved?: Record<string, number> } | { ok: false; error: string };
      if (!r.ok) { setError(r.error); setPhase("input"); return; }
      if (r.queued) setResult(`You're offline. ${toSave.length} entr${toSave.length === 1 ? "y is" : "ies are"} saved on this device and will sync when you're back online.`);
      else {
        const parts = Object.entries(r.saved ?? {}).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${KIND_LABEL[k as Item["kind"]].toLowerCase()}`);
        setResult(parts.length ? `Saved ${parts.join(", ")}.` : "Nothing new to save.");
      }
      reset();
      setPhase("done");
      router.refresh();
    } catch {
      setError("Saving failed. Your entries are still here. Try again.");
      setPhase("input");
    }
  }

  const grouped = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const i of [...items].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))) m.set(i.date, [...(m.get(i.date) ?? []), i]);
    return [...m.entries()];
  }, [items]);
  const total = items.length;
  const days = grouped.length;

  return (
    <div className="space-y-5">
      <PageHeader theme="import" eyebrow="Smart Import" title="Paste your notes" subtitle="From Apple Notes, Google Keep, Notion, anywhere. Check what Thrivie found, then save." />

      <p className="flex items-start gap-2.5 rounded-2xl bg-seaglass-soft px-4 py-3 text-sm">
        <Lock size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden />
        <span>Your notes are read <b>on this device</b>. The pasted text is never sent to our server; only the entries you save are.</span>
      </p>
      <Tip id="import" seen={tipsSeen}>Write the day first, like “Mon -” or “yesterday:”, and Thrivie will sort entries by date. Checkmarks (✅ ❌) mark habits as done or missed.</Tip>

      {phase === "done" && (
        <div className="card space-y-3 text-center" role="status">
          <div className="text-3xl" aria-hidden>✦</div>
          <p className="font-display text-xl">{result}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Link href="/" className="btn-primary">See today</Link>
            <button className="btn-soft" onClick={() => setPhase("input")}>Import more</button>
          </div>
        </div>
      )}

      {phase !== "done" && (
        <section className="card space-y-4">
          <label className="block">
            <span className="sr-only">Notes to import</span>
            <textarea
              className="input min-h-56 text-[15px] leading-relaxed"
              placeholder={example}
              value={text}
              onChange={(e) => onText(e.target.value)}
              spellCheck={false}
            />
          </label>
          {truncated && (
            <p className="flex items-start gap-2 rounded-xl bg-gold-soft px-3 py-2 text-xs text-gold-ink" role="status">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
              Only the first 20,000 characters fit in one import. Save these, then paste the rest.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn-outline" onClick={pasteFromClipboard}><ClipboardPaste size={16} aria-hidden /> Paste from clipboard</button>
            {!text && <button type="button" className="btn-ghost" onClick={() => onText(example)}>Try the example</button>}
            {text && <button type="button" className="btn-ghost" onClick={reset}>Clear</button>}
          </div>

          {text.trim() && !parsed && (
            <div className={`flex flex-wrap items-center gap-3 rounded-2xl p-4 text-sm ${failed ? "bg-terracotta-soft text-terracotta-ink" : "bg-surface-2/60"}`} role={failed ? "alert" : "status"}>
              <span className="min-w-0 flex-1">{failed ? "Thrivie couldn't read these notes on this device. Try again, or paste a shorter piece." : "Reading your notes…"}</span>
              {failed && <button type="button" className="btn-outline" onClick={retry}>Try again</button>}
            </div>
          )}

          {parsed && (
            <div className="rounded-2xl bg-surface-2/60 p-4" aria-live="polite">
              <p className="text-sm font-bold">
                {total
                  ? `Found ${total} entr${total === 1 ? "y" : "ies"} across ${days} day${days === 1 ? "" : "s"}${needsLook ? `. ${needsLook} need${needsLook === 1 ? "s" : ""} a quick look.` : "."}`
                  : "Nothing recognised yet. Try a day and a number, like “Mon - slept 7h”."}
              </p>
              {parsed.unparsed.length > 0 && (
                <div className="mt-2 space-y-1 text-xs text-muted">
                  <p className="font-semibold">Not recognised:</p>
                  <ul className="space-y-1">
                    {parsed.unparsed.slice(0, 4).map((u, i) => (
                      <li key={`${u}-${i}`} className="break-words">“{u.slice(0, 60)}{u.length > 60 ? "…" : ""}”{hintFor(u, units) && <span className="whitespace-nowrap"> · try “{hintFor(u, units)}”</span>}</li>
                    ))}
                  </ul>
                  {parsed.unparsed.length > 4 && <p>…and {parsed.unparsed.length - 4} more.</p>}
                </div>
              )}
              {dupStatus === "failed" && total > 0 && <p className="mt-2 text-xs text-muted">Couldn&apos;t check what you&apos;ve already logged. You can still save; Thrivie won&apos;t overwrite anything.</p>}
            </div>
          )}

          <OnDeviceEnhance enabled={onDeviceAi} text={text} ctx={ctx} parsed={parsed} onResult={setEnhanced} active={!!enhanced} />
        </section>
      )}

      {error && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-terracotta-soft px-4 py-3 text-sm text-terracotta-ink" role="alert">
          <AlertTriangle size={16} aria-hidden />
          <span className="flex-1">{error}</span>
        </div>
      )}

      {phase !== "done" && total > 0 && (
        <>
          <div className="glass sticky top-[env(safe-area-inset-top)] z-30 flex flex-wrap items-center gap-2 rounded-2xl px-3 py-2.5">
            <span className="mr-auto text-sm text-muted" aria-live="polite">
              <b className="text-text">{toSave.length}</b> of {total} ready{pending || dupStatus === "checking" ? " · checking…" : ""}
            </span>
            {needsLook > 0 && <button className="btn-ghost px-3 text-xs" onClick={includeAll}><Check size={15} aria-hidden /> Include all</button>}
            <button className="btn-primary" onClick={save} disabled={!toSave.length || phase === "saving"}>
              {phase === "saving" ? "Saving…" : `Save ${toSave.length}`}
            </button>
          </div>
          {grouped.map(([date, group]) => (
            <section key={date} className="space-y-3" aria-label={formatDate(date, { weekday: "long", month: "long", day: "numeric" })}>
              <h2 className="text-sm font-bold text-muted">{formatDate(date, { weekday: "long", month: "short", day: "numeric" })}</h2>
              {group.map((item) => (
                <ReviewCard key={item.key} item={item} units={units} habits={habits} goals={goals} onChange={(fn) => update(item.key, fn)} onFix={(f) => applyFix(item.key, f)} onRemove={() => remove(item.key)} />
              ))}
            </section>
          ))}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function ReviewCard({
  item, units, habits, goals, onChange, onFix, onRemove,
}: {
  item: Item; units: Units; habits: Opt[]; goals: (Opt & { unit: string })[];
  onChange: (fn: (i: Item) => Item) => void; onFix: (f: Fix) => void; onRemove: () => void;
}) {
  const low = item.confidence < LOW_CONFIDENCE;
  const lowField = (f: string) => item.lowFields.some((x) => x === f || x.startsWith(f)) || item.issues.some((x) => x.field === f);
  // Editing a field counts as checking it.
  const setData = (patch: Record<string, unknown>) => onChange((i) => ({ ...i, approved: true, data: { ...i.data, ...patch } }) as Item);
  const skipped = item.decision === "skip";
  const blocked = item.issues.some((x) => x.blocking);
  const fieldCls = (f: string) => `input py-1.5 text-sm ${lowField(f) ? "border-terracotta-ink bg-terracotta-soft" : ""}`;

  return (
    <div className={`card space-y-3 transition ${item.approved && !skipped && !blocked ? "border-primary/50" : ""} ${skipped ? "border-dashed border-border shadow-none" : ""} ${!item.approved && !skipped ? "border-l-4 border-l-warn" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium">{KIND_LABEL[item.kind]}</span>
        {low && <span className="rounded-full bg-terracotta-soft px-2 py-0.5 text-[11px] text-terracotta-ink">Not sure ({Math.round(item.confidence * 100)}%)</span>}
        {item.dateText && <span className="text-[11px] text-muted">“{item.dateText}”</span>}
        <input
          type="date"
          className={`input ml-auto w-36 px-2 py-1 text-xs ${lowField("date") ? "border-terracotta-ink bg-terracotta-soft" : ""}`}
          value={item.date}
          onChange={(e) => e.target.value && onChange((i) => ({ ...i, date: e.target.value, approved: true }))}
          aria-label="Entry date"
        />
        <button className="btn-ghost px-2 py-1" onClick={onRemove} aria-label="Remove entry" title="Remove"><Trash2 size={15} /></button>
      </div>

      {item.kind === "health" && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Mini label={`Weight (${weightUnit(units)})`}>
            <input className={fieldCls("weight")} inputMode="decimal" value={item.data.weightKg != null ? kgToDisplay(item.data.weightKg, units) : ""} onChange={(e) => { const v = numOrNull(e.target.value); setData({ weightKg: v != null ? displayToKg(v, units) : null }); }} />
          </Mini>
          <Mini label="Sleep (h)">
            <input className={fieldCls("sleep_hours")} inputMode="decimal" value={item.data.sleepHours ?? ""} onChange={(e) => setData({ sleepHours: numOrNull(e.target.value) })} />
          </Mini>
          <Mini label={`Water (${waterUnit(units)})`}>
            <input className={fieldCls("water")} inputMode="numeric" value={item.data.waterMl != null ? mlToDisplay(item.data.waterMl, units) : ""} onChange={(e) => { const v = numOrNull(e.target.value); setData({ waterMl: v != null ? displayToMl(v, units) : null }); }} />
          </Mini>
          <Mini label="Steps">
            <input className={fieldCls("steps")} inputMode="numeric" value={item.data.steps ?? ""} onChange={(e) => setData({ steps: numOrNull(e.target.value) })} />
          </Mini>
          <Mini label="Sleep quality"><RatingSelect cls={fieldCls("sleep_quality")} value={item.data.sleepQuality} onChange={(v) => setData({ sleepQuality: v })} /></Mini>
          <Mini label="Mood"><RatingSelect cls={fieldCls("mood")} value={item.data.mood} labels={MOOD_EMOJI} onChange={(v) => setData({ mood: v })} /></Mini>
          <Mini label="Energy"><RatingSelect cls={fieldCls("energy")} value={item.data.energy} labels={ENERGY_EMOJI} onChange={(v) => setData({ energy: v })} /></Mini>
          {Object.entries(item.data.custom).map(([k, v]) => (
            <Mini key={k} label={k}>
              <input className={fieldCls(k)} inputMode="decimal" value={v} onChange={(e) => { const n = numOrNull(e.target.value); const c = { ...item.data.custom } as Record<string, number>; if (n == null) delete c[k]; else c[k] = n; setData({ custom: c }); }} />
            </Mini>
          ))}
        </div>
      )}

      {item.kind === "workout" && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Mini label="Type">
              <select className={fieldCls("type")} value={item.data.type} onChange={(e) => setData({ type: e.target.value })}>
                {WORKOUT_TYPES.map((t) => <option key={t} value={t}>{WORKOUT_LABELS[t].label}</option>)}
              </select>
            </Mini>
            <Mini label="Title"><input className={fieldCls("title")} value={item.data.title ?? ""} onChange={(e) => setData({ title: e.target.value || null })} /></Mini>
            <Mini label="Minutes"><input className={fieldCls("duration")} inputMode="numeric" value={item.data.durationMin} onChange={(e) => setData({ durationMin: Math.max(1, Math.round(numOrNull(e.target.value) ?? 1)) })} /></Mini>
            <Mini label={`Distance (${distanceUnit(units)})`}>
              <input className={fieldCls("distance")} inputMode="decimal" value={item.data.distanceKm != null ? kmToDisplay(item.data.distanceKm, units) : ""} onChange={(e) => { const v = numOrNull(e.target.value); setData({ distanceKm: v != null ? displayToKm(v, units) : null }); }} />
            </Mini>
            <Mini label="Intensity"><RatingSelect cls={fieldCls("intensity")} value={item.data.intensity} onChange={(v) => setData({ intensity: v ?? 3 })} /></Mini>
          </div>
          {item.data.exercises.map((x, idx) => {
            const setEx = (patch: Record<string, unknown>) => setData({ exercises: item.data.exercises.map((y, j) => (j === idx ? { ...y, ...patch } : y)) });
            return (
              <div key={idx} className="grid grid-cols-[1fr_3.5rem_3.5rem_4.5rem_auto] gap-1.5">
                <input className={fieldCls(`exercises.${idx}`)} value={x.name} onChange={(e) => setEx({ name: e.target.value })} aria-label="Exercise" />
                <input className="input px-2 py-1.5 text-sm" inputMode="numeric" placeholder="sets" value={x.sets ?? ""} onChange={(e) => setEx({ sets: numOrNull(e.target.value) })} aria-label="Sets" />
                <input className="input px-2 py-1.5 text-sm" inputMode="numeric" placeholder="reps" value={x.reps ?? ""} onChange={(e) => setEx({ reps: numOrNull(e.target.value) })} aria-label="Reps" />
                <input className="input px-2 py-1.5 text-sm" inputMode="decimal" placeholder={weightUnit(units)} value={x.weightKg != null ? kgToDisplay(x.weightKg, units) : ""} onChange={(e) => { const v = numOrNull(e.target.value); setEx({ weightKg: v != null ? displayToKg(v, units) : null }); }} aria-label="Weight" />
                <button className="btn-ghost px-1.5" onClick={() => setData({ exercises: item.data.exercises.filter((_, j) => j !== idx) })} aria-label="Remove exercise"><X size={14} /></button>
              </div>
            );
          })}
        </div>
      )}

      {item.kind === "habit" && (
        <div className="space-y-2 text-sm">
          {item.data.habitId ? (
            <div className="flex flex-wrap items-center gap-2">
              <span>✓ Check off</span>
              <select className="input w-auto py-1.5 text-sm" aria-label="Habit to check off" value={item.data.habitId} onChange={(e) => setData({ habitId: e.target.value })}>
                {habits.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
              {normalizeLoose(item.data.habitName) !== normalizeLoose(habits.find((h) => h.id === item.data.habitId)?.name ?? "") && (
                <span className="text-xs text-muted">from “{item.data.habitName}”</span>
              )}
            </div>
          ) : (
            <div className="space-y-2 rounded-xl bg-clay-soft p-3">
              <p><b>New habit?</b> “{item.data.habitName}” doesn&apos;t match any of your habits.</p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  className={`chip text-xs ${item.data.createNew ? "chip-on" : "bg-surface"}`}
                  onClick={() => onChange((i) => ({ ...i, approved: i.kind === "habit" && !i.data.createNew, decision: i.kind === "habit" && !i.data.createNew ? "add" : "skip", data: { ...i.data, createNew: !(i.data as { createNew: boolean }).createNew } }) as Item)}
                >
                  {item.data.createNew ? "✓ Will create habit" : "Create it"}
                </button>
                {item.data.createNew && (
                  <>
                    <input className="input w-auto py-1 text-sm" value={item.data.habitName} onChange={(e) => setData({ habitName: e.target.value })} aria-label="New habit name" />
                    <select className="input w-auto py-1 text-sm" aria-label="How often" value={item.data.frequency} onChange={(e) => setData({ frequency: e.target.value })}>
                      <option value="daily">Every day</option>
                      <option value="weekly">3 times a week</option>
                    </select>
                  </>
                )}
                {!item.data.createNew && habits.length > 0 && (
                  <select
                    className="input w-auto bg-surface py-1 text-sm"
                    aria-label="Link to an existing habit"
                    value=""
                    onChange={(e) => e.target.value && onChange((i) => ({ ...i, approved: true, decision: "add", data: { ...i.data, habitId: e.target.value } }) as Item)}
                  >
                    <option value="">…or link to an existing habit</option>
                    {habits.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                  </select>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {item.kind === "goal_update" && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {goals.length ? (
            <select
              className="input w-auto py-1.5 text-sm"
              aria-label="Goal to update"
              value={item.data.goalId ?? ""}
              onChange={(e) => onChange((i) => ({ ...i, approved: !!e.target.value, decision: e.target.value && i.decision === "skip" && !i.dup ? "add" : i.decision, data: { ...i.data, goalId: e.target.value || null } }) as Item)}
            >
              <option value="">Unmatched: “{item.data.goalName}”</option>
              {goals.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          ) : (
            <span className="text-muted">“{item.data.goalName}”: no manual goals to update.</span>
          )}
          <span>+</span>
          <input className={`${fieldCls("value")} w-24`} inputMode="decimal" value={item.data.value} onChange={(e) => setData({ value: numOrNull(e.target.value) ?? 0 })} aria-label="Progress value" />
          <span className="text-muted">{goals.find((g) => g.id === item.data.goalId)?.unit}</span>
          {item.data.note && <span className="text-xs text-muted">· {item.data.note}</span>}
        </div>
      )}

      {item.kind === "meal" && (
        <div className="space-y-2">
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <Mini label="Meal">
              <select className={fieldCls("slot")} value={item.data.slot} onChange={(e) => setData({ slot: e.target.value })}>
                {MEAL_SLOTS.map((s) => <option key={s} value={s}>{MEAL_LABELS[s]}</option>)}
              </select>
            </Mini>
            <Mini label="What you had">
              <input className={fieldCls("name")} value={item.data.name} maxLength={200} onChange={(e) => setData({ name: e.target.value })} />
            </Mini>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Mini label="Calories"><input className={fieldCls("calories")} inputMode="numeric" value={item.data.calories ?? ""} onChange={(e) => { const v = numOrNull(e.target.value); setData({ calories: v != null ? Math.round(v) : null }); }} /></Mini>
            <Mini label="Protein (g)"><input className={fieldCls("protein_g")} inputMode="decimal" value={item.data.proteinG ?? ""} onChange={(e) => setData({ proteinG: numOrNull(e.target.value) })} /></Mini>
            <Mini label="Carbs (g)"><input className={fieldCls("carbs_g")} inputMode="decimal" value={item.data.carbsG ?? ""} onChange={(e) => setData({ carbsG: numOrNull(e.target.value) })} /></Mini>
            <Mini label="Fat (g)"><input className={fieldCls("fat_g")} inputMode="decimal" value={item.data.fatG ?? ""} onChange={(e) => setData({ fatG: numOrNull(e.target.value) })} /></Mini>
          </div>
        </div>
      )}

      {item.kind === "journal" && (
        <div className="space-y-2">
          <textarea className={`${fieldCls("content")} min-h-20`} value={item.data.content} onChange={(e) => setData({ content: e.target.value })} aria-label="Journal text" />
          <div className="w-40"><RatingSelect cls={fieldCls("mood")} value={item.data.mood} labels={MOOD_EMOJI} onChange={(v) => setData({ mood: v })} /></div>
        </div>
      )}

      {item.dup && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-terracotta-soft px-3 py-2 text-xs">
          <span className="flex min-w-0 basis-full items-start gap-2 sm:basis-0 sm:flex-1">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-terracotta-ink" />
            <span>{item.dup.message}</span>
          </span>
          {item.dup.options.length > 1 && (
            <select className="input w-auto bg-surface py-1 text-xs" aria-label="What to do with this duplicate" value={item.decision} onChange={(e) => onChange((i) => ({ ...i, decision: e.target.value as Decision, approved: e.target.value !== "skip" }))}>
              {item.dup.options.map((o) => <option key={o} value={o}>{DECISION_LABEL[o]}</option>)}
            </select>
          )}
        </div>
      )}

      {item.issues.length > 0 && (
        <ul className="space-y-1.5">
          {item.issues.map((x, n) => (
            <li key={`${x.field}-${n}`} className="flex flex-wrap items-center gap-2 rounded-xl bg-gold-soft px-3 py-2 text-xs text-gold-ink">
              <span className="flex min-w-0 flex-1 basis-48 items-start gap-2"><AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden /><span>{x.message}</span></span>
              {x.fix && (
                <button type="button" className="btn bg-surface min-h-9 px-3 text-xs text-text" onClick={() => onFix(x.fix!)}>
                  <Wand2 size={13} aria-hidden /> {x.fix.label}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {item.sourceText && <p className="truncate text-[11px] text-muted" title={item.sourceText}>From: “{item.sourceText}”</p>}

      <div className="flex items-center justify-end gap-2">
        {skipped ? (
          <span className="text-xs text-muted">Won&apos;t be saved</span>
        ) : blocked ? (
          <span className="text-xs text-muted">Fix the highlighted value to save this</span>
        ) : (
          <button
            className={item.approved ? "btn-ghost min-h-9 py-1.5 text-xs text-primary" : "btn-soft min-h-9 py-1.5 text-xs"}
            onClick={() => onChange((i) => ({ ...i, approved: !i.approved }))}
            aria-pressed={item.approved}
          >
            <Check size={14} aria-hidden /> {item.approved ? "Will be saved" : "Looks right"}
          </button>
        )}
      </div>
    </div>
  );
}

function normalizeLoose(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function Mini({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-0.5 block truncate text-[11px] text-muted uppercase">{label}</span>
      {children}
    </label>
  );
}

function RatingSelect({ value, onChange, labels, cls }: { value: number | null; onChange: (v: number | null) => void; labels?: string[]; cls: string }) {
  return (
    <select className={cls} value={value ?? ""} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
      <option value="">—</option>
      {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{labels ? `${labels[n - 1]} ${n}` : n}</option>)}
    </select>
  );
}
