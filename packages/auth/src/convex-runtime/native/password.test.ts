import { describe, expect, it } from "vitest";
import { argon2id } from "@noble/hashes/argon2.js";
import { scryptAsync } from "@noble/hashes/scrypt.js";
import { bytesToHex } from "@noble/hashes/utils.js";

import {
  bytesToBase64url,
  hashPassword,
  isBcryptHash,
  legacyPbkdf2Hash,
  shouldRehashAfterVerify,
  verifyPassword,
} from "./password.js";

describe("password", () => {
  it("hashes and verifies a password with argon2id", async () => {
    const hash = await hashPassword("hunter2");
    /* PHC contract: $argon2id$v=19$m=...,t=...,p=...$salt$hash (6 segments). */
    const parts = hash.split("$");
    expect(parts.length).toBe(6);
    expect(parts[2]).toBe("v=19");
    expect(parts[3]).toMatch(/^m=\d+,t=\d+,p=\d+$/);
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

  it("still verifies legacy (pre-WASM) argon2id hashes", async () => {
    /*
     * Format written by the previous @noble/hashes implementation:
     * $argon2id$v=19,m=19456,t=2,p=1$<b64url salt>$<b64url derived>
     */
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const derived = argon2id("hunter2", salt, { t: 2, m: 19456, p: 1, dkLen: 32, version: 0x13 });
    const legacyHash = `$argon2id$v=19,m=19456,t=2,p=1$${bytesToBase64url(salt)}$${bytesToBase64url(derived)}`;
    expect(await verifyPassword("hunter2", legacyHash)).toBe(true);
    expect(await verifyPassword("wrong", legacyHash)).toBe(false);
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

  it("verifies imported bcrypt hashes (Clerk/WorkOS migration bridge)", async () => {
    /* Matches the `$2a$10$...` digests in Clerk's dashboard CSV export. */
    const imported = "$2a$10$DprdJOxGXADLAHm6zgiHee6l4Wey3XBYfEtgTPXhDbScWLr6to2xy"; // nosemgrep: generic.secrets.security.detected-bcrypt-hash.detected-bcrypt-hash
    expect(isBcryptHash(imported)).toBe(true);
    expect(await verifyPassword("hunter2", imported)).toBe(true);
    expect(await verifyPassword("wrong", imported)).toBe(false);
  });

  it("accepts all bcrypt crypt variants and rejects near-miss strings", async () => {
    const imported = "$2a$04$DprdJOxGXADLAHm6zgiHeepPaaQJ9oXVKp07GahazNJ.jIeyQjtpm"; // nosemgrep: generic.secrets.security.detected-bcrypt-hash.detected-bcrypt-hash
    for (const variant of ["2a", "2b", "2y"]) {
      const hash = imported.replace("$2a$", `$${variant}$`);
      expect(isBcryptHash(hash)).toBe(true);
      expect(await verifyPassword("hunter2", hash)).toBe(true);
    }
    expect(
      isBcryptHash("$2z$10$AnPv4/qb1oLaM7t/RGRXJuPFAO3j5YjhpIeWIlu7yZ5dDEoEtH6CO"), // nosemgrep: generic.secrets.security.detected-bcrypt-hash.detected-bcrypt-hash
    ).toBe(false);
    expect(
      isBcryptHash("$2x$10$AnPv4/qb1oLaM7t/RGRXJuPFAO3j5YjhpIeWIlu7yZ5dDEoEtH6CO"), // nosemgrep: generic.secrets.security.detected-bcrypt-hash.detected-bcrypt-hash
    ).toBe(false);
    /* Cost outside 4–14 is rejected: 15+ is a per-sign-in DoS vector. */
    expect(
      isBcryptHash("$2b$31$AnPv4/qb1oLaM7t/RGRXJuPFAO3j5YjhpIeWIlu7yZ5dDEoEtH6CO"), // nosemgrep: generic.secrets.security.detected-bcrypt-hash.detected-bcrypt-hash
    ).toBe(false);
    expect(isBcryptHash("$argon2id$v=19$m=19456,t=2,p=1$salt$hash")).toBe(false);
    expect(await verifyPassword("hunter2", "$2b$10$malformed")).toBe(false);
  });

  it("flags non-native and below-floor credentials for rehash after verify", async () => {
    /* Native emit (m=16384,t=3,p=1) and the other OWASP profile stay put. */
    expect(shouldRehashAfterVerify(await hashPassword("hunter2"))).toBe(false);
    expect(shouldRehashAfterVerify("$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$ZC5kYXRl")).toBe(false);
    /* Legacy packed params, bcrypt, scrypt, pbkdf2, weak PHC → rehash. */
    expect(shouldRehashAfterVerify("$argon2id$v=19,m=16384,t=3,p=1$c2FsdA$ZC5kYXRl")).toBe(true);
    expect(shouldRehashAfterVerify("$argon2id$v=19$m=8,t=1,p=1$c2FsdA$ZC5kYXRl")).toBe(true);
    expect(
      shouldRehashAfterVerify("$2b$10$AnPv4/qb1oLaM7t/RGRXJuPFAO3j5YjhpIeWIlu7yZ5dDEoEtH6CO"), // nosemgrep: generic.secrets.security.detected-bcrypt-hash.detected-bcrypt-hash
    ).toBe(true);
    expect(shouldRehashAfterVerify("$scrypt$whatever")).toBe(true);
    expect(shouldRehashAfterVerify("deadc0de:beef")).toBe(true);
  });

  it("verifies Better Auth legacy scrypt hashes", async () => {
    const password = "LongPassword123!";
    const saltHex = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
    /*
     * Better Auth hashes with the salt as a lowercase hex string, not decoded bytes,
     * and normalizes the password to NFKC before scrypt.
     */
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
