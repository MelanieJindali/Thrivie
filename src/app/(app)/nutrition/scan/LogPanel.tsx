"use client";

import { useMemo, useState } from "react";
import { Heart, Minus, Plus, TriangleAlert } from "lucide-react";
import { MEAL_EMOJI, MEAL_LABELS, MEAL_SLOTS, type MealSlot } from "@/lib/constants";
import type { Allergen } from "@/lib/nutrition/calculations";
import { allergenMatches, nutrientsFor, type Food, type Nutrients, type Portion } from "@/lib/nutrition/food";
import { fitNote, type DayTargets } from "@/lib/nutrition/dayFit";
import { toggleFavorite } from "@/app/foodActions";

export const ALLERGEN_NAME: Record<Allergen, string> = { dairy: "milk", gluten: "gluten", nuts: "nuts", eggs: "eggs", soy: "soy", shellfish: "shellfish", fish: "fish" };
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

export type Day = { left: DayTargets; hideCalories: boolean; allergies: Allergen[] };
export type TrayItem = { food: Food; portion: Portion; nutrients: Nutrients };

export function NutrientLine({ n, hide }: { n: Nutrients; hide: boolean }) {
  if (hide) return null;
  const parts = [n.calories != null && `${Math.round(n.calories)} kcal`, n.proteinG != null && `${n.proteinG} g protein`, n.carbsG != null && `${n.carbsG} g carbs`, n.fatG != null && `${n.fatG} g fat`].filter(Boolean);
  return parts.length ? <p className="text-sm text-muted">{parts.join(" · ")}</p> : null;
}

/** Product screen: how much, which meal, how it fits today, any allergen warning, then log. */
export function LogPanel({ food, day, slot, onSlot, favorite, pending, onLog, onAdd, onBack }: {
  food: Food; day: Day; slot: MealSlot; onSlot: (s: MealSlot) => void; favorite: boolean; pending: boolean;
  onLog: (item: TrayItem) => void; onAdd: (item: TrayItem) => void; onBack: () => void;
}) {
  const canGrams = !!food.per100g || (!!food.perServing && !!food.servingGrams);
  const [mode, setMode] = useState<"servings" | "grams">(food.perServing || !food.per100g ? "servings" : "grams");
  const [servings, setServings] = useState(1);
  const [grams, setGrams] = useState(String(Math.round(food.servingGrams ?? 100)));
  const [fav, setFav] = useState(favorite);
  const portion: Portion = mode === "servings" ? { servings } : { grams: Number(grams) || 0 };
  const n = useMemo(() => nutrientsFor(food, portion), [food, mode, servings, grams]); // eslint-disable-line react-hooks/exhaustive-deps
  const note = n ? fitNote(n, day.left, { hideCalories: day.hideCalories }) : null;
  const allergy = allergenMatches(food, day.allergies);
  const item = n ? { food, portion, nutrients: n } : null;
  const step = (d: number) => setServings((s) => Math.min(20, Math.max(0.5, Math.round((s + d) * 2) / 2)));

  return (
    <section className="card space-y-4" aria-labelledby="food-h">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1 basis-56">
          <h2 id="food-h" className="h2 break-words">{food.name}</h2>
          <p className="text-sm text-muted">{[food.brand, food.servingSize && `Serving: ${food.servingSize}`].filter(Boolean).join(" · ") || (food.mine ? "Your food" : "Generic food")}</p>
        </div>
        {!food.id.startsWith("generic:") && (
          <button type="button" className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-border" aria-pressed={fav} aria-label={fav ? "Remove from favorites" : "Add to favorites"}
            onClick={async () => { setFav(!fav); const r = await toggleFavorite(food.id); if (r.ok) setFav(r.favorite); else setFav(fav); }}>
            <Heart size={20} className={fav ? "fill-terracotta text-terracotta" : "text-muted"} aria-hidden />
          </button>
        )}
      </div>

      {(allergy.contains.length > 0 || allergy.mayContain.length > 0) && (
        <div className="flex gap-3 rounded-2xl bg-terracotta-soft p-4 text-sm text-terracotta-ink" role="alert">
          <TriangleAlert size={20} className="mt-0.5 shrink-0" aria-hidden />
          <p>
            {allergy.contains.length > 0 && <b>Contains {list(allergy.contains.map((a) => ALLERGEN_NAME[a]))}, which is on your allergy list. </b>}
            {allergy.mayContain.length > 0 && <b>May contain traces of {list(allergy.mayContain.map((a) => ALLERGEN_NAME[a]))}. </b>}
            Product data can be incomplete, so always check the package.
          </p>
        </div>
      )}
      {day.allergies.length > 0 && allergy.contains.length === 0 && allergy.mayContain.length === 0 && food.source !== "generic" && (
        <p className="text-xs text-muted">No match with your allergy list in this product&apos;s data. Data can be incomplete, so always check the package.</p>
      )}

      <div className="space-y-2">
        {canGrams && (
          <div className="inline-grid grid-cols-2 gap-1 rounded-2xl bg-surface-2/70 p-1" role="radiogroup" aria-label="Measure by">
            {(["servings", "grams"] as const).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={`min-h-12 rounded-xl px-4 text-sm font-semibold ${mode === m ? "bg-surface text-text shadow-sm" : "text-muted"}`}>
                {m === "servings" ? "Servings" : "Grams"}
              </button>
            ))}
          </div>
        )}
        {mode === "servings" ? (
          <div className="flex items-center gap-3" role="group" aria-label="Number of servings">
            <button type="button" className="grid h-12 w-12 place-items-center rounded-full bg-surface-2 text-text" onClick={() => step(-0.5)} disabled={servings <= 0.5} aria-label="Half a serving less"><Minus size={18} aria-hidden /></button>
            <output className="min-w-24 text-center" aria-live="polite"><span className="font-display text-2xl font-semibold">{servings}</span> <span className="text-sm text-muted">{servings === 1 ? "serving" : "servings"}</span></output>
            <button type="button" className="grid h-12 w-12 place-items-center rounded-full bg-primary text-on-primary" onClick={() => step(0.5)} aria-label="Half a serving more"><Plus size={18} aria-hidden /></button>
          </div>
        ) : (
          <label className="flex max-w-48 items-center gap-2">
            <span className="sr-only">Amount in grams</span>
            <input className="input" inputMode="decimal" value={grams} onChange={(e) => setGrams(e.target.value.replace(/[^\d.]/g, ""))} />
            <span className="text-sm text-muted" aria-hidden>g</span>
          </label>
        )}
        {n ? <NutrientLine n={n} hide={day.hideCalories} /> : <p className="text-sm text-terracotta-ink">Enter an amount above zero.</p>}
        {note && <p className="rounded-2xl bg-seaglass-soft/70 px-3.5 py-2.5 text-sm">{note}</p>}
      </div>

      <fieldset>
        <legend className="label">Meal</legend>
        <div className="flex flex-wrap gap-2">
          {MEAL_SLOTS.map((s) => (
            <button key={s} type="button" className={`chip ${slot === s ? "chip-on" : ""}`} aria-pressed={slot === s} onClick={() => onSlot(s)}><span aria-hidden>{MEAL_EMOJI[s]}</span> {MEAL_LABELS[s]}</button>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary flex-1 basis-40" disabled={!item || pending} onClick={() => item && onLog(item)}>{pending ? "Logging…" : `Log to ${MEAL_LABELS[slot].toLowerCase()}`}</button>
        <button type="button" className="btn-soft" disabled={!item || pending} onClick={() => item && onAdd(item)}>Add another item</button>
        <button type="button" className="btn-ghost" onClick={onBack}>Back</button>
      </div>
      {food.source === "open_food_facts" && (
        <p className="text-xs text-muted">Data from <a className="font-semibold text-primary underline" href={`https://world.openfoodfacts.org/product/${food.barcode ?? ""}`} target="_blank" rel="noreferrer">Open Food Facts</a>, a public database. Values can differ from the package.</p>
      )}
      {food.source === "generic" && <p className="text-xs text-muted">Typical values from USDA FoodData Central. Your portion or recipe may differ.</p>}
    </section>
  );
}
