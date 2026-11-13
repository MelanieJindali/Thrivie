"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { acceptBrief, BRIEF_SYSTEM } from "@/lib/import/polish";
import { useLocalAi } from "./useLocalAi";

const KEY = "thrivie-brief-rewrite";
type Saved = { brief: string; text: string };

/**
 * Shows the brief, with an optional rewrite by the on-device model. The rewrite streams into the
 * card, is kept for this browser session so switching between the two versions never runs the
 * model again, and is dropped if it invents a number.
 */
export function BriefText({ brief, enabled }: { brief: string; enabled: boolean }) {
  const ai = useLocalAi(enabled);
  const [rewrite, setRewrite] = useState<string | null>(null);
  const [live, setLive] = useState<string | null>(null); // text while it streams in
  const [showOriginal, setShowOriginal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const tried = useRef(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as Saved | null;
      if (saved?.brief === brief) setRewrite(saved.text);
    } catch { /* nothing saved */ }
  }, [brief]);

  const run = useCallback(async () => {
    setBusy(true);
    setNote(null);
    setLive("");
    try {
      const { generate } = await import("@/services/localAi");
      let good: string | null = null;
      // A second, steadier attempt if the first one changes a number.
      for (const temperature of [0.4, 0.1]) {
        setLive("");
        const raw = await generate({ system: BRIEF_SYSTEM, prompt: brief, maxTokens: 150, temperature, onToken: (_d, full) => setLive(full) });
        good = acceptBrief(brief, raw);
        if (good) break;
      }
      if (good) {
        setRewrite(good);
        setShowOriginal(false);
        try { sessionStorage.setItem(KEY, JSON.stringify({ brief, text: good } satisfies Saved)); } catch { /* storage blocked */ }
      } else setNote("The rewrite changed some details, so your original stays. Tap to try again.");
    } catch {
      setNote(null); // the status line below says why
    }
    setLive(null);
    setBusy(false);
  }, [brief]);

  // On load: rewrite straight away when it costs nothing to start (model already on the device, not a phone).
  useEffect(() => {
    if (!ai.autoRun || tried.current || rewrite || busy) return;
    tried.current = true;
    try { if ((JSON.parse(sessionStorage.getItem(KEY) ?? "null") as Saved | null)?.brief === brief) return; } catch { /* nothing saved */ }
    void run();
  }, [ai.autoRun, rewrite, busy, brief, run]);

  const text = live != null ? live : rewrite && !showOriginal ? rewrite : brief;
  return (
    <>
      {live === "" ? (
        <div className="max-w-3xl space-y-2.5 py-1" role="status" aria-label="Rewriting your brief on this device">
          <div className="h-5 w-full animate-pulse rounded-full bg-surface-2/80" />
          <div className="h-5 w-11/12 animate-pulse rounded-full bg-surface-2/80" />
          <div className="h-5 w-3/5 animate-pulse rounded-full bg-surface-2/80" />
        </div>
      ) : (
        <p className="max-w-3xl font-display text-lg leading-relaxed sm:text-[1.3rem]" aria-live={live != null ? "off" : undefined}>{text}</p>
      )}
      {enabled && (ai.supported || ai.status) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          {ai.supported && (rewrite ? (
            <button type="button" className="btn-ghost px-3 text-xs" aria-pressed={showOriginal} onClick={() => setShowOriginal((v) => !v)}>{showOriginal ? "Show rewrite" : "Show original"}</button>
          ) : (
            <button type="button" className="btn-ghost px-3 text-xs" disabled={busy} onClick={run}>
              <span className={busy ? "animate-pulse" : ""}>{busy ? "Rewriting on this device…" : "Rewrite with on-device AI"}</span>
            </button>
          ))}
          {(ai.status || note) && <p className="text-xs text-muted" role="status">{ai.status ?? note}</p>}
        </div>
      )}
    </>
  );
}
