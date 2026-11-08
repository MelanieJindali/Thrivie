"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { consumeMagicLink, requestMagicLink, signIn, signUp, verifyMfa, type AuthState } from "@/app/authActions";

function Err({ state }: { state: AuthState }) {
  if (!state?.error) return null;
  return <p className="rounded-2xl bg-danger-soft px-4 py-2.5 text-sm text-danger" role="alert">{state.error}</p>;
}

export function LoginForm({ next, notice, magic }: { next?: string; notice?: string; magic?: boolean }) {
  const [state, action, pending] = useActionState(signIn, undefined);
  return (
    <form action={action} className="card space-y-4">
      <h2 className="h2 text-xl">Welcome back</h2>
      {notice && <p className="rounded-2xl bg-primary-soft px-4 py-2.5 text-sm text-primary">{notice}</p>}
      <input type="hidden" name="next" value={next ?? "/"} />
      <label className="block">
        <span className="label">Email</span>
        <input className="input" name="email" type="email" autoComplete="email" inputMode="email" required defaultValue={state?.email} key={state?.email} />
      </label>
      <label className="block">
        <span className="label">Password</span>
        <input className="input" name="password" type="password" autoComplete="current-password" required />
      </label>
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
      <label className="block">
        <span className="label">Password</span>
        <input className="input" name="password" type="password" autoComplete="new-password" minLength={10} required aria-describedby="pw-hint" />
        <span id="pw-hint" className="mt-1 block text-xs text-muted">At least 10 characters. A short phrase like “sea glass at sunrise” is strong and easy to remember.</span>
      </label>
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
