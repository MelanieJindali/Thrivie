"use client";

import { useState } from "react";

/**
 * The daily brief: a short summary written on our server from the day's own numbers, with a
 * switch to the plain numbers behind it. Both arrive with the page, so switching is instant.
 */
export function BriefText({ brief, numbers }: { brief: string; numbers: { label: string; value: string }[] }) {
  const [showNumbers, setShowNumbers] = useState(false);
  return (
    <>
      {showNumbers ? (
        <dl className="grid max-w-3xl grid-cols-1 gap-x-8 gap-y-1.5 sm:grid-cols-2">
          {numbers.map((n) => (
            <div key={n.label} className="flex items-baseline justify-between gap-3 border-b border-border/60 py-1.5">
              <dt className="min-w-0 text-sm text-muted">{n.label}</dt>
              <dd className="shrink-0 font-display text-lg font-semibold tabular-nums">{n.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="max-w-3xl font-display text-lg leading-relaxed sm:text-[1.3rem]">{brief}</p>
      )}
      {numbers.length > 0 && (
        <button type="button" className="btn-ghost mt-2 -ml-3 px-3 text-xs" aria-pressed={showNumbers} onClick={() => setShowNumbers((v) => !v)}>
          {showNumbers ? "Show summary" : "Show the numbers"}
        </button>
      )}
    </>
  );
}
