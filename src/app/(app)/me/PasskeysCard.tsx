"use client";

import { useEffect, useState } from "react";
import { Fingerprint, Trash2 } from "lucide-react";
import { browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { removePasskey } from "@/app/authActions";
import { createPasskey } from "@/components/Passkeys";
import { formatDate } from "@/lib/dates";

export type PasskeyRow = { id: string; name: string; createdAt: string; lastUsedAt: string | null; backedUp: boolean };
const day = (iso: string) => formatDate(iso.slice(0, 10), { month: "short", day: "numeric", year: "numeric" });

/** Passkeys on this account: add one for this device, or remove one you no longer use. */
export function PasskeysCard({ passkeys }: { passkeys: PasskeyRow[] }) {
  const [supported, setSupported] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setSupported(browserSupportsWebAuthn()), []);

  async function add() {
    setBusy(true); setError(null);
    const r = await createPasskey();
    setError(r.error);
    setBusy(false); // the save action refreshes this page's data
  }
  async function remove(id: string) {
    setBusy(true);
    await removePasskey(id);
    setBusy(false);
  }

  return (
    <section className="card space-y-4" aria-labelledby="passkeys-h">
      <div className="flex flex-wrap items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-seaglass-soft text-primary" aria-hidden><Fingerprint size={18} /></span>
        <div className="min-w-0 flex-1 basis-56">
          <h2 id="passkeys-h" className="h2">Passkeys</h2>
          <p className="text-sm text-muted">Sign in with Face ID, Touch ID or your screen lock. Nothing to remember, and nothing that can be phished.</p>
        </div>
        {supported && <button type="button" className="btn-primary" disabled={busy} aria-busy={busy} onClick={add}>{busy ? "Setting up…" : "Add a passkey"}</button>}
      </div>
      {!supported && <p className="text-sm text-muted">This browser doesn&apos;t support passkeys. Your other sign-in methods still work.</p>}
      {error && <p className="text-sm text-terracotta-ink" role="alert">{error}</p>}
      {passkeys.length > 0 && (
        <ul className="divide-y divide-border">
          {passkeys.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
              <div className="min-w-0 flex-1 basis-48">
                <p className="font-semibold">{k.name}</p>
                <p className="text-xs text-muted">Added {day(k.createdAt)}{k.lastUsedAt ? ` · last used ${day(k.lastUsedAt)}` : ""}{k.backedUp ? " · synced" : ""}</p>
              </div>
              <button type="button" className="btn-ghost px-3 text-xs" disabled={busy} aria-busy={busy} aria-label={`Remove passkey: ${k.name}`} onClick={() => remove(k.id)}>
                <Trash2 size={15} aria-hidden /> Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
