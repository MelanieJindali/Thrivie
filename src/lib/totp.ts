import "server-only";
import crypto from "node:crypto";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";
import { decryptText, encryptText } from "./crypto";
import { rateLimit, sha256 } from "./auth";

// Authenticator-app two-factor (RFC 6238, 30s, 6 digits, SHA-1 for broad app support).
// The secret is stored encrypted; recovery codes are stored as SHA-256 hashes.

const ISSUER = "Thrivie";

function totp(secretB32: string, label: string) {
  return new OTPAuth.TOTP({ issuer: ISSUER, label, algorithm: "SHA1", digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(secretB32) });
}

export async function newTotpSetup(userId: string, email: string) {
  const secret = new OTPAuth.Secret({ size: 20 }).base32;
  const uri = totp(secret, email).toString();
  const qr = await QRCode.toDataURL(uri, { margin: 1, width: 220 });
  return { encryptedSecret: encryptText(secret, userId), secret, qr };
}

/** Verifies a code (±1 step) and blocks re-use of the same code. */
export async function verifyTotp(encryptedSecret: string, userId: string, code: string): Promise<boolean> {
  const clean = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  const secret = decryptText(encryptedSecret, userId);
  const delta = totp(secret, "x").validate({ token: clean, window: 1 });
  if (delta === null) return false;
  // replay protection: each code works once
  return rateLimit(`totp-used:${userId}:${clean}`, 1, 120);
}

export function newRecoveryCodes(): { codes: string[]; hashes: string[] } {
  const codes = Array.from({ length: 8 }, () => {
    const b = crypto.randomBytes(5).toString("hex"); // 10 hex chars
    return `${b.slice(0, 5)}-${b.slice(5)}`;
  });
  return { codes, hashes: codes.map((c) => sha256(c)) };
}

/** Returns the remaining hashes if the code matched, or null. */
export function useRecoveryCode(stored: string | null, code: string): string[] | null {
  const hashes: string[] = stored ? JSON.parse(stored) : [];
  const h = sha256(code.trim().toLowerCase());
  if (!hashes.includes(h)) return null;
  return hashes.filter((x) => x !== h);
}
