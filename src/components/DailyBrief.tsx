import { Sparkles } from "lucide-react";
import { BriefText } from "./BriefPolish";

/** Daily brief: frosted glass with an iridescent edge. Written from your own numbers on our server. */
export function DailyBrief({ brief, numbers, hasData }: { brief: string; numbers: { label: string; value: string }[]; hasData: boolean }) {
  return (
    <section className="brief-card" aria-labelledby="brief-title">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-gold-soft text-gold-ink" aria-hidden>
          <Sparkles size={17} />
        </span>
        <h2 id="brief-title" className="eyebrow">Your daily brief</h2>
      </div>
      {hasData ? (
        <BriefText brief={brief} numbers={numbers} />
      ) : (
        <p className="max-w-prose font-display text-lg leading-relaxed">
          Log a few things, or paste notes into Import, and a short personal brief will appear here each day.
        </p>
      )}
    </section>
  );
}
