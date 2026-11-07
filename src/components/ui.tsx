"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/app/actions";

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="h1">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

/** Row of 1–5 buttons; tap the selected one again to clear. */
export function RatingPicker({
  value,
  onChange,
  labels,
  name,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  labels?: string[];
  name: string;
}) {
  return (
    <div className="flex gap-1.5" role="radiogroup" aria-label={name}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${name} ${n}`}
          onClick={() => onChange(value === n ? null : n)}
          className={`h-10 min-w-10 flex-1 rounded-xl border text-base transition ${
            value === n ? "border-primary bg-primary-soft" : "border-border bg-surface hover:bg-surface-2"
          }`}
        >
          {labels ? labels[n - 1] : n}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function numOrNull(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Runs a server action with pending state + error message + refresh. */
export function useAction() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();
  function run(fn: () => Promise<ActionResult>, opts: { success?: string; onOk?: (r: ActionResult) => void } = {}) {
    setError(null);
    setMessage(null);
    start(async () => {
      const r = await fn();
      if (r.ok) {
        if (opts.success) {
          setMessage(opts.success);
          setTimeout(() => setMessage(null), 2500);
        }
        opts.onOk?.(r);
        router.refresh();
      } else setError(r.error);
    });
  }
  return { pending, error, message, run, setError };
}

export function FormStatus({ error, message }: { error: string | null; message: string | null }) {
  if (error) return <p className="text-sm text-danger" role="alert">{error}</p>;
  if (message) return <p className="text-sm text-primary" role="status">{message}</p>;
  return null;
}

export function ProgressBar({ pct, expected, tone = "primary" }: { pct: number; expected?: number; tone?: "primary" | "warn" | "accent" }) {
  const color = tone === "warn" ? "bg-warn" : tone === "accent" ? "bg-accent" : "bg-primary";
  return (
    <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${Math.max(2, pct)}%` }} />
      {expected != null && expected > 0 && expected < 100 && (
        <div className="absolute top-0 h-full w-0.5 bg-text/30" style={{ left: `${expected}%` }} title="Where a steady pace would be" />
      )}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">{children}</div>;
}

export function ConfirmButton({ onConfirm, label = "Delete", className = "btn-ghost text-xs" }: { onConfirm: () => void; label?: string; className?: string }) {
  const [ask, setAsk] = useState(false);
  if (!ask) return <button type="button" className={className} onClick={() => setAsk(true)}>{label}</button>;
  return (
    <span className="inline-flex items-center gap-1">
      <button type="button" className="btn-danger px-3 py-1.5 text-xs" onClick={() => { setAsk(false); onConfirm(); }}>Confirm</button>
      <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setAsk(false)}>Cancel</button>
    </span>
  );
}
