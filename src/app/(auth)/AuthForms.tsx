"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { signIn, signUp, type AuthState } from "@/app/authActions";

function Err({ state }: { state: AuthState }) {
  if (!state?.error) return null;
  return <p className="rounded-2xl bg-danger-soft px-4 py-2.5 text-sm text-danger" role="alert">{state.error}</p>;
}

export function LoginForm({ next, notice }: { next?: string; notice?: string }) {
  const [state, action, pending] = useActionState(signIn, undefined);
  return (
    <form action={action} className="card space-y-4">
      <h2 className="h2 text-xl">Welcome back</h2>
      {notice && <p className="rounded-2xl bg-primary-soft px-4 py-2.5 text-sm text-primary">{notice}</p>}
      <input type="hidden" name="next" value={next ?? "/"} />
      <label className="block">
        <span className="label">Email</span>
        <input className="input" name="email" type="email" autoComplete="email" inputMode="email" required />
      </label>
      <label className="block">
        <span className="label">Password</span>
        <input className="input" name="password" type="password" autoComplete="current-password" required />
      </label>
      <Err state={state} />
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
      <p className="text-center text-sm text-muted">
        New here? <Link href="/signup" className="font-semibold text-primary">Create an account</Link>
      </p>
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
        <input className="input" name="name" autoComplete="given-name" />
      </label>
      <label className="block">
        <span className="label">Email</span>
        <input className="input" name="email" type="email" autoComplete="email" inputMode="email" required />
      </label>
      <label className="block">
        <span className="label">Password</span>
        <input className="input" name="password" type="password" autoComplete="new-password" minLength={8} required />
        <span className="mt-1 block text-xs text-muted">At least 8 characters.</span>
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
