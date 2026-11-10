"use server";

import { redirect } from "next/navigation";
import crypto from "node:crypto";
import { z } from "zod";
import { systemDb } from "@/lib/db";
import {
  clearRateLimit, createSession, isRateLimited, recordRateHit, destroySession, getPendingMfaUser, hashPassword, markSessionVerified, rateLimit, requireUser, sha256, verifyPassword,
} from "@/lib/auth";
import { checkPassword } from "@/lib/passwordPolicy";
import { newRecoveryCodes, newTotpSetup, useRecoveryCode, verifyTotp } from "@/lib/totp";
import { clientIp } from "@/lib/request";
import { isValidTimezone } from "@/lib/dates";
import { logEmailFailure, magicLinksEnabled, sendMagicLinkEmail, sendPasswordChangedEmail, sendPasswordResetEmail } from "@/lib/email";
import { newRecoveryKey, recoveryKeyMatches } from "@/lib/recoveryKey";

export type AuthState = { error?: string; ok?: string; email?: string; name?: string; recoveryKey?: string } | undefined;

const email = z.string().trim().toLowerCase().email("Enter a valid email address.").max(200);
const SAME_MESSAGE = "Email or password is incorrect.";

function signupPolicy() {
  return { open: process.env.ALLOW_SIGNUP?.toLowerCase() !== "false", code: process.env.SIGNUP_CODE?.trim() || null };
}

const safeNext = (n: unknown) => {
  const s = String(n ?? "/");
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : "/";
};

// ------------------------------------------------------------------ sign up --

export async function signUp(_: AuthState, form: FormData): Promise<AuthState> {
  const policy = signupPolicy();
  if (!policy.open) return { error: "New sign-ups are closed on this server." };
  const keep = { email: String(form.get("email") ?? "").slice(0, 200), name: String(form.get("name") ?? "").slice(0, 60) };
  if (!(await rateLimit(`signup:${await clientIp()}`, 10, 3600))) return { error: "Too many sign-ups from this network. Try again later.", ...keep };
  const parsed = z
    .object({ email, password: z.string(), name: z.string().trim().max(60), code: z.string().trim().max(100), timezone: z.string().max(64) })
    .safeParse({ email: form.get("email"), password: form.get("password"), name: form.get("name") ?? "", code: form.get("code") ?? "", timezone: form.get("timezone") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0].message, ...keep };
  const v = parsed.data;
  if (policy.code && v.code !== policy.code) return { error: "That invite code isn't right.", ...keep };
  const weak = await checkPassword(v.password, v.email);
  if (weak) return { error: weak, ...keep };
  const sys = systemDb();
  if (await sys.user.findUnique({ where: { email: v.email }, select: { id: true } })) {
    return { error: "An account with that email already exists. Try signing in.", ...keep };
  }
  const user = await sys.user.create({
    data: {
      email: v.email,
      passwordHash: await hashPassword(v.password),
      settings: { create: { name: v.name, timezone: isValidTimezone(v.timezone) ? v.timezone : "America/New_York" } },
    },
  });
  await createSession(user.id, true);
  redirect("/welcome");
}

// ------------------------------------------------------------------ sign in --

export async function signIn(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = z.object({ email, password: z.string().min(1, "Enter your password.").max(200) }).safeParse({ email: form.get("email"), password: form.get("password") });
  const keepEmail = String(form.get("email") ?? "").slice(0, 200);
  if (!parsed.success) return { error: parsed.error.issues[0].message, email: keepEmail };
  const { email: e, password: pw } = parsed.data;
  const ip = await clientIp();
  // Only failed attempts count, so people sharing a network don't lock each other out.
  if ((await isRateLimited(`login-ip:${ip}`, 30, 900)) || (await isRateLimited(`login:${e}`, 8, 900))) {
    return { error: "Too many attempts. Please wait 15 minutes and try again.", email: e };
  }
  const user = await systemDb().user.findUnique({ where: { email: e } });
  // Constant work whether or not the account exists, and the same message.
  const ok = user ? await verifyPassword(pw, user.passwordHash) : (await verifyPassword(pw, DUMMY_HASH), false);
  if (!user || !ok) {
    await recordRateHit(`login-ip:${ip}`);
    await recordRateHit(`login:${e}`);
    return { error: SAME_MESSAGE, email: e };
  }
  await clearRateLimit(`login:${e}`);
  await createSession(user.id, !user.totpEnabled);
  if (user.totpEnabled) redirect(`/login/verify?next=${encodeURIComponent(safeNext(form.get("next")))}`);
  redirect(safeNext(form.get("next")));
}

const DUMMY_HASH = "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" + Buffer.alloc(64).toString("base64");

export async function verifyMfa(_: AuthState, form: FormData): Promise<AuthState> {
  const pending = await getPendingMfaUser();
  if (!pending) redirect("/login");
  if (!(await rateLimit(`mfa:${pending.id}`, 8, 900))) return { error: "Too many attempts. Please wait 15 minutes." };
  const code = String(form.get("code") ?? "").trim();
  const sys = systemDb();
  const row = await sys.user.findUniqueOrThrow({ where: { id: pending.id } });
  let ok = false;
  if (/^\d{6}$/.test(code.replace(/\s/g, ""))) ok = !!row.totpSecret && (await verifyTotp(row.totpSecret, row.id, code));
  else {
    const remaining = useRecoveryCode(row.recoveryCodes, code);
    if (remaining) {
      await sys.user.update({ where: { id: row.id }, data: { recoveryCodes: JSON.stringify(remaining) } });
      ok = true;
    }
  }
  if (!ok) return { error: "That code didn't work. Check your authenticator app and try again." };
  await markSessionVerified();
  redirect(safeNext(form.get("next")));
}

// --------------------------------------------------------------- magic link --

export async function requestMagicLink(_: AuthState, form: FormData): Promise<AuthState> {
  if (!magicLinksEnabled()) return { error: "Email sign-in links aren't set up on this server." };
  const parsed = email.safeParse(form.get("email"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const e = parsed.data;
  const generic = { ok: "If an account exists for that email, a sign-in link is on its way. It works once, for 15 minutes.", email: e };
  if (!(await rateLimit(`magic:${e}`, 3, 900)) || !(await rateLimit(`magic-ip:${await clientIp()}`, 10, 900))) return generic;
  const sys = systemDb();
  const user = await sys.user.findUnique({ where: { email: e }, select: { id: true } });
  if (user) {
    const token = crypto.randomBytes(32).toString("base64url");
    await sys.magicLink.create({ data: { id: sha256(token), email: e, expiresAt: new Date(Date.now() + 15 * 60_000) } });
    await sendMagicLinkEmail(e, token).catch(logEmailFailure("sign-in link")); // never reveal delivery problems (or account existence)
  }
  return generic;
}

/** Consumed from a button press on /login/magic (not on GET, so link scanners can't use it up). */
export async function consumeMagicLink(_: AuthState, form: FormData): Promise<AuthState> {
  const token = String(form.get("token") ?? "");
  if (!/^[A-Za-z0-9_-]{30,60}$/.test(token)) return { error: "This sign-in link isn't valid. Request a new one." };
  const sys = systemDb();
  const link = await sys.magicLink.findUnique({ where: { id: sha256(token) } });
  if (!link || link.purpose !== "signin" || link.usedAt || link.expiresAt < new Date()) return { error: "This sign-in link has expired or was already used. Request a new one." };
  await sys.magicLink.update({ where: { id: link.id }, data: { usedAt: new Date() } });
  const user = await sys.user.findUnique({ where: { email: link.email } });
  if (!user) return { error: "This sign-in link isn't valid. Request a new one." };
  await createSession(user.id, !user.totpEnabled);
  redirect(user.totpEnabled ? "/login/verify" : "/");
}

// ---------------------------------------------------------- password reset --

const notifyChanged = (to: string) => (magicLinksEnabled() ? sendPasswordChangedEmail(to).catch(logEmailFailure("password-changed notice")) : null);

function newPasswordPair(form: FormData): { pw: string } | { error: string } {
  const pw = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  if (!pw) return { error: "Choose a new password." };
  if (pw.length > 200) return { error: "That password is too long." };
  if (pw !== confirm) return { error: "The two passwords don't match." };
  return { pw };
}

/** Emails a one-time reset link. The answer is the same whether or not the account exists. */
export async function requestPasswordReset(_: AuthState, form: FormData): Promise<AuthState> {
  if (!magicLinksEnabled()) return { error: "Reset by email isn't set up on this server. Use your recovery key instead." };
  const parsed = email.safeParse(form.get("email"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const e = parsed.data;
  const generic = { ok: "If an account exists for that email, a reset link is on its way. It works once, for 30 minutes. Check your spam folder if it doesn't arrive.", email: e };
  if (!(await rateLimit(`reset:${e}`, 3, 3600)) || !(await rateLimit(`reset-ip:${await clientIp()}`, 10, 900))) return generic;
  const sys = systemDb();
  const user = await sys.user.findUnique({ where: { email: e }, select: { id: true } });
  if (user) {
    const token = crypto.randomBytes(32).toString("base64url");
    await sys.magicLink.create({ data: { id: sha256(token), email: e, purpose: "reset", expiresAt: new Date(Date.now() + 30 * 60_000) } });
    await sendPasswordResetEmail(e, token).catch(logEmailFailure("reset link")); // never reveal delivery problems (or account existence)
  }
  return generic;
}

/** Sets a new password from an emailed link. Signs out every device; 2FA is still required at the next sign-in. */
export async function resetPasswordWithLink(_: AuthState, form: FormData): Promise<AuthState> {
  const token = String(form.get("token") ?? "");
  if (!/^[A-Za-z0-9_-]{30,60}$/.test(token)) return { error: "This reset link isn't valid. Request a new one." };
  if (!(await rateLimit(`reset-use-ip:${await clientIp()}`, 20, 900))) return { error: "Too many attempts. Please wait 15 minutes and try again." };
  const pair = newPasswordPair(form);
  if ("error" in pair) return pair;
  const sys = systemDb();
  const link = await sys.magicLink.findUnique({ where: { id: sha256(token) } });
  if (!link || link.purpose !== "reset" || link.usedAt || link.expiresAt < new Date()) return { error: "This reset link has expired or was already used. Request a new one." };
  const user = await sys.user.findUnique({ where: { email: link.email }, select: { id: true, email: true } });
  if (!user) return { error: "This reset link isn't valid. Request a new one." };
  const weak = await checkPassword(pair.pw, user.email);
  if (weak) return { error: weak }; // the link stays usable so they can try another password
  const passwordHash = await hashPassword(pair.pw);
  // All or nothing: the link is used up, the password changes and every device is signed out together.
  const done = await sys.$transaction(async (tx) => {
    const claimed = await tx.magicLink.updateMany({ where: { id: link.id, usedAt: null }, data: { usedAt: new Date() } });
    if (claimed.count !== 1) return false; // a parallel request used it first
    await tx.magicLink.updateMany({ where: { email: user.email, purpose: "reset", usedAt: null }, data: { usedAt: new Date() } });
    await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
    await tx.session.deleteMany({ where: { userId: user.id } });
    return true;
  });
  if (!done) return { error: "This reset link has expired or was already used. Request a new one." };
  await clearRateLimit(`login:${user.email}`);
  await notifyChanged(user.email);
  redirect("/login?reset=1");
}

/** Works without email: email + recovery key + new password. Issues a fresh recovery key. */
export async function resetPasswordWithRecoveryKey(_: AuthState, form: FormData): Promise<AuthState> {
  const keepEmail = String(form.get("email") ?? "").slice(0, 200);
  const parsed = z.object({ email, key: z.string().trim().min(1, "Enter your recovery key.").max(60) }).safeParse({ email: form.get("email"), key: form.get("key") });
  if (!parsed.success) return { error: parsed.error.issues[0].message, email: keepEmail };
  const { email: e, key } = parsed.data;
  const pair = newPasswordPair(form);
  if ("error" in pair) return { ...pair, email: e };
  const ip = await clientIp();
  // Only failed attempts count, like sign-in.
  if ((await isRateLimited(`rk-ip:${ip}`, 20, 3600)) || (await isRateLimited(`rk:${e}`, 5, 3600))) {
    return { error: "Too many attempts. Please wait an hour and try again.", email: e };
  }
  const sys = systemDb();
  const user = await sys.user.findUnique({ where: { email: e }, select: { id: true, email: true, recoveryKeyHash: true } });
  const ok = user ? recoveryKeyMatches(key, user.recoveryKeyHash) : (recoveryKeyMatches(key, null), false);
  if (!user || !ok) {
    await recordRateHit(`rk-ip:${ip}`);
    await recordRateHit(`rk:${e}`);
    return { error: "That email and recovery key don't match.", email: e };
  }
  const weak = await checkPassword(pair.pw, user.email);
  if (weak) return { error: weak, email: e };
  const fresh = newRecoveryKey(); // the old key is used up
  const passwordHash = await hashPassword(pair.pw);
  // Only succeeds if the key is still the one that was checked, so two parallel requests can't both use it.
  const done = await sys.$transaction(async (tx) => {
    const r = await tx.user.updateMany({ where: { id: user.id, recoveryKeyHash: user.recoveryKeyHash }, data: { passwordHash, recoveryKeyHash: fresh.hash, recoveryKeyAt: new Date() } });
    if (r.count !== 1) return false;
    await tx.session.deleteMany({ where: { userId: user.id } });
    return true;
  });
  if (!done) return { error: "That email and recovery key don't match.", email: e };
  await clearRateLimit(`rk:${e}`);
  await clearRateLimit(`login:${e}`);
  await notifyChanged(user.email);
  return { ok: "Your password is reset and other devices were signed out.", recoveryKey: fresh.key, email: e };
}

// ----------------------------------------------------------------- sign out --

export async function signOut() {
  await destroySession();
  redirect("/login?signedout=1");
}

// ------------------------------------------------------------ account (Me) --

export async function changePassword(_: AuthState, form: FormData): Promise<AuthState> {
  const { user } = await requireUser();
  if (!(await rateLimit(`pw:${user.id}`, 5, 900))) return { error: "Too many attempts. Please wait a few minutes." };
  const current = String(form.get("current") ?? "");
  const next = String(form.get("next") ?? "");
  const sys = systemDb();
  const row = await sys.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!(await verifyPassword(current, row.passwordHash))) return { error: "Current password is incorrect." };
  const weak = await checkPassword(next, row.email);
  if (weak) return { error: weak };
  if (next !== String(form.get("confirm") ?? "")) return { error: "The new passwords don't match." };
  await sys.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next) } });
  await sys.session.deleteMany({ where: { userId: user.id } }); // sign out everywhere else
  await createSession(user.id, true);
  await notifyChanged(row.email);
  return { ok: "Password updated. Other devices were signed out." };
}

/** Creates (or replaces) the account recovery key. Needs the current password; the key is shown once. */
export async function createRecoveryKey(_: AuthState, form: FormData): Promise<AuthState> {
  const { user } = await requireUser();
  if (!(await rateLimit(`rk-new:${user.id}`, 5, 900))) return { error: "Too many attempts. Please wait a few minutes." };
  const sys = systemDb();
  const row = await sys.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!(await verifyPassword(String(form.get("password") ?? ""), row.passwordHash))) return { error: "Password is incorrect." };
  const fresh = newRecoveryKey();
  await sys.user.update({ where: { id: user.id }, data: { recoveryKeyHash: fresh.hash, recoveryKeyAt: new Date() } });
  return { ok: "Save this key somewhere safe, like a password manager. It won't be shown again, and any older key no longer works.", recoveryKey: fresh.key };
}

export async function signOutEverywhere() {
  const { user } = await requireUser();
  await systemDb().session.deleteMany({ where: { userId: user.id } });
  await destroySession();
  redirect("/login?signedout=1");
}

/** The only action that asks for explicit confirmation: password + typed email. */
export async function deleteAccount(_: AuthState, form: FormData): Promise<AuthState> {
  const { user } = await requireUser();
  if (!(await rateLimit(`delete:${user.id}`, 5, 900))) return { error: "Too many attempts. Please wait a few minutes." };
  if (String(form.get("confirm") ?? "").trim().toLowerCase() !== user.email) return { error: "Type your email address exactly to confirm." };
  const sys = systemDb();
  const row = await sys.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!(await verifyPassword(String(form.get("password") ?? ""), row.passwordHash))) return { error: "Password is incorrect." };
  await sys.user.delete({ where: { id: user.id } }); // cascades to every row this user owns
  await destroySession();
  redirect("/login?deleted=1");
}

// ------------------------------------------------------------ two-factor ----

export type TotpSetup = { ok: true; qr: string; secret: string } | { ok: false; error: string };

export async function startTotpSetup(): Promise<TotpSetup> {
  const { user } = await requireUser();
  if (user.totpEnabled) return { ok: false, error: "Two-factor is already on." };
  const setup = await newTotpSetup(user.id, user.email);
  await systemDb().user.update({ where: { id: user.id }, data: { totpSecret: setup.encryptedSecret } });
  return { ok: true, qr: setup.qr, secret: setup.secret };
}

export async function confirmTotpSetup(code: string): Promise<{ ok: true; recoveryCodes: string[] } | { ok: false; error: string }> {
  const { user } = await requireUser();
  if (!(await rateLimit(`mfa-setup:${user.id}`, 10, 900))) return { ok: false, error: "Too many attempts. Please wait a few minutes." };
  const sys = systemDb();
  const row = await sys.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!row.totpSecret || !(await verifyTotp(row.totpSecret, user.id, code))) return { ok: false, error: "That code didn't match. Try the newest code from your app." };
  const { codes, hashes } = newRecoveryCodes();
  await sys.user.update({ where: { id: user.id }, data: { totpEnabled: true, recoveryCodes: JSON.stringify(hashes) } });
  await markSessionVerified();
  return { ok: true, recoveryCodes: codes };
}

export async function disableTotp(_: AuthState, form: FormData): Promise<AuthState> {
  const { user } = await requireUser();
  if (!(await rateLimit(`mfa-off:${user.id}`, 5, 900))) return { error: "Too many attempts. Please wait a few minutes." };
  const sys = systemDb();
  const row = await sys.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!(await verifyPassword(String(form.get("password") ?? ""), row.passwordHash))) return { error: "Password is incorrect." };
  await sys.user.update({ where: { id: user.id }, data: { totpEnabled: false, totpSecret: null, recoveryCodes: null } });
  return { ok: "Two-factor authentication is off." };
}
