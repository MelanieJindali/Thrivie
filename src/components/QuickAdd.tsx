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
  const btn = "flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-border bg-surface px-2 py-3 text-xs font-medium transition hover:bg-surface-2 active:scale-[0.97]";
  return (
    <>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {visible.includes("health") && (
          <button className={btn} onClick={() => setOpen("health")}>
            <HeartPulse size={20} className="text-danger" /> Log health
          </button>
        )}
        {visible.includes("workouts") && (
          <Link href="/workouts" className={btn}>
            <Dumbbell size={20} className="text-sky" /> Workout
          </Link>
        )}
        {visible.includes("workouts") && lastWorkout && (
          <button className={btn} disabled={pending} title={lastWorkout} onClick={() => run(() => repeatLastWorkout(), { success: "Logged ✓" })}>
            <Repeat size={20} className="text-sky" /> Repeat last
          </button>
        )}
        {visible.includes("journal") && (
          <button className={btn} onClick={() => setOpen("journal")}>
            <NotebookPen size={20} className="text-lavender" /> Journal
          </button>
        )}
        {visible.includes("goals") && (
          <Link href="/goals" className={btn}>
            <Target size={20} className="text-accent" /> Goals
          </Link>
        )}
        <Link href="/import" className={btn}>
          <Sparkles size={20} className="text-primary" /> AI import
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
