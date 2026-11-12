"use client";

import { useEffect, useRef, useState } from "react";
import { Fingerprint, X } from "lucide-react";
import { browserSupportsWebAuthn, browserSupportsWebAuthnAutofill, platformAuthenticatorIsAvailable, startAuthentication, startRegistration, WebAuthnAbortService } from "@simplewebauthn/browser";
import { dismissTip } from "@/app/actions";
import { useToast } from "./Toast";
import { passkeyLoginFinish, passkeyLoginStart, passkeyRegisterFinish, passkeyRegisterStart } from "@/app/authActions";

/** The person closed the Face ID / Touch ID sheet, or the autofill request was replaced: not an error. */
const cancelled = (e: unknown) => e instanceof Error && ["NotAllowedError", "AbortError"].includes(e.name);

/** A friendly default name for a new passkey, from the device it's created on. */
function deviceName(): string {
  const ua = navigator.userAgent;
  return /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android phone" : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows PC" : "This device";
}

/**
 * Passkey sign-in: a button, plus the browser's own autofill suggestion on the email field
 * (the field must carry autocomplete="username webauthn"). Renders nothing where passkeys aren't supported.
 */
export function PasskeySignIn({ next }: { next?: string }) {
  const [supported, setSupported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autofillStarted = useRef(false);

  async function signIn(autofill: boolean) {
    if (!autofill) { setBusy(true); setError(null); }
    try {
      const start = await passkeyLoginStart();
      if (!start.ok) { if (!autofill) setError(start.error); return; }
      const response = await startAuthentication({ optionsJSON: start.options, useBrowserAutofill: autofill });
      setBusy(true);
      const done = await passkeyLoginFinish(response, next);
      if (done.ok) { window.location.assign(done.redirectTo); return; }
      setError(done.error);
    } catch (e) {
      // The autofill request runs in the background, unasked: it must stay silent whatever happens
      // (no passkey hardware, replaced by a button press) and never disturb the button's state.
      if (autofill) return;
      if (cancelled(e)) { setBusy(false); return; }
      setError(e instanceof Error && e.name === "NotSupportedError" ? "This device or browser can't use passkeys here. Sign in another way." : "Passkey sign-in didn't complete. Try again, or sign in another way.");
    }
    setBusy(false);
  }

  useEffect(() => {
    if (!browserSupportsWebAuthn()) return;
    setSupported(true);
    // Offer saved passkeys in the email field's autofill, where the browser supports it.
    void browserSupportsWebAuthnAutofill().then((ok) => {
      if (ok && !autofillStarted.current) { autofillStarted.current = true; void signIn(true); }
    });
    return () => WebAuthnAbortService.cancelCeremony();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!supported) return null;
  return (
    <div className="space-y-2">
      <button type="button" className="btn-primary w-full" disabled={busy} onClick={() => signIn(false)}>
        <Fingerprint size={18} aria-hidden /> {busy ? "Signing in…" : "Sign in with Face ID, Touch ID or passkey"}
      </button>
      {error && <p className="rounded-2xl bg-terracotta-soft px-4 py-2.5 text-sm text-terracotta-ink" role="alert">{error}</p>}
    </div>
  );
}

/** Creates a passkey for the signed-in account. Returns an error message, or null on success or cancel. */
export async function createPasskey(): Promise<{ created: boolean; error: string | null }> {
  try {
    const start = await passkeyRegisterStart();
    if (!start.ok) return { created: false, error: start.error };
    const response = await startRegistration({ optionsJSON: start.options });
    const done = await passkeyRegisterFinish(response, deviceName());
    return done.ok ? { created: true, error: null } : { created: false, error: done.error };
  } catch (e) {
    if (cancelled(e)) return { created: false, error: null };
    if (e instanceof Error && e.name === "InvalidStateError") return { created: false, error: "This device already has a passkey for your account." };
    return { created: false, error: "Couldn't set up a passkey on this device. You can keep signing in as before." };
  }
}

/**
 * Shown after a password sign-in on a device that can do Face ID / Touch ID, to accounts
 * with no passkey yet. One tap sets it up; dismissing it hides it for good.
 */
export function PasskeyUpgradeBanner() {
  const [state, setState] = useState<"hidden" | "offer" | "busy">("hidden");
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (browserSupportsWebAuthn()) void platformAuthenticatorIsAvailable().then((ok) => ok && setState("offer"));
  }, []);
  if (state === "hidden") return null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-seaglass-soft px-4 py-3 text-sm" role="region" aria-label="Faster sign-in">
      <Fingerprint size={20} className="shrink-0 text-primary" aria-hidden />
      <p className="min-w-0 flex-1 basis-56">
        Upgrade to instant Face ID / Touch ID login for faster access.
        {error && <span className="mt-1 block text-terracotta-ink" role="alert">{error}</span>}
      </p>
      <button type="button" className="btn-primary" disabled={state === "busy"}
        onClick={async () => {
          setState("busy"); setError(null);
          const r = await createPasskey();
          // The page refreshes once the passkey exists and this banner goes away, so confirm with a toast.
          if (r.created) { setState("hidden"); void dismissTip("passkey"); toast({ message: "You're set. Next time, sign in with Face ID or Touch ID. Your password still works too." }); } else { setError(r.error); setState("offer"); }
        }}>
        {state === "busy" ? "Setting up…" : "Set up now"}
      </button>
      <button type="button" className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-muted hover:text-text" aria-label="Not now: hide this suggestion"
        onClick={() => { setState("hidden"); void dismissTip("passkey"); }}>
        <X size={18} aria-hidden />
      </button>
    </div>
  );
}
