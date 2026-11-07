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
    if (v < 0.34) return "bg-primary/30";
    if (v < 0.67) return "bg-primary/60";
    return "bg-primary";
  };
  return (
    <div className="overflow-x-auto" aria-label={label ?? "Activity heatmap"}>
      <div className="flex gap-[3px]">
        {cols.map((col, i) => (
          <div key={i} className="flex flex-col gap-[3px]">
            {col.map((d) => {
              const future = diffDays(today, d) > 0;
              return (
                <div
                  key={d}
                  title={`${formatDate(d)}${values[d] ? ` · ${Math.round(values[d] * 100)}%` : ""}`}
                  className={`h-3 w-3 rounded-[3px] sm:h-3.5 sm:w-3.5 ${future ? "bg-transparent" : shade(values[d])} ${d === today ? "ring-1 ring-text/40" : ""}`}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
