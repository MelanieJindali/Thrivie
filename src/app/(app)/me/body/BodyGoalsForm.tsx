"use client";

import { useId, useMemo, useState } from "react";
import { HeartHandshake } from "lucide-react";
import { clearBodyProfile, saveBodyProfile, setHideCalories } from "@/app/actions";
import { Field, FormStatus, useAction } from "@/components/ui";
import {
  ACTIVITY_LEVELS,
  ALLERGENS,
  BodyProfileSchema,
  calculateTargets,
  cmToFtIn,
  ftInToCm,
  kgToLb,
  lbToKg,
  NOT_MEDICAL_ADVICE,
  type Allergen,
  type BodyProfile,
  type DietType,
  type Goal,
  type Sex,
} from "@/lib/nutrition/calculations";
import type { Units } from "@/lib/units";

const SEX_OPTIONS: { value: Sex; label: string }[] = [{ value: "female", label: "Female" }, { value: "male", label: "Male" }, { value: "unspecified", label: "Prefer not to say" }];


const GOAL_OPTIONS: { value: Goal; label: string }[] = [{ value: "lose", label: "Lose weight" }, { value: "fat_loss", label: "Fat loss" }, { value: "maintain", label: "Maintain" }, { value: "gain", label: "Gain muscle" }];
const DIET_OPTIONS: { value: DietType; label: string }[] = [{ value: "none", label: "No preference" }, { value: "vegetarian", label: "Vegetarian" }, { value: "vegan", label: "Vegan" }, { value: "pescatarian", label: "Pescatarian" }];
const ALLERGEN_LABEL: Record<Allergen, string> = { dairy: "Dairy", gluten: "Gluten", nuts: "Nuts", eggs: "Eggs", soy: "Soy", shellfish: "Shellfish", fish: "Fish" };

const num = (s: string) => (s.trim() === "" ? NaN : Number(s.replace(",", ".")));

/** A row of radio "chips" with a visible group label. */
function Choice<T extends string>({ label, value, options, onChange, hint }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; hint?: string }) {
  const id = useId();
  return (
    <div>
      <span className="label" id={id}>{label}</span>
      {hint && <p id={`${id}-hint`} className="-mt-0.5 mb-2 text-xs text-muted">{hint}</p>}
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby={id} aria-describedby={hint ? `${id}-hint` : undefined}>
        {options.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={`chip min-h-11 ${value === o.value ? "chip-on" : ""}`} onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function BodyGoalsForm({ initial, units, prefillWeightKg, hideCalories: hideInitial }: { initial: BodyProfile | null; units: Units; prefillWeightKg: number | null; hideCalories: boolean }) {
  const imperial = units === "imperial";
  const startCm = initial?.heightCm ?? null;
  const startKg = initial?.weightKg ?? prefillWeightKg;
  const ftIn = startCm ? cmToFtIn(startCm) : null;
  const [ft, setFt] = useState(ftIn ? String(ftIn.ft) : "");
  const [inch, setInch] = useState(ftIn ? String(ftIn.in) : "");
  const [cm, setCm] = useState(startCm ? String(Math.round(startCm)) : "");
  const [weight, setWeight] = useState(startKg ? String(Math.round((imperial ? kgToLb(startKg) : startKg) * 10) / 10) : "");
  const [age, setAge] = useState(initial ? String(initial.age) : "");
  const [sex, setSex] = useState<Sex>(initial?.sex ?? "unspecified");
  const [pregnant, setPregnant] = useState(initial?.pregnantOrBreastfeeding ?? false);
  const [activity, setActivity] = useState(initial?.activity ?? "light");
  const [goal, setGoal] = useState<Goal>(initial?.goal ?? "maintain");
  const [diet, setDiet] = useState<DietType>(initial?.diet ?? "none");
  const [allergies, setAllergies] = useState<Allergen[]>(initial?.allergies ?? []);
  const [hideCalories, setHide] = useState(hideInitial);
  const { pending, error, message, run } = useAction();
  const hide = useAction();

  const profile = useMemo(() => {
    const heightCm = imperial ? ftInToCm(num(ft || "0"), num(inch || "0")) : num(cm);
    const weightKg = imperial ? lbToKg(num(weight)) : num(weight);
    return BodyProfileSchema.safeParse({ heightCm, weightKg, age: num(age), sex, pregnantOrBreastfeeding: sex !== "male" && pregnant, activity, goal, diet, allergies });
  }, [imperial, ft, inch, cm, weight, age, sex, pregnant, activity, goal, diet, allergies]);
  const result = profile.success ? calculateTargets(profile.data) : null;
  const complete = ft !== "" || cm !== "";
  const firstIssue = !profile.success && complete && weight && age ? profile.error.issues[0]?.message : null;

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (!profile.success) return run(async () => ({ ok: false, error: profile.error.issues[0]?.message ?? "Please check your details." }));
        run(() => saveBodyProfile(profile.data), { success: "Profile saved ✓. Your meal plan will update." });
      }}
    >
      <section className="card space-y-5" aria-labelledby="body-h">
        <div>
          <h2 id="body-h" className="h2">Your details</h2>
          <p className="mt-1 text-sm text-muted">Used only to estimate your daily energy needs for meal planning.</p>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] gap-3">
          {imperial ? (
            <fieldset className="min-w-0">
              <legend className="label">Height</legend>
              <div className="flex gap-2">
                <label className="flex min-w-0 flex-1 items-center gap-1.5"><input className="input" inputMode="numeric" value={ft} onChange={(e) => setFt(e.target.value)} aria-label="Height, feet" /><span className="text-sm text-muted" aria-hidden>ft</span></label>
                <label className="flex min-w-0 flex-1 items-center gap-1.5"><input className="input" inputMode="numeric" value={inch} onChange={(e) => setInch(e.target.value)} aria-label="Height, inches" /><span className="text-sm text-muted" aria-hidden>in</span></label>
              </div>
            </fieldset>
          ) : (
            <Field label="Height (cm)"><input className="input" inputMode="numeric" value={cm} onChange={(e) => setCm(e.target.value)} /></Field>
          )}
          <Field label={`Weight (${imperial ? "lb" : "kg"})`} hint={!initial && prefillWeightKg ? "From your latest check-in" : undefined}>
            <input className="input" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} />
          </Field>
          <Field label="Age"><input className="input" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} /></Field>
        </div>
        <Choice label="Sex assigned at birth" value={sex} options={SEX_OPTIONS} onChange={setSex}
          hint="Optional. The standard energy equation (Mifflin–St Jeor) has separate values for female and male physiology. If you prefer not to say, a neutral average is used." />
        {sex !== "male" && (
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input type="checkbox" className="h-5 w-5 accent-[var(--primary)]" checked={pregnant} onChange={(e) => setPregnant(e.target.checked)} />
            Currently pregnant or breastfeeding
          </label>
        )}
        <div>
          <span className="label" id="activity-l">Activity level</span>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-labelledby="activity-l">
            {ACTIVITY_LEVELS.map((a) => (
              <button key={a.value} type="button" role="radio" aria-checked={activity === a.value} onClick={() => setActivity(a.value)}
                className={`min-h-14 rounded-2xl border px-4 py-2 text-left text-sm transition ${activity === a.value ? "border-primary bg-primary-soft" : "border-border bg-surface hover:bg-surface-2"}`}>
                <span className="block font-bold">{a.label}</span>
                <span className="block text-xs text-muted">{a.description}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="card space-y-5" aria-labelledby="goals-h">
        <h2 id="goals-h" className="h2">Goal & food</h2>
        <Choice label="Goal" value={goal} options={GOAL_OPTIONS} onChange={setGoal} hint={goal === "fat_loss" ? "A moderate calorie deficit with more protein, to lose fat while keeping muscle." : undefined} />
        <Choice label="Diet" value={diet} options={DIET_OPTIONS} onChange={setDiet} />
        <fieldset>
          <legend className="label">Allergies (we&apos;ll leave these out)</legend>
          <div className="flex flex-wrap gap-2">
            {ALLERGENS.map((a) => {
              const on = allergies.includes(a);
              return (
                <button key={a} type="button" aria-pressed={on} className={`chip min-h-11 ${on ? "chip-on" : ""}`} onClick={() => setAllergies((xs) => (on ? xs.filter((x) => x !== a) : [...xs, a]))}>
                  {on ? "✓ " : ""}{ALLERGEN_LABEL[a]}
                </button>
              );
            })}
          </div>
        </fieldset>
      </section>

      <section className="card space-y-3" aria-labelledby="targets-h" aria-live="polite">
        <h2 id="targets-h" className="h2">Your daily target</h2>
        {!result ? (
          <p className="text-sm text-muted">{firstIssue ?? "Enter your height, weight and age to calculate your daily target."}</p>
        ) : result.ok ? (
          <>
            {hideCalories ? (
              <p className="text-sm">Your plan is ready. Calorie numbers are hidden; meals show portions only.</p>
            ) : (
              <dl className="grid grid-cols-2 gap-2.5 text-center sm:grid-cols-4">
                {([["Calories", `${result.targets.calories.toLocaleString("en-US")}`, "bg-clay-soft"], ["Protein", `${result.targets.proteinG} g`, "bg-sage-soft"], ["Carbs", `${result.targets.carbsG} g`, "bg-gold-soft"], ["Fat", `${result.targets.fatG} g`, "bg-ocean-soft"]] as const).map(([l, v, tone]) => (
                  <div key={l} className={`rounded-2xl px-2 py-3 ${tone}`}>
                    <dd className="font-display text-lg font-semibold">{v}</dd>
                    <dt className="mt-0.5 text-[10px] font-bold tracking-[0.12em] text-text uppercase">{l}</dt>
                  </div>
                ))}
              </dl>
            )}
            {result.notes.map((n) => <p key={n} className="text-sm text-muted">{n}</p>)}
          </>
        ) : (
          <div className="flex gap-3 rounded-2xl bg-iris-soft p-4 text-sm" role="note">
            <HeartHandshake size={20} className="mt-0.5 shrink-0 text-iris" aria-hidden />
            <p>{result.message}</p>
          </div>
        )}
        <p className="text-xs text-muted">{NOT_MEDICAL_ADVICE}</p>
      </section>

      <section className="card space-y-3">
        <label className="flex min-h-11 items-center justify-between gap-3 text-sm">
          <span>
            <span className="block font-bold">Hide calorie numbers</span>
            <span className="block text-xs text-muted">Meal plans show foods and portions only.</span>
          </span>
          <input type="checkbox" role="switch" className="h-6 w-6 shrink-0 accent-[var(--primary)]" checked={hideCalories}
            onChange={(e) => { const v = e.target.checked; setHide(v); hide.run(() => setHideCalories(v)); }} />
        </label>
        <FormStatus error={hide.error} message={null} />
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Save profile"}</button>
        {initial && (
          <button type="button" className="btn-ghost" disabled={pending} onClick={() => run(() => clearBodyProfile(), { success: "Profile removed." })}>Remove my profile</button>
        )}
        <FormStatus error={error} message={message} />
      </div>
      <p className="text-xs text-muted">Your measurements and health details are encrypted before they&apos;re stored and are included in your data export.</p>
    </form>
  );
}
