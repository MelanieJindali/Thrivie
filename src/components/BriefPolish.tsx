"use client";

import { useEffect, useState } from "react";

/** Shows the brief, with an optional on-device "polish" when the model is already downloaded. */
export function BriefText({ brief }: { brief: string }) {
  const [text, setText] = useState(brief);
  const [can, setCan] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    import("@/lib/import/onDevice").then(async (m) => setCan((await m.webGpuAvailable()) && (await m.isModelCached()))).catch(() => {});
  }, []);

  async function polish() {
    setBusy(true);
    setNote(null);
    try {
      const m = await import("@/lib/import/onDevice");
      const r = await m.polishBrief(brief);
      if (r.ok) setText(r.text);
      else setNote(r.reason === "changed" ? "Couldn't improve this one safely, so your original stays. Tap again to try another wording." : "The on-device model couldn't start right now. Your original stays.");
    } catch {
      setNote("The on-device model couldn't start right now. Your original stays.");
    }
    setBusy(false);
  }

  return (
    <>
      <p className="max-w-3xl font-display text-lg leading-relaxed sm:text-[1.3rem]">{text}</p>
      {can && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {text === brief ? (
            <button type="button" className="btn-ghost px-3 text-xs" disabled={busy} onClick={polish}>
              {busy ? "Rewriting on this device…" : "Rewrite with on-device AI"}
            </button>
          ) : (
            <button type="button" className="btn-ghost px-3 text-xs" onClick={() => { setText(brief); setNote(null); }}>Show original</button>
          )}
          {note && <p className="text-xs text-muted" role="status">{note}</p>}
        </div>
      )}
    </>
  );
}
