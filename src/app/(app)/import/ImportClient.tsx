"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Check, ClipboardPaste, Lock, RotateCcw, Trash2, X } from "lucide-react";
import { PageHeader, numOrNull } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { ENERGY_EMOJI, MOOD_EMOJI, WORKOUT_LABELS, WORKOUT_TYPES } from "@/lib/constants";
import {
  displayToKg, displayToKm, displayToMl, distanceUnit, kgToDisplay, kmToDisplay, mlToDisplay, waterUnit, weightUnit, type Units,
} from "@/lib/units";
import { flagDuplicates, type Decision, type Existing, type ReviewItemWithDup } from "@/lib/import/duplicates";
import { LOW_CONFIDENCE, normalizeEntries, type ReviewItem } from "@/lib/import/normalize";
import { parseNotes, type AliasRule } from "@/lib/import/parser";
import type { ImportEntry } from "@/lib/import/schema";
import { Tip } from "@/components/Tip";
import { useToast } from "@/components/Toast";
import { OnDeviceEnhance } from "./OnDeviceEnhance";

type Item = ReviewItemWithDup & { approved: boolean };
type Opt = { id: string; name: string };

const EXAMPLE = `Mon - ran 5k 28min, slept 6h felt tired. pushups 3x15. no sugar ✅ meditated ✅. weight 172.
Tues: rest day, 8h sleep, journaled about work stress`;

const KIND_LABEL: Record<Item["kind"], string> = { health: "Health", workout: "Workout", habit: "Habit", goal_update: "Goal progress", journal: "Journal" };
const DECISION_LABEL: Record<Decision, string> = { add: "Add anyway", merge: "Keep existing, fill gaps", overwrite: "Overwrite existing", replace: "Replace existing", skip: "Skip" };

export function ImportClient({ today, units, habits, goals, aliases, tipsSeen, onDeviceAi }: {
  today: string; units: Units; habits: Opt[]; goals: (Opt & { unit: string })[]; aliases: AliasRule[]; tipsSeen: string[]; onDeviceAi: boolean;
}) {
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<"input" | "checking" | "review" | "saving" | "done">("input");
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [originals, setOriginals] = useState<Record<string, ReviewItem>>({});
  const [result, setResult] = useState<string | null>(null);
  const [enhanced, setEnhanced] = useState<ImportEntry[] | null>(null);
  const router = useRouter();
  const toast = useToast();

  // Tier 1: parse instantly on this device as the user types or pastes.
  const ctx = useMemo(() => ({ today, units, habits: habits.map((h) => h.name), goals: goals.map((g) => ({ title: g.name, unit: g.unit })), aliases }), [today, units, habits, goals, aliases]);
  const parsed = useMemo(() => (text.trim() ? parseNotes(text, ctx) : null), [text, ctx]);
  const entries = enhanced ?? parsed?.entries ?? [];
  const preview = useMemo(() => {
    const items = normalizeEntries(entries, { today, units, habits, goals });
    const count = (k: ReviewItem["kind"]) => items.filter((i) => i.kind === k).length;
    return { items, days: new Set(items.map((i) => i.date)).size, health: count("health"), workout: count("workout"), habit: count("habit"), goal: count("goal_update"), journal: count("journal"), low: items.filter((i) => i.confidence < LOW_CONFIDENCE || i.lowFields.length).length };
  }, [entries, today, units, habits, goals]);
  useEffect(() => setEnhanced(null), [text]);

  async function pasteFromClipboard() {
    try {
      const t = await navigator.clipboard.readText();
      if (t) setText((x) => (x ? `${x}\n${t}` : t));
    } catch {
      toast({ message: "Clipboard access was blocked. Long-press the box and choose Paste instead.", tone: "error" });
    }
  }

  async function review() {
    setError(null);
    setPhase("checking");
    try {
      // Only dates are sent; your own existing entries for those dates come back for a duplicate check here.
      const dates = [...new Set(preview.items.map((i) => i.date))].join(",");
      const res = await fetch(`/api/import/existing?dates=${encodeURIComponent(dates)}`);
      if (!res.ok) throw new Error();
      const existing = (await res.json()) as Existing;
      const flagged = flagDuplicates(preview.items, existing, units).map((i) => ({ ...i, approved: false }));
      setOriginals(Object.fromEntries(preview.items.map((i) => [i.key, i])));
      setItems(flagged);
      setPhase("review");
    } catch {
      setError("Couldn't check for duplicates. Check your connection and try again.");
      setPhase("input");
    }
  }

  const update = (key: string, fn: (i: Item) => Item) => setItems((xs) => xs.map((x) => (x.key === key ? fn(x) : x)));
  const remove = (key: string) => setItems((xs) => xs.filter((x) => x.key !== key));
  const savable = (i: Item) => i.decision !== "skip";
  const approveAll = () => setItems((xs) => xs.map((x) => ({ ...x, approved: savable(x) })));
  const toSave = items.filter((i) => i.approved && savable(i));

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
      if (it.kind === "workout" && o.kind === "workout") {
        it.data.exercises.forEach((e, idx) => {
          const before = o.data.exercises[idx]?.name;
          if (before && e.name && before !== e.name) out.push({ kind: "exercise", alias: before.toLowerCase().slice(0, 40), target: e.name.slice(0, 60) });
        });
      }
    }
    return out.slice(0, 50);
  }

  async function save() {
    setPhase("saving");
    setError(null);
    try {
      const res = await fetch("/api/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: toSave.map(({ kind, date, data, decision }) => ({ kind, date, data, decision })), aliases: learnedAliases() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Saving failed. Nothing was changed.");
        setPhase("review");
        return;
      }
      const s = json.saved as Record<string, number>;
      const parts = Object.entries(s).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${KIND_LABEL[k as Item["kind"]].toLowerCase()}`);
      setResult(parts.length ? `Saved ${parts.join(", ")}.` : "Nothing new to save.");
      setText("");
      setPhase("done");
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Your entries are still here. Try again.");
      setPhase("review");
    }
  }

  const grouped = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const i of [...items].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))) m.set(i.date, [...(m.get(i.date) ?? []), i]);
    return [...m.entries()];
  }, [items]);
  const total = preview.items.length;

  return (
    <div className="space-y-5">
      <PageHeader theme="import" eyebrow="Smart Import" title="Paste your notes" subtitle="From Apple Notes, Google Keep, Notion, anywhere. You approve everything before it's saved." />

      <p className="flex items-start gap-2.5 rounded-2xl bg-seaglass-soft px-4 py-3 text-sm">
        <Lock size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden />
        <span>Your notes are read <b>on this device</b>. The pasted text is never sent to our server; only the entries you approve are saved.</span>
      </p>
      <Tip id="import" seen={tipsSeen}>Write the day first, like “Mon -” or “yesterday:”, and Thrivie will sort entries by date. Checkmarks (✅ ❌) mark habits as done or missed.</Tip>

      {phase === "done" && (
        <div className="card space-y-3 text-center" role="status">
          <div className="text-3xl" aria-hidden>✦</div>
          <p className="font-display text-xl">{result}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Link href="/" className="btn-primary">See today</Link>
            <button className="btn-soft" onClick={() => { setItems([]); setPhase("input"); }}>Import more</button>
          </div>
        </div>
      )}

      {(phase === "input" || phase === "checking") && (
        <section className="card space-y-4">
          <label className="block">
            <span className="sr-only">Notes to import</span>
            <textarea
              className="input min-h-56 text-[15px] leading-relaxed"
              placeholder={EXAMPLE}
              value={text}
              maxLength={20000}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn-outline" onClick={pasteFromClipboard}><ClipboardPaste size={16} aria-hidden /> Paste from clipboard</button>
            {!text && <button type="button" className="btn-ghost" onClick={() => setText(EXAMPLE)}>Try the example</button>}
            {text && <button type="button" className="btn-ghost" onClick={() => setText("")}>Clear</button>}
          </div>

          {parsed && (
            <div className="rounded-2xl bg-surface-2/60 p-4" aria-live="polite">
              <p className="text-sm font-bold">
                {total ? `Found ${total} entr${total === 1 ? "y" : "ies"} across ${preview.days} day${preview.days === 1 ? "" : "s"}` : "Nothing recognised yet. Try adding a day and a number, like “Mon - slept 7h”."}
              </p>
              {total > 0 && (
                <ul className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
                  {preview.health > 0 && <li className="rounded-full bg-terracotta-soft px-3 py-1 text-terracotta-ink">{preview.health} check-in{preview.health === 1 ? "" : "s"}</li>}
                  {preview.workout > 0 && <li className="rounded-full bg-ocean-soft px-3 py-1 text-ocean">{preview.workout} workout{preview.workout === 1 ? "" : "s"}</li>}
                  {preview.habit > 0 && <li className="rounded-full bg-sage-soft px-3 py-1 text-sage-ink">{preview.habit} habit{preview.habit === 1 ? "" : "s"}</li>}
                  {preview.goal > 0 && <li className="rounded-full bg-gold-soft px-3 py-1 text-gold-ink">{preview.goal} goal update{preview.goal === 1 ? "" : "s"}</li>}
                  {preview.journal > 0 && <li className="rounded-full bg-iris-soft px-3 py-1 text-iris">{preview.journal} journal</li>}
                  {preview.low > 0 && <li className="rounded-full bg-surface px-3 py-1 text-muted">{preview.low} to double-check</li>}
                </ul>
              )}
              {parsed.unparsed.length > 0 && <p className="mt-2 text-xs text-muted">Not recognised: {parsed.unparsed.slice(0, 4).map((u) => `“${u.slice(0, 40)}”`).join(", ")}{parsed.unparsed.length > 4 ? "…" : ""}</p>}
            </div>
          )}

          <OnDeviceEnhance enabled={onDeviceAi} text={text} ctx={ctx} parsed={parsed} onResult={setEnhanced} active={!!enhanced} />

          <button type="button" className="btn-primary w-full sm:w-auto" disabled={!total || phase === "checking"} onClick={review}>
            {phase === "checking" ? "Checking for duplicates…" : total ? `Review ${total} entr${total === 1 ? "y" : "ies"}` : "Review entries"}
          </button>
        </section>
      )}

      {error && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-terracotta-soft px-4 py-3 text-sm text-terracotta-ink" role="alert">
          <AlertTriangle size={16} aria-hidden />
          <span className="flex-1">{error}</span>
          {phase === "input" && <button className="btn bg-surface px-3 text-xs text-text" onClick={review}><RotateCcw size={14} aria-hidden /> Retry</button>}
        </div>
      )}

      {(phase === "review" || phase === "saving") && (
        <>
          <div className="glass sticky top-[env(safe-area-inset-top)] z-30 -mx-1 flex flex-wrap items-center gap-2 rounded-2xl px-3 py-2.5">
            <span className="mr-auto text-sm text-muted"><b className="text-text">{toSave.length}</b> of {items.length} approved</span>
            <button className="btn-ghost px-3" onClick={() => { setItems([]); setPhase("input"); }}>Back</button>
            <button className="btn-soft" onClick={approveAll} disabled={!items.length}><Check size={16} aria-hidden /> Approve all</button>
            <button className="btn-primary" onClick={save} disabled={!toSave.length || phase === "saving"}>{phase === "saving" ? "Saving…" : `Save ${toSave.length}`}</button>
          </div>
          <p className="text-xs text-muted">Highlighted fields are ones Thrivie is less sure about. Check them quickly before approving.</p>
          {grouped.map(([date, group]) => (
            <section key={date} className="space-y-3" aria-label={formatDate(date, { weekday: "long", month: "long", day: "numeric" })}>
              <h2 className="text-sm font-bold text-muted">{formatDate(date, { weekday: "long", month: "short", day: "numeric" })}</h2>
              {group.map((item) => (
                <ReviewCard key={item.key} item={item} units={units} habits={habits} goals={goals} onChange={(fn) => update(item.key, fn)} onRemove={() => remove(item.key)} />
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
  item, units, habits, goals, onChange, onRemove,
}: {
  item: Item; units: Units; habits: Opt[]; goals: (Opt & { unit: string })[];
  onChange: (fn: (i: Item) => Item) => void; onRemove: () => void;
}) {
  const low = item.confidence < LOW_CONFIDENCE;
  const lowField = (f: string) => item.lowFields.some((x) => x === f || x.startsWith(f));
  const setData = (patch: Record<string, unknown>) => onChange((i) => ({ ...i, approved: false, data: { ...i.data, ...patch } }) as Item);
  const skipped = item.decision === "skip";
  const fieldCls = (f: string) => `input py-1.5 text-sm ${lowField(f) ? "border-warn bg-warn-soft" : ""}`;

  return (
    <div className={`card space-y-3 transition ${item.approved && !skipped ? "border-primary/50" : ""} ${skipped ? "opacity-70" : ""} ${low ? "border-l-4 border-l-warn" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium">{KIND_LABEL[item.kind]}</span>
        {low && <span className="rounded-full bg-warn-soft px-2 py-0.5 text-[11px] text-warn" title="The AI wasn't sure about this one">⚠ Low confidence ({Math.round(item.confidence * 100)}%)</span>}
        {item.dateText && <span className="text-[11px] text-muted">“{item.dateText}”</span>}
        <input
          type="date"
          className={`input ml-auto w-36 px-2 py-1 text-xs ${lowField("date") ? "border-warn bg-warn-soft" : ""}`}
          value={item.date}
          onChange={(e) => e.target.value && onChange((i) => ({ ...i, date: e.target.value, approved: false }))}
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
              <select className="input w-auto py-1.5 text-sm" value={item.data.habitId} onChange={(e) => setData({ habitId: e.target.value })}>
                {habits.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
              {normalizeLoose(item.data.habitName) !== normalizeLoose(habits.find((h) => h.id === item.data.habitId)?.name ?? "") && (
                <span className="text-xs text-muted">from “{item.data.habitName}”</span>
              )}
            </div>
          ) : (
            <div className="space-y-2 rounded-xl bg-accent-soft p-3">
              <p><b>New habit?</b> “{item.data.habitName}” doesn&apos;t match any of your habits.</p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  className={`chip text-xs ${item.data.createNew ? "chip-on" : "bg-surface"}`}
                  onClick={() => onChange((i) => ({ ...i, approved: false, decision: i.kind === "habit" && !i.data.createNew ? "add" : "skip", data: { ...i.data, createNew: !(i.data as { createNew: boolean }).createNew } }) as Item)}
                >
                  {item.data.createNew ? "✓ Will create habit" : "Create it"}
                </button>
                {item.data.createNew && (
                  <>
                    <input className="input w-auto py-1 text-sm" value={item.data.habitName} onChange={(e) => setData({ habitName: e.target.value })} aria-label="New habit name" />
                    <select className="input w-auto py-1 text-sm" value={item.data.frequency} onChange={(e) => setData({ frequency: e.target.value })}>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                    </select>
                  </>
                )}
                {!item.data.createNew && habits.length > 0 && (
                  <select
                    className="input w-auto bg-surface py-1 text-sm"
                    value=""
                    onChange={(e) => e.target.value && onChange((i) => ({ ...i, approved: false, decision: "add", data: { ...i.data, habitId: e.target.value } }) as Item)}
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
              value={item.data.goalId ?? ""}
              onChange={(e) => onChange((i) => ({ ...i, approved: false, decision: e.target.value && i.decision === "skip" && !i.dup ? "add" : i.decision, data: { ...i.data, goalId: e.target.value || null } }) as Item)}
            >
              <option value="">Unmatched: “{item.data.goalName}”</option>
              {goals.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          ) : (
            <span className="text-muted">“{item.data.goalName}” — no manual goals to update.</span>
          )}
          <span>+</span>
          <input className={`${fieldCls("value")} w-24`} inputMode="decimal" value={item.data.value} onChange={(e) => setData({ value: numOrNull(e.target.value) ?? 0 })} aria-label="Progress value" />
          <span className="text-muted">{goals.find((g) => g.id === item.data.goalId)?.unit}</span>
          {item.data.note && <span className="text-xs text-muted">· {item.data.note}</span>}
        </div>
      )}

      {item.kind === "journal" && (
        <div className="space-y-2">
          <textarea className={`${fieldCls("content")} min-h-20`} value={item.data.content} onChange={(e) => setData({ content: e.target.value })} aria-label="Journal text" />
          <div className="w-40"><RatingSelect cls={fieldCls("mood")} value={item.data.mood} labels={MOOD_EMOJI} onChange={(v) => setData({ mood: v })} /></div>
        </div>
      )}

      {item.dup && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-warn-soft px-3 py-2 text-xs">
          <span className="flex min-w-0 basis-full items-start gap-2 sm:basis-0 sm:flex-1">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warn" />
            <span>{item.dup.message}</span>
          </span>
          {item.dup.options.length > 1 && (
            <select className="input w-auto bg-surface py-1 text-xs" value={item.decision} onChange={(e) => onChange((i) => ({ ...i, decision: e.target.value as Decision, approved: false }))}>
              {item.dup.options.map((o) => <option key={o} value={o}>{DECISION_LABEL[o]}</option>)}
            </select>
          )}
        </div>
      )}

      {item.sourceText && <p className="truncate text-[11px] text-muted" title={item.sourceText}>From: “{item.sourceText}”</p>}

      <div className="flex items-center justify-end gap-2">
        {skipped ? (
          <span className="text-xs text-muted">Won&apos;t be saved</span>
        ) : (
          <button
            className={item.approved ? "btn-primary py-1.5 text-xs" : "btn-soft py-1.5 text-xs"}
            onClick={() => onChange((i) => ({ ...i, approved: !i.approved }))}
            aria-pressed={item.approved}
          >
            <Check size={14} /> {item.approved ? "Approved" : "Approve"}
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
