import { describe, expect, it } from "vitest";
import { hashRecoveryKey, newRecoveryKey, normalizeRecoveryKey, recoveryKeyMatches } from "@/lib/recoveryKey";

describe("recovery keys", () => {
  it("are 20 unambiguous characters in four groups", () => {
    const { key } = newRecoveryKey();
    expect(key).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}(-[0-9A-HJKMNP-TV-Z]{5}){3}$/);
  });

  it("are unique", () => {
    const keys = new Set(Array.from({ length: 500 }, () => newRecoveryKey().key));
    expect(keys.size).toBe(500);
  });

  it("match however they're typed", () => {
    const { key, hash } = newRecoveryKey();
    expect(recoveryKeyMatches(key, hash)).toBe(true);
    expect(recoveryKeyMatches(key.toLowerCase(), hash)).toBe(true);
    expect(recoveryKeyMatches(key.replace(/-/g, " "), hash)).toBe(true);
    expect(recoveryKeyMatches(key.replace(/-/g, ""), hash)).toBe(true);
  });

  it("treat O as 0 and I or L as 1", () => {
    expect(normalizeRecoveryKey("O1I1L-00000-00000-00000")).toBe("01111000000000000000");
  });

  it("reject wrong keys, malformed input and accounts without a key", () => {
    const { hash } = newRecoveryKey();
    expect(recoveryKeyMatches(newRecoveryKey().key, hash)).toBe(false);
    expect(recoveryKeyMatches("not a key", hash)).toBe(false);
    expect(recoveryKeyMatches("", hash)).toBe(false);
    expect(recoveryKeyMatches(newRecoveryKey().key, null)).toBe(false);
  });

  it("store only a hash", () => {
    const { key, hash } = newRecoveryKey();
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(key.replace(/-/g, ""));
    expect(hashRecoveryKey(key)).toBe(hash);
  });
});
