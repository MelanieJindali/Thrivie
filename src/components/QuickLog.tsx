"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronDown, CircleCheck, ClipboardPaste, Dumbbell, HeartPulse, NotebookPen, Plus, ScanBarcode, Target, Utensils } from "lucide-react";
import dynamic from "next/dynamic";
import { getQuickLogData } from "@/app/actions";
import { Sheet } from "./Sheet";
import { HabitDayLogger } from "./HabitDayLogger";
import { clearDraft } from "./ui";

// The sheet shows the very same forms as the full pages (in their compact layout), so every field
// is available here too. They load only when a row is opened, to keep every page's startup small.
const loading = () => <p className="text-sm text-muted" role="status">Loading…</p>;
const HealthForm = dynamic(() => import("@/app/(app)/health/HealthForm").then((m) => m.HealthForm), { loading });
const WorkoutForm = dynamic(() => import("@/app/(app)/workouts/WorkoutForm").then((m) => m.WorkoutForm), { loading });
const MealForm = dynamic(() => import("@/app/(app)/nutrition/MealForm").then((m) => m.MealForm), { loading });
const JournalComposer = dynamic(() => import("@/app/(app)/journal/JournalClient").then((m) => m.JournalComposer), { loading });
const GoalProgressForm = dynamic(() => import("@/app/(app)/goals/GoalProgressForm").then((m) => m.GoalProgressForm), { loading });

export type QuickKind = "health" | "habits" | "workouts" | "nutrition" | "journal" | "goals";
type Data = Awaited<ReturnType<typeof getQuickLogData>>;

const KINDS: { kind: QuickKind; label: string; sub: string; href: string; icon: typeof Plus; tone: string }[] = [
  { kind: "health", label: "Check-in", sub: "Mood, sleep, water and more", href: "/health#log", icon: HeartPulse, tone: "bg-terracotta-soft text-terracotta-ink" },
  { kind: "habits", label: "Habits", sub: "Today or a past day", href: "/habits#today", icon: CircleCheck, tone: "bg-sage-soft text-sage-ink" },
  { kind: "workouts", label: "Workout", sub: "Type, minutes, exercises", href: "/workouts#log", icon: Dumbbell, tone: "bg-ocean-soft text-ocean" },
  { kind: "nutrition", label: "Meal", sub: "What you ate, calories, macros", href: "/nutrition#log", icon: Utensils, tone: "bg-clay-soft text-clay-ink" },
  { kind: "journal", label: "Journal", sub: "A few lines, a photo or a voice note", href: "/journal#new", icon: NotebookPen, tone: "bg-iris-soft text-iris" },
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
  const keepDraft = useRef(false);
  const show = useCallback((kind?: QuickKind) => { setExpanded(kind ?? null); setOpen(true); }, []);
  // Closing the sheet forgets anything half-typed, unless the person is following "Open the full page".
  const close = useCallback(() => { if (!keepDraft.current) clearDraft(); keepDraft.current = false; setOpen(false); }, []);
  const toFullPage = useCallback(() => { keepDraft.current = true; close(); }, [close]);
  const load = useCallback(() => getQuickLogData().then((d) => { setData(d); setFailed(false); }).catch(() => setFailed(true)), []);
  // The sheet's data is fetched only when it's opened, and again after each save.
  useEffect(() => { if (open) void load(); }, [open, load]);
  const saved = useCallback(() => { setExpanded(null); void load(); }, [load]);
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
              <Row k={k} open={expanded === k.kind} onToggle={() => setExpanded((e) => (e === k.kind ? null : k.kind))} onNavigate={toFullPage}>
                {!data ? <p className="text-sm text-muted" role="status">{failed ? "Couldn't load this right now. Open the full page instead." : "Loading…"}</p>
                  : k.kind === "health" ? (data.health && <HealthForm sheet today={data.today} units={data.units} prefill={data.health.prefill} lastWeight={data.health.lastWeight} customKeys={data.health.customKeys} onSaved={saved} />)
                  : k.kind === "habits" ? <HabitDayLogger habits={data.habits} today={data.today} showAll plain />
                  : k.kind === "workouts" ? (data.workout && <WorkoutForm sheet today={data.today} units={data.units} exerciseNames={data.workout.exerciseNames} lastSummary={data.workout.lastSummary} onDone={saved} />)
                  : k.kind === "nutrition" ? (data.meal && <MealForm sheet today={data.today} recent={data.meal.recent} allMeals={data.meal.allMeals} editing={null} onDone={saved} />)
                  : k.kind === "journal" ? <JournalComposer sheet today={data.today} onDone={saved} />
                  : <GoalProgressForm sheet goals={data.goals} today={data.today} onDone={saved} />}
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
