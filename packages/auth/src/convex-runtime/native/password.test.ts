import { describe, expect, it } from "vitest";
import { scryptAsync } from "@noble/hashes/scrypt.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { bytesToBase64url, hashPassword, legacyPbkdf2Hash, verifyPassword } from "./password.js";

describe("password", () => {
  it("hashes and verifies a password with argon2id", async () => {
    const hash = await hashPassword("hunter2");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword("hunter2", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("rejects malformed hashes", async () => {
    expect(await verifyPassword("hunter2", "not-a-hash")).toBe(false);
    expect(await verifyPassword("hunter2", "$pbkdf2$bad")).toBe(false);
    expect(await verifyPassword("hunter2", "$scrypt$bad$bad")).toBe(false);
    expect(await verifyPassword("hunter2", "$argon2id$bad")).toBe(false);
  });

  it("produces different hashes for the same password", async () => {
    const hash1 = await hashPassword("hunter2");
    const hash2 = await hashPassword("hunter2");
    expect(hash1).not.toBe(hash2);
    expect(await verifyPassword("hunter2", hash1)).toBe(true);
    expect(await verifyPassword("hunter2", hash2)).toBe(true);
  });

  it("still verifies legacy scrypt hashes", async () => {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const derived = await scryptAsync("hunter2", salt, {
      N: 2 ** 14,
      r: 8,
      p: 1,
      dkLen: 32,
    });
    const legacyHash = `$scrypt$N=${2 ** 14},r=8,p=1$${bytesToBase64url(salt)}$${bytesToBase64url(derived)}`;
    expect(await verifyPassword("hunter2", legacyHash)).toBe(true);
    expect(await verifyPassword("wrong", legacyHash)).toBe(false);
  });

  it("still verifies legacy PBKDF2 hashes", async () => {
    const legacyHash = await legacyPbkdf2Hash("hunter2");
    expect(legacyHash.startsWith("$pbkdf2$")).toBe(true);
    expect(await verifyPassword("hunter2", legacyHash)).toBe(true);
    expect(await verifyPassword("wrong", legacyHash)).toBe(false);
  });

  it("verifies Better Auth legacy scrypt hashes", async () => {
    const password = "LongPassword123!";
    const saltHex = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
    // Better Auth hashes with the salt as a lowercase hex string, not decoded bytes,
    // and normalizes the password to NFKC before scrypt.
    const derived = await scryptAsync(password.normalize("NFKC"), saltHex, {
      N: 16384,
      r: 16,
      p: 1,
      dkLen: 64,
      maxmem: 128 * 16384 * 16 * 2,
    });
    const legacyHash = `${saltHex}:${bytesToHex(derived)}`;
    expect(await verifyPassword(password, legacyHash)).toBe(true);
    expect(await verifyPassword("wrong", legacyHash)).toBe(false);
  });
});
