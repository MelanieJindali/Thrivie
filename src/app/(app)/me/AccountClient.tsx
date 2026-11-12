"use client";

import { useActionState, useState } from "react";
import { KeyRound } from "lucide-react";
import { changePassword, createRecoveryKey, deleteAccount, signOut, signOutEverywhere } from "@/app/authActions";
import { clearDeviceData } from "@/components/OfflineSync";
import { PasswordInput } from "@/components/PasswordInput";
import { RecoveryKeyReveal } from "@/components/RecoveryKeyReveal";
import { formatDate } from "@/lib/dates";

export function AccountSection({ email, hasPassword, recoveryKeyAt }: { email: string; hasPassword: boolean; recoveryKeyAt: string | null }) {
  const [pwState, pwAction, pwPending] = useActionState(changePassword, undefined);
  const [delState, delAction, delPending] = useActionState(deleteAccount, undefined);
  return (
    <section className="card space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="h2">Account</h2>
          <p className="text-sm text-muted">Signed in as <b className="text-text">{email}</b></p>
        </div>
        <div className="flex flex-wrap gap-2"><form action={signOut} onSubmit={() => { void clearDeviceData(); }}><button className="btn-soft">Sign out</button></form><form action={signOutEverywhere} onSubmit={() => { void clearDeviceData(); }}><button className="btn-outline">Sign out everywhere</button></form></div>
      </div>

      <form action={pwAction} className="space-y-3" aria-labelledby="chpw-h">
        <h3 id="chpw-h" className="font-bold">{hasPassword ? "Change password" : "Set a password"}</h3>
        {!hasPassword && <p className="text-sm text-muted">Your account has no password; you sign in with a passkey or an emailed code. A password is optional, and is needed to create a recovery key or delete the account.</p>}
        <div className="grid gap-3 sm:grid-cols-3">
          {hasPassword && <PasswordInput name="current" label="Current password" autoComplete="current-password" />}
          <PasswordInput name="next" label="New password" autoComplete="new-password" minLength={10} hint="10+ characters" />
          <PasswordInput name="confirm" label="Confirm new password" autoComplete="new-password" minLength={10} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-primary" disabled={pwPending}>{pwPending ? "Saving…" : hasPassword ? "Update password" : "Set password"}</button>
          {pwState?.error && <p className="text-sm text-terracotta-ink" role="alert">{pwState.error}</p>}
          {pwState?.ok && <p className="text-sm text-primary" role="status">{pwState.ok}</p>}
        </div>
      </form>

      <RecoveryKeyCard createdAt={recoveryKeyAt} />

      <form action={delAction} onSubmit={() => { void clearDeviceData(); }} className="space-y-2 rounded-2xl bg-terracotta-soft/60 p-4">
        <span className="label text-terracotta-ink">Delete account</span>
        <p className="text-sm text-muted">Permanently deletes your account and <b>all</b> of its data from this server. This can&apos;t be undone.</p>
        <div className="flex flex-wrap gap-2">
          <input className="input max-w-xs bg-surface" name="confirm" placeholder={`Type ${email} to confirm`} aria-label="Type your email to confirm" autoComplete="off" />
          <input className="input max-w-xs bg-surface" type="password" name="password" placeholder="Your password" aria-label="Your password" autoComplete="current-password" />
          <button className="btn-danger" disabled={delPending}>Delete my account</button>
        </div>
        {delState?.error && <p className="text-sm text-terracotta-ink">{delState.error}</p>}
      </form>
    </section>
  );
}

/** Recovery key: lets you reset a forgotten password without email. */
function RecoveryKeyCard({ createdAt }: { createdAt: string | null }) {
  const [state, action, pending] = useActionState(createRecoveryKey, undefined);
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-3 rounded-2xl bg-surface-2/50 p-4" aria-labelledby="rk-h">
      <div className="flex flex-wrap items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-seaglass-soft text-primary" aria-hidden><KeyRound size={17} /></span>
        <div className="min-w-0 flex-1 basis-56">
          <h3 id="rk-h" className="font-bold">Recovery key</h3>
          <p className="text-sm text-muted">
            {state?.recoveryKey ? "New key created." : createdAt ? `Created ${formatDate(createdAt.slice(0, 10), { month: "short", day: "numeric", year: "numeric" })}. Lost it? Make a new one; the old one stops working.` : "Not set up. If you forget your password, this key lets you reset it, even without email."}
          </p>
        </div>
        {!open && !state?.recoveryKey && (
          <button type="button" className={createdAt ? "btn-outline" : "btn-primary"} onClick={() => setOpen(true)}>{createdAt ? "Replace key" : "Create recovery key"}</button>
        )}
      </div>
      {state?.recoveryKey ? (
        <>
          <RecoveryKeyReveal value={state.recoveryKey} />
          <p className="text-sm text-muted" role="status">{state.ok}</p>
        </>
      ) : open && (
        <form action={action} className="flex flex-wrap items-end gap-2">
          <PasswordInput name="password" label="Confirm with your password" autoComplete="current-password" className="min-w-0 flex-1 basis-60" autoFocus />
          <button className="btn-primary" disabled={pending}>{pending ? "Creating…" : "Show my key"}</button>
          <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
          {state?.error && <p className="basis-full text-sm text-terracotta-ink" role="alert">{state.error}</p>}
        </form>
      )}
    </div>
  );
}
