"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Sparkles } from "lucide-react";

type Brief = { brief: string; source: string; createdAt: string; error?: string };

export function DailyBrief({ initial, hasData }: { initial: Brief | null; hasData: boolean }) {
  const [brief, setBrief] = useState<Brief | null>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const started = useRef(false);

  const load = useCallback(
    async (refresh: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/brief", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refresh }) });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        setBrief(json);
        if (json.error) setError(json.error);
        router.refresh(); // pick up AI-phrased highlights
      } catch (e) {
        setError((e as Error).message || "Couldn't load the brief.");
      } finally {
        setLoading(false);
      }
    },
    [router],
  );

  // Generate once per day on first visit; afterwards it's served from the cache.
  useEffect(() => {
    if (!initial && hasData && !started.current) {
      started.current = true;
      load(false);
    }
  }, [initial, hasData, load]);

  if (!hasData)
    return (
      <section className="card bg-primary-soft">
        <h2 className="h2 mb-1 flex items-center gap-2"><Sparkles size={16} className="text-primary" /> Welcome to Thrivie</h2>
        <p className="text-sm">Log a few things — or paste notes into <b>AI import</b> — and your daily brief will appear here.</p>
      </section>
    );

  return (
    <section className="card relative overflow-hidden bg-gradient-to-br from-primary-soft to-surface">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="h2 flex items-center gap-2"><Sparkles size={16} className="text-primary" /> Daily brief</h2>
        <button className="btn-ghost ml-auto px-2 py-1 text-xs" onClick={() => load(true)} disabled={loading} aria-label="Refresh brief" title="Regenerate">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> {loading ? "Thinking…" : "Refresh"}
        </button>
      </div>
      {brief ? (
        <p className={`leading-relaxed ${loading ? "opacity-50" : ""}`}>{brief.brief}</p>
      ) : (
        <div className="space-y-2" aria-busy="true">
          <div className="h-3 w-full animate-pulse rounded bg-surface-2" />
          <div className="h-3 w-5/6 animate-pulse rounded bg-surface-2" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-surface-2" />
        </div>
      )}
      <p className="mt-2 text-[11px] text-muted">
        {brief?.source === "ai"
          ? "Written by Claude from a summary of your last 7 days (counts and averages, not your journal text)."
          : "Simple summary — add an Anthropic API key for an AI-written brief."}
      </p>
      {error && <p className="mt-1 text-xs text-warn">{error}</p>}
    </section>
  );
}
