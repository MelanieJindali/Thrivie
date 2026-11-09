import { Scale } from "lucide-react";
import { getSettings } from "@/lib/settings";
import { requireUser } from "@/lib/auth";
import { latestWeightKg, loadBodyProfile } from "@/lib/nutrition/profile";
import { PageHeader } from "@/components/ui";
import { BodyGoalsForm } from "./BodyGoalsForm";

export const metadata = { title: "Body & Goals · Thrivie" };

export default async function BodyGoalsPage() {
  const settings = await getSettings();
  const { db, user } = await requireUser();
  const [profile, weightKg] = await Promise.all([loadBodyProfile(db, user.id), latestWeightKg(db)]);
  return (
    <div className="space-y-6">
      <PageHeader theme="nutrition" icon={<Scale size={26} />} eyebrow="Settings" title="Body & Goals" subtitle="Used only to suggest a daily meal plan. Everything here is private and encrypted." />
      <BodyGoalsForm initial={profile} units={settings.units} prefillWeightKg={weightKg} hideCalories={settings.hideCalories} />
    </div>
  );
}
