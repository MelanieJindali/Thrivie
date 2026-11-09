"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { consumeMagicLink, requestMagicLink, requestPasswordReset, resetPasswordWithLink, resetPasswordWithRecoveryKey, signIn, signUp, verifyMfa, type AuthState } from "@/app/authActions";
import { PasswordInput } from "@/components/PasswordInput";
import { RecoveryKeyReveal } from "@/components/RecoveryKeyReveal";

const NEW_PW_HINT = "At least 10 characters. A short phrase like “sea glass at sunrise” is strong and easy to remember.";

function Err({ state }: { state: AuthState }) {
  if (!state?.error) return null;
  return <p className="rounded-2xl bg-terracotta-soft px-4 py-2.5 text-sm text-terracotta-ink" role="alert">{state.error}</p>;
}

export function LoginForm({ next, notice, magic }: { next?: string; notice?: string; magic?: boolean }) {
  const [state, action, pending] = useActionState(signIn, undefined);
  return (
    <form action={action} className="card space-y-4">
      <h2 className="h2 text-xl">Welcome back</h2>
      {notice && <p className="rounded-2xl bg-primary-soft px-4 py-2.5 text-sm text-primary" role="status">{notice}</p>}
      <input type="hidden" name="next" value={next ?? "/"} />
      <label className="block">
        <span className="label">Email</span>
        <input className="input" name="email" type="email" autoComplete="email" inputMode="email" required defaultValue={state?.email} key={state?.email} />
      </label>
      <div className="space-y-1">
        <PasswordInput name="password" label="Password" autoComplete="current-password" />
        <p className="text-right">
          <Link href="/login/forgot" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary">Forgot password?</Link>
        </p>
      </div>
      <Err state={state} />
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
      {magic && <MagicLinkRequest />}
      <p className="text-center text-sm text-muted">
        New here? <Link href="/signup" className="font-semibold text-primary">Create an account</Link>
      </p>
    </form>
  );
}

function MagicLinkRequest() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(requestMagicLink, undefined);
  if (!open) return <button type="button" className="btn-ghost w-full" onClick={() => setOpen(true)}>Email me a sign-in link instead</button>;
  return (
    <div className="space-y-2 rounded-2xl bg-surface-2/60 p-3">
      <label className="block">
        <span className="label">Email for sign-in link</span>
        <input className="input" name="magic-email" type="email" autoComplete="email" form="magic-form" required />
      </label>
      <form id="magic-form" action={(fd) => { fd.set("email", String(fd.get("magic-email") ?? "")); return action(fd); }}>
        <button className="btn-outline w-full" disabled={pending}>{pending ? "Sending…" : "Send link"}</button>
      </form>
      {state?.ok && <p className="text-sm text-sage-ink" role="status">{state.ok}</p>}
      <Err state={state} />
    </div>
  );
}

export function VerifyForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(verifyMfa, undefined);
  return (
    <form action={action} className="card space-y-4">
      <h2 className="h2 text-xl">Two-step verification</h2>
      <p className="text-sm text-muted">Enter the 6-digit code from your authenticator app, or one of your recovery codes.</p>
      <input type="hidden" name="next" value={next ?? "/"} />
      <label className="block">
        <span className="label">Code</span>
        <input className="input text-center font-display text-2xl tracking-[0.3em]" name="code" inputMode="numeric" autoComplete="one-time-code" autoFocus required maxLength={11} />
      </label>
      <Err state={state} />
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Checking…" : "Verify"}</button>
    </form>
  );
}

export function MagicConsume() {
  const [token, setToken] = useState("");
  const [state, action, pending] = useActionState(consumeMagicLink, undefined);
  useEffect(() => {
    const m = window.location.hash.match(/t=([A-Za-z0-9_-]+)/);
    if (m) setToken(m[1]);
    history.replaceState(null, "", window.location.pathname); // remove the token from the address bar
  }, []);
  return (
    <form action={action} className="card space-y-4 text-center">
      <h2 className="h2 text-xl">Sign in to Thrivie</h2>
      <input type="hidden" name="token" value={token} />
      <Err state={state} />
      <button className="btn-primary w-full" disabled={pending || !token}>{pending ? "Signing in…" : "Continue"}</button>
      {!token && <p className="text-sm text-muted">This link is missing its code. <Link className="font-semibold text-primary" href="/login">Back to sign in</Link></p>}
    </form>
  );
}

export function SignupForm({ needsCode, closed }: { needsCode: boolean; closed: boolean }) {
  const [state, action, pending] = useActionState(signUp, undefined);
  const [tz, setTz] = useState("");
  useEffect(() => setTz(Intl.DateTimeFormat().resolvedOptions().timeZone), []);
  if (closed)
    return (
      <div className="card text-center text-sm">
        <p>New sign-ups are closed on this server.</p>
        <Link href="/login" className="btn-soft mt-4">Sign in instead</Link>
      </div>
    );
  return (
    <form action={action} className="card space-y-4">
      <h2 className="h2 text-xl">Create your account</h2>
      <input type="hidden" name="timezone" value={tz} />
      <label className="block">
        <span className="label">First name (optional)</span>
        <input className="input" name="name" autoComplete="given-name" defaultValue={state?.name} key={state?.name} />
      </label>
      <label className="block">
        <span className="label">Email</span>
        <input className="input" name="email" type="email" autoComplete="email" inputMode="email" required defaultValue={state?.email} key={state?.email} />
      </label>
      <PasswordInput name="password" label="Password" autoComplete="new-password" minLength={10} hint={NEW_PW_HINT} />
      {needsCode && (
        <label className="block">
          <span className="label">Invite code</span>
          <input className="input" name="code" autoComplete="off" required />
        </label>
      )}
      <Err state={state} />
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Creating…" : "Create account"}</button>
      <p className="text-center text-xs text-muted">Your entries are private to your account. Nobody else on this server can see them.</p>
      <p className="text-center text-sm text-muted">
        Already have an account? <Link href="/login" className="font-semibold text-primary">Sign in</Link>
      </p>
    </form>
  );
}

// ------------------------------------------------------------ forgot password --

/** /login/forgot: reset by email (when this server can send email) or with a recovery key. */
export function ForgotPassword({ emailReset }: { emailReset: boolean }) {
  const [mode, setMode] = useState<"email" | "key">(emailReset ? "email" : "key");
  return (
    <div className="card space-y-4">
      <div>
        <h2 className="h2 text-xl">Reset your password</h2>
        <p className="mt-1 text-sm text-muted">Your entries stay safe. Only the password changes, and every device is signed out.</p>
      </div>
      {emailReset && (
        <div className="grid grid-cols-2 gap-1 rounded-2xl bg-surface-2/70 p-1" role="tablist" aria-label="How to reset">
          {([["email", "Email me a link"], ["key", "Use recovery key"]] as const).map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={mode === k} aria-controls={`reset-${k}`} id={`tab-${k}`} onClick={() => setMode(k)}
              className={`min-h-11 rounded-xl px-2 text-sm font-semibold ${mode === k ? "bg-surface text-text shadow-sm" : "text-muted"}`}>
              {l}
            </button>
          ))}
        </div>
      )}
      <div id={`reset-${mode}`} role={emailReset ? "tabpanel" : undefined} aria-labelledby={emailReset ? `tab-${mode}` : undefined}>
        {mode === "email" ? <EmailResetRequest /> : <RecoveryKeyReset emailReset={emailReset} />}
      </div>
      <p className="text-center text-sm text-muted">
        Remembered it? <Link href="/login" className="font-semibold text-primary">Back to sign in</Link>
      </p>
    </div>
  );
}

function EmailResetRequest() {
  const [state, action, pending] = useActionState(requestPasswordReset, undefined);
  if (state?.ok) return <p className="rounded-2xl bg-sage-soft px-4 py-3 text-sm text-sage-ink" role="status">{state.ok}</p>;
  return (
    <form action={action} className="space-y-4">
      <label className="block">
        <span className="label">Email</span>
        <input className="input" name="email" type="email" autoComplete="email" inputMode="email" required defaultValue={state?.email} key={state?.email} />
      </label>
      <Err state={state} />
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Sending…" : "Send reset link"}</button>
    </form>
  );
}

function RecoveryKeyReset({ emailReset }: { emailReset: boolean }) {
  const [state, action, pending] = useActionState(resetPasswordWithRecoveryKey, undefined);
  // Controlled, so a typo in the new password doesn't wipe the email and the 20-character key.
  const [em, setEm] = useState("");
  const [key, setKey] = useState("");
  if (state?.recoveryKey)
    return (
      <div className="space-y-4" role="status">
        <p className="rounded-2xl bg-sage-soft px-4 py-3 text-sm text-sage-ink">{state.ok}</p>
        <RecoveryKeyReveal value={state.recoveryKey} intro="Your old recovery key is used up. Here is your new one:" />
        <Link href="/login" className="btn-primary w-full">Sign in with your new password</Link>
      </div>
    );
  return (
    <form action={action} className="space-y-4">
      <p className="text-sm text-muted">
        Use the recovery key you saved from Me → Account.{!emailReset && " This server can't send email, so the key is the way to reset."}
      </p>
      <label className="block">
        <span className="label">Email</span>
        <input className="input" name="email" type="email" autoComplete="email" inputMode="email" required value={em} onChange={(e) => setEm(e.target.value)} />
      </label>
      <label className="block">
        <span className="label">Recovery key</span>
        <input className="input font-mono tracking-wider uppercase" name="key" autoComplete="off" autoCapitalize="characters" spellCheck={false} required placeholder="XXXXX-XXXXX-XXXXX-XXXXX" maxLength={60} value={key} onChange={(e) => setKey(e.target.value)} />
      </label>
      <PasswordInput name="password" label="New password" autoComplete="new-password" minLength={10} hint={NEW_PW_HINT} />
      <PasswordInput name="confirm" label="Confirm new password" autoComplete="new-password" minLength={10} />
      <Err state={state} />
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Resetting…" : "Reset password"}</button>
      <p className="text-xs text-muted">No recovery key and no reset email? Ask whoever runs this Thrivie server to help you get back in.</p>
    </form>
  );
}

/** /login/reset#t=…: choose a new password from an emailed link. */
export function ResetFromLink() {
  const [token, setToken] = useState("");
  const [checked, setChecked] = useState(false);
  const [state, action, pending] = useActionState(resetPasswordWithLink, undefined);
  useEffect(() => {
    const m = window.location.hash.match(/t=([A-Za-z0-9_-]+)/);
    if (m) setToken(m[1]);
    setChecked(true);
    history.replaceState(null, "", window.location.pathname); // remove the token from the address bar
  }, []);
  if (checked && !token)
    return (
      <div className="card space-y-4 text-center">
        <h2 className="h2 text-xl">This link is incomplete</h2>
        <p className="text-sm text-muted">Open the link from the email again, or request a new one.</p>
        <Link href="/login/forgot" className="btn-primary w-full">Request a new link</Link>
      </div>
    );
  return (
    <form action={action} className="card space-y-4">
      <h2 className="h2 text-xl">Choose a new password</h2>
      <input type="hidden" name="token" value={token} />
      <PasswordInput name="password" label="New password" autoComplete="new-password" minLength={10} hint={NEW_PW_HINT} autoFocus />
      <PasswordInput name="confirm" label="Confirm new password" autoComplete="new-password" minLength={10} />
      <Err state={state} />
      {state?.error?.includes("expired") && <Link href="/login/forgot" className="btn-soft w-full">Request a new link</Link>}
      <button className="btn-primary w-full" disabled={pending || !token}>{pending ? "Saving…" : "Save new password"}</button>
    </form>
  );
}
