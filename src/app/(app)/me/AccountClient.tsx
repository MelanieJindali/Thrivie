"use client";

import { useActionState } from "react";
import { changePassword, deleteAccount, signOut, signOutEverywhere } from "@/app/authActions";
import { clearDeviceData } from "@/components/OfflineSync";

export function AccountSection({ email }: { email: string }) {
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

      <form action={pwAction} className="space-y-2">
        <span className="label">Change password</span>
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <input className="input" type="password" name="current" placeholder="Current password" autoComplete="current-password" aria-label="Current password" />
          <input className="input" type="password" name="next" placeholder="New password (10+ characters)" autoComplete="new-password" aria-label="New password" />
          <button className="btn-primary" disabled={pwPending}>Update</button>
        </div>
        {pwState?.error && <p className="text-sm text-danger">{pwState.error}</p>}
        {pwState?.ok && <p className="text-sm text-primary">{pwState.ok}</p>}
      </form>

      <form action={delAction} onSubmit={() => { void clearDeviceData(); }} className="space-y-2 rounded-2xl bg-danger-soft/60 p-4">
        <span className="label text-danger">Delete account</span>
        <p className="text-sm text-muted">Permanently deletes your account and <b>all</b> of its data from this server. This can&apos;t be undone.</p>
        <div className="flex flex-wrap gap-2">
          <input className="input max-w-xs bg-surface" name="confirm" placeholder={`Type ${email} to confirm`} aria-label="Type your email to confirm" autoComplete="off" />
          <input className="input max-w-xs bg-surface" type="password" name="password" placeholder="Your password" aria-label="Your password" autoComplete="current-password" />
          <button className="btn-danger" disabled={delPending}>Delete my account</button>
        </div>
        {delState?.error && <p className="text-sm text-danger">{delState.error}</p>}
      </form>
    </section>
  );
}
