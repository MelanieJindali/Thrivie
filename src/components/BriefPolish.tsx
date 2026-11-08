"use client";

import { useEffect, useState } from "react";

/** Shows the brief, with an optional on-device "polish" when the model is already downloaded. */
export function BriefText({ brief }: { brief: string }) {
  const [text, setText] = useState(brief);
  const [can, setCan] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    import("@/lib/import/onDevice").then(async (m) => setCan((await m.webGpuAvailable()) && (await m.isModelCached()))).catch(() => {});
  }, []);
  return (
    <>
      <p className="max-w-3xl font-display text-lg leading-relaxed sm:text-[1.3rem]">{text}</p>
      {can && text === brief && (
        <button type="button" className="btn-ghost mt-2 px-3 text-xs" disabled={busy}
          onClick={async () => { setBusy(true); const m = await import("@/lib/import/onDevice"); const out = await m.polishBrief(brief); setBusy(false); if (out) setText(out); }}>
          {busy ? "Polishing on this device…" : "Rewrite with on-device AI"}
        </button>
      )}
    </>
  );
}
