import "server-only";

// Transactional email via Resend (free tier: 3,000 emails/month).
// Email features (sign-in codes, reset links, notices) are only offered when
// RESEND_API_KEY, EMAIL_FROM and APP_URL are set.

export function emailEnabled(): boolean {
  return !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM && process.env.APP_URL);
}

const base = () => process.env.APP_URL!.replace(/\/$/, "");
const esc = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

async function send(to: string, subject: string, lines: string[], link?: { href: string; label: string }) {
  const text = [...lines, ...(link ? ["", link.href] : [])].join("\n");
  const html =
    lines.map((l) => (l ? `<p>${esc(l)}</p>` : "")).join("") +
    (link ? `<p><a href="${esc(link.href)}">${esc(link.label)}</a></p>` : "");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to, subject, text, html }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { name?: string; message?: string };
    throw new EmailError(res.status, body.name ?? "unknown", body.message ?? "");
  }
}

class EmailError extends Error {
  constructor(readonly status: number, readonly reason: string, readonly detail: string) {
    super(`email failed (${status})`);
  }
}

/**
 * Records why an email couldn't be sent, for the server logs only. The person using the app
 * still sees the same message either way, so nothing reveals whether an account exists.
 * Email addresses are blanked out; the recipient is never logged.
 */
export function logEmailFailure(kind: "sign-in code" | "reset link" | "password-changed notice") {
  return (e: unknown) => {
    const scrub = (t: string) => t.replace(/[^\s@<>"']+@[^\s@<>"']+/g, "[email]").slice(0, 300);
    if (e instanceof EmailError) console.error(`[email] ${kind} not sent: HTTP ${e.status} ${e.reason}: ${scrub(e.detail)}`);
    else console.error(`[email] ${kind} not sent: ${e instanceof Error ? scrub(e.name + " " + e.message) : "unknown error"}`);
    return null;
  };
}

export async function sendSignInCodeEmail(to: string, code: string) {
  await send(to, "Your Thrivie sign-in code", [
    `Your Thrivie sign-in code is ${code}`,
    "It works once and expires in 10 minutes. If you didn't ask for it, you can ignore this email; nobody can sign in without it.",
  ]);
}

// Reset tokens go in the URL fragment, which browsers never send to servers,
// so they can't end up in request logs.
export async function sendPasswordResetEmail(to: string, token: string) {
  await send(to, "Reset your Thrivie password", [
    "Someone (hopefully you) asked to reset the password for this Thrivie account.",
    "The link works once and expires in 30 minutes. If you didn't ask for it, you can ignore this email; your password won't change.",
  ], { href: `${base()}/login/reset#t=${token}`, label: "Choose a new password" });
}

/** Security notice after a password change or reset. Contains no personal data beyond the address it's sent to. */
export async function sendPasswordChangedEmail(to: string) {
  await send(to, "Your Thrivie password was changed", [
    "The password for your Thrivie account was just changed, and other devices were signed out.",
    "If this wasn't you, reset your password right away from the sign-in page.",
  ]);
}
