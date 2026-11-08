import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "node:crypto";
import { prisma, scopedDb, type ScopedDb } from "./db";
export { hashPassword, verifyPassword } from "./password";

// Email + password accounts with server-side sessions.
// - Passwords: scrypt (N=2^15) with a per-user random salt.
// - Sessions: a random 256-bit token in an httpOnly cookie; only its SHA-256
//   is stored, so a database leak can't be used to log in.

export const SESSION_COOKIE = "thrivie_session";
const SESSION_DAYS = 60;
export const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export async function createSession(userId: string) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await prisma.session.create({ data: { id: sha256(token), userId, expiresAt } });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { id: sha256(token) } });
  jar.delete(SESSION_COOKIE);
}

export type CurrentUser = { id: string; email: string };

/** The signed-in user for this request (memoized per request), or null. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({ where: { id: sha256(token) }, include: { user: { select: { id: true, email: true } } } });
  if (!session || session.expiresAt < new Date()) return null;
  return session.user;
});

/** For pages and server actions: the signed-in user + their scoped DB, or redirect to /login. */
export const requireUser = cache(async (): Promise<{ user: CurrentUser; db: ScopedDb }> => {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return { user, db: scopedDb(user.id) };
});

/** For API routes: like requireUser but returns null instead of redirecting. */
export async function apiUser(): Promise<{ user: CurrentUser; db: ScopedDb } | null> {
  const user = await getCurrentUser();
  return user ? { user, db: scopedDb(user.id) } : null;
}

// --- brute-force protection ------------------------------------------------

const MAX_FAILS = 8;
const WINDOW_MIN = 15;

export async function tooManyAttempts(email: string): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MIN * 60_000);
  return (await prisma.loginAttempt.count({ where: { key: email, createdAt: { gte: since } } })) >= MAX_FAILS;
}

export async function recordFailedAttempt(email: string) {
  await prisma.loginAttempt.create({ data: { key: email } });
  // opportunistic cleanup
  if (Math.random() < 0.05) await prisma.loginAttempt.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 86_400_000) } } });
}

export async function clearAttempts(email: string) {
  await prisma.loginAttempt.deleteMany({ where: { key: email } });
}
