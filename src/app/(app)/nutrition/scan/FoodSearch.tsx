"use client";

import { useEffect, useRef, useState } from "react";
import { Globe, Heart, History, Plus, Search } from "lucide-react";
import type { Food } from "@/lib/nutrition/food";

type Results = { favorites: Food[]; recents: Food[]; results: Food[]; online: { status: "ok" | "busy" | "unavailable"; foods: Food[] } | null };
const EMPTY: Results = { favorites: [], recents: [], results: [], online: null };

function Row({ food, onPick, hide }: { food: Food; onPick: (f: Food) => void; hide: boolean }) {
  const n = food.perServing ?? food.per100g;
  return (
    <li>
      <button type="button" className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-2" onClick={() => onPick(food)}>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{food.name}</span>
          <span className="block truncate text-xs text-muted">
            {[food.brand, food.mine ? "Your food" : food.source === "generic" ? "Generic" : null, !hide && n?.calories != null ? `${Math.round(n.calories)} kcal ${food.perServing ? "per serving" : "per 100 g"}` : null].filter(Boolean).join(" · ")}
          </span>
        </span>
        <span className="shrink-0 text-xs font-bold text-primary">Choose</span>
      </button>
    </li>
  );
}

/** Search foods by name: favorites and recents first, then your foods, generic foods and known products. */
export function FoodSearch({ onPick, onCreate, hideCalories }: { onPick: (f: Food) => void; onCreate: (name: string) => void; hideCalories: boolean }) {
  const [q, setQ] = useState("");
  const [data, setData] = useState<Results>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [onlineBusy, setOnlineBusy] = useState(false);
  const seq = useRef(0);

  async function run(query: string, online = false) {
    const id = ++seq.current;
    if (online) setOnlineBusy(true); else setLoading(true);
    try {
      const res = await fetch(`/api/foods/search?q=${encodeURIComponent(query)}${online ? "&online=1" : ""}`);
      const body = (await res.json()) as Results;
      if (id === seq.current && res.ok) setData(body);
    } catch {
      if (id === seq.current && online) setData((d) => ({ ...d, online: { status: "unavailable", foods: [] } }));
    }
    if (id === seq.current) { setLoading(false); setOnlineBusy(false); }
  }
  // Favorites and recents show straight away; typing searches after a short pause.
  useEffect(() => { const t = setTimeout(() => void run(q.trim()), q ? 250 : 0); return () => clearTimeout(t); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const query = q.trim();
  const section = (title: string, icon: React.ReactNode, foods: Food[]) => foods.length > 0 && (
    <section aria-label={title}>
      <h3 className="mb-1 flex items-center gap-1.5 text-xs font-bold tracking-[0.12em] text-muted uppercase">{icon}{title}</h3>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-surface">{foods.map((f) => <Row key={f.id} food={f} onPick={onPick} hide={hideCalories} />)}</ul>
    </section>
  );
  const nothing = query.length >= 2 && !loading && !data.favorites.length && !data.recents.length && !data.results.length && !data.online?.foods.length;

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" aria-hidden />
        <label htmlFor="food-q" className="sr-only">Search foods</label>
        <input id="food-q" type="search" className="input pl-10" placeholder="Search foods, e.g. yogurt or banana" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
      </div>
      <p className="sr-only" role="status" aria-live="polite">{loading ? "Searching" : `${data.favorites.length + data.recents.length + data.results.length} foods`}</p>
      {section("Favorites", <Heart size={13} aria-hidden />, data.favorites)}
      {section("Recent", <History size={13} aria-hidden />, data.recents)}
      {section("Foods", null, data.results)}
      {data.online?.status === "ok" && section("From Open Food Facts", <Globe size={13} aria-hidden />, data.online.foods)}
      {data.online?.status === "ok" && data.online.foods.length === 0 && <p className="text-sm text-muted">Open Food Facts has nothing more for “{query}”.</p>}
      {data.online?.status === "busy" && <p className="text-sm text-muted">Open Food Facts search is busy right now. Try again in a minute.</p>}
      {data.online?.status === "unavailable" && <p className="text-sm text-muted">Couldn&apos;t reach Open Food Facts. Your own and generic foods still work.</p>}
      {nothing && <p className="text-sm text-muted">Nothing found for “{query}” yet.</p>}
      {!query && !data.favorites.length && !data.recents.length && !loading && <p className="text-sm text-muted">Foods you log will show up here for quick repeats. Start typing to search.</p>}
      <div className="flex flex-wrap gap-2">
        {query.length >= 3 && data.online?.status !== "ok" && (
          <button type="button" className="btn-soft" disabled={onlineBusy} onClick={() => run(query, true)}><Globe size={16} aria-hidden /> {onlineBusy ? "Searching…" : "Search Open Food Facts"}</button>
        )}
        <button type="button" className="btn-ghost" onClick={() => onCreate(query)}><Plus size={16} aria-hidden /> Add your own food</button>
      </div>
      {data.online?.status === "ok" && data.online.foods.length > 0 && <p className="text-xs text-muted">Data from Open Food Facts, a public database. Only your search words were sent.</p>}
    </div>
  );
}
