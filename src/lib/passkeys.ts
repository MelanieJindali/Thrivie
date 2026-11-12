import "server-only";
import {
  generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse,
  type AuthenticationResponseJSON, type AuthenticatorTransportFuture, type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import type { PrismaClient } from "@prisma/client";

// Passkeys (WebAuthn). The device keeps the private key behind Face ID, Touch ID or a
// screen lock; the server stores only the public key. Every ceremony uses a random
// challenge that is stored server-side, expires in 5 minutes and works once.

export type RelyingParty = { id: string; origin: string; name: string };
const CHALLENGE_MS = 5 * 60_000;
export const MAX_PASSKEYS = 10;

async function saveChallenge(sys: PrismaClient, kind: "passkey-register" | "passkey-login", value: string, subject: string | null) {
  await sys.authChallenge.deleteMany({ where: { expiresAt: { lt: new Date() } } }); // opportunistic cleanup
  const row = await sys.authChallenge.create({ data: { kind, value, subject, expiresAt: new Date(Date.now() + CHALLENGE_MS) } });
  return row.id;
}

/** Reads and deletes a challenge in one step, so it can never be used twice. */
async function takeChallenge(sys: PrismaClient, id: string, kind: "passkey-register" | "passkey-login") {
  if (!/^[a-z0-9]{10,40}$/.test(id)) return null;
  const row = await sys.authChallenge.findUnique({ where: { id } });
  if (!row || row.kind !== kind) return null;
  const { count } = await sys.authChallenge.deleteMany({ where: { id } });
  return count === 1 && row.expiresAt > new Date() ? row : null;
}

export async function startRegistration(sys: PrismaClient, user: { id: string; email: string }, rp: RelyingParty) {
  const existing = await sys.passkey.findMany({ where: { userId: user.id }, select: { credentialId: true, transports: true } });
  const options = await generateRegistrationOptions({
    rpName: rp.name,
    rpID: rp.id,
    userName: user.email,
    userID: new TextEncoder().encode(user.id),
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({ id: c.credentialId, transports: transportsOf(c.transports) })),
    // A discoverable passkey on this device, always unlocked with biometrics or the screen lock.
    authenticatorSelection: { residentKey: "required", userVerification: "required", authenticatorAttachment: "platform" },
  });
  return { options, challengeId: await saveChallenge(sys, "passkey-register", options.challenge, user.id) };
}

export async function finishRegistration(sys: PrismaClient, userId: string, challengeId: string, response: RegistrationResponseJSON, rp: RelyingParty, name: string): Promise<boolean> {
  const ch = await takeChallenge(sys, challengeId, "passkey-register");
  if (!ch || ch.subject !== userId) return false;
  if ((await sys.passkey.count({ where: { userId } })) >= MAX_PASSKEYS) return false;
  const v = await verifyRegistrationResponse({ response, expectedChallenge: ch.value, expectedOrigin: rp.origin, expectedRPID: rp.id, requireUserVerification: true }).catch(() => null);
  if (!v?.verified || !v.registrationInfo) return false;
  const { credential, credentialBackedUp } = v.registrationInfo;
  await sys.passkey.create({
    data: {
      userId, credentialId: credential.id, publicKey: Buffer.from(credential.publicKey), counter: BigInt(credential.counter),
      transports: credential.transports?.join(",") ?? null, backedUp: credentialBackedUp, name: name.trim().slice(0, 60) || "Passkey",
    },
  });
  return true;
}

export async function startLogin(sys: PrismaClient, rp: RelyingParty) {
  // No account is named: the device offers whichever passkeys it holds for this site.
  const options = await generateAuthenticationOptions({ rpID: rp.id, userVerification: "required" });
  return { options, challengeId: await saveChallenge(sys, "passkey-login", options.challenge, null) };
}

/** Returns the user id when the passkey signature checks out, otherwise null. */
export async function finishLogin(sys: PrismaClient, challengeId: string, response: AuthenticationResponseJSON, rp: RelyingParty): Promise<string | null> {
  const ch = await takeChallenge(sys, challengeId, "passkey-login");
  if (!ch || typeof response?.id !== "string") return null;
  const key = await sys.passkey.findUnique({ where: { credentialId: response.id } });
  if (!key) return null;
  const v = await verifyAuthenticationResponse({
    response, expectedChallenge: ch.value, expectedOrigin: rp.origin, expectedRPID: rp.id, requireUserVerification: true,
    credential: { id: key.credentialId, publicKey: new Uint8Array(key.publicKey), counter: Number(key.counter), transports: transportsOf(key.transports) },
  }).catch(() => null);
  if (!v?.verified) return null;
  await sys.passkey.update({ where: { id: key.id }, data: { counter: BigInt(v.authenticationInfo.newCounter), lastUsedAt: new Date(), backedUp: v.authenticationInfo.credentialBackedUp } });
  return key.userId;
}

const transportsOf = (s: string | null) => (s ? (s.split(",") as AuthenticatorTransportFuture[]) : undefined);
