"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteAllData, saveSettings } from "@/app/actions";
import { Field, FormStatus, useAction } from "@/components/ui";
import { TimezonePicker } from "@/components/TimezonePicker";
import { ALL_MODULES, type ModuleKey } from "@/lib/constants";
import { MODULE_INFO } from "@/lib/constants";

type S = { name: string; units: "metric" | "imperial"; timezone: string; visibleModules: ModuleKey[] };

export function SettingsForm({ initial }: { initial: S }) {
  const [s, setS] = useState(initial);
  const { pending, error, message, run } = useAction();
  const toggle = (m: ModuleKey) =>
    setS((x) => ({ ...x, visibleModules: x.visibleModules.includes(m) ? x.visibleModules.filter((y) => y !== m) : [...x.visibleModules, m] }));

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveSettings(s), { success: "Settings saved ✓" });
      }}
    >
      <Field label="Your name">
        <input className="input" value={s.name} placeholder="Optional" onChange={(e) => setS({ ...s, name: e.target.value })} />
      </Field>
      <div>
        <span className="label">Units</span>
        <div className="flex gap-2">
          <button type="button" className={`chip ${s.units === "imperial" ? "chip-on" : ""}`} onClick={() => setS({ ...s, units: "imperial" })}>U.S. (lb, mi, fl oz)</button>
          <button type="button" className={`chip ${s.units === "metric" ? "chip-on" : ""}`} onClick={() => setS({ ...s, units: "metric" })}>Metric (kg, km, ml)</button>
        </div>
        <p className="mt-1 text-xs text-muted">Changing units converts how existing data is shown — nothing is lost.</p>
      </div>
      <TimezonePicker value={s.timezone} onChange={(timezone) => setS({ ...s, timezone })} hint="Used to decide what “today” and “yesterday” mean. Saved when you tap Save." />
      <div>
        <span className="label">Visible modules</span>
        <div className="flex flex-wrap gap-2">
          {ALL_MODULES.map((m) => (
            <button type="button" key={m} className={`chip ${s.visibleModules.includes(m) ? "chip-on" : ""}`} onClick={() => toggle(m)} aria-pressed={s.visibleModules.includes(m)}>
              {s.visibleModules.includes(m) ? "✓ " : ""}{MODULE_INFO[m].label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted">Hidden modules keep their data; they just disappear from navigation and the dashboard.</p>
      </div>
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={pending}>Save settings</button>
        <FormStatus error={error} message={message} />
      </div>
    </form>
  );
}

export function ThemePicker() {
  const [theme, setTheme] = useState<string>("system");
  useEffect(() => {
    try {
      setTheme(localStorage.getItem("thrivie-theme") || "system");
    } catch {}
  }, []);
  const apply = (t: string) => {
    setTheme(t);
    try {
      localStorage.setItem("thrivie-theme", t);
    } catch {}
    const dark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
  };
  return (
    <div className="flex flex-wrap gap-2">
      {["system", "light", "dark"].map((t) => (
        <button key={t} type="button" className={`chip capitalize ${theme === t ? "chip-on" : ""}`} onClick={() => apply(t)}>
          {t === "system" ? "Match device" : t}
        </button>
      ))}
    </div>
  );
}

export function BackupRestore() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<{ error?: string; message?: string }>({});
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function onFile(f: File) {
    if (!confirm("Restoring replaces ALL current data with the backup. Continue?")) return;
    setBusy(true);
    setStatus({});
    try {
      const text = await f.text();
      const res = await fetch("/api/backup", { method: "POST", headers: { "Content-Type": "application/json" }, body: text });
      const json = await res.json();
      if (!res.ok) setStatus({ error: json.error });
      else {
        const c = json.counts;
        setStatus({ message: `Restored ${c.health} health logs, ${c.workouts} workouts, ${c.habits} habits, ${c.goals} goals, ${c.journal} journal entries.` });
        router.refresh();
      }
    } catch {
      setStatus({ error: "Couldn't read that file." });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <span className="label">Restore from backup</span>
      <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      <button className="btn-soft" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? "Restoring…" : "Import JSON backup…"}</button>
      <FormStatus error={status.error ?? null} message={status.message ?? null} />
    </div>
  );
}

export function DangerZone() {
  const [confirmText, setConfirmText] = useState("");
  const { pending, error, message, run } = useAction();
  return (
    <section className="card space-y-3 border-terracotta-ink/30">
      <h2 className="h2 text-terracotta-ink">Delete all data</h2>
      <p className="text-sm text-muted">Permanently removes every log, workout, habit, goal and journal entry. Export a backup first if you might want it back. Your settings are kept.</p>
      <div className="flex flex-wrap gap-2">
        <input className="input w-40" placeholder='Type "DELETE"' value={confirmText} onChange={(e) => setConfirmText(e.target.value)} aria-label="Type DELETE to confirm" />
        <button className="btn-danger" disabled={pending || confirmText !== "DELETE"} onClick={() => run(() => deleteAllData(confirmText), { success: "All data deleted.", onOk: () => setConfirmText("") })}>
          Delete everything
        </button>
      </div>
      <FormStatus error={error} message={message} />
    </section>
  );
}
