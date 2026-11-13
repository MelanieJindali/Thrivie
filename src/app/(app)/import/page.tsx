import { getSettings } from "@/lib/settings";
import { requireUser } from "@/lib/auth";
import { todayInTz } from "@/lib/dates";
import { ImportClient } from "./ImportClient";
import { personalContext } from "@/lib/import/personal";

export default async function ImportPage() {
  const settings = await getSettings();
  const { db } = await requireUser();
  const today = todayInTz(settings.timezone);
  const [habits, goals, aliases, personal] = await Promise.all([
    db.habit.findMany({ where: { archived: false }, select: { id: true, name: true }, orderBy: { order: "asc" } }),
    db.goal.findMany({ where: { archived: false, linkType: "manual" }, select: { id: true, title: true, unit: true } }),
    db.alias.findMany({ select: { kind: true, alias: true, target: true } }),
    personalContext(db, today),
  ]);
  return (
    <ImportClient
      today={today}
      personal={personal}
      units={settings.units}
      habits={habits}
      goals={goals.map((g) => ({ id: g.id, name: g.title, unit: g.unit }))}
      aliases={aliases as { kind: "exercise" | "habit" | "workout" | "metric"; alias: string; target: string }[]}
      tipsSeen={settings.tipsSeen}
    />
  );
}
