"use client";

import { RefreshCw, Sparkles } from "lucide-react";
import { generateReview } from "@/app/actions";
import { useAction } from "@/components/ui";
import type { ReviewContent } from "@/lib/review";

export function ReviewCard({ weekStart, review, source }: { weekStart: string; review: ReviewContent | null; source: string | null }) {
  const { run, pending, error } = useAction();
  const go = () => run(() => generateReview(weekStart));
  return (
    <section className="relative overflow-hidden rounded-[2rem] bg-linear-to-br from-[#2a2350] via-[#3b2f6b] to-[#1f5c4a] p-6 text-[#f6efe2] shadow-lift sm:p-8">
      <div className="pointer-events-none absolute -top-20 -right-10 h-56 w-56 rounded-full bg-[#d8b46c]/25 blur-3xl" />
      <div className="relative mb-3 flex items-center gap-3">
        <Sparkles size={17} className="text-[#e3c27f]" />
        <p className="eyebrow text-[#e3c27f]">Your weekly reflection</p>
        {review && (
          <button onClick={go} disabled={pending} className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-semibold ring-1 ring-white/15 hover:bg-white/20">
            <RefreshCw size={13} className={pending ? "animate-spin" : ""} /> {pending ? "Writing…" : "Rewrite"}
          </button>
        )}
      </div>
      {review ? (
        <div className={`relative space-y-4 ${pending ? "opacity-50" : ""}`}>
          <p className="font-display text-lg leading-relaxed sm:text-xl">{review.summary}</p>
          <ul className="space-y-1.5 text-sm">{review.wins.map((w, i) => <li key={i} className="flex gap-2"><span className="text-[#e3c27f]">✦</span>{w}</li>)}</ul>
          <p className="rounded-2xl bg-white/10 px-4 py-3 text-sm"><b className="text-[#e3c27f]">Next week:</b> {review.focus}</p>
          <p className="text-[11px] text-[#f6efe2]/60">{source === "ai" ? "Written by Claude from this week's numbers (never your journal text)." : "Simple summary — add an Anthropic API key for an AI-written review."}</p>
        </div>
      ) : (
        <div className="relative space-y-3">
          <p className="font-display text-lg">Ready to look back on your week?</p>
          <button onClick={go} disabled={pending} className="inline-flex items-center gap-2 rounded-full bg-[#d8b46c] px-5 py-2.5 text-sm font-semibold text-[#1d2925] hover:brightness-105">
            <Sparkles size={15} /> {pending ? "Writing…" : "Write my review"}
          </button>
        </div>
      )}
      {error && <p className="relative mt-2 text-xs text-[#f3c98a]">{error}</p>}
    </section>
  );
}
