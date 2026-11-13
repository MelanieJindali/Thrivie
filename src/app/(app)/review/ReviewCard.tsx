import { Sparkles } from "lucide-react";
import type { ReviewContent } from "@/lib/review";

export function ReviewCard({ review }: { review: ReviewContent }) {
  return (
    <section className="brief-card" aria-label="Weekly reflection">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles size={17} className="text-gold-ink" aria-hidden />
        <p className="eyebrow">Your weekly reflection</p>
      </div>
      <div className="space-y-4">
        <p className="font-display text-lg leading-relaxed sm:text-xl">{review.summary}</p>
        <ul className="space-y-1.5 text-sm">
          {review.wins.map((w, i) => (
            <li key={i} className="flex gap-2"><span aria-hidden className="text-gold-ink">✦</span>{w}</li>
          ))}
        </ul>
        <p className="rounded-2xl bg-seaglass-soft px-4 py-3 text-sm"><b>Next week:</b> {review.focus}</p>
        <p className="text-xs text-muted">Written from this week&apos;s numbers, on our server. Nothing is shared with other services.</p>
      </div>
    </section>
  );
}
