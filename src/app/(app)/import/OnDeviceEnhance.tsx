"use client";

import { useState } from "react";
import { Cpu } from "lucide-react";
import { setOnDeviceAi } from "@/app/actions";
import { useLocalAi } from "@/components/useLocalAi";
import { acceptEnhance, ENHANCE_EXAMPLES, ENHANCE_SYSTEM } from "@/lib/import/polish";
import type { ParseContext, ParseOutput } from "@/lib/import/parser";

/**
 * Optional on-device AI for the parts of a note Thrivie couldn't read. Off by default; when on,
 * each unclear part is rewritten on this device into a line Thrivie understands, and that line
 * replaces the original in the note, so the usual reader picks it up and you review it as usual.
 * Nothing is downloaded until it's turned on and Enhance is tapped.
 */
export function OnDeviceEnhance({ enabled, parsed, ctx, onReplace }: {
  enabled: boolean; parsed: ParseOutput | null; ctx: ParseContext; onReplace: (changes: { from: string; to: string }[]) => void;
}) {
  const [on, setOn] = useState(enabled);
  const ai = useLocalAi(on);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState<{ index: number; total: number; text: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // Parts read with low confidence, plus lines that weren't recognised at all.
  const uncertain = [...new Set([...(parsed?.uncertain ?? []).map((u) => u.text), ...(parsed?.unparsed ?? [])])].filter((t) => t.trim().length > 2).map((text) => ({ text }));

  if (!on) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-driftwood px-4 py-3 text-sm">
        <Cpu size={16} className="text-iris" aria-hidden />
        <span className="min-w-0 flex-1">Smarter reading of messy notes. Runs privately on your device. One-time download (a few hundred MB); Wi-Fi recommended.</span>
        <button type="button" className="btn-outline" onClick={() => { setOn(true); void setOnDeviceAi(true); }}>Turn on</button>
      </div>
    );
  }

  async function enhance() {
    setBusy(true);
    setNote(null);
    const changes: { from: string; to: string }[] = [];
    try {
      const [{ generate }, { readsAsEntry }] = await Promise.all([import("@/services/localAi"), import("@/lib/import/enhanceCheck")]);
      const list = uncertain.slice(0, 8);
      for (const [i, u] of list.entries()) {
        setLive({ index: i + 1, total: list.length, text: "" });
        const raw = await generate({ system: ENHANCE_SYSTEM, examples: ENHANCE_EXAMPLES, prompt: u.text.slice(0, 300), maxTokens: 60, temperature: 0, onToken: (_d, full) => setLive({ index: i + 1, total: list.length, text: full }) });
        // Used only if Thrivie's own reader can read the new line; otherwise the original stays.
        const line = acceptEnhance(u.text, raw);
        if (line && readsAsEntry(line, ctx)) changes.push({ from: u.text, to: line });
      }
      if (changes.length) onReplace(changes);
      setNote(changes.length ? `Rewrote ${changes.length} part${changes.length === 1 ? "" : "s"} of your note. Check the entries below before saving.` : "Couldn't improve these parts, so your note stays as it was.");
    } catch {
      if (changes.length) onReplace(changes);
      setNote(changes.length ? `Rewrote ${changes.length} part${changes.length === 1 ? "" : "s"} before on-device AI stopped. Your note is otherwise unchanged.` : null);
    }
    setLive(null);
    setBusy(false);
  }

  return (
    <div className="space-y-2 rounded-2xl bg-iris-soft px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <Cpu size={16} className="text-iris" aria-hidden />
        <span className="min-w-0 flex-1">{ai.status === "On-device AI unsupported on this browser" ? ai.status : "On-device AI is on."}</span>
        {uncertain.length > 0 && ai.supported && (
          <button type="button" className="btn-outline" disabled={busy} onClick={enhance}>
            <span className={busy ? "animate-pulse" : ""}>{busy ? "Enhancing…" : `Enhance ${uncertain.length} unclear part${uncertain.length === 1 ? "" : "s"}`}</span>
          </button>
        )}
        <button type="button" className="btn-ghost px-3 text-xs" onClick={() => { setOn(false); ai.release(); void setOnDeviceAi(false); }}>Turn off</button>
      </div>
      {ai.downloading && (
        <div aria-live="polite">
          <div className="h-2 overflow-hidden rounded-full bg-surface" role="progressbar" aria-valuenow={ai.downloading.pct} aria-valuemin={0} aria-valuemax={100} aria-label="Model download">
            <div className="h-full rounded-full bg-iris transition-all" style={{ width: `${Math.max(3, ai.downloading.pct)}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted">{ai.status} Only the first time; it works offline after that.</p>
        </div>
      )}
      {ai.status === "Starting on-device AI…" && <p className="text-xs text-muted" role="status">{ai.status}</p>}
      {live && (
        <p className="text-xs text-muted" aria-live="off">
          Part {live.index} of {live.total}{live.text ? <>: <span className="text-text">{live.text}</span></> : "…"}
        </p>
      )}
      {note && <p className="text-xs text-muted" role="status">{note}</p>}
    </div>
  );
}
