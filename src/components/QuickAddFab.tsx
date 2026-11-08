"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, HeartPulse, Dumbbell, CircleCheck, NotebookPen, Target, ClipboardPaste, Utensils } from "lucide-react";
import { Sheet } from "./Sheet";

const ITEMS = [
  { href: "/health#log", label: "Check-in", sub: "Mood, sleep, water…", icon: HeartPulse, tone: "bg-terracotta-soft text-terracotta-ink" },
  { href: "/habits#today", label: "Habits", sub: "Tick off today", icon: CircleCheck, tone: "bg-sage-soft text-sage-ink" },
  { href: "/workouts#log", label: "Workout", sub: "Or repeat last", icon: Dumbbell, tone: "bg-ocean-soft text-ocean" },
  { href: "/nutrition#log", label: "Meal", sub: "What you ate", icon: Utensils, tone: "bg-clay-soft text-clay-ink" },
  { href: "/journal#new", label: "Journal", sub: "A few lines", icon: NotebookPen, tone: "bg-iris-soft text-iris" },
  { href: "/goals#progress", label: "Goal progress", sub: "Add an update", icon: Target, tone: "bg-gold-soft text-gold-ink" },
  { href: "/import", label: "Paste notes", sub: "Smart Import", icon: ClipboardPaste, tone: "bg-seaglass-soft text-primary" },
];

/** Floating quick-add on phones: two taps to any entry. */
export function QuickAddFab() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Quick add"
        className="fixed right-4 bottom-[calc(6.25rem+env(safe-area-inset-bottom))] z-40 grid h-15 w-15 place-items-center rounded-[22px] text-[#0B1727] shadow-lift transition active:scale-95 md:hidden"
        style={{ width: 60, height: 60, background: "linear-gradient(135deg, #2EF2E0, #B9A6F7 55%, #FF8A73)", boxShadow: "0 12px 28px -10px var(--glow), 0 0 0 4px var(--bg)" }}
      >
        <Plus size={26} strokeWidth={2.4} aria-hidden />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="What would you like to log?">
        <ul className="grid grid-cols-2 gap-2.5">
          {ITEMS.map(({ href, label, sub, icon: Icon, tone }) => (
            <li key={href}>
              <Link href={href} onClick={() => setOpen(false)} className="flex min-h-24 flex-col justify-between gap-2 rounded-2xl border border-border bg-surface p-3.5 transition active:scale-[0.98]">
                <span className={`grid h-10 w-10 place-items-center rounded-xl ${tone}`} aria-hidden><Icon size={19} /></span>
                <span>
                  <span className="block text-sm font-bold">{label}</span>
                  <span className="block text-xs text-muted">{sub}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  );
}
