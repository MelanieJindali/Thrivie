"use client";

import { useState } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { LineChart as LineIcon } from "lucide-react";
import { formatDate } from "@/lib/dates";

export type TrendPoint = { date: string; value: number | null };
export type TrendSpec = {
  key: string;
  title: string;
  unit?: string;
  data: TrendPoint[]; // 90 days, oldest first
  decimals?: number;
  domain?: [number | "auto", number | "auto"];
  color?: string;
  summary?: "avg" | "latest";
};

const RANGES = [7, 30, 90] as const;

export function RangeToggle({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="inline-flex rounded-full bg-surface-2 p-1" role="tablist" aria-label="Time range">
      {RANGES.map((r) => (
        <button
          key={r}
          role="tab"
          aria-selected={value === r}
          onClick={() => onChange(r)}
          className={`rounded-full px-3.5 py-1 text-xs font-semibold transition ${value === r ? "bg-surface text-text shadow-soft" : "text-muted hover:text-text"}`}
        >
          {r}d
        </button>
      ))}
    </div>
  );
}

const axisTick = { fill: "var(--muted)", fontSize: 11 };

function ChartTooltip({ active, payload, label, unit, decimals = 1 }: { active?: boolean; payload?: { value: number; name: string; color: string }[]; label?: string; unit?: string; decimals?: number }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-2xl border border-border/70 bg-surface/95 px-3.5 py-2.5 text-xs shadow-lift backdrop-blur">
      <div className="mb-1 text-muted">{label ? formatDate(label) : ""}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 text-text">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          {payload.length > 1 && <span className="text-muted">{p.name}</span>}
          <span className="font-medium">
            {typeof p.value === "number" ? p.value.toFixed(decimals) : p.value} {unit}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Plain-language description of a trend chart for screen readers. */
function srSummary(spec: TrendSpec, data: TrendPoint[], days: number) {
  const vals = data.filter((d) => d.value != null) as { date: string; value: number }[];
  if (!vals.length) return `${spec.title}: no data in the last ${days} days.`;
  const dp = spec.decimals ?? 1;
  const f = (v: number) => `${v.toFixed(dp)}${spec.unit ? ` ${spec.unit}` : ""}`;
  const first = vals[0], last = vals[vals.length - 1];
  const min = Math.min(...vals.map((v) => v.value)), max = Math.max(...vals.map((v) => v.value));
  const avg = vals.reduce((a, v) => a + v.value, 0) / vals.length;
  return `${spec.title} over the last ${days} days: ${vals.length} entries, from ${f(first.value)} on ${formatDate(first.date)} to ${f(last.value)} on ${formatDate(last.date)}. Average ${f(avg)}, lowest ${f(min)}, highest ${f(max)}.`;
}

function summarize(spec: TrendSpec, data: TrendPoint[]) {
  const vals = data.map((d) => d.value).filter((v): v is number => v != null);
  if (!vals.length) return null;
  const v = spec.summary === "latest" ? vals[vals.length - 1] : vals.reduce((a, b) => a + b, 0) / vals.length;
  return `${spec.summary === "latest" ? "Latest" : "Avg"} ${v.toFixed(spec.decimals ?? 1)}${spec.unit ? ` ${spec.unit}` : ""}`;
}

export function TrendChart({ spec, days, height = 160 }: { spec: TrendSpec; days: number; height?: number }) {
  const data = spec.data.slice(-days);
  const hasData = data.some((d) => d.value != null);
  const color = spec.color ?? "var(--primary)";
  const gradId = `grad-${spec.key}`;
  return (
    <div className="rounded-2xl bg-surface-2/35 p-3.5">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
          {spec.title}
        </h3>
        <span className="text-xs font-semibold text-muted">{summarize(spec, data) ?? "No data yet"}</span>
      </div>
      <p className="sr-only">{srSummary(spec, data, days)}</p>
      {hasData ? (
        <div style={{ height }} aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" style={{ stopColor: color, stopOpacity: 0.28 }} />
                  <stop offset="100%" style={{ stopColor: color, stopOpacity: 0 }} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--chart-grid)" vertical={false} strokeDasharray="3 4" />
              <XAxis
                dataKey="date"
                tick={axisTick}
                tickLine={false}
                axisLine={false}
                minTickGap={24}
                tickFormatter={(d: string) => formatDate(d, { month: "short", day: "numeric" })}
              />
              <YAxis
                tick={axisTick}
                tickLine={false}
                axisLine={false}
                domain={spec.domain ?? ["auto", "auto"]}
                width={40}
                tickCount={4}
                allowDecimals={(spec.decimals ?? 1) > 0}
                tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 100) / 10}k` : String(Math.round(v * 10) / 10))}
              />
              <Tooltip content={<ChartTooltip unit={spec.unit} decimals={spec.decimals} />} cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: "3 3" }} />
              <Area
                type="monotone"
                dataKey="value"
                name={spec.title}
                stroke={color}
                strokeWidth={2.25}
                fill={`url(#${gradId})`}
                connectNulls
                dot={days <= 7 ? { r: 4, fill: color, stroke: "var(--surface)", strokeWidth: 2 } : false}
                activeDot={{ r: 5.5, fill: color, stroke: "var(--surface)", strokeWidth: 2.5 }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="grid place-items-center rounded-xl text-xs text-muted" style={{ height }}>
          Log a few days to see a trend
        </div>
      )}
    </div>
  );
}

/** Several trend charts that share one 7/30/90 toggle. */
export function TrendGroup({ specs, title = "Trends", initial = 30 }: { specs: TrendSpec[]; title?: string; initial?: number }) {
  const [days, setDays] = useState(initial);
  return (
    <section className="card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="h2 flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-terracotta-soft text-terracotta-ink"><LineIcon size={16} /></span>
          {title}
        </h2>
        <RangeToggle value={days} onChange={setDays} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {specs.map((s) => (
          <TrendChart key={s.key} spec={s} days={days} />
        ))}
      </div>
    </section>
  );
}

// Fixed categorical order so a workout type keeps its color everywhere.
const TYPE_COLORS: Record<string, string> = {
  strength: "var(--series-1)",
  cardio: "var(--series-2)",
  mobility: "var(--series-3)",
  sport: "var(--series-4)",
  other: "var(--series-5)",
};
const TYPE_LABEL: Record<string, string> = { strength: "Strength", cardio: "Cardio", mobility: "Mobility", sport: "Sport", other: "Other" };

export type WeekVolume = { week: string } & Record<string, number | string>;

/** Weekly workout minutes, stacked by type. */
export function WorkoutVolumeChart({ data, height = 200 }: { data: WeekVolume[]; height?: number }) {
  const types = Object.keys(TYPE_COLORS).filter((t) => data.some((d) => Number(d[t] ?? 0) > 0));
  if (!types.length)
    return <div className="grid place-items-center rounded-xl bg-surface-2 text-xs text-muted" style={{ height }}>No workouts yet</div>;
  const summary = data.map((d) => `week of ${formatDate(String(d.week), { month: "short", day: "numeric" })}: ${types.reduce((a, t) => a + Number(d[t] ?? 0), 0)} minutes`).join("; ");
  return (
    <div style={{ height }}>
      <p className="sr-only">Weekly workout minutes, {summary}.</p>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} strokeDasharray="3 4" />
          <XAxis dataKey="week" tick={axisTick} tickLine={false} axisLine={false} tickFormatter={(d: string) => formatDate(d, { month: "short", day: "numeric" })} />
          <YAxis tick={axisTick} tickLine={false} axisLine={false} width={40} />
          <Tooltip
            cursor={{ fill: "var(--surface-2)" }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <div className="rounded-2xl border border-border/70 bg-surface/95 px-3.5 py-2.5 text-xs shadow-lift backdrop-blur">
                  <div className="mb-1 text-muted">Week of {formatDate(String(label), { month: "short", day: "numeric" })}</div>
                  {payload.filter((p) => Number(p.value) > 0).map((p) => (
                    <div key={String(p.dataKey)} className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                      <span className="text-muted">{p.name}</span>
                      <span className="font-medium">{p.value} min</span>
                    </div>
                  ))}
                </div>
              ) : null
            }
          />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} formatter={(v: string) => <span style={{ color: "var(--muted)" }}>{v}</span>} />
          {types.map((t, i) => (
            <Bar
              key={t}
              dataKey={t}
              name={TYPE_LABEL[t]}
              stackId="v"
              fill={TYPE_COLORS[t]}
              stroke="var(--surface)"
              strokeWidth={1}
              radius={i === types.length - 1 ? [8, 8, 0, 0] : 0}
              maxBarSize={30}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
