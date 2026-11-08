import { getSettings } from "@/lib/settings";
import { requireUser } from "@/lib/auth";
import { todayInTz } from "@/lib/dates";
import { ImportClient } from "./ImportClient";

export default async function ImportPage() {
  const settings = await getSettings();
  const { db } = await requireUser();
  const [habits, goals, aliases] = await Promise.all([
    db.habit.findMany({ where: { archived: false }, select: { id: true, name: true }, orderBy: { order: "asc" } }),
    db.goal.findMany({ where: { archived: false, linkType: "manual" }, select: { id: true, title: true, unit: true } }),
    db.alias.findMany({ select: { kind: true, alias: true, target: true } }),
  ]);
  return (
    <ImportClient
      today={todayInTz(settings.timezone)}
      units={settings.units}
      habits={habits}
      goals={goals.map((g) => ({ id: g.id, name: g.title, unit: g.unit }))}
      aliases={aliases as { kind: "exercise" | "habit" | "workout" | "metric"; alias: string; target: string }[]}
      tipsSeen={settings.tipsSeen}
      onDeviceAi={settings.onDeviceAi}
    />
  );
}
