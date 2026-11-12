"use client";

import type { Food } from "@/lib/nutrition/food";

/** Placeholder until the photo model is wired in (step 6). */
export function PhotoScanner({ onSearch }: { onPick: (f: Food) => void; onSearch: () => void }) {
  return (
    <div className="space-y-3 rounded-3xl bg-surface-2/60 p-5 text-sm">
      <p><b>Photo recognition (beta)</b> isn&apos;t available yet.</p>
      <button type="button" className="btn-soft" onClick={onSearch}>Search instead</button>
    </div>
  );
}
