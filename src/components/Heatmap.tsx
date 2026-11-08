import { addDays, formatDate, startOfWeek, diffDays } from "@/lib/dates";

/**
 * GitHub-style calendar heatmap. Columns are weeks (Mon→Sun rows).
 * `values` maps date → 0..1 intensity.
 */
export function Heatmap({ values, today, weeks = 13, label }: { values: Record<string, number>; today: string; weeks?: number; label?: string }) {
  const lastWeek = startOfWeek(today);
  const first = addDays(lastWeek, -(weeks - 1) * 7);
  const cols = Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(first, w * 7 + d)));
  const shade = (v: number | undefined) => {
    if (!v) return "bg-surface-2";
    if (v < 0.34) return "bg-emerald/25";
    if (v < 0.67) return "bg-emerald/55";
    if (v < 1) return "bg-emerald/80";
    return "bg-linear-to-br from-emerald to-teal";
  };
  return (
    <div aria-label={label ?? "Activity heatmap"}>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))`, maxWidth: weeks * 26 }}>
        {cols.map((col, i) => (
          <div key={i} className="flex flex-col gap-1">
            {col.map((d) => {
              const future = diffDays(today, d) > 0;
              return (
                <div
                  key={d}
                  title={`${formatDate(d)}${values[d] ? ` · ${Math.round(values[d] * 100)}%` : ""}`}
                  className={`aspect-square w-full rounded-[4px] ${future ? "bg-transparent" : shade(values[d])} ${d === today ? "ring-1 ring-text/40" : ""}`}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
