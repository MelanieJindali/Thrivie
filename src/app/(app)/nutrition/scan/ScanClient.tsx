"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Check, Lock, ScanBarcode, ScanText, Search, X } from "lucide-react";
import { MEAL_LABELS, type MealSlot } from "@/lib/constants";
import type { Food } from "@/lib/nutrition/food";
import { mealComparison, sum, type DayTargets } from "@/lib/nutrition/dayFit";
import type { LabelRead } from "@/lib/nutrition/labelParse";
import { useOfflineAction } from "@/components/OfflineSync";
import { LogPanel, NutrientLine, type Day, type TrayItem } from "./LogPanel";
import type { FoodDraft } from "./FoodEditor";

// Each part loads only when its tab is first opened, so the scanner adds nothing to the rest of the app.
const Loading = () => <p className="py-8 text-center text-sm text-muted" role="status">Loading…</p>;
const BarcodeScanner = dynamic(() => import("./BarcodeScanner").then((m) => m.BarcodeScanner), { ssr: false, loading: Loading });
const LabelScanner = dynamic(() => import("./LabelScanner").then((m) => m.LabelScanner), { ssr: false, loading: Loading });
const FoodSearch = dynamic(() => import("./FoodSearch").then((m) => m.FoodSearch), { ssr: false, loading: Loading });
const FoodEditor = dynamic(() => import("./FoodEditor").then((m) => m.FoodEditor), { ssr: false, loading: Loading });

type Tab = "barcode" | "label" | "search";
const TABS: { key: Tab; label: string; icon: typeof Search }[] = [
  { key: "barcode", label: "Barcode", icon: ScanBarcode }, { key: "label", label: "Label", icon: ScanText }, { key: "search", label: "Search", icon: Search },
];
type View =
  | { kind: "tabs" }
  | { kind: "food"; food: Food }
  | { kind: "editor"; draft: FoodDraft; title: string; intro?: string }
  | { kind: "missing"; barcode: string | null; why: "not_found" | "unavailable" }
  | { kind: "done"; names: string[]; queued: boolean };

const slotNow = (): MealSlot => { const h = new Date().getHours(); return h < 11 ? "breakfast" : h < 16 ? "lunch" : h < 21 ? "dinner" : "snack"; };

export function ScanClient({ day, targets, favoriteIds, initialTab }: { day: Day; targets: DayTargets; favoriteIds: string[]; initialTab: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [view, setView] = useState<View>({ kind: "tabs" });
  const [slot, setSlot] = useState<MealSlot>("lunch");
  const [tray, setTray] = useState<TrayItem[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [barcodeForLabel, setBarcodeForLabel] = useState<string | null>(null);
  const run = useOfflineAction();
  useEffect(() => setSlot(slotNow()), []); // the time of day is only known on the device

  async function log(items: TrayItem[]) {
    setPending(true); setError(null);
    try {
      const r = (await run("logFoods", items.map((i) => ({ foodId: i.food.id, portion: i.portion, slot })))) as { ok: true; queued?: boolean } | { ok: false; error: string };
      if (!r.ok) setError(r.error);
      else { setTray([]); setView({ kind: "done", names: items.map((i) => i.food.name), queued: !!r.queued }); }
    } catch { setError("Couldn't save that. Check your connection and try again."); }
    setPending(false);
  }
  const fromLabel = (label: LabelRead) => setView({
    kind: "editor", title: "Check what was read", intro: "Give it a name, glance over the numbers, and save. Highlighted values were harder to read.",
    draft: { source: "label_scan", barcode: barcodeForLabel, servingSize: label.servingSize, servingGrams: label.servingGrams, perServing: label.perServing, per100g: label.per100g, allergens: label.allergens, traces: label.traces, unsure: label.unsure },
  });
  const manual = (name = "", barcode: string | null = null) => setView({ kind: "editor", title: "Add your own food", intro: "Enter what's on the package. Only the name and one nutrition value are needed.", draft: { source: "custom", name, barcode } });
  const total = sum(tray.map((t) => t.nutrients));

  return (
    <div className="space-y-5">
      <p className="flex items-start gap-2.5 rounded-2xl bg-seaglass-soft px-4 py-3 text-sm">
        <Lock size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden />
        <span>Camera images and label photos are read <b>on your device</b> and never uploaded. Only a product&apos;s barcode number is sent, to Open Food Facts, with nothing about you.</span>
      </p>

      {tray.length > 0 && view.kind !== "done" && (
        <section className="card space-y-3" aria-labelledby="tray-h">
          <h2 id="tray-h" className="h2">This {MEAL_LABELS[slot].toLowerCase()} so far</h2>
          <ul className="divide-y divide-border">
            {tray.map((t, i) => (
              <li key={`${t.food.id}-${i}`} className="flex items-center gap-3 py-2 text-sm">
                <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{t.food.name}</span><span className="text-xs text-muted">{"servings" in t.portion ? `${t.portion.servings} ${t.portion.servings === 1 ? "serving" : "servings"}` : `${Math.round(t.portion.grams)} g`}</span></span>
                <button type="button" className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-muted hover:text-text" aria-label={`Remove ${t.food.name}`} onClick={() => setTray((xs) => xs.filter((_, j) => j !== i))}><X size={18} aria-hidden /></button>
              </li>
            ))}
          </ul>
          <NutrientLine n={total} hide={day.hideCalories} />
          {(() => { const c = mealComparison(total, slot, targets, { hideCalories: day.hideCalories }); return c ? <p className="rounded-2xl bg-seaglass-soft/70 px-3.5 py-2.5 text-sm">{c}</p> : null; })()}
          <button type="button" className="btn-primary w-full" disabled={pending} onClick={() => log(tray)}>{pending ? "Logging…" : `Log ${tray.length} ${tray.length === 1 ? "item" : "items"} to ${MEAL_LABELS[slot].toLowerCase()}`}</button>
        </section>
      )}

      {error && <p className="rounded-2xl bg-terracotta-soft px-4 py-2.5 text-sm text-terracotta-ink" role="alert">{error}</p>}

      {view.kind === "tabs" && (
        <section className="card space-y-4">
          <div className="grid grid-cols-3 gap-1 rounded-2xl bg-surface-2/70 p-1" role="tablist" aria-label="Ways to find a food">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button key={key} type="button" role="tab" id={`tab-${key}`} aria-selected={tab === key} aria-controls="scan-panel" onClick={() => setTab(key)}
                className={`flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-xs font-semibold ${tab === key ? "bg-surface text-text shadow-sm" : "text-muted"}`}>
                <Icon size={18} aria-hidden />
                <span className="truncate">{label}</span>
              </button>
            ))}
          </div>
          <div id="scan-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
            {tab === "barcode" && <BarcodeScanner onFood={(food) => setView({ kind: "food", food })} onMissing={(barcode, why) => setView({ kind: "missing", barcode, why })} />}
            {tab === "label" && <LabelScanner onRead={fromLabel} />}
            {tab === "search" && <FoodSearch hideCalories={day.hideCalories} onPick={(food) => setView({ kind: "food", food })} onCreate={(name) => manual(name)} />}
          </div>
        </section>
      )}

      {view.kind === "food" && (
        <LogPanel key={view.food.id} food={view.food} day={day} slot={slot} onSlot={setSlot} favorite={favoriteIds.includes(view.food.id)} pending={pending}
          onLog={(item) => log([...tray, item])} onAdd={(item) => { setTray((xs) => [...xs, item]); setView({ kind: "tabs" }); }} onBack={() => setView({ kind: "tabs" })} />
      )}

      {view.kind === "editor" && (
        <FoodEditor draft={view.draft} title={view.title} intro={view.intro} onSaved={(food) => { setBarcodeForLabel(null); setView({ kind: "food", food }); }} onCancel={() => setView({ kind: "tabs" })} />
      )}

      {view.kind === "missing" && (
        <section className="card space-y-4" role="status">
          <div>
            <h2 className="h2">{view.why === "not_found" ? "This one isn't in the database yet" : "Couldn't look that up right now"}</h2>
            <p className="mt-1 text-sm text-muted">
              {view.why === "not_found" ? "No problem. Read its nutrition label or enter it yourself, and it's saved as your own food for next time." : "You may be offline, or the product service is busy. You can still read the label or enter the food yourself."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary" onClick={() => { setBarcodeForLabel(view.barcode); setTab("label"); setView({ kind: "tabs" }); }}><ScanText size={18} aria-hidden /> Scan the nutrition label</button>
            <button type="button" className="btn-soft" onClick={() => manual("", view.barcode)}>Enter it yourself</button>
            <button type="button" className="btn-soft" onClick={() => { setTab("search"); setView({ kind: "tabs" }); }}>Search by name</button>
            <button type="button" className="btn-ghost" onClick={() => { setTab("barcode"); setView({ kind: "tabs" }); }}>Scan again</button>
          </div>
        </section>
      )}

      {view.kind === "done" && (
        <section className="card space-y-4 text-center" role="status">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-sage-soft text-sage-ink" aria-hidden><Check size={26} /></span>
          <div>
            <h2 className="h2">{view.queued ? "Saved on this device" : `Logged to ${MEAL_LABELS[slot].toLowerCase()}`}</h2>
            <p className="mt-1 text-sm text-muted break-words">{view.names.join(", ")}{view.queued ? ". You're offline, so it will sync when you're back online." : ""}</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" className="btn-primary" onClick={() => setView({ kind: "tabs" })}>Scan another</button>
            <Link href="/nutrition" className="btn-soft">See today</Link>
          </div>
        </section>
      )}
    </div>
  );
}
