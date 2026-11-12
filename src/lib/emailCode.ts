import "server-only";
import crypto from "node:crypto";
import type { PrismaClient } from "@prisma/client";

// Six-digit sign-in codes sent by email. Only a hash of the code is stored, each code
// expires in 10 minutes, works once, and is cancelled after 5 wrong guesses.

const CODE_MS = 10 * 60_000;
export const MAX_CODE_ATTEMPTS = 5;
const hash = (id: string, code: string) => crypto.createHash("sha256").update(`thrivie-code:${id}:${code}`).digest("hex");

/** Creates a new code for this email (cancelling any earlier one) and returns it for sending. */
export async function issueEmailCode(sys: PrismaClient, email: string): Promise<string> {
  await sys.authChallenge.deleteMany({ where: { OR: [{ kind: "email-code", subject: email }, { expiresAt: { lt: new Date() } }] } });
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  const id = crypto.randomBytes(12).toString("hex");
  await sys.authChallenge.create({ data: { id, kind: "email-code", subject: email, value: hash(id, code), expiresAt: new Date(Date.now() + CODE_MS) } });
  return code;
}

/** True when the code is right. A right code is used up; a wrong one counts toward the limit. */
export async function checkEmailCode(sys: PrismaClient, email: string, code: string): Promise<boolean> {
  const digits = code.replace(/\D/g, "");
  const row = await sys.authChallenge.findFirst({ where: { kind: "email-code", subject: email }, orderBy: { createdAt: "desc" } });
  if (!row || row.expiresAt < new Date() || row.attempts >= MAX_CODE_ATTEMPTS) return false;
  const a = Buffer.from(hash(row.id, digits), "hex");
  const b = Buffer.from(row.value, "hex");
  if (digits.length !== 6 || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    await sys.authChallenge.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
    return false;
  }
  // Delete-and-count makes the code single-use even if two requests race.
  return (await sys.authChallenge.deleteMany({ where: { id: row.id } })).count === 1;
}
