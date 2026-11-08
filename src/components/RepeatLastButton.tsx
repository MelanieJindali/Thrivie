"use client";

import { Repeat } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { repeatLastWorkout } from "@/app/actions";
import { useToast } from "./Toast";

export function RepeatLastButton({ summary }: { summary: string }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pending}
      title={summary}
      onClick={() => start(async () => {
        const r = await repeatLastWorkout();
        toast(r.ok ? { message: "Logged again for today ✓" } : { message: r.error, tone: "error" });
        router.refresh();
      })}
      className="lift flex min-h-20 items-center gap-3 rounded-3xl border border-border/70 bg-surface p-4 text-left text-sm font-bold shadow-soft"
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-ocean-soft text-ocean" aria-hidden><Repeat size={20} /></span>
      <span className="min-w-0">Repeat last<span className="block truncate text-xs font-medium text-muted">{summary}</span></span>
    </button>
  );
}
