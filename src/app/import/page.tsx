import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { aiConfigured, AI_MODEL } from "@/lib/ai";
import { ImportClient } from "./ImportClient";

export default async function ImportPage() {
  const settings = await getSettings();
  const [habits, goals] = await Promise.all([
    prisma.habit.findMany({ where: { archived: false }, select: { id: true, name: true }, orderBy: { order: "asc" } }),
    prisma.goal.findMany({ where: { archived: false, linkType: "manual" }, select: { id: true, title: true, unit: true } }),
  ]);
  return (
    <ImportClient
      units={settings.units}
      habits={habits}
      goals={goals.map((g) => ({ id: g.id, name: g.title, unit: g.unit }))}
      configured={aiConfigured()}
      model={AI_MODEL}
    />
  );
}
