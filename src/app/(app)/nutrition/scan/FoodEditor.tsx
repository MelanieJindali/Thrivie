"use client";

import { useMemo, useState } from "react";
import { TriangleAlert, Wand2 } from "lucide-react";
import { ALLERGENS, type Allergen } from "@/lib/nutrition/calculations";
import { NUTRIENT_KEYS, type Food, type FoodData, type NutrientKey, type Nutrients } from "@/lib/nutrition/food";
import { labelIssues } from "@/lib/nutrition/labelParse";
import { saveCustomFood } from "@/app/foodActions";
import { ALLERGEN_NAME } from "./LogPanel";

const FIELDS: [NutrientKey, string, string][] = [
  ["calories", "Calories", "kcal"], ["fatG", "Total fat", "g"], ["satFatG", "Saturated fat", "g"], ["transFatG", "Trans fat", "g"],
  ["cholesterolMg", "Cholesterol", "mg"], ["sodiumMg", "Sodium", "mg"], ["carbsG", "Total carbs", "g"], ["fiberG", "Fiber", "g"],
  ["sugarsG", "Total sugars", "g"], ["addedSugarsG", "Added sugars", "g"], ["proteinG", "Protein", "g"],
];

export type FoodDraft = Partial<FoodData> & { unsure?: NutrientKey[] };
const toText = (n: Nutrients | null | undefined) => Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, n?.[k] != null ? String(n[k]) : ""])) as Record<NutrientKey, string>;
const toNumbers = (t: Record<NutrientKey, string>): Nutrients | null => {
  const out: Nutrients = {};
  for (const k of NUTRIENT_KEYS) { const v = t[k].trim() === "" ? NaN : Number(t[k].replace(",", ".")); if (Number.isFinite(v) && v >= 0) out[k] = v; }
  return Object.keys(out).length ? out : null;
};

/**
 * Review and edit a food before saving it as your own: used after a label is read (with the
 * unsure values highlighted) and for entering a food by hand.
 */
export function FoodEditor({ draft, title, intro, onSaved, onCancel }: { draft: FoodDraft; title: string; intro?: string; onSaved: (f: Food) => void; onCancel: () => void }) {
  const [name, setName] = useState(draft.name ?? "");
  const [brand, setBrand] = useState(draft.brand ?? "");
  const [servingSize, setServingSize] = useState(draft.servingSize ?? "");
  const [servingGrams, setServingGrams] = useState(draft.servingGrams ? String(draft.servingGrams) : "");
  // A label gives values per serving, per 100 g, or both. Edit whichever was read; the other is kept as read.
  const [basis, setBasis] = useState<"serving" | "100g">(draft.perServing || !draft.per100g ? "serving" : "100g");
  const [serving, setServing] = useState(toText(draft.perServing));
  const [hundred, setHundred] = useState(toText(draft.per100g));
  const [allergens, setAllergens] = useState<Allergen[]>(draft.allergens ?? []);
  const [looked, setLooked] = useState<NutrientKey[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const values = basis === "serving" ? serving : hundred;
  const setValues = basis === "serving" ? setServing : setHundred;
  const numbers = useMemo(() => toNumbers(values), [values]);
  const issues = useMemo(() => (numbers ? labelIssues(numbers) : []), [numbers]);
  const flagged = (k: NutrientKey) => (draft.unsure?.includes(k) && !looked.includes(k)) || issues.some((i) => i.field === k);
  const set = (k: NutrientKey, v: string) => { setValues((x) => ({ ...x, [k]: v })); setLooked((l) => (l.includes(k) ? l : [...l, k])); };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setPending(true); setError(null);
    const grams = Number(servingGrams.replace(",", "."));
    const r = await saveCustomFood({
      source: draft.source === "label_scan" ? "label_scan" : "custom", barcode: draft.barcode ?? null, name, brand: brand.trim() || null,
      servingSize: servingSize.trim() || null, servingGrams: Number.isFinite(grams) && grams > 0 ? grams : null,
      perServing: toNumbers(serving), per100g: toNumbers(hundred), allergens, traces: draft.traces ?? [],
    });
    setPending(false);
    if (r.ok) onSaved(r.food); else setError(r.error);
  }

  return (
    <form onSubmit={save} className="card space-y-4" aria-labelledby="editor-h">
      <div>
        <h2 id="editor-h" className="h2">{title}</h2>
        {intro && <p className="mt-1 text-sm text-muted">{intro}</p>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block"><span className="label">Name</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} required placeholder="e.g. Honey oat granola" /></label>
        <label className="block"><span className="label">Brand (optional)</span><input className="input" value={brand} onChange={(e) => setBrand(e.target.value)} maxLength={120} /></label>
        <label className="block"><span className="label">Serving size (as printed)</span><input className="input" value={servingSize} onChange={(e) => setServingSize(e.target.value)} maxLength={80} placeholder="e.g. 2/3 cup (55 g)" /></label>
        <label className="block"><span className="label">Serving weight (g or ml)</span><input className="input" inputMode="decimal" value={servingGrams} onChange={(e) => setServingGrams(e.target.value)} /></label>
      </div>

      {draft.perServing && draft.per100g && (
        <div className="inline-grid grid-cols-2 gap-1 rounded-2xl bg-surface-2/70 p-1" role="radiogroup" aria-label="Values shown">
          {(["serving", "100g"] as const).map((b) => (
            <button key={b} type="button" role="radio" aria-checked={basis === b} onClick={() => setBasis(b)} className={`min-h-12 rounded-xl px-4 text-sm font-semibold ${basis === b ? "bg-surface text-text shadow-sm" : "text-muted"}`}>{b === "serving" ? "Per serving" : "Per 100 g"}</button>
          ))}
        </div>
      )}
      <fieldset>
        <legend className="label">Nutrition {basis === "serving" ? "per serving" : "per 100 g"}</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {FIELDS.map(([k, label, unit]) => (
            <label key={k} className="block min-w-0">
              <span className="mb-1 block text-xs font-semibold text-muted">{label} ({unit}){flagged(k) && <span className="text-gold-ink"> · check</span>}</span>
              <input className={`input ${flagged(k) ? "border-gold-ink bg-gold-soft" : ""}`} inputMode="decimal" value={values[k]} onChange={(e) => set(k, e.target.value)} aria-describedby={flagged(k) ? "editor-flag-help" : undefined} />
            </label>
          ))}
        </div>
        {(draft.unsure?.length ?? 0) > 0 && <p id="editor-flag-help" className="mt-2 text-xs text-muted">Highlighted values were harder to read. A quick look against the package is enough.</p>}
      </fieldset>

      {issues.length > 0 && (
        <ul className="space-y-1.5">
          {issues.map((x, i) => (
            <li key={`${x.field}-${i}`} className="flex flex-wrap items-center gap-2 rounded-xl bg-gold-soft px-3 py-2 text-xs text-gold-ink">
              <span className="flex min-w-0 flex-1 basis-48 items-start gap-2"><TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden /><span>{x.message}</span></span>
              {x.fix && <button type="button" className="btn min-h-12 bg-surface px-3 text-xs text-text" onClick={() => set(x.field, String(x.fix!.value))}><Wand2 size={13} aria-hidden /> {x.fix.label}</button>}
            </li>
          ))}
        </ul>
      )}

      <fieldset>
        <legend className="label">Contains (allergens)</legend>
        <div className="flex flex-wrap gap-2">
          {ALLERGENS.map((a) => {
            const on = allergens.includes(a);
            return <button key={a} type="button" aria-pressed={on} className={`chip ${on ? "chip-on" : ""}`} onClick={() => setAllergens((xs) => (on ? xs.filter((x) => x !== a) : [...xs, a]))}>{on ? "✓ " : ""}{ALLERGEN_NAME[a][0].toUpperCase() + ALLERGEN_NAME[a].slice(1)}</button>;
          })}
        </div>
      </fieldset>

      {error && <p className="rounded-2xl bg-terracotta-soft px-4 py-2.5 text-sm text-terracotta-ink" role="alert">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Save food"}</button>
        <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
      <p className="text-xs text-muted">Saved as your own food. Only you can see it.</p>
    </form>
  );
}
