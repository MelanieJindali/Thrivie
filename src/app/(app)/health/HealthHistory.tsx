"use client";

import { ListControls, NoMatches, ShowMoreButton, ShowMoreText, useListView } from "@/components/ListControls";
import { relativeLabel } from "@/lib/dates";
import { HealthRowActions } from "./HealthRowActions";

export type HealthRow = {
  id: string; date: string;
  weight: string | null; sleep: string | null; sleepHours: number | null; mood: string | null; moodValue: number | null;
  energy: number | null; steps: number | null; water: string | null; notes: string | null;
};

const desc = (k: keyof HealthRow) => (a: HealthRow, b: HealthRow) => ((b[k] as number | null) ?? -1) - ((a[k] as number | null) ?? -1);

/** Recent check-ins with search (notes), sort and "has this metric" filters. */
export function HealthHistory({ rows, today }: { rows: HealthRow[]; today: string }) {
  const view = useListView(rows, {
    searchText: (r) => r.notes ?? "",
    sorts: [
      { key: "new", label: "Newest", compare: (a, b) => (a.date < b.date ? 1 : -1) },
      { key: "old", label: "Oldest", compare: (a, b) => (a.date > b.date ? 1 : -1) },
      { key: "sleep", label: "Most sleep", compare: desc("sleepHours") },
      { key: "steps", label: "Most steps", compare: desc("steps") },
      { key: "mood", label: "Best mood", compare: desc("moodValue") },
    ],
    filters: [
      { key: "weight", label: "Weight", test: (r) => r.weight != null },
      { key: "sleep", label: "Sleep", test: (r) => r.sleep != null },
      { key: "mood", label: "Mood", test: (r) => r.mood != null },
      { key: "steps", label: "Steps", test: (r) => r.steps != null },
      { key: "water", label: "Water", test: (r) => r.water != null },
      { key: "notes", label: "Notes", test: (r) => !!r.notes },
    ],
    filterMode: "all",
    pageSize: 14,
  });
  if (!rows.length) return <p className="py-4 text-sm text-muted">Nothing logged yet. Start with today above.</p>;
  return (
    <>
      <ListControls view={view} label="check-ins" searchPlaceholder="Search notes" />
      <NoMatches view={view} />
      <ul className="divide-y divide-border">
        {view.visible.map((l) => (
          <li key={l.id} className="py-2.5 text-sm">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="w-24 font-medium">{relativeLabel(l.date, today)}</span>
              {l.weight && <span>{l.weight}</span>}
              {l.sleep && <span>😴 {l.sleep}</span>}
              {l.mood && <span>{l.mood}</span>}
              {l.energy != null && <span>⚡ {l.energy}</span>}
              {l.steps != null && <span>👟 {l.steps.toLocaleString("en-US")}</span>}
              {l.water && <span>💧 {l.water}</span>}
              <span className="ml-auto"><HealthRowActions id={l.id} /></span>
            </div>
            {l.notes && <ShowMoreText lines={2} className="mt-1 text-xs text-muted">{l.notes}</ShowMoreText>}
          </li>
        ))}
      </ul>
      <ShowMoreButton view={view} noun="more days" />
    </>
  );
}
