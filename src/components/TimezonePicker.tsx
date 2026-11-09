"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, Search } from "lucide-react";
import { detectTimeZone, getCuratedGroups, getTimeZoneLabel, searchTimeZones, type TimeZoneOption } from "@/lib/timezones";

/**
 * Friendly timezone picker: shows "Eastern Time (New York) · UTC−5" with a Change link that opens a
 * searchable list (curated zones by region; every zone through search). Stores the IANA id.
 * It never changes the value by itself; the parent decides whether to preselect the device's zone.
 */
export function TimezonePicker({ value, onChange, label = "Timezone", hint }: { value: string; onChange: (id: string) => void; label?: string; hint?: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [mounted, setMounted] = useState(false); // labels depend on the current time; render them on the device only
  const [device, setDevice] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const changeBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMounted(true);
    setDevice(detectTimeZone());
  }, []);

  const groups = useMemo(() => (open && !query.trim() ? getCuratedGroups(new Date(), value) : []), [open, query, value]);
  const results = useMemo(() => (open && query.trim() ? searchTimeZones(query) : []), [open, query]);
  const flat: TimeZoneOption[] = query.trim() ? results : groups.flatMap((g) => g.options);

  // On open, highlight the current zone in the curated list.
  useEffect(() => {
    if (open && !query) setActive(Math.max(0, flat.findIndex((o) => o.id === value)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open) document.getElementById(`${id}-opt-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, open, id]);

  function choose(o: TimeZoneOption) {
    onChange(o.id);
    close();
  }
  function close() {
    setOpen(false);
    setQuery("");
    requestAnimationFrame(() => changeBtn.current?.focus());
  }
  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(flat.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Home") { e.preventDefault(); setActive(0); }
    else if (e.key === "End") { e.preventDefault(); setActive(flat.length - 1); }
    else if (e.key === "Enter") { e.preventDefault(); const o = flat[Math.min(active, flat.length - 1)]; if (o) choose(o); }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
  }

  const currentLabel = mounted ? getTimeZoneLabel(value) : value.replace(/_/g, " ");
  let n = -1;
  const option = (o: TimeZoneOption) => {
    n++;
    const i = n;
    const selected = o.id === value;
    return (
      <li
        key={o.id}
        id={`${id}-opt-${i}`}
        role="option"
        aria-selected={selected}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => choose(o)}
        onMouseMove={() => setActive(i)}
        className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm ${i === active ? "bg-primary-soft" : ""}`}
      >
        <span className="min-w-0 flex-1">{o.label}</span>
        {selected && <Check size={16} className="shrink-0 text-primary" aria-hidden />}
      </li>
    );
  };

  return (
    <div className="min-w-0">
      <span className="label" id={`${id}-label`}>{label}</span>
      {!open ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="min-w-0 text-sm font-semibold" id={`${id}-value`}>{currentLabel}</span>
          <button ref={changeBtn} type="button" className="inline-flex min-h-11 items-center text-sm font-bold text-primary underline-offset-4 hover:underline" aria-describedby={`${id}-value`} onClick={() => { setOpen(true); requestAnimationFrame(() => input.current?.focus()); }}>
            Change<span className="sr-only"> timezone</span>
          </button>
          {device && device !== value && (
            <button type="button" className="btn-soft min-h-11 text-xs" onClick={() => onChange(device)}>
              Use this device: {mounted ? getTimeZoneLabel(device) : device}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" aria-hidden />
            <input
              ref={input}
              className="input pl-10"
              role="combobox"
              aria-expanded="true"
              aria-controls={`${id}-list`}
              aria-labelledby={`${id}-label`}
              aria-autocomplete="list"
              aria-activedescendant={flat[active] ? `${id}-opt-${active}` : undefined}
              placeholder="Search a city, country or zone"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setActive(0); }}
              onKeyDown={onKey}
              autoComplete="off"
            />
          </div>
          <ul id={`${id}-list`} role="listbox" aria-labelledby={`${id}-label`} className="max-h-72 overflow-y-auto overscroll-contain rounded-2xl border border-border bg-surface p-1.5">
            {query.trim()
              ? results.length
                ? results.map(option)
                : <li className="px-3 py-3 text-sm text-muted" role="presentation">No matches. Try a nearby city or a country.</li>
              : groups.map((g) => (
                  <li key={g.region} role="presentation">
                    <p className="px-3 pt-2 pb-1 text-[11px] font-bold tracking-[0.12em] text-muted uppercase" id={`${id}-${g.region}`} aria-hidden>{g.region}</p>
                    <ul role="group" aria-labelledby={`${id}-${g.region}`}>{g.options.map(option)}</ul>
                  </li>
                ))}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted" aria-live="polite">{query.trim() ? `${results.length} ${results.length === 1 ? "match" : "matches"}` : "Common timezones. Search to see every zone."}</p>
            <button type="button" className="btn-ghost min-h-11 text-xs" onClick={close}>Cancel</button>
          </div>
        </div>
      )}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
