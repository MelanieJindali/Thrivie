import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { requireUser } from "@/lib/auth";
import { CSV_TABLES } from "@/lib/backup";
import { PageHeader } from "@/components/ui";
import { SettingsForm, ThemePicker, BackupRestore, DangerZone } from "./SettingsClient";
import { AccountSection } from "./AccountClient";
import { TwoFactorCard } from "./TwoFactorCard";
import { SmartImportCard } from "./SmartImportCard";
import { ReminderCard } from "./ReminderCard";
import { getVapidKeys } from "@/lib/push";
import { HealthSyncCard } from "./HealthSyncCard";
import { Settings as SettingsIcon } from "lucide-react";

export default async function SettingsPage() {
  const settings = await getSettings();
  const { db, user } = await requireUser();
  const habitCount = await db.habit.count({ where: { archived: false } });
  const hasProfile = (await db.bodyProfile.count()) > 0;

  return (
    <div className="space-y-6">
      <PageHeader theme="settings" icon={<SettingsIcon size={26} />} eyebrow="Preferences" title="Settings" />

      <section className="card">
        <h2 className="h2 mb-4">Profile & units</h2>
        <SettingsForm initial={settings} />
      </section>

      <section className="card flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="h2">Body & Goals</h2>
          <p className="text-sm text-muted">{hasProfile ? "Your profile powers your meal plan." : "Add height, goal and diet to get a simple daily meal plan."}</p>
        </div>
        <Link href="/me/body" className="btn-soft">{hasProfile ? "Edit" : "Set up"}</Link>
      </section>

      <ReminderCard on={settings.remindersOn} hour={settings.reminderHour} publicKey={(await getVapidKeys()).publicKey} />

      <HealthSyncCard tokens={(await db.apiToken.findMany({ orderBy: { createdAt: "desc" } })).map((t) => ({ id: t.id, name: t.name, prefix: t.prefix, lastUsedAt: t.lastUsedAt?.toISOString() ?? null }))} />

      <SmartImportCard aliases={await db.alias.findMany({ orderBy: { alias: "asc" }, select: { id: true, kind: true, alias: true, target: true } })} onDeviceAi={settings.onDeviceAi} />

      <section className="card space-y-3">
        <h2 className="h2">Appearance</h2>
        <ThemePicker />
      </section>

      <section className="card flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="h2">Habits</h2>
          <p className="text-sm text-muted">{habitCount} active habit{habitCount === 1 ? "" : "s"}. Add, rename, archive or delete them.</p>
        </div>
        <Link href="/habits#manage" className="btn-soft">Manage habits</Link>
      </section>

      <section className="card space-y-2 text-sm">
        <h2 className="h2">Privacy</h2>
        <p>Your entries are private to your account and protected by the database itself. Journal text, notes and attachments are encrypted before they are stored. Smart Import reads your notes on this device; the pasted text is never sent to our server.</p>
        <a href="/privacy" className="font-semibold text-primary underline">Read the privacy page</a>
      </section>

      <section className="card space-y-4">
        <h2 className="h2">Your data</h2>
        <div className="space-y-2">
          <a href="/api/export?format=json" className="btn-primary" download>Export everything (JSON backup)</a>
          <p className="text-xs text-muted">A complete backup you can restore later.</p>
        </div>
        <div>
          <span className="label">CSV exports</span>
          <div className="flex flex-wrap gap-2">
            {CSV_TABLES.map((t) => (
              <a key={t} href={`/api/export?format=csv&table=${t}`} className="chip text-xs hover:bg-surface-2" download>
                {t.replace("_", " ")}.csv
              </a>
            ))}
          </div>
        </div>
        <BackupRestore />
      </section>

      <DangerZone />

      <TwoFactorCard enabled={user.totpEnabled} />

      <AccountSection email={user.email} />
    </div>
  );
}
