"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Search } from "lucide-react";

// Shared list tools: search, sort, filter chips and "show more" paging, plus
// clamped text with a Show more / Show less toggle. Pure client-side over the
// rows a page already loaded, so nothing extra is fetched or sent anywhere.

export type SortOption<T> = { key: string; label: string; compare: (a: T, b: T) => number };
export type FilterOption<T> = { key: string; label: string; test: (t: T) => boolean };

export type ListViewConfig<T> = {
  /** Text to match the search box against (omit to hide search). */
  searchText?: (t: T) => string;
  sorts?: SortOption<T>[];
  filters?: FilterOption<T>[];
  /** Filters combine with OR inside this list (e.g. workout types) instead of AND. */
  filterMode?: "any" | "all";
  pageSize?: number;
};

/** Search, sort, filter and page a list. Returns the visible rows plus state for <ListControls> and <ShowMoreButton>. */
export function useListView<T>(items: readonly T[], cfg: ListViewConfig<T>) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState(cfg.sorts?.[0]?.key ?? "");
  const [active, setActive] = useState<string[]>([]);
  const pageSize = cfg.pageSize ?? 20;
  const [limit, setLimit] = useState(pageSize);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const chosen = (cfg.filters ?? []).filter((f) => active.includes(f.key));
    let out = items.filter((t) => {
      if (q && cfg.searchText && !cfg.searchText(t).toLowerCase().includes(q)) return false;
      if (!chosen.length) return true;
      return cfg.filterMode === "all" ? chosen.every((f) => f.test(t)) : chosen.some((f) => f.test(t));
    });
    const s = cfg.sorts?.find((x) => x.key === sort);
    if (s) out = [...out].sort(s.compare);
    return out;
    // cfg is usually an inline object; its functions are stable in meaning, so key off the inputs that change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, query, sort, active.join("|")]);

  // Back to the first page whenever the result set changes.
  useEffect(() => setLimit(pageSize), [query, sort, active.join("|"), pageSize]);

  return {
    visible: filtered.slice(0, limit),
    total: filtered.length,
    all: items.length,
    hidden: Math.max(0, filtered.length - limit),
    expanded: limit > pageSize,
    showMore: () => setLimit((l) => l + pageSize * 2),
    showLess: () => setLimit(pageSize),
    query, setQuery, sort, setSort, active,
    toggle: (k: string) => setActive((xs) => (xs.includes(k) ? xs.filter((x) => x !== k) : [...xs, k])),
    clear: () => { setActive([]); setQuery(""); },
    cfg,
  };
}
export type ListView<T> = ReturnType<typeof useListView<T>>;

/** Search box, sort menu and filter chips for a useListView list. */
export function ListControls<T>({ view, label, searchPlaceholder = "Search" }: { view: ListView<T>; label: string; searchPlaceholder?: string }) {
  const id = useId();
  const { cfg } = view;
  const filtering = view.active.length > 0 || view.query.trim() !== "";
  return (
    <div className="mb-3 space-y-2.5" role="search" aria-label={`Search and filter ${label}`}>
      {(cfg.searchText || (cfg.sorts && cfg.sorts.length > 1)) && (
        <div className="flex flex-wrap items-center gap-2">
          {cfg.searchText && (
            <div className="relative min-w-[min(12rem,100%)] flex-1">
              <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" aria-hidden />
              <label htmlFor={`${id}-q`} className="sr-only">Search {label}</label>
              <input id={`${id}-q`} type="search" className="input min-h-11 py-2 pl-9 text-sm" placeholder={searchPlaceholder} value={view.query} onChange={(e) => view.setQuery(e.target.value)} />
            </div>
          )}
          {cfg.sorts && cfg.sorts.length > 1 && (
            <label className="flex items-center gap-2 text-xs font-semibold text-muted">
              Sort
              <select className="input min-h-11 w-auto py-2 text-sm" value={view.sort} onChange={(e) => view.setSort(e.target.value)}>
                {cfg.sorts.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </label>
          )}
        </div>
      )}
      {cfg.filters && cfg.filters.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={`Filter ${label}`}>
          {cfg.filters.map((f) => {
            const on = view.active.includes(f.key);
            return (
              <button key={f.key} type="button" aria-pressed={on} onClick={() => view.toggle(f.key)} className={`chip min-h-10 px-3 py-1 text-xs ${on ? "chip-on" : ""}`}>
                {on ? "✓ " : ""}{f.label}
              </button>
            );
          })}
          {filtering && <button type="button" className="btn-ghost min-h-10 px-2.5 text-xs" onClick={view.clear}>Clear</button>}
        </div>
      )}
      <p className="text-xs text-muted" aria-live="polite">{filtering ? `${view.total} of ${view.all} shown` : ""}</p>
    </div>
  );
}

/** "Show N more" / "Show less" for a paged list. */
export function ShowMoreButton<T>({ view, noun = "more" }: { view: ListView<T>; noun?: string }) {
  if (!view.hidden && !view.expanded) return null;
  return (
    <div className="mt-3 flex flex-wrap justify-center gap-2">
      {view.hidden > 0 && (
        <button type="button" className="btn-soft min-h-11 text-xs" onClick={view.showMore}>
          <ChevronDown size={15} aria-hidden /> Show {Math.min(view.hidden, (view.cfg.pageSize ?? 20) * 2)} {noun}
        </button>
      )}
      {view.expanded && (
        <button type="button" className="btn-ghost min-h-11 text-xs" onClick={view.showLess}>
          <ChevronUp size={15} aria-hidden /> Show less
        </button>
      )}
    </div>
  );
}

/** Empty state for a filtered list. */
export function NoMatches<T>({ view }: { view: ListView<T> }) {
  if (view.total || !view.all) return null;
  return (
    <p className="rounded-2xl bg-surface-2/60 px-4 py-3 text-sm text-muted">
      Nothing matches. <button type="button" className="font-bold text-primary underline" onClick={view.clear}>Clear search and filters</button>
    </p>
  );
}

/**
 * Text clamped to `lines` with a Show more / Show less toggle. The toggle only appears
 * when the text actually overflows, so short text looks exactly as before.
 */
export function ShowMoreText({ children, lines = 3, className = "" }: { children: React.ReactNode; lines?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const id = useId();
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setOverflows(open || el.scrollHeight - el.clientHeight > 2);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, children]);
  return (
    <div className={`min-w-0 break-words ${className}`}>
      <div id={id} ref={ref} className="break-words whitespace-pre-wrap" style={open ? undefined : { display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
        {children}
      </div>
      {overflows && (
        <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)} className="mt-1 inline-flex min-h-11 items-center gap-1 text-xs font-bold text-primary">
          {open ? <>Show less <ChevronUp size={14} aria-hidden /></> : <>Show more <ChevronDown size={14} aria-hidden /></>}
        </button>
      )}
    </div>
  );
}
