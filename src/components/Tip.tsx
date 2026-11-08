"use client";

import { useState } from "react";
import { Lightbulb, X } from "lucide-react";
import { dismissTip } from "@/app/actions";

/** A light, one-time tip shown the first time a feature is used. Never repeats once dismissed. */
export function Tip({ id, seen, children }: { id: string; seen: string[]; children: React.ReactNode }) {
  const [hidden, setHidden] = useState(seen.includes(id));
  if (hidden) return null;
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-seaglass-soft px-4 py-3 text-sm" role="note">
      <Lightbulb size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
      <button type="button" className="-m-2 grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted hover:text-text" aria-label="Dismiss tip"
        onClick={() => { setHidden(true); void dismissTip(id); }}>
        <X size={16} />
      </button>
    </div>
  );
}
