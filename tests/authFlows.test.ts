import { afterAll, beforeAll, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { Client } from "pg";
import { encodeCBOR } from "@levischuck/tiny-cbor";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { disconnect, systemDb } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { checkEmailCode, issueEmailCode, MAX_CODE_ATTEMPTS } from "@/lib/emailCode";
import { finishLogin, finishRegistration, startLogin, startRegistration, type RelyingParty } from "@/lib/passkeys";

// Sign-in flows against a real Postgres database with the production migrations and
// row-level security: passkeys (with a software authenticator), emailed codes, and
// existing password accounts. All data here is synthetic.

const RP: RelyingParty = { id: "thrivie.test", origin: "https://thrivie.test", name: "Thrivie" };
const sys = systemDb();
const b64u = (b: Uint8Array | Buffer) => Buffer.from(b).toString("base64url");
const sha = (d: Uint8Array | string) => crypto.createHash("sha256").update(d).digest();

/** A minimal software passkey: an ES256 key that signs like a phone's secure chip would. */
class SoftAuthenticator {
  private keys = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  readonly credentialId = crypto.randomBytes(32);
  private counter = 0;

  private authData(withKey: boolean, userVerified = true) {
    const flags = 0x01 | (userVerified ? 0x04 : 0) | (withKey ? 0x40 : 0);
    const count = Buffer.alloc(4);
    count.writeUInt32BE(++this.counter);
    const parts = [sha(RP.id), Buffer.from([flags]), count];
    if (withKey) {
      const jwk = this.keys.publicKey.export({ format: "jwk" });
      const cose = encodeCBOR(new Map<number, number | Uint8Array>([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x!, "base64url")], [-3, Buffer.from(jwk.y!, "base64url")]]));
      const len = Buffer.alloc(2);
      len.writeUInt16BE(this.credentialId.length);
      parts.push(Buffer.alloc(16), len, this.credentialId, Buffer.from(cose));
    }
    return Buffer.concat(parts);
  }
  private clientData(type: string, challenge: string, origin = RP.origin) {
    return Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }));
  }

  register(challenge: string): RegistrationResponseJSON {
    const attestationObject = encodeCBOR(new Map<string, unknown>([["fmt", "none"], ["attStmt", new Map()], ["authData", new Uint8Array(this.authData(true))]]) as never);
    const id = b64u(this.credentialId);
    return { id, rawId: id, type: "public-key", clientExtensionResults: {}, response: { clientDataJSON: b64u(this.clientData("webauthn.create", challenge)), attestationObject: b64u(attestationObject), transports: ["internal"] } };
  }
  sign(challenge: string, opts: { origin?: string; userVerified?: boolean } = {}): AuthenticationResponseJSON {
    const authData = this.authData(false, opts.userVerified ?? true);
    const clientDataJSON = this.clientData("webauthn.get", challenge, opts.origin);
    const signature = crypto.sign("sha256", Buffer.concat([authData, sha(clientDataJSON)]), this.keys.privateKey);
    const id = b64u(this.credentialId);
    return { id, rawId: id, type: "public-key", clientExtensionResults: {}, response: { clientDataJSON: b64u(clientDataJSON), authenticatorData: b64u(authData), signature: b64u(signature) } };
  }
}

async function newUser(email: string, password: string | null) {
  return sys.user.create({ data: { email, passwordHash: await hashPassword(password ?? crypto.randomBytes(32).toString("base64url")), hasPassword: password !== null, settings: { create: { name: "Test" } } } });
}
async function addPasskey(user: { id: string; email: string }, device = new SoftAuthenticator()) {
  const { options, challengeId } = await startRegistration(sys, user, RP);
  const ok = await finishRegistration(sys, user.id, challengeId, device.register(options.challenge), RP, "Test phone");
  return { ok, device, challengeId, options };
}
async function passkeyLogin(device: SoftAuthenticator, opts?: { origin?: string; userVerified?: boolean }) {
  const { options, challengeId } = await startLogin(sys, RP);
  const response = device.sign(options.challenge, opts);
  return { userId: await finishLogin(sys, challengeId, response, RP), challengeId, response };
}

afterAll(async () => {
  await sys.user.deleteMany({ where: { email: { endsWith: "@authflows.test" } } });
  await sys.authChallenge.deleteMany({});
  await disconnect();
});

describe("1. new user: passkey registration and sign-in", () => {
  it("creates a passwordless account, registers a passkey and signs in with it", async () => {
    const user = await newUser("new@authflows.test", null);
    const { ok, device, options } = await addPasskey(user);
    expect(ok).toBe(true);
    expect(options.authenticatorSelection).toMatchObject({ residentKey: "required", userVerification: "required" });
    const stored = await sys.passkey.findMany({ where: { userId: user.id } });
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe("Test phone");
    expect((await passkeyLogin(device)).userId).toBe(user.id);
    expect((await sys.passkey.findFirstOrThrow({ where: { userId: user.id } })).lastUsedAt).not.toBeNull();
  });

  it("uses each challenge once and rejects replays", async () => {
    const user = await newUser("replay@authflows.test", null);
    const { device, challengeId: regId, options } = await addPasskey(user);
    expect(await finishRegistration(sys, user.id, regId, device.register(options.challenge), RP, "again")).toBe(false);
    const first = await passkeyLogin(device);
    expect(first.userId).toBe(user.id);
    expect(await finishLogin(sys, first.challengeId, first.response, RP)).toBeNull();
  });

  it("rejects another site's origin, a missing biometric check, an unknown passkey and someone else's challenge", async () => {
    const user = await newUser("strict@authflows.test", null);
    const { device } = await addPasskey(user);
    expect((await passkeyLogin(device, { origin: "https://evil.example" })).userId).toBeNull();
    expect((await passkeyLogin(device, { userVerified: false })).userId).toBeNull();
    expect((await passkeyLogin(new SoftAuthenticator())).userId).toBeNull();
    const other = await newUser("other@authflows.test", null);
    const { options, challengeId } = await startRegistration(sys, other, RP);
    expect(await finishRegistration(sys, user.id, challengeId, new SoftAuthenticator().register(options.challenge), RP, "x")).toBe(false);
  });
});

describe("2. existing password accounts keep working", () => {
  it("signs in with the stored hash; new columns default to the legacy behaviour", async () => {
    const pw = "sea glass at sunrise";
    const hash = await hashPassword(pw);
    // Insert the way an account looked before this change: no hasPassword, no session method.
    const raw = new Client({ connectionString: process.env.POSTGRES_PRISMA_URL });
    await raw.connect();
    await raw.query(`INSERT INTO "User"(id, email, "passwordHash") VALUES ('legacy-user-1', 'legacy@authflows.test', $1)`, [hash]);
    await raw.query(`INSERT INTO "Session"(id, "userId", "expiresAt") VALUES ('legacy-session-1', 'legacy-user-1', now() + interval '30 days')`);
    await raw.end();
    const user = await sys.user.findUniqueOrThrow({ where: { email: "legacy@authflows.test" } });
    expect(user.hasPassword).toBe(true);
    expect(await verifyPassword(pw, user.passwordHash)).toBe(true);
    expect(await verifyPassword("wrong password", user.passwordHash)).toBe(false);
    const session = await sys.session.findUniqueOrThrow({ where: { id: "legacy-session-1" } });
    expect(session.method).toBe("password"); // an active session from before the change stays valid
    expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("a passwordless account can't be signed in to with any password", async () => {
    const user = await newUser("nopw@authflows.test", null);
    expect(await verifyPassword("", user.passwordHash)).toBe(false);
    expect(await verifyPassword("password", user.passwordHash)).toBe(false);
  });
});

describe("3. emailed code fallback", () => {
  const email = "code@authflows.test";
  beforeAll(async () => { await newUser(email, "sea glass at sunrise"); });

  it("accepts the right code once, and stores only a hash", async () => {
    const code = await issueEmailCode(sys, email);
    expect(code).toMatch(/^\d{6}$/);
    const row = await sys.authChallenge.findFirstOrThrow({ where: { kind: "email-code", subject: email } });
    expect(row.value).toMatch(/^[0-9a-f]{64}$/);
    expect(row.value).not.toContain(code);
    expect(await checkEmailCode(sys, email, `${code.slice(0, 3)} ${code.slice(3)}`)).toBe(true); // typed with a space
    expect(await checkEmailCode(sys, email, code)).toBe(false); // already used
  });

  it("cancels a code after 5 wrong guesses, even if the 6th is right", async () => {
    const code = await issueEmailCode(sys, email);
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < MAX_CODE_ATTEMPTS; i++) expect(await checkEmailCode(sys, email, wrong)).toBe(false);
    expect(await checkEmailCode(sys, email, code)).toBe(false);
  });

  it("a new code cancels the old one, and expired codes and other emails are rejected", async () => {
    const old = await issueEmailCode(sys, email);
    const fresh = await issueEmailCode(sys, email);
    if (old !== fresh) expect(await checkEmailCode(sys, email, old)).toBe(false);
    expect(await checkEmailCode(sys, "someone-else@authflows.test", fresh)).toBe(false);
    await sys.authChallenge.updateMany({ where: { kind: "email-code", subject: email }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await checkEmailCode(sys, email, fresh)).toBe(false);
  });
});

describe("4. upgrading a password account to a passkey", () => {
  it("links a passkey to the existing account and leaves the password working", async () => {
    const pw = "tide pools at golden hour";
    const user = await newUser("upgrade@authflows.test", pw);
    const before = user.passwordHash;
    const { ok, device } = await addPasskey(user);
    expect(ok).toBe(true);
    const after = await sys.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.passwordHash).toBe(before); // untouched
    expect(after.hasPassword).toBe(true);
    expect(await verifyPassword(pw, after.passwordHash)).toBe(true);
    expect((await passkeyLogin(device)).userId).toBe(user.id);
  });

  it("won't register the same device twice (it is listed as excluded)", async () => {
    const user = await newUser("twice@authflows.test", "tide pools at golden hour");
    const { device } = await addPasskey(user);
    const { options } = await startRegistration(sys, user, RP);
    expect(options.excludeCredentials?.map((c) => c.id)).toEqual([Buffer.from(device.credentialId).toString("base64url")]);
  });
});

describe("database rules for the new tables", () => {
  it("passkeys and sign-in challenges are invisible outside the sign-in system role", async () => {
    const raw = new Client({ connectionString: process.env.POSTGRES_PRISMA_URL });
    await raw.connect();
    await raw.query("BEGIN");
    await raw.query("SELECT set_config('app.user_id', 'legacy-user-1', true), set_config('app.system', '', true), set_config('role', 'thrivie_rls', true)");
    const keys = await raw.query(`SELECT count(*)::int AS n FROM "Passkey"`);
    const challenges = await raw.query(`SELECT count(*)::int AS n FROM "AuthChallenge"`);
    await raw.query("ROLLBACK");
    await raw.end();
    expect(keys.rows[0].n).toBe(0);
    expect(challenges.rows[0].n).toBe(0);
    expect(await sys.passkey.count()).toBeGreaterThan(0);
  });
});
