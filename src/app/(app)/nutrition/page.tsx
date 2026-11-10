import { Utensils } from "lucide-react";
import { getSettings } from "@/lib/settings";
import { requireUser } from "@/lib/auth";
import { addDays, formatDate, todayInTz } from "@/lib/dates";
import { dayTotals, groupByDay, macroLine } from "@/lib/nutrition";
import { MEAL_SLOTS, type MealSlot } from "@/lib/constants";
import { PageHeader, ProgressBar } from "@/components/ui";
import { NutritionView, TargetsForm, type DayGroup } from "./NutritionView";
import type { RecentMeal } from "./MealForm";
import { MealPlanCard } from "@/components/MealPlanCard";
import { getPlanContext, loggedFromPlan, planCard } from "@/lib/nutrition/planStore";

const str = (v: number | null) => (v == null ? "" : String(v));

export default async function NutritionPage() {
  const settings = await getSettings();
  const { db, user } = await requireUser();
  const today = todayInTz(settings.timezone);
  const plan = await getPlanContext(db, user.id, today);
  const meals = await db.meal.findMany({ where: { date: { gte: addDays(today, -29) } }, orderBy: [{ date: "desc" }, { createdAt: "asc" }] });
  const slotOrder = (s: string) => MEAL_SLOTS.indexOf(s as MealSlot);

  const days: DayGroup[] = groupByDay(meals).map((d) => ({
    date: d.date,
    calories: d.totals.calories,
    proteinG: d.totals.proteinG,
    meals: [...d.meals].sort((a, b) => slotOrder(a.slot) - slotOrder(b.slot)).map((m) => ({
      id: m.id, date: m.date, slot: m.slot as MealSlot, name: m.name, notes: m.notes ?? "",
      calories: str(m.calories), proteinG: str(m.proteinG), carbsG: str(m.carbsG), fatG: str(m.fatG),
    })),
  }));

  // Every distinct meal from the past year, most recent first, with how often it was had,
  // so repeat meals can be re-entered with one tap. The first four show as quick chips.
  const history = await db.meal.findMany({
    where: { date: { gte: addDays(today, -365) } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    select: { name: true, slot: true, calories: true, proteinG: true, carbsG: true, fatG: true },
    take: 3000,
  });
  const byName = new Map<string, RecentMeal>();
  for (const m of history) {
    const key = m.name.trim().toLowerCase();
    const had = byName.get(key);
    if (had) had.times = (had.times ?? 1) + 1;
    else if (byName.size < 400) byName.set(key, { slot: m.slot as MealSlot, name: m.name, calories: str(m.calories), proteinG: str(m.proteinG), carbsG: str(m.carbsG), fatG: str(m.fatG), times: 1 });
  }
  const allMeals = [...byName.values()];
  const recent = allMeals.slice(0, 4);

  const t = dayTotals(meals.filter((m) => m.date === today));
  const { calorieTarget: calT, proteinTargetG: proT } = settings;
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)).map((date) => ({ date, ...dayTotals(meals.filter((m) => m.date === date)) }));
  const weekMax = Math.max(calT ?? 0, ...week.map((w) => w.calories ?? 0));
  const tracked = week.filter((w) => w.calories != null);

  return (
    <div className="space-y-6">
      <PageHeader theme="nutrition" icon={<Utensils size={26} />} eyebrow="Nourish" title="Nutrition" crumbs={[{ href: "/log", label: "Log" }]}
        subtitle={t.meals ? `${t.meals} ${t.meals === 1 ? "meal" : "meals"} logged today.` : "A simple, private food diary. Numbers are optional."} />

      <MealPlanCard plan={planCard(plan, settings.hideCalories, await loggedFromPlan(db, plan, today))} />

      <section className="card" aria-labelledby="today-food-h">
        <h2 id="today-food-h" className="h2 mb-4">Today</h2>
        {t.meals ? (
          <div className="space-y-4">
            {calT ? (
              <div>
                <p className="mb-1.5 flex justify-between text-sm"><span className="font-bold">Calories</span><span>{(t.calories ?? 0).toLocaleString("en-US")} / {calT.toLocaleString("en-US")} kcal</span></p>
                <ProgressBar label="Calories toward today's target" pct={Math.min(100, ((t.calories ?? 0) / calT) * 100)} />
              </div>
            ) : null}
            {proT ? (
              <div>
                <p className="mb-1.5 flex justify-between text-sm"><span className="font-bold">Protein</span><span>{t.proteinG ?? 0} / {proT} g</span></p>
                <ProgressBar label="Protein toward today's target" pct={Math.min(100, ((t.proteinG ?? 0) / proT) * 100)} tone="accent" />
              </div>
            ) : null}
            <dl className="grid grid-cols-2 gap-2.5 text-center sm:grid-cols-4">
              {([["Calories", t.calories, " kcal", "bg-clay-soft"], ["Protein", t.proteinG, "g", "bg-sage-soft"], ["Carbs", t.carbsG, "g", "bg-gold-soft"], ["Fat", t.fatG, "g", "bg-ocean-soft"]] as const).map(([label, v, unit, tone]) => (
                <div key={label} className={`rounded-2xl px-2 py-3 ${tone}`}>
                  <dd className="font-display text-lg font-semibold">{v != null ? `${v.toLocaleString("en-US")}${unit}` : "—"}</dd>
                  <dt className="mt-0.5 text-[10px] font-bold tracking-[0.12em] text-text uppercase">{label}</dt>
                </div>
              ))}
            </dl>
          </div>
        ) : (
          <p className="text-sm text-muted">Nothing logged yet today.</p>
        )}
      </section>

      <NutritionView today={today} days={days} recent={recent} allMeals={allMeals} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="card" aria-labelledby="week-food-h">
          <h2 id="week-food-h" className="h2 mb-1">Last 7 days</h2>
          <p className="mb-4 text-sm text-muted">
            {tracked.length ? `Average ${Math.round(tracked.reduce((a, w) => a + (w.calories ?? 0), 0) / tracked.length).toLocaleString("en-US")} kcal on ${tracked.length} tracked ${tracked.length === 1 ? "day" : "days"}.` : "Add calories to meals to see your week."}
          </p>
          <ul className="flex h-40 items-end gap-2" aria-label="Calories per day">
            {week.map((w) => (
              <li key={w.date} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                <span className="text-[10px] text-muted">{w.calories != null ? w.calories.toLocaleString("en-US") : ""}</span>
                <span className="w-full max-w-10 rounded-t-lg bg-linear-to-t from-clay-ink to-gold-bright" style={{ height: `${weekMax && w.calories ? Math.max(4, (w.calories / weekMax) * 100) : 0}%` }}
                  aria-label={`${formatDate(w.date, { weekday: "long" })}: ${w.calories != null ? `${w.calories} kcal` : "not tracked"}`} role="img" />
                <span className="text-[11px] font-bold text-muted" aria-hidden>{formatDate(w.date, { weekday: "narrow" })}</span>
              </li>
            ))}
          </ul>
          {tracked.length > 0 && <p className="sr-only">{week.map((w) => `${formatDate(w.date, { weekday: "short" })} ${macroLine({ calories: w.calories, proteinG: w.proteinG }) || "not tracked"}`).join("; ")}</p>}
        </section>
        <TargetsForm calorieTarget={calT} proteinTargetG={proT} />
      </div>
    </div>
  );
}
