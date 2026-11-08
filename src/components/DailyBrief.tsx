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
      <section className="relative overflow-hidden rounded-[2rem] bg-linear-to-br from-[#1f5c4a] via-[#256e58] to-[#163f33] p-7 text-[#f6efe2] shadow-lift">
        <Glow />
        <p className="eyebrow text-[#d8b46c]">Welcome</p>
        <h2 className="mt-2 font-display text-2xl font-medium">Your wellness story starts here</h2>
        <p className="mt-2 max-w-prose text-sm text-[#f6efe2]/80">Log a few things — or paste notes into <b>AI import</b> — and a personal daily brief will appear here each morning.</p>
      </section>
    );

  return (
    <section className="relative overflow-hidden rounded-[2rem] bg-linear-to-br from-[#1f5c4a] via-[#256e58] to-[#163f33] p-6 text-[#f6efe2] shadow-lift sm:p-8">
      <Glow />
      <div className="relative mb-4 flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-[#d8b46c]/20 text-[#e8cb8c] ring-1 ring-[#d8b46c]/40">
          <Sparkles size={17} />
        </span>
        <p className="eyebrow text-[#e3c27f]">Your daily brief</p>
        <button
          className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-[#f6efe2] ring-1 ring-white/15 backdrop-blur transition hover:bg-white/20 disabled:opacity-60"
          onClick={() => load(true)}
          disabled={loading}
          aria-label="Refresh brief"
          title="Regenerate"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> {loading ? "Thinking…" : "Refresh"}
        </button>
      </div>
      {brief ? (
        <p className={`relative max-w-3xl font-display text-lg leading-relaxed font-normal sm:text-[1.35rem] sm:leading-relaxed ${loading ? "opacity-50" : ""}`}>{brief.brief}</p>
      ) : (
        <div className="relative space-y-3" aria-busy="true">
          <div className="h-4 w-full animate-pulse rounded-full bg-white/15" />
          <div className="h-4 w-5/6 animate-pulse rounded-full bg-white/15" />
          <div className="h-4 w-2/3 animate-pulse rounded-full bg-white/15" />
        </div>
      )}
      <p className="relative mt-5 text-[11px] text-[#f6efe2]/60">
        {brief?.source === "ai"
          ? "Written by Claude from a summary of your last 7 days (counts and averages, never your journal text)."
          : "Simple summary — add an Anthropic API key for an AI-written brief."}
      </p>
      {error && <p className="relative mt-1 text-xs text-[#f3c98a]">{error}</p>}
    </section>
  );
}

/** Decorative gold/emerald glow + leaf watermark for the hero card. */
function Glow() {
  return (
    <>
      <div className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full bg-[#d8b46c]/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 -left-10 h-64 w-64 rounded-full bg-[#5fbf9b]/20 blur-3xl" />
      <svg className="pointer-events-none absolute -right-6 -bottom-10 h-48 w-48 opacity-[0.08]" viewBox="100 100 312 312" aria-hidden>
        <path d="M256 262c0-70 48-122 128-126 0 80-50 128-128 126z" fill="#fff" />
        <path d="M256 300c0-60-40-104-108-108 0 68 42 110 108 108z" fill="#fff" />
        <path d="M256 400V250" stroke="#fff" strokeWidth="20" strokeLinecap="round" />
      </svg>
    </>
  );
}
