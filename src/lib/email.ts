import "server-only";

// Transactional email via Resend (free tier: 3,000 emails/month).
// Magic links are only offered when RESEND_API_KEY, EMAIL_FROM and APP_URL are set.

export function magicLinksEnabled(): boolean {
  return !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM && process.env.APP_URL);
}

export async function sendMagicLinkEmail(to: string, token: string) {
  const base = process.env.APP_URL!.replace(/\/$/, "");
  // The token goes in the URL fragment, which browsers never send to servers,
  // so it can't end up in request logs.
  const link = `${base}/login/magic#t=${token}`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to,
      subject: "Your Thrivie sign-in link",
      text: `Tap to sign in to Thrivie:\n\n${link}\n\nThis link works once and expires in 15 minutes. If you didn't ask for it, you can ignore this email.`,
      html: `<p>Tap to sign in to Thrivie:</p><p><a href="${link}">Sign in to Thrivie</a></p><p style="color:#6F6250">This link works once and expires in 15 minutes. If you didn't ask for it, you can ignore this email.</p>`,
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`email failed (${res.status})`);
}
