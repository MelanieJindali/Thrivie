import "server-only";
import crypto from "node:crypto";

const COMMON = new Set([
  "password", "password1", "password123", "123456789", "1234567890", "qwertyuiop", "iloveyou", "letmein123", "welcome123",
  "thrivie123", "abc123456", "11111111", "12345678", "passw0rd", "qwerty123", "football", "sunshine1", "princess1",
]);

/**
 * Strong-password check. Length first (most important), then obvious
 * patterns, then the Have I Been Pwned range API using k-anonymity: only the
 * first 5 characters of the password's SHA-1 hash are sent, never the password.
 */
export async function checkPassword(password: string, email: string): Promise<string | null> {
  if (password.length < 10) return "Use at least 10 characters. A short phrase works well.";
  if (password.length > 200) return "That password is too long.";
  const lower = password.toLowerCase();
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  if (local.length >= 4 && lower.includes(local)) return "Don't include your email name in your password.";
  if (COMMON.has(lower) || /^(.)\1+$/.test(password)) return "That password is too easy to guess.";
  if (await isBreached(password)) return "That password has appeared in a data breach. Please choose a different one.";
  return null;
}

async function isBreached(password: string): Promise<boolean> {
  if (process.env.HIBP_CHECK === "off") return false;
  const hash = crypto.createHash("sha1").update(password).digest("hex").toUpperCase();
  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`, {
      headers: { "Add-Padding": "true" },
      signal: AbortSignal.timeout(2500),
      cache: "no-store",
    });
    if (!res.ok) return false;
    const suffix = hash.slice(5);
    // Each line is "SUFFIX:COUNT". Padding entries have a count of 0.
    return (await res.text()).split("\n").some((line) => {
      const [s, n] = line.trim().split(":");
      return s === suffix && Number(n) > 0;
    });
  } catch {
    return false; // network problems never block sign-up
  }
}
