"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  clearAttempts, createSession, destroySession, hashPassword, recordFailedAttempt, requireUser, tooManyAttempts, verifyPassword,
} from "@/lib/auth";
import { isValidTimezone } from "@/lib/dates";

export type AuthState = { error?: string; ok?: string } | undefined;

const email = z.string().trim().toLowerCase().email("Enter a valid email address.").max(200);
const password = z.string().min(8, "Use at least 8 characters.").max(200);

/** Sign-ups can be closed (ALLOW_SIGNUP=false) or invite-only (SIGNUP_CODE=…). */
function signupPolicy() {
  return {
    open: process.env.ALLOW_SIGNUP?.toLowerCase() !== "false",
    code: process.env.SIGNUP_CODE?.trim() || null,
  };
}

export async function signUp(_: AuthState, form: FormData): Promise<AuthState> {
  const policy = signupPolicy();
  if (!policy.open) return { error: "New sign-ups are closed on this server." };
  const parsed = z
    .object({ email, password, name: z.string().trim().max(60), code: z.string().trim(), timezone: z.string() })
    .safeParse({
      email: form.get("email"),
      password: form.get("password"),
      name: form.get("name") ?? "",
      code: form.get("code") ?? "",
      timezone: form.get("timezone") ?? "",
    });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;
  if (policy.code && v.code !== policy.code) return { error: "That invite code isn't right." };
  if (await prisma.user.findUnique({ where: { email: v.email } })) {
    return { error: "An account with that email already exists. Try signing in." };
  }
  const user = await prisma.user.create({
    data: {
      email: v.email,
      passwordHash: await hashPassword(v.password),
      settings: { create: { name: v.name, timezone: isValidTimezone(v.timezone) ? v.timezone : "America/New_York" } },
    },
  });
  await createSession(user.id);
  redirect("/welcome");
}

export async function signIn(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = z.object({ email, password: z.string().min(1, "Enter your password.") }).safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { email: e, password: pw } = parsed.data;
  if (await tooManyAttempts(e)) return { error: "Too many attempts. Please wait 15 minutes and try again." };
  const user = await prisma.user.findUnique({ where: { email: e } });
  // Same message whether the email exists or not.
  if (!user || !(await verifyPassword(pw, user.passwordHash))) {
    await recordFailedAttempt(e);
    return { error: "Email or password is incorrect." };
  }
  await clearAttempts(e);
  await createSession(user.id);
  const next = String(form.get("next") ?? "/");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function signOut() {
  await destroySession();
  redirect("/login");
}

export async function changePassword(_: AuthState, form: FormData): Promise<AuthState> {
  const { user } = await requireUser();
  const parsed = z.object({ current: z.string().min(1, "Enter your current password."), next: password }).safeParse({ current: form.get("current"), next: form.get("next") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!(await verifyPassword(parsed.data.current, row.passwordHash))) return { error: "Current password is incorrect." };
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(parsed.data.next) } });
  // sign out every other device
  await prisma.session.deleteMany({ where: { userId: user.id } });
  await createSession(user.id);
  return { ok: "Password updated. Other devices were signed out." };
}

export async function deleteAccount(_: AuthState, form: FormData): Promise<AuthState> {
  const { user } = await requireUser();
  if (String(form.get("confirm") ?? "") !== user.email) return { error: "Type your email address exactly to confirm." };
  await prisma.user.delete({ where: { id: user.id } }); // cascades to every row this user owns
  await destroySession();
  redirect("/login?deleted=1");
}
