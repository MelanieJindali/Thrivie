"use client";

import { useEffect, useState, useTransition } from "react";
import { TimezonePicker } from "@/components/TimezonePicker";
import { detectTimeZone } from "@/lib/timezones";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { completeOnboarding, loadSampleDataAction, skipOnboarding } from "@/app/actions";

const STARTERS = [
  { name: "Meditate", emoji: "🧘" }, { name: "Drink water", emoji: "💧" }, { name: "Walk 20 minutes", emoji: "🚶" },
  { name: "Read", emoji: "📚" }, { name: "Stretch", emoji: "🤸" }, { name: "Phone-free morning", emoji: "📵" },
  { name: "In bed by 11", emoji: "🌙" }, { name: "Eat a vegetable", emoji: "🥦" },
];

type GoalChoice = { key: string; label: string; goal: { title: string; target: number; unit: string; days: number; linkType: "manual" | "workout" | "habit"; linkMeasure?: "count" | "minutes" | "distance" } };

export function Onboarding({ name: initialName, units: initialUnits, timezone: initialTimezone }: { name: string; units: "metric" | "imperial"; timezone: string }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(initialName);
  const [units, setUnits] = useState(initialUnits);
  const [timezone, setTimezone] = useState(initialTimezone);
  // Preselect the device's timezone (the user can change it before continuing).
  useEffect(() => setTimezone(detectTimeZone()), []);
  const [habits, setHabits] = useState<{ name: string; emoji?: string }[]>([]);
  const [custom, setCustom] = useState("");
  const [goal, setGoal] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const dist = units === "imperial" ? "mi" : "km";
  const GOALS: GoalChoice[] = [
    { key: "walk", label: `Walk or run 50 ${dist} in 2 months`, goal: { title: `Move 50 ${dist}`, target: 50, unit: dist, days: 60, linkType: "workout", linkMeasure: "distance" } },
    { key: "workouts", label: "Work out 12 times this month", goal: { title: "12 workouts", target: 12, unit: "workouts", days: 30, linkType: "workout", linkMeasure: "count" } },
    ...(habits[0] ? [{ key: "habit", label: `${habits[0].name} 30 times`, goal: { title: `${habits[0].name} 30 times`, target: 30, unit: "times", days: 45, linkType: "habit" as const } }] : []),
    { key: "books", label: "Read 6 books", goal: { title: "Read 6 books", target: 6, unit: "books", days: 90, linkType: "manual" } },
  ];

  const toggleHabit = (h: { name: string; emoji?: string }) =>
    setHabits((xs) => (xs.some((x) => x.name === h.name) ? xs.filter((x) => x.name !== h.name) : xs.length >= 3 ? xs : [...xs, h]));

  function finish(withGoal: boolean) {
    setError(null);
    start(async () => {
      const g = withGoal ? GOALS.find((x) => x.key === goal)?.goal ?? null : null;
      const r = await completeOnboarding({ name, units, timezone, habits, goal: g });
      if (!r.ok) return setError(r.error);
      router.push("/");
    });
  }

  const steps = ["About you", "Starter habits", "A first goal"];
  return (
    <div className="mx-auto max-w-xl space-y-6 pt-2">
      <div className="text-center">
        <p className="eyebrow">Welcome to Thrivie · step {step + 1} of 3</p>
        <h1 className="h1 mt-2">{steps[step]}</h1>
        <ol className="mt-4 flex justify-center gap-2" aria-label="Progress">
          {steps.map((s, i) => (
            <li key={s} aria-current={i === step ? "step" : undefined} className={`h-1.5 w-10 rounded-full ${i <= step ? "bg-primary" : "bg-surface-2"}`}><span className="sr-only">{s}</span></li>
          ))}
        </ol>
      </div>

      {step === 0 && (
        <section className="card space-y-5">
          <label className="block">
            <span className="label">What should we call you? (optional)</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" maxLength={60} />
          </label>
          <div>
            <span className="label" id="units-l">Units</span>
            <div className="flex flex-wrap gap-2" role="group" aria-labelledby="units-l">
              <button type="button" className={`chip ${units === "imperial" ? "chip-on" : ""}`} aria-pressed={units === "imperial"} onClick={() => setUnits("imperial")}>U.S. (lb, mi, fl oz)</button>
              <button type="button" className={`chip ${units === "metric" ? "chip-on" : ""}`} aria-pressed={units === "metric"} onClick={() => setUnits("metric")}>Metric (kg, km, ml)</button>
            </div>
          </div>
          <TimezonePicker value={timezone} onChange={setTimezone} hint="Decides when your day starts, for streaks and reminders." />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button type="button" className="btn-ghost" disabled={pending}
              onClick={() => start(async () => { await skipOnboarding(timezone); const r = await loadSampleDataAction(); if (!r.ok) return setError(r.error); router.push("/"); })}>
              Explore with sample data
            </button>
            <button type="button" className="btn-primary" onClick={() => setStep(1)}>Continue</button>
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="card space-y-5">
          <p className="text-sm text-muted">Pick up to three small things you&apos;d like to do most days. You can change these any time.</p>
          <ul className="flex flex-wrap gap-2">
            {[...STARTERS, ...habits.filter((h) => !STARTERS.some((s) => s.name === h.name))].map((h) => {
              const on = habits.some((x) => x.name === h.name);
              return (
                <li key={h.name}>
                  <button type="button" className={`chip ${on ? "chip-on" : ""}`} aria-pressed={on} disabled={!on && habits.length >= 3} onClick={() => toggleHabit(h)}>
                    {on ? <Check size={14} aria-hidden /> : <span aria-hidden>{h.emoji ?? "✨"}</span>} {h.name}
                  </button>
                </li>
              );
            })}
          </ul>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (custom.trim()) { toggleHabit({ name: custom.trim().slice(0, 60) }); setCustom(""); } }}>
            <input className="input" placeholder="Or type your own" value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={60} aria-label="Custom habit" />
            <button className="btn-outline" disabled={!custom.trim() || habits.length >= 3}>Add</button>
          </form>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button type="button" className="btn-ghost" onClick={() => setStep(0)}>Back</button>
            <div className="flex gap-2">
              <button type="button" className="btn-ghost" onClick={() => { setHabits([]); setStep(2); }}>Skip</button>
              <button type="button" className="btn-primary" onClick={() => setStep(2)}>{habits.length ? `Continue with ${habits.length}` : "Continue"}</button>
            </div>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="card space-y-5">
          <p className="text-sm text-muted">Optional. Linked goals track themselves from what you log.</p>
          <ul className="grid gap-2" role="radiogroup" aria-label="First goal">
            {GOALS.map((g) => (
              <li key={g.key}>
                <button type="button" role="radio" aria-checked={goal === g.key} onClick={() => setGoal(goal === g.key ? null : g.key)}
                  className={`flex min-h-14 w-full items-center justify-between rounded-2xl border-[1.5px] px-4 text-left text-sm font-semibold ${goal === g.key ? "border-primary bg-seaglass-soft" : "border-line bg-surface"}`}>
                  {g.label} {goal === g.key && <Check size={16} aria-hidden />}
                </button>
              </li>
            ))}
          </ul>
          {error && <p className="text-sm text-terracotta-ink" role="alert">{error}</p>}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button type="button" className="btn-ghost" onClick={() => setStep(1)}>Back</button>
            <div className="flex gap-2">
              <button type="button" className="btn-ghost" disabled={pending} onClick={() => finish(false)}>Skip</button>
              <button type="button" className="btn-primary" disabled={pending || !goal} onClick={() => finish(true)}>{pending ? "Setting up…" : "Start"}</button>
            </div>
          </div>
        </section>
      )}
      {step < 2 && error && <p className="text-center text-sm text-terracotta-ink" role="alert">{error}</p>}
    </div>
  );
}
