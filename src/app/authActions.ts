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
import { magicLinksEnabled, sendMagicLinkEmail } from "@/lib/email";

export type AuthState = { error?: string; ok?: string; email?: string; name?: string } | undefined;

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
    await sendMagicLinkEmail(e, token).catch(() => null); // never reveal delivery problems (or account existence)
  }
  return generic;
}

/** Consumed from a button press on /login/magic (not on GET, so link scanners can't use it up). */
export async function consumeMagicLink(_: AuthState, form: FormData): Promise<AuthState> {
  const token = String(form.get("token") ?? "");
  if (!/^[A-Za-z0-9_-]{30,60}$/.test(token)) return { error: "This sign-in link isn't valid. Request a new one." };
  const sys = systemDb();
  const link = await sys.magicLink.findUnique({ where: { id: sha256(token) } });
  if (!link || link.usedAt || link.expiresAt < new Date()) return { error: "This sign-in link has expired or was already used. Request a new one." };
  await sys.magicLink.update({ where: { id: link.id }, data: { usedAt: new Date() } });
  const user = await sys.user.findUnique({ where: { email: link.email } });
  if (!user) return { error: "This sign-in link isn't valid. Request a new one." };
  await createSession(user.id, !user.totpEnabled);
  redirect(user.totpEnabled ? "/login/verify" : "/");
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
  await sys.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next) } });
  await sys.session.deleteMany({ where: { userId: user.id } }); // sign out everywhere else
  await createSession(user.id, true);
  return { ok: "Password updated. Other devices were signed out." };
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
