"use client";

import { useState } from "react";
import Link from "next/link";
import { HeartPulse, Dumbbell, NotebookPen, Target, Sparkles, Repeat } from "lucide-react";
import { Sheet } from "./Sheet";
import { HealthForm, type HealthPrefill } from "@/app/health/HealthForm";
import { JournalComposer } from "@/app/journal/JournalClient";
import { repeatLastWorkout } from "@/app/actions";
import { FormStatus, useAction } from "./ui";
import type { Units } from "@/lib/units";
import type { ModuleKey } from "@/lib/settings";

export function QuickAdd({
  today, units, visible, healthToday, lastWeight, lastWorkout,
}: {
  today: string; units: Units; visible: ModuleKey[]; healthToday: HealthPrefill | null; lastWeight: number | null; lastWorkout: string | null;
}) {
  const [open, setOpen] = useState<null | "health" | "journal">(null);
  const { run, pending, error, message } = useAction();
  const btn = "lift group flex flex-col items-center justify-center gap-2 rounded-3xl border border-border/70 bg-surface px-2 py-4 text-xs font-semibold shadow-soft active:scale-[0.97]";
  const ico = (grad: string) => `grid h-11 w-11 place-items-center rounded-2xl bg-linear-to-br ${grad} text-white shadow-md transition group-hover:scale-110`;
  return (
    <>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {visible.includes("health") && (
          <button className={btn} onClick={() => setOpen("health")}>
            <span className={ico("from-rose to-amber")}><HeartPulse size={20} /></span> Log health
          </button>
        )}
        {visible.includes("workouts") && (
          <Link href="/workouts" className={btn}>
            <span className={ico("from-sapphire to-teal")}><Dumbbell size={20} /></span> Workout
          </Link>
        )}
        {visible.includes("workouts") && lastWorkout && (
          <button className={btn} disabled={pending} title={lastWorkout} onClick={() => run(() => repeatLastWorkout(), { success: "Logged ✓" })}>
            <span className={ico("from-teal to-emerald")}><Repeat size={20} /></span> Repeat last
          </button>
        )}
        {visible.includes("journal") && (
          <button className={btn} onClick={() => setOpen("journal")}>
            <span className={ico("from-plum to-sapphire")}><NotebookPen size={20} /></span> Journal
          </button>
        )}
        {visible.includes("goals") && (
          <Link href="/goals" className={btn}>
            <span className={ico("from-amber to-rose")}><Target size={20} /></span> Goals
          </Link>
        )}
        <Link href="/import" className={btn}>
          <span className={ico("from-primary to-gold")}><Sparkles size={20} /></span> AI import
        </Link>
      </div>
      <div className="mt-2 min-h-5"><FormStatus error={error} message={message} /></div>
      <Sheet open={open === "health"} onClose={() => setOpen(null)} title="Log health">
        <HealthForm compact today={today} units={units} prefill={healthToday ? { [today]: healthToday } : {}} lastWeight={lastWeight} customKeys={[]} onSaved={() => setTimeout(() => setOpen(null), 600)} />
      </Sheet>
      <Sheet open={open === "journal"} onClose={() => setOpen(null)} title="Journal">
        <JournalComposer compact today={today} onDone={() => setOpen(null)} />
      </Sheet>
    </>
  );
}
