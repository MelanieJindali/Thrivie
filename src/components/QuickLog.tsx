"use client";

import { createContext, useCallback, useContext, useEffect, useId, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronDown, CircleCheck, ClipboardPaste, Dumbbell, HeartPulse, NotebookPen, Plus, ScanBarcode, Target, Utensils } from "lucide-react";
import { getQuickLogData } from "@/app/actions";
import { MEAL_EMOJI, MEAL_LABELS, MEAL_SLOTS, MOOD_EMOJI, WORKOUT_LABELS, WORKOUT_TYPES, type MealSlot, type WorkoutType } from "@/lib/constants";
import { waterUnit } from "@/lib/units";
import { useOfflineAction } from "./OfflineSync";
import { Sheet } from "./Sheet";
import { useToast } from "./Toast";
import { HabitDayLogger } from "./HabitDayLogger";

export type QuickKind = "health" | "habits" | "workouts" | "nutrition" | "journal" | "goals";
type Data = Awaited<ReturnType<typeof getQuickLogData>>;

const KINDS: { kind: QuickKind; label: string; sub: string; href: string; icon: typeof Plus; tone: string }[] = [
  { kind: "health", label: "Check-in", sub: "Mood, sleep, water", href: "/health#log", icon: HeartPulse, tone: "bg-terracotta-soft text-terracotta-ink" },
  { kind: "habits", label: "Habits", sub: "Today or a past day", href: "/habits#today", icon: CircleCheck, tone: "bg-sage-soft text-sage-ink" },
  { kind: "workouts", label: "Workout", sub: "Type and minutes", href: "/workouts#log", icon: Dumbbell, tone: "bg-ocean-soft text-ocean" },
  { kind: "nutrition", label: "Meal", sub: "What you ate", href: "/nutrition#log", icon: Utensils, tone: "bg-clay-soft text-clay-ink" },
  { kind: "journal", label: "Journal", sub: "A few lines", href: "/journal#new", icon: NotebookPen, tone: "bg-iris-soft text-iris" },
  { kind: "goals", label: "Goal progress", sub: "Add an update", href: "/goals#progress", icon: Target, tone: "bg-gold-soft text-gold-ink" },
];

const Ctx = createContext<(kind?: QuickKind) => void>(() => {});
/** Opens the quick-log sheet, optionally with one kind of entry already expanded. */
export const useQuickLog = () => useContext(Ctx);

/** Wraps the app: provides the quick-log sheet and the small floating plus button (phones). */
export function QuickLogProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<QuickKind | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const show = useCallback((kind?: QuickKind) => { setExpanded(kind ?? null); setOpen(true); }, []);
  const close = useCallback(() => setOpen(false), []);
  // The sheet's data is fetched only when it's opened, and refreshed each time.
  useEffect(() => {
    if (!open) return;
    let live = true;
    setFailed(false);
    getQuickLogData().then((d) => { if (live) setData(d); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [open]);
  const kinds = data ? KINDS.filter((k) => data.visible.includes(k.kind)) : KINDS;

  return (
    <Ctx.Provider value={show}>
      {children}
      <button type="button" onClick={() => show()} aria-label="Quick log"
        className="fixed right-4 bottom-[calc(6.25rem+env(safe-area-inset-bottom))] z-40 grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-text shadow-soft ring-4 ring-bg transition active:scale-95 md:hidden">
        <Plus size={22} strokeWidth={2.2} aria-hidden />
      </button>
      <Sheet open={open} onClose={close} title="Quick log">
        <ul className="t-stagger space-y-2">
          {kinds.map((k) => (
            <li key={k.kind}>
              <Row k={k} open={expanded === k.kind} onToggle={() => setExpanded((e) => (e === k.kind ? null : k.kind))} onNavigate={close}>
                {!data ? <p className="text-sm text-muted" role="status">{failed ? "Couldn't load this right now. Open the full page instead." : "Loading…"}</p>
                  : k.kind === "health" ? <CheckinMini data={data} onSaved={() => setExpanded(null)} />
                  : k.kind === "habits" ? <HabitDayLogger habits={data.habits} today={data.today} showAll plain />
                  : k.kind === "workouts" ? <WorkoutMini data={data} onSaved={() => setExpanded(null)} />
                  : k.kind === "nutrition" ? <MealMini data={data} onSaved={() => setExpanded(null)} onNavigate={close} />
                  : k.kind === "journal" ? <JournalMini data={data} onSaved={() => setExpanded(null)} />
                  : <GoalMini data={data} onSaved={() => setExpanded(null)} />}
              </Row>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/nutrition/scan" onClick={close} className="btn-soft flex-1 basis-36"><ScanBarcode size={16} aria-hidden /> Scan food</Link>
          <Link href="/import" onClick={close} className="btn-soft flex-1 basis-36"><ClipboardPaste size={16} aria-hidden /> Paste notes</Link>
        </div>
      </Sheet>
    </Ctx.Provider>
  );
}

/** One kind of entry: a button that drops open a mini form, with a link to the full page. */
function Row({ k, open, onToggle, onNavigate, children }: { k: (typeof KINDS)[number]; open: boolean; onToggle: () => void; onNavigate: () => void; children: React.ReactNode }) {
  const id = useId();
  const Icon = k.icon;
  return (
    <div className={`rounded-2xl border transition ${open ? "border-primary/50 bg-surface" : "border-border bg-surface"}`}>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={onToggle} className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 py-2 text-left">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${k.tone}`} aria-hidden><Icon size={17} /></span>
        <span className="min-w-0 flex-1"><span className="block text-sm font-bold">{k.label}</span><span className="block truncate text-xs text-muted">{k.sub}</span></span>
        <ChevronDown size={18} className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && (
        <div id={id} className="t-acc space-y-3 border-t border-border px-3 pt-3 pb-3">
          {children}
          <Link href={k.href} onClick={onNavigate} className="inline-flex min-h-12 items-center gap-1 text-xs font-bold text-primary">Open the full {k.label.toLowerCase()} page <ArrowUpRight size={14} aria-hidden /></Link>
        </div>
      )}
    </div>
  );
}

type MiniProps = { data: Data; onSaved: () => void };
const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));

/** Shared save handling: run the action (queued when offline), toast, then close the form. */
function useSave(onSaved: () => void) {
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save(what: string, action: () => Promise<{ ok: true; queued?: boolean } | { ok: false; error: string }>) {
    setPending(true); setError(null);
    try {
      const r = await action();
      if (r.ok) { toast({ message: r.queued ? `${what} saved on this device. It will sync when you're back online.` : `${what} saved ✓` }); onSaved(); }
      else setError(r.error);
    } catch { setError("Couldn't save that. Check your connection and try again."); }
    setPending(false);
  }
  return { pending, error, setError, save };
}
const Err = ({ error }: { error: string | null }) => (error ? <p className="t-shake text-sm text-terracotta-ink" role="alert">{error}</p> : null);

function CheckinMini({ data, onSaved }: MiniProps) {
  const run = useOfflineAction();
  const { pending, error, setError, save } = useSave(onSaved);
  const [mood, setMood] = useState<number | null>(null);
  const [sleep, setSleep] = useState("");
  const [water, setWater] = useState("");
  return (
    <form className="space-y-3" onSubmit={(e) => {
      e.preventDefault();
      const s = num(sleep), w = num(water);
      if (mood == null && s == null && w == null) return setError("Add at least one value.");
      void save("Check-in", () => run("quickCheckin", { mood, sleepHours: s, water: w }));
    }}>
      <fieldset>
        <legend className="label">Mood</legend>
        <div className="flex flex-wrap gap-1.5">
          {MOOD_EMOJI.map((emoji, i) => (
            <button key={emoji} type="button" aria-pressed={mood === i + 1} aria-label={`Mood ${i + 1} of 5`} onClick={() => setMood(mood === i + 1 ? null : i + 1)}
              className={`grid h-12 w-12 place-items-center rounded-2xl border text-xl ${mood === i + 1 ? "border-primary bg-seaglass" : "border-border bg-surface"}`}>{emoji}</button>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <label className="block min-w-0"><span className="label">Sleep (hours)</span><input className="input" inputMode="decimal" value={sleep} onChange={(e) => setSleep(e.target.value)} /></label>
        <label className="block min-w-0"><span className="label">Water ({waterUnit(data.units)})</span><input className="input" inputMode="decimal" value={water} onChange={(e) => setWater(e.target.value)} /></label>
      </div>
      <Err error={error} />
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Saving…" : "Save check-in"}</button>
      <p className="text-xs text-muted">Adds to today&apos;s check-in. Anything you logged earlier today stays.</p>
    </form>
  );
}

function WorkoutMini({ data, onSaved }: MiniProps) {
  const run = useOfflineAction();
  const { pending, error, setError, save } = useSave(onSaved);
  const [type, setType] = useState<WorkoutType>("strength");
  const [minutes, setMinutes] = useState("");
  return (
    <form className="space-y-3" onSubmit={(e) => {
      e.preventDefault();
      const m = num(minutes);
      if (m == null || !(m >= 1) || m > 1440) return setError("Enter how many minutes it took.");
      void save("Workout", () => run("saveWorkout", { date: data.today, type, durationMin: Math.round(m), intensity: 3 }));
    }}>
      <fieldset>
        <legend className="label">Type</legend>
        <div className="flex flex-wrap gap-1.5">
          {WORKOUT_TYPES.map((t) => <button key={t} type="button" aria-pressed={type === t} onClick={() => setType(t)} className={`chip ${type === t ? "chip-on" : ""}`}><span aria-hidden>{WORKOUT_LABELS[t].emoji}</span> {WORKOUT_LABELS[t].label}</button>)}
        </div>
      </fieldset>
      <label className="block max-w-40"><span className="label">Minutes</span><input className="input" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} /></label>
      <Err error={error} />
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Saving…" : "Save workout"}</button>
    </form>
  );
}

function MealMini({ data, onSaved, onNavigate }: MiniProps & { onNavigate: () => void }) {
  const run = useOfflineAction();
  const { pending, error, setError, save } = useSave(onSaved);
  const [slot, setSlot] = useState<MealSlot>("lunch");
  const [name, setName] = useState("");
  const [calories, setCalories] = useState("");
  useEffect(() => { const h = new Date().getHours(); setSlot(h < 11 ? "breakfast" : h < 16 ? "lunch" : h < 21 ? "dinner" : "snack"); }, []);
  return (
    <form className="space-y-3" onSubmit={(e) => {
      e.preventDefault();
      if (!name.trim()) return setError("Add what you ate.");
      const c = num(calories);
      void save("Meal", () => run("saveMeal", { date: data.today, slot, name, calories: c != null && c >= 0 ? Math.round(c) : null }));
    }}>
      <fieldset>
        <legend className="label">Meal</legend>
        <div className="flex flex-wrap gap-1.5">
          {MEAL_SLOTS.map((s) => <button key={s} type="button" aria-pressed={slot === s} onClick={() => setSlot(s)} className={`chip ${slot === s ? "chip-on" : ""}`}><span aria-hidden>{MEAL_EMOJI[s]}</span> {MEAL_LABELS[s]}</button>)}
        </div>
      </fieldset>
      <div className="grid grid-cols-[1fr_6.5rem] gap-3">
        <label className="block min-w-0"><span className="label">What did you have?</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} autoComplete="off" /></label>
        <label className="block min-w-0"><span className="label">Calories</span><input className="input" inputMode="numeric" value={calories} onChange={(e) => setCalories(e.target.value)} placeholder="Optional" /></label>
      </div>
      <Err error={error} />
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary flex-1 basis-36" disabled={pending}>{pending ? "Saving…" : "Save meal"}</button>
        <Link href="/nutrition/scan" onClick={onNavigate} className="btn-soft"><ScanBarcode size={16} aria-hidden /> Scan instead</Link>
      </div>
    </form>
  );
}

function JournalMini({ data, onSaved }: MiniProps) {
  const run = useOfflineAction();
  const { pending, error, setError, save } = useSave(onSaved);
  const [text, setText] = useState("");
  return (
    <form className="space-y-3" onSubmit={(e) => {
      e.preventDefault();
      if (!text.trim()) return setError("Write something first.");
      void save("Journal entry", () => run("saveJournal", { date: data.today, content: text }));
    }}>
      <label className="block"><span className="label">A few lines about today</span><textarea className="input min-h-28" value={text} onChange={(e) => setText(e.target.value)} maxLength={20000} /></label>
      <Err error={error} />
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Saving…" : "Save entry"}</button>
    </form>
  );
}

function GoalMini({ data, onSaved }: MiniProps) {
  const run = useOfflineAction();
  const { pending, error, setError, save } = useSave(onSaved);
  const [goalId, setGoalId] = useState(data.goals[0]?.id ?? "");
  const [value, setValue] = useState("");
  const goal = data.goals.find((g) => g.id === goalId);
  if (!data.goals.length) return <p className="text-sm text-muted">No goals that take manual updates yet. Goals linked to your logs update by themselves.</p>;
  return (
    <form className="space-y-3" onSubmit={(e) => {
      e.preventDefault();
      const v = num(value);
      if (v == null || !Number.isFinite(v)) return setError("Enter a number.");
      void save("Progress", () => run("addGoalProgress", goalId, v));
    }}>
      <div className="grid grid-cols-[1fr_7rem] gap-3">
        <label className="block min-w-0"><span className="label">Goal</span>
          <select className="input" value={goalId} onChange={(e) => setGoalId(e.target.value)}>{data.goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}</select>
        </label>
        <label className="block min-w-0"><span className="label">Add{goal?.unit ? ` (${goal.unit})` : ""}</span><input className="input" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} /></label>
      </div>
      <Err error={error} />
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Saving…" : "Add progress"}</button>
    </form>
  );
}

/** A tile or link that opens the quick-log sheet at one kind of entry. */
export function QuickLogButton({ kind, className, children, label }: { kind: QuickKind; className?: string; children: React.ReactNode; label?: string }) {
  const open = useQuickLog();
  return <button type="button" className={className} aria-label={label} onClick={() => open(kind)}>{children}</button>;
}
