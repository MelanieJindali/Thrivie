"use client";

import { useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
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
    <div className="inline-flex rounded-xl bg-surface-2 p-1" role="tablist" aria-label="Time range">
      {RANGES.map((r) => (
        <button
          key={r}
          role="tab"
          aria-selected={value === r}
          onClick={() => onChange(r)}
          className={`rounded-lg px-3 py-1 text-xs font-medium transition ${value === r ? "bg-surface text-text shadow-sm" : "text-muted"}`}
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
    <div className="rounded-xl border border-border bg-surface px-3 py-2 text-xs shadow-lg">
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
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm font-medium">{spec.title}</h3>
        <span className="text-xs text-muted">{summarize(spec, data) ?? "No data yet"}</span>
      </div>
      {hasData ? (
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
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
                width={44}
                tickCount={4}
                allowDecimals={(spec.decimals ?? 1) > 0}
                tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 100) / 10}k` : String(Math.round(v * 10) / 10))}
              />
              <Tooltip content={<ChartTooltip unit={spec.unit} decimals={spec.decimals} />} cursor={{ stroke: "var(--border)", strokeWidth: 1 }} />
              <Line
                type="monotone"
                dataKey="value"
                name={spec.title}
                stroke={color}
                strokeWidth={2}
                connectNulls
                dot={days <= 7 ? { r: 4, fill: color, stroke: "var(--surface)", strokeWidth: 2 } : false}
                activeDot={{ r: 5, stroke: "var(--surface)", strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="grid place-items-center rounded-xl bg-surface-2 text-xs text-muted" style={{ height }}>
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
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="h2">{title}</h2>
        <RangeToggle value={days} onChange={setDays} />
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey="week" tick={axisTick} tickLine={false} axisLine={false} tickFormatter={(d: string) => formatDate(d, { month: "short", day: "numeric" })} />
          <YAxis tick={axisTick} tickLine={false} axisLine={false} width={40} />
          <Tooltip
            cursor={{ fill: "var(--surface-2)" }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <div className="rounded-xl border border-border bg-surface px-3 py-2 text-xs shadow-lg">
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
              radius={i === types.length - 1 ? [4, 4, 0, 0] : 0}
              maxBarSize={28}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
