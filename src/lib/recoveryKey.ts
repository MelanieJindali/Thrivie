import crypto from "node:crypto";

// Account recovery keys: 20 random characters (100 bits) shown once as
// XXXXX-XXXXX-XXXXX-XXXXX. Only a SHA-256 hash is stored; the key is high-entropy,
// so a fast hash is safe here (unlike passwords, which use scrypt).

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32: no I, L, O, U

export function newRecoveryKey(): { key: string; hash: string } {
  const bytes = crypto.randomBytes(20);
  const chars = Array.from(bytes, (b) => ALPHABET[b & 31]).join("");
  const key = chars.match(/.{5}/g)!.join("-");
  return { key, hash: hashRecoveryKey(key) };
}

/** Accepts the key as typed: any case, with or without dashes or spaces, O/I/L for 0/1/1. */
export function normalizeRecoveryKey(input: string): string | null {
  const s = input.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  return /^[0-9A-HJKMNP-TV-Z]{20}$/.test(s) ? s : null;
}

export function hashRecoveryKey(key: string): string {
  const n = normalizeRecoveryKey(key) ?? "";
  return crypto.createHash("sha256").update(`thrivie-recovery:${n}`).digest("hex");
}

/** Constant-time comparison against the stored hash. */
export function recoveryKeyMatches(input: string, storedHash: string | null): boolean {
  const n = normalizeRecoveryKey(input);
  const a = Buffer.from(n ? hashRecoveryKey(n) : "0".repeat(64), "hex");
  const b = Buffer.from(storedHash ?? "f".repeat(64), "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b) && !!n && !!storedHash;
}
