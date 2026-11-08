import crypto from "node:crypto";

// Application-level encryption for sensitive free text and attachments.
//
// AES-256-GCM with a random 96-bit IV per value. The user id is bound as
// additional authenticated data (AAD), so a ciphertext copied into another
// user's row fails to decrypt. Keys come only from environment secrets:
//   ENCRYPTION_KEY           32 bytes, base64 (current key, used to encrypt)
//   ENCRYPTION_KEY_PREVIOUS  optional, still accepted for decryption (rotation)
// Each value records which key encrypted it (an 8-hex key id, not the key).
//
// Text format:   enc:<kid>:<base64(iv | tag | ciphertext)>
// Binary format: "THV1" | kid(4 bytes) | iv(12) | tag(16) | ciphertext

type Key = { id: string; raw: Buffer };

function parseKey(b64: string): Key {
  const raw = Buffer.from(b64, "base64");
  if (raw.length !== 32) throw new Error("ENCRYPTION_KEY must be 32 bytes, base64-encoded (generate with: openssl rand -base64 32)");
  return { id: crypto.createHash("sha256").update(raw).digest("hex").slice(0, 8), raw };
}

let keys: { current: Key; all: Key[] } | null = null;
function getKeys() {
  if (keys) return keys;
  let current = process.env.ENCRYPTION_KEY?.trim();
  if (!current) {
    if (process.env.NODE_ENV === "production") throw new Error("ENCRYPTION_KEY is required in production.");
    // Local development and tests only. Production refuses to start without a real key.
    current = crypto.createHash("sha256").update("thrivie-local-development-only").digest("base64");
  }
  const cur = parseKey(current);
  const prev = process.env.ENCRYPTION_KEY_PREVIOUS?.trim();
  keys = { current: cur, all: prev ? [cur, parseKey(prev)] : [cur] };
  return keys;
}

const MAGIC = Buffer.from("THV1");
export const UNREADABLE = "⚠︎ This entry couldn't be decrypted.";

export function isEncryptedText(v: unknown): v is string {
  return typeof v === "string" && v.startsWith("enc:");
}

export function encryptText(plain: string, userId: string): string {
  const { current } = getKeys();
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", current.raw, iv);
  c.setAAD(Buffer.from(userId));
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `enc:${current.id}:${Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64")}`;
}

export function decryptText(value: string, userId: string): string {
  if (!isEncryptedText(value)) return value;
  const [, kid, payload] = value.split(":");
  const key = getKeys().all.find((k) => k.id === kid);
  if (!key || !payload) throw new Error("Cannot decrypt: unknown key");
  const buf = Buffer.from(payload, "base64");
  const d = crypto.createDecipheriv("aes-256-gcm", key.raw, buf.subarray(0, 12));
  d.setAAD(Buffer.from(userId));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8");
}

export function isEncryptedBytes(v: unknown): v is Uint8Array {
  return v instanceof Uint8Array && v.length > 36 && Buffer.from(v.subarray(0, 4)).equals(MAGIC);
}

export function encryptBytes(plain: Uint8Array, userId: string): Buffer {
  const { current } = getKeys();
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", current.raw, iv);
  c.setAAD(Buffer.from(userId));
  const ct = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([MAGIC, Buffer.from(current.id, "hex"), iv, c.getAuthTag(), ct]);
}

export function decryptBytes(value: Uint8Array, userId: string): Buffer {
  const buf = Buffer.from(value);
  if (!isEncryptedBytes(buf)) return buf;
  const kid = buf.subarray(4, 8).toString("hex");
  const key = getKeys().all.find((k) => k.id === kid);
  if (!key) throw new Error("Cannot decrypt: unknown key");
  const d = crypto.createDecipheriv("aes-256-gcm", key.raw, buf.subarray(8, 20));
  d.setAAD(Buffer.from(userId));
  d.setAuthTag(buf.subarray(20, 36));
  return Buffer.concat([d.update(buf.subarray(36)), d.final()]);
}

/** Decrypt every encrypted string/bytes value inside a query result (objects, arrays, nested includes). */
export function decryptDeep<T>(value: T, userId: string): T {
  if (value == null) return value;
  try {
    if (typeof value === "string") return (isEncryptedText(value) ? decryptText(value, userId) : value) as T;
    if (value instanceof Uint8Array) return (isEncryptedBytes(value) ? decryptBytes(value, userId) : value) as T;
  } catch {
    // Wrong key or corrupted value: show a placeholder instead of failing the whole page.
    console.error("[thrivie] decrypt: a value could not be decrypted (check ENCRYPTION_KEY)");
    return (typeof value === "string" ? UNREADABLE : Buffer.alloc(0)) as T;
  }
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map((v) => decryptDeep(v, userId)) as T;
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = decryptDeep(v, userId);
    return out as T;
  }
  return value;
}

/** Constant-time compare for secrets. */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
