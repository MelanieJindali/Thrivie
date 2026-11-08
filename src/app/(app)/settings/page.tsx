import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { requireUser } from "@/lib/auth";
import { aiConfigured, AI_MODEL } from "@/lib/ai";
import { CSV_TABLES } from "@/lib/backup";
import { PageHeader } from "@/components/ui";
import { SettingsForm, ThemePicker, BackupRestore, DangerZone } from "./SettingsClient";
import { AccountSection } from "./AccountClient";
import { ReminderCard } from "./ReminderCard";
import { getVapidKeys } from "@/lib/push";
import { HealthSyncCard } from "./HealthSyncCard";
import { Settings as SettingsIcon } from "lucide-react";

export default async function SettingsPage() {
  const settings = await getSettings();
  const { db, user } = await requireUser();
  const habitCount = await db.habit.count({ where: { archived: false } });
  const timezones = Intl.supportedValuesOf("timeZone");

  return (
    <div className="space-y-6">
      <PageHeader theme="settings" icon={<SettingsIcon size={26} />} eyebrow="Preferences" title="Settings" />

      <section className="card">
        <h2 className="h2 mb-4">Profile & units</h2>
        <SettingsForm initial={settings} timezones={timezones} />
      </section>

      <ReminderCard on={settings.remindersOn} hour={settings.reminderHour} publicKey={(await getVapidKeys()).publicKey} />

      <HealthSyncCard tokens={(await db.apiToken.findMany({ orderBy: { createdAt: "desc" } })).map((t) => ({ id: t.id, name: t.name, prefix: t.prefix, lastUsedAt: t.lastUsedAt?.toISOString() ?? null }))} />

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

      <section className="card space-y-3 text-sm">
        <h2 className="h2">Privacy & AI</h2>
        <p>Your data is stored in this Thrivie server&apos;s database and is tied to your account. Other people with accounts on this server can never see it. It isn&apos;t shared with anyone else, except:</p>
        <ul className="list-disc space-y-1 pl-5 text-muted">
          <li><b className="text-text">AI Notes Import</b> sends the text you paste (plus your habit and goal names) to Anthropic&apos;s Claude API.</li>
          <li><b className="text-text">Daily brief & highlights</b> send a summary of the last 7 days (averages, counts, habit and goal names — never journal text) to Anthropic&apos;s Claude API, at most once a day unless you tap refresh.</li>
        </ul>
        <p className="text-muted">
          AI status:{" "}
          {aiConfigured() ? <span className="text-primary">connected · {AI_MODEL}</span> : <span className="text-warn">no API key set (AI features off)</span>}
        </p>
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

      <AccountSection email={user.email} />
    </div>
  );
}
