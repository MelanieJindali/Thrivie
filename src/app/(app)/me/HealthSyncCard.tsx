"use client";

import { UndoDeleteButton } from "@/components/Toast";
import { useEffect, useState } from "react";
import { Copy, Smartphone } from "lucide-react";
import { createApiToken, revokeApiToken } from "@/app/actions";
import { FormStatus, useAction } from "@/components/ui";

type Token = { id: string; name: string; prefix: string; lastUsedAt: string | null };

export function HealthSyncCard({ tokens }: { tokens: Token[] }) {
  const [name, setName] = useState("My iPhone");
  const [fresh, setFresh] = useState<string | null>(null);
  const [origin, setOrigin] = useState("https://your-thrivie-url");
  const { run, pending, error, message, setError } = useAction();
  useEffect(() => setOrigin(window.location.origin), []);

  async function create() {
    const r = await createApiToken(name);
    if (r.ok) {
      setFresh(r.token);
      run(async () => ({ ok: true }));
    } else setError(r.error);
  }
  const example = `curl -X POST ${origin}/api/ingest \\
  -H "Authorization: Bearer ${fresh ?? "thr_…"}" \\
  -H "Content-Type: application/json" \\
  -d '{"steps": 9120, "sleepHours": 7.4, "weight": 171.6,
       "workouts": [{"type": "running", "durationMin": 32, "distance": 3.1}]}'`;

  return (
    <section className="card space-y-4">
      <h2 className="h2 flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-rose-soft text-rose"><Smartphone size={16} /></span>
        Health sync
      </h2>
      <p className="text-sm text-muted">
        Send steps, sleep, weight and workouts from Apple Health (via the Shortcuts app) or Android automation apps.
        A personal token lets your phone add data to <b className="text-text">your account only</b>.
      </p>

      {fresh ? (
        <div className="space-y-2 rounded-2xl bg-primary-soft p-4">
          <p className="text-sm font-semibold text-primary">Copy your token now — it won&apos;t be shown again.</p>
          <div className="flex gap-2">
            <code className="min-w-0 flex-1 truncate rounded-xl bg-surface px-3 py-2 text-xs">{fresh}</code>
            <button className="btn-soft px-3 text-xs" onClick={() => navigator.clipboard?.writeText(fresh)}><Copy size={14} /> Copy</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <input className="input max-w-56" value={name} onChange={(e) => setName(e.target.value)} aria-label="Token name" />
          <button className="btn-primary" disabled={pending} onClick={create}>Create token</button>
        </div>
      )}
      <FormStatus error={error} message={message} />

      {tokens.length > 0 && (
        <ul className="divide-y divide-border text-sm">
          {tokens.map((t) => (
            <li key={t.id} className="flex items-center gap-3 py-2">
              <span className="flex-1">{t.name} <code className="text-xs text-muted">{t.prefix}…</code></span>
              <span className="text-xs text-muted">{t.lastUsedAt ? `used ${new Date(t.lastUsedAt).toLocaleDateString()}` : "never used"}</span>
              <UndoDeleteButton label="Revoke" what="Token" action={() => revokeApiToken(t.id)} />
            </li>
          ))}
        </ul>
      )}

      <details className="rounded-2xl bg-surface-2/50 p-4 text-sm">
        <summary className="cursor-pointer font-semibold">Set up on iPhone (Shortcuts + Apple Health)</summary>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-muted">
          <li>Open the <b className="text-text">Shortcuts</b> app → <b className="text-text">+</b> to make a new shortcut.</li>
          <li>Add <b className="text-text">Find Health Samples</b>: Type <i>Steps</i>, Start Date <i>is today</i>. Then <b className="text-text">Calculate Statistics</b> → <i>Sum</i>.</li>
          <li>Repeat for <i>Sleep Analysis</i> (last night; Sum gives hours) and <i>Weight</i> (Sort by Start Date, Latest, Limit 1).</li>
          <li>Add <b className="text-text">Get Contents of URL</b>: URL <code className="text-xs">{origin}/api/ingest</code>, Method <i>POST</i>,
            Header <code className="text-xs">Authorization</code> = <code className="text-xs">Bearer &lt;your token&gt;</code>,
            Request Body <i>JSON</i> with keys <code className="text-xs">steps</code>, <code className="text-xs">sleepHours</code>, <code className="text-xs">weight</code> set to the results above.</li>
          <li>In <b className="text-text">Automation</b>, run it daily (e.g. 9 PM) with “Run Immediately”.</li>
        </ol>
        <p className="mt-3 text-muted">Android: use an app such as Tasker or Health Connect exporters to send the same JSON. Test it with:</p>
        <pre className="mt-2 overflow-x-auto rounded-xl bg-surface p-3 text-[11px] leading-relaxed">{example}</pre>
        <p className="mt-2 text-xs text-muted">Weight, water and distance use your unit setting unless you add <code>weightUnit</code>, <code>waterUnit</code> or <code>distanceUnit</code>. Sending the same day again updates it.</p>
      </details>
    </section>
  );
}
