import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { getSettings } from "@/lib/settings";
import { requireUser } from "@/lib/auth";
import { formatDate, todayInTz } from "@/lib/dates";
import { getPlanContext, loggedFromPlan } from "@/lib/nutrition/planStore";
import { NOT_MEDICAL_ADVICE } from "@/lib/nutrition/calculations";
import { PageHeader } from "@/components/ui";
import { MealPlanCard, MealPlanDay, NewPlanButton } from "@/components/MealPlanCard";

export const metadata = { title: "Meal plan · Thrivie" };

export default async function MealPlanPage() {
  const settings = await getSettings();
  const { db, user } = await requireUser();
  const today = todayInTz(settings.timezone);
  const ctx = await getPlanContext(db, user.id, today);
  const logged = await loggedFromPlan(db, ctx, today);

  return (
    <div className="space-y-6">
      <PageHeader theme="nutrition" icon={<CalendarDays size={26} />} eyebrow="Nutrition" title="This week's meals" crumbs={[{ href: "/log", label: "Log" }, { href: "/nutrition", label: "Nutrition" }]}
        subtitle={ctx.state === "ready" && !settings.hideCalories ? `About ${ctx.targets.calories.toLocaleString("en-US")} kcal a day, built around your diet and allergies.` : "Simple meals built around your diet and allergies."}>
        {ctx.state === "ready" && <NewPlanButton />}
      </PageHeader>
      {ctx.state !== "ready" ? (
        <MealPlanCard plan={ctx} />
      ) : (
        <>
          {ctx.plan.warnings.map((w) => <p key={w} className="rounded-2xl bg-terracotta-soft px-4 py-3 text-sm">{w}</p>)}
          {ctx.notes.map((n) => <p key={n} className="text-sm text-muted">{n}</p>)}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,21rem),1fr))] gap-4">
            {ctx.plan.days.map((d, i) => (
              <section key={d.date} className={`card ${d.date === today ? "ring-2 ring-primary/40" : ""}`} aria-label={formatDate(d.date, { weekday: "long", month: "long", day: "numeric" })}>
                <MealPlanDay day={d} dayIndex={i} hideCalories={settings.hideCalories} compact logged={logged[i]}
                  title={d.date === today ? `Today · ${formatDate(d.date, { weekday: "long" })}` : formatDate(d.date, { weekday: "long", month: "short", day: "numeric" })} />
              </section>
            ))}
          </div>
          <p className="text-xs text-muted">{NOT_MEDICAL_ADVICE} Nutrition values are calculated from USDA FoodData Central. <Link href="/me/body" className="-my-3 inline-block py-3 font-semibold text-primary underline">Edit Body & Goals</Link></p>
        </>
      )}
    </div>
  );
}
