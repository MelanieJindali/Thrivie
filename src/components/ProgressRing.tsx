// Iridescent progress ring. A completed ring glows; text in the center is the
// accessible value (the SVG itself is labelled for screen readers).
export function ProgressRing({ pct, size = 120, stroke = 11, label, sub, id }: { pct: number; size?: number; stroke?: number; label?: string; sub?: string; id: string }) {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const done = p >= 100;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className={`h-full w-full -rotate-90 overflow-visible ${done ? "glow" : ""}`} role="img" aria-label={`${label ?? "Progress"}: ${p}%`}>
        <defs>
          <linearGradient id={`ring-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={{ stopColor: "var(--ring-1)" }} />
            <stop offset="0.55" style={{ stopColor: "var(--ring-2)" }} />
            <stop offset="1" style={{ stopColor: "var(--ring-3)" }} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#ring-${id})`} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - p / 100)} style={{ transition: "stroke-dashoffset 900ms cubic-bezier(.2,.8,.2,1)" }} />
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center" aria-hidden>
        <span className="font-display text-[1.6em] leading-none font-semibold" style={{ fontSize: size / 5 }}>{done ? "✓" : `${p}%`}</span>
        {sub && <span className="mt-1 text-[11px] text-muted">{sub}</span>}
      </div>
    </div>
  );
}
