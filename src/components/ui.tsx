"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/app/actions";
import { THEME, type ThemeKey } from "@/lib/constants";

export type Crumb = { href: string; label: string };

/**
 * Where you are and a way back. Phones get one large "‹ Parent" link (an easy tap target);
 * wider screens show the whole trail.
 */
export function Breadcrumbs({ trail, current }: { trail: Crumb[]; current: string }) {
  const parent = trail[trail.length - 1];
  return (
    <nav aria-label="Breadcrumb" className="-mb-2 basis-full">
      <Link href={parent.href} aria-label={`Back to ${parent.label}`} className="-ml-1 inline-flex min-h-11 items-center gap-0.5 rounded-xl pr-2 text-sm font-semibold text-primary sm:hidden">
        <ChevronLeft size={18} aria-hidden /> {parent.label}
      </Link>
      <ol className="hidden flex-wrap items-center gap-1 text-sm text-muted sm:flex">
        {trail.map((c) => (
          <li key={c.href} className="flex items-center gap-1">
            <Link href={c.href} className="inline-flex min-h-11 items-center rounded-lg font-semibold text-primary hover:underline">{c.label}</Link>
            <ChevronRight size={14} aria-hidden />
          </li>
        ))}
        <li aria-current="page" className="min-w-0 truncate font-semibold text-text">{current}</li>
      </ol>
    </nav>
  );
}

export function PageHeader({
  title,
  subtitle,
  eyebrow,
  theme = "today",
  icon,
  children,
  crumbs,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  theme?: ThemeKey;
  icon?: React.ReactNode;
  children?: React.ReactNode;
  /** Parent pages, top level first (e.g. Log › Nutrition). The current page is added automatically. */
  crumbs?: Crumb[];
}) {
  const t = THEME[theme];
  return (
    <header className="mb-2 flex flex-wrap items-end justify-between gap-4">
      {crumbs && crumbs.length > 0 && <Breadcrumbs trail={crumbs} current={title} />}
      <div className="flex min-w-0 items-center gap-4">
        {icon && (
          <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-linear-to-br ${t.grad} text-white shadow-lg ring-4 ${t.ring}`}>
            {icon}
          </span>
        )}
        <div className="min-w-0">
          {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
          <h1 className="h1">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        </div>
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </header>
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
          className={`h-11 min-w-11 flex-1 rounded-2xl border text-base font-semibold transition duration-200 ${
            value === n
              ? "scale-[1.04] border-primary bg-primary-soft text-primary shadow-md shadow-primary/15"
              : "border-border bg-surface text-muted hover:-translate-y-0.5 hover:border-primary/30 hover:bg-surface-2"
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
        if ((r as { queued?: boolean }).queued) {
          setMessage("Saved on this device. It will sync when you're back online.");
          setTimeout(() => setMessage(null), 4000);
        } else if (opts.success) {
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
  if (error) return <p className="text-sm text-terracotta-ink" role="alert">{error}</p>;
  if (message) return <p className="rounded-full bg-primary-soft px-3 py-1 text-sm font-medium text-primary" role="status">{message}</p>;
  return null;
}

export function ProgressBar({ pct, expected, tone = "primary", label }: { pct: number; expected?: number; tone?: "primary" | "warn" | "accent"; label: string }) {
  const color =
    tone === "warn" ? "from-gold-ink to-terracotta-ink" : tone === "accent" ? "from-gold-ink to-gold-ink" : "from-sage-ink to-primary";
  return (
    <div className="relative h-3 w-full overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label={label} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full bg-linear-to-r ${color} shadow-[inset_0_-1px_0_rgb(0_0_0/0.08)] transition-all duration-700`} style={{ width: `${Math.max(3, pct)}%` }} />
      {expected != null && expected > 0 && expected < 100 && (
        <div className="absolute top-0.5 bottom-0.5 w-[3px] rounded-full bg-text/25" style={{ left: `${expected}%` }} title="Where a steady pace would be" />
      )}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-3xl border border-dashed border-border bg-surface-2/40 p-8 text-center text-sm text-muted">{children}</div>;
}
