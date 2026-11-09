"use client";

import { ListControls, NoMatches, ShowMoreButton, useListView, type FilterOption, type SortOption } from "./ListControls";

// Server pages render each card; this client wrapper only sorts, filters and pages them.
// Sort/filter rules live here (functions can't be passed from server components).

export type CardItem = { key: string; node: React.ReactNode; title: string; meta: Record<string, string | number | boolean | null> };

const PRESETS: Record<string, { sorts: SortOption<CardItem>[]; filters: FilterOption<CardItem>[]; search: boolean; pageSize: number; filterMode?: "any" | "all" }> = {
  goals: {
    search: true, pageSize: 10,
    sorts: [
      { key: "deadline", label: "Deadline soonest", compare: (a, b) => String(a.meta.deadline).localeCompare(String(b.meta.deadline)) },
      { key: "pct-hi", label: "Most progress", compare: (a, b) => Number(b.meta.pct) - Number(a.meta.pct) },
      { key: "pct-lo", label: "Least progress", compare: (a, b) => Number(a.meta.pct) - Number(b.meta.pct) },
      { key: "name", label: "Name A–Z", compare: (a, b) => a.title.localeCompare(b.title) },
    ],
    filters: [
      { key: "on-track", label: "On track", test: (g) => g.meta.status === "on-track" || g.meta.status === "not-started" },
      { key: "behind", label: "A little behind", test: (g) => g.meta.status === "behind" },
      { key: "done", label: "Complete", test: (g) => g.meta.status === "done" },
      { key: "overdue", label: "Past deadline", test: (g) => g.meta.status === "overdue" },
    ],
  },
  habits: {
    search: true, pageSize: 12,
    sorts: [
      { key: "order", label: "Your order", compare: (a, b) => Number(a.meta.order) - Number(b.meta.order) },
      { key: "streak", label: "Longest current streak", compare: (a, b) => Number(b.meta.streak) - Number(a.meta.streak) },
      { key: "best", label: "Best streak", compare: (a, b) => Number(b.meta.best) - Number(a.meta.best) },
      { key: "name", label: "Name A–Z", compare: (a, b) => a.title.localeCompare(b.title) },
    ],
    filters: [
      { key: "day", label: "Day by day", test: (h) => h.meta.unit === "day" },
      { key: "period", label: "Weekly or monthly", test: (h) => h.meta.unit !== "day" },
      { key: "today", label: "Due today", test: (h) => h.meta.dueToday === true },
    ],
  },
};

export function SortableCards({ preset, items, label, className = "space-y-3", as = "div" }: { preset: keyof typeof PRESETS; items: CardItem[]; label: string; className?: string; as?: "div" | "ul" }) {
  const p = PRESETS[preset];
  const view = useListView(items, { searchText: p.search ? (i) => i.title : undefined, sorts: p.sorts, filters: p.filters, filterMode: p.filterMode, pageSize: p.pageSize });
  const Tag = as;
  return (
    <div>
      {items.length > 1 && <ListControls view={view} label={label} searchPlaceholder={`Search ${label}`} />}
      <NoMatches view={view} />
      <Tag className={className}>{view.visible.map((i) => (as === "ul" ? <li key={i.key}>{i.node}</li> : <div key={i.key}>{i.node}</div>))}</Tag>
      <ShowMoreButton view={view} noun={`more ${label}`} />
    </div>
  );
}
