import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "node:crypto";
import { scopedDb, systemDb, type ScopedDb } from "./db";
export { hashPassword, verifyPassword } from "./password";

// Email + password (and optional magic link) accounts with server-side sessions.
// - Sessions: random 256-bit token in an httpOnly, Secure, SameSite=Lax cookie
//   ("__Host-" prefixed in production). Only its SHA-256 is stored.
// - Two-factor (TOTP): a session stays "pending" until the code is verified.
// - Rate limits are keyed by hashes, so emails/IPs aren't stored in clear text.

const PROD = process.env.NODE_ENV === "production";
export const SESSION_COOKIE = PROD ? "__Host-thrivie" : "thrivie_session";
const SESSION_DAYS = 30;

export const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export async function createSession(userId: string, mfaVerified: boolean) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  const sys = systemDb();
  await sys.session.create({ data: { id: sha256(token), userId, expiresAt, mfaVerified } });
  // Opportunistic cleanup of this user's expired sessions.
  await sys.session.deleteMany({ where: { userId, expiresAt: { lt: new Date() } } });
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, secure: PROD, sameSite: "lax", path: "/", expires: expiresAt });
}

async function currentSessionRow() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const s = await systemDb().session.findUnique({
    where: { id: sha256(token) },
    include: { user: { select: { id: true, email: true, totpEnabled: true } } },
  });
  if (!s || s.expiresAt < new Date()) return null;
  return s;
}

export async function markSessionVerified() {
  const s = await currentSessionRow();
  if (s) await systemDb().session.update({ where: { id: s.id }, data: { mfaVerified: true } });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await systemDb().session.deleteMany({ where: { id: sha256(token) } });
  jar.delete(SESSION_COOKIE);
}

export type CurrentUser = { id: string; email: string; totpEnabled: boolean };

/** Signed in AND past 2FA (memoized per request). */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const s = await currentSessionRow();
  if (!s) return null;
  if (s.user.totpEnabled && !s.mfaVerified) return null;
  return s.user;
});

/** Password was correct but the 2FA code is still needed. */
export const getPendingMfaUser = cache(async (): Promise<CurrentUser | null> => {
  const s = await currentSessionRow();
  return s && s.user.totpEnabled && !s.mfaVerified ? s.user : null;
});

/** Pages and server actions: the signed-in user + their scoped DB, or redirect. */
export const requireUser = cache(async (): Promise<{ user: CurrentUser; db: ScopedDb }> => {
  const user = await getCurrentUser();
  if (!user) {
    if (await getPendingMfaUser()) redirect("/login/verify");
    redirect("/login");
  }
  return { user, db: scopedDb(user.id) };
});

/** API routes: like requireUser but returns null instead of redirecting. */
export async function apiUser(): Promise<{ user: CurrentUser; db: ScopedDb } | null> {
  const user = await getCurrentUser();
  return user ? { user, db: scopedDb(user.id) } : null;
}

// --- rate limiting -----------------------------------------------------------

/**
 * Sliding-window limiter backed by the database (works across serverless
 * instances). Returns false when the limit is reached; otherwise records a hit.
 */
export async function rateLimit(key: string, max: number, windowSec: number): Promise<boolean> {
  const k = sha256(`rl:${key}`);
  const sys = systemDb();
  const since = new Date(Date.now() - windowSec * 1000);
  if ((await sys.rateEvent.count({ where: { key: k, createdAt: { gte: since } } })) >= max) return false;
  await sys.rateEvent.create({ data: { key: k } });
  if (Math.random() < 0.02) await sys.rateEvent.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 86_400_000) } } });
  return true;
}

/** Check a limit without recording a hit (e.g. only failed sign-ins should count). */
export async function isRateLimited(key: string, max: number, windowSec: number): Promise<boolean> {
  const since = new Date(Date.now() - windowSec * 1000);
  return (await systemDb().rateEvent.count({ where: { key: sha256(`rl:${key}`), createdAt: { gte: since } } })) >= max;
}

export async function recordRateHit(key: string) {
  await systemDb().rateEvent.create({ data: { key: sha256(`rl:${key}`) } });
}

export async function clearRateLimit(key: string) {
  await systemDb().rateEvent.deleteMany({ where: { key: sha256(`rl:${key}`) } });
}
