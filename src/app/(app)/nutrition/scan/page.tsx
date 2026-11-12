import { ScanBarcode } from "lucide-react";
import { getSettings } from "@/lib/settings";
import { requireUser } from "@/lib/auth";
import { todayInTz } from "@/lib/dates";
import { loadDay } from "@/lib/nutrition/dayData";
import { PageHeader } from "@/components/ui";
import { ScanClient } from "./ScanClient";

export const metadata = { title: "Scan food · Thrivie" };
const TABS = ["barcode", "label", "photo", "search"] as const;

export default async function ScanPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const settings = await getSettings();
  const { db, user } = await requireUser();
  const today = todayInTz(settings.timezone);
  const [day, favorites] = await Promise.all([loadDay(db, user.id, today, settings), db.favoriteFood.findMany({ select: { foodId: true } })]);
  const wanted = (await searchParams).tab;
  const tab = TABS.find((t) => t === wanted) ?? "barcode";
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader theme="nutrition" icon={<ScanBarcode size={26} />} eyebrow="Nutrition" title="Scan food" subtitle="Scan a barcode, read a label, or search. Check it, then log it." crumbs={[{ href: "/log", label: "Log" }, { href: "/nutrition", label: "Nutrition" }]} />
      <ScanClient day={{ left: day.left, hideCalories: settings.hideCalories, allergies: day.allergies }} targets={day.targets} favoriteIds={favorites.map((f) => f.foodId)} initialTab={tab} />
    </div>
  );
}
