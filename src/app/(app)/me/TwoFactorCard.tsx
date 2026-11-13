"use client";

import { useActionState, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { confirmTotpSetup, disableTotp, startTotpSetup } from "@/app/authActions";

export function TwoFactorCard({ enabled }: { enabled: boolean }) {
  const [setup, setSetup] = useState<{ qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [offState, offAction, offPending] = useActionState(disableTotp, undefined);

  async function start() {
    setBusy(true);
    setError(null);
    const r = await startTotpSetup();
    setBusy(false);
    if (r.ok) setSetup({ qr: r.qr, secret: r.secret });
    else setError(r.error);
  }
  async function confirm() {
    setBusy(true);
    setError(null);
    const r = await confirmTotpSetup(code);
    setBusy(false);
    if (r.ok) {
      setCodes(r.recoveryCodes);
      setSetup(null);
    } else setError(r.error);
  }

  return (
    <section className="card space-y-3" aria-labelledby="tfa">
      <h2 id="tfa" className="h2 flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-seaglass-soft text-primary" aria-hidden><ShieldCheck size={16} /></span>
        Two-step verification
      </h2>
      {codes ? (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-sage-ink" role="status">Two-step verification is on.</p>
          <p className="text-sm">Save these recovery codes somewhere safe. Each works once if you lose your phone. They won&apos;t be shown again.</p>
          <ul className="grid grid-cols-2 gap-2 rounded-2xl bg-surface-2 p-3 font-mono text-sm">{codes.map((c) => <li key={c}>{c}</li>)}</ul>
        </div>
      ) : enabled ? (
        <form action={offAction} className="space-y-2">
          <p className="text-sm text-sage-ink">On. You&apos;ll enter a code from your authenticator app when you sign in.</p>
          <div className="flex flex-wrap gap-2">
            <input className="input max-w-xs" type="password" name="password" placeholder="Your password" autoComplete="current-password" aria-label="Password to turn off two-step verification" />
            <button className="btn-outline" disabled={offPending}>Turn off</button>
          </div>
          {offState?.error && <p className="text-sm text-terracotta-ink" role="alert">{offState.error}</p>}
          {offState?.ok && <p className="text-sm text-sage-ink" role="status">{offState.ok}</p>}
        </form>
      ) : setup ? (
        <div className="space-y-3">
          <p className="text-sm">Scan this with an authenticator app (Apple Passwords, Google Authenticator, 1Password…), then enter the 6-digit code.</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={setup.qr} alt="QR code for your authenticator app" width={180} height={180} className="rounded-2xl bg-white p-2" />
          <p className="text-xs text-muted">Can&apos;t scan? Enter this key: <code className="break-all">{setup.secret}</code></p>
          <div className="flex flex-wrap gap-2">
            <input className="input max-w-40 text-center tracking-[0.3em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} aria-label="6-digit code" />
            <button className="btn-primary" disabled={busy || code.length !== 6} aria-busy={busy} onClick={confirm}>Turn on</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">Add a code from your phone when you sign in, for extra protection.</p>
          <button className="btn-soft" disabled={busy} aria-busy={busy} onClick={start}>Set up</button>
        </div>
      )}
      {error && <p className="text-sm text-terracotta-ink" role="alert">{error}</p>}
    </section>
  );
}
