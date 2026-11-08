"use client";

import { useEffect, useState } from "react";
import { Cpu } from "lucide-react";
import { setOnDeviceAi } from "@/app/actions";
import type { ParseContext, ParseOutput } from "@/lib/import/parser";
import type { ImportEntry } from "@/lib/import/schema";

/**
 * Optional on-device AI (Tier 2). Hidden entirely on devices without WebGPU.
 * Off by default; when on, it re-reads only the snippets Tier 1 was unsure about.
 */
export function OnDeviceEnhance({ enabled, parsed, onResult, active }: {
  enabled: boolean; text: string; ctx: ParseContext; parsed: ParseOutput | null; onResult: (e: ImportEntry[] | null) => void; active: boolean;
}) {
  const [supported, setSupported] = useState(false);
  const [on, setOn] = useState(enabled);
  const [progress, setProgress] = useState<{ pct: number; text: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    import("@/lib/import/onDevice").then((m) => m.webGpuAvailable()).then(setSupported).catch(() => setSupported(false));
  }, []);
  if (!supported) return null;

  if (!on) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-driftwood px-4 py-3 text-sm">
        <Cpu size={16} className="text-iris" aria-hidden />
        <span className="min-w-0 flex-1">Smarter reading of messy notes. Runs privately on your device. One-time download (several hundred MB); Wi-Fi recommended.</span>
        <button type="button" className="btn-outline" onClick={() => { setOn(true); void setOnDeviceAi(true); }}>Turn on</button>
      </div>
    );
  }

  const uncertain = parsed?.uncertain ?? [];
  async function enhance() {
    setNote(null);
    setProgress({ pct: 0, text: "Starting…" });
    const { enhanceSnippets } = await import("@/lib/import/onDevice");
    const ai = await enhanceSnippets(uncertain, (pct, text) => setProgress({ pct, text }));
    setProgress(null);
    if (!ai) {
      setNote("On-device reading wasn't available, so the standard reading is used.");
      return;
    }
    const sent = new Set(uncertain.map((u) => u.text));
    const kept = (parsed?.entries ?? []).filter((e) => !(e.confidence < 0.7 && e.source_text && sent.has(e.source_text)));
    onResult([...kept, ...ai]);
    setNote(ai.length ? `On-device AI added ${ai.length} entr${ai.length === 1 ? "y" : "ies"}. They're highlighted for you to check.` : "On-device AI found nothing more to add.");
  }

  return (
    <div className="space-y-2 rounded-2xl bg-iris-soft px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <Cpu size={16} className="text-iris" aria-hidden />
        <span className="min-w-0 flex-1">On-device AI is on{active ? " · enhanced" : ""}.</span>
        {uncertain.length > 0 && !active && (
          <button type="button" className="btn-outline" disabled={!!progress} onClick={enhance}>Enhance {uncertain.length} unclear part{uncertain.length === 1 ? "" : "s"}</button>
        )}
        <button type="button" className="btn-ghost px-3 text-xs" onClick={() => { setOn(false); onResult(null); void setOnDeviceAi(false); }}>Turn off</button>
      </div>
      {progress && (
        <div aria-live="polite">
          <div className="h-2 overflow-hidden rounded-full bg-surface" role="progressbar" aria-valuenow={progress.pct} aria-valuemin={0} aria-valuemax={100} aria-label="Model download">
            <div className="h-full rounded-full bg-iris transition-all" style={{ width: `${Math.max(3, progress.pct)}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted">{progress.pct < 100 ? `Preparing the model… ${progress.pct}% (only the first time)` : "Reading your notes…"}</p>
        </div>
      )}
      {note && <p className="text-xs text-muted" role="status">{note}</p>}
    </div>
  );
}
