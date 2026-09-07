import { describe, expect, it } from "vitest";
import {
  buildTOTPURI,
  decodeBase32,
  encodeBase32,
  generateSecret,
  generateTOTP,
  getCurrentTOTPCounter,
  verifyTOTP,
} from "./totp.js";

describe("base32", () => {
  it("round-trips random bytes", () => {
    const bytes = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]); // "Hello"
    const encoded = encodeBase32(bytes);
    const decoded = decodeBase32(encoded);
    expect(decoded).toEqual(bytes);
  });

  it("decodes an RFC 4648 test vector", () => {
    const encoded = "JBSWY3DPEBLW64TMMQ";
    const decoded = decodeBase32(encoded);
    const expected = new TextEncoder().encode("Hello World");
    expect(decoded).toEqual(new Uint8Array(expected));
  });

  it("encodes and decodes 'Hello!'", () => {
    const encoded = "JBSWY3DPEE";
    const decoded = decodeBase32(encoded);
    expect(decoded).toEqual(new Uint8Array(new TextEncoder().encode("Hello!")));
  });

  it("ignores padding and lower case", () => {
    const encoded = "jbswy3dp";
    const decoded = decodeBase32(encoded);
    const expected = new TextEncoder().encode("Hello");
    expect(decoded).toEqual(new Uint8Array(expected));
  });
});

describe("TOTP", () => {
  it("generates a 6-digit code for a known secret and counter", async () => {
    const secret = decodeBase32("JBSWY3DPEBLW64TMMQ======");
    const code = await generateTOTP(secret, 0);
    expect(code).toMatch(/^\d{6}$/);
    expect(code).toBe("309435");
  });

  it("matches the standard TOTP test vector at time 1234567890", async () => {
    const secret = new TextEncoder().encode("12345678901234567890");
    const config = { digits: 8, period: 30, algorithm: "SHA-1" as const };
    const counter = Math.floor(1234567890 / 30);
    const code = await generateTOTP(secret, counter, config);
    expect(code).toBe("89005924");
  });

  it("verifies a code within the default window", async () => {
    const secret = generateSecret();
    const now = Date.now();
    const code = await generateTOTP(secret, getCurrentTOTPCounter(30, now));
    expect(await verifyTOTP(secret, code, {}, 1, now)).toBe(true);
  });

  it("rejects an invalid code", async () => {
    const secret = generateSecret();
    expect(await verifyTOTP(secret, "000000")).toBe(false);
  });

  it("rejects a code with a non-digits", async () => {
    const secret = await generateSecret();
    expect(await verifyTOTP(secret, "abc123")).toBe(false);
  });

  it("rejects a code outside the window", async () => {
    const secret = await generateSecret();
    const pastCounter = getCurrentTOTPCounter(30, Date.now()) - 10;
    const code = await generateTOTP(secret, pastCounter);
    expect(await verifyTOTP(secret, code, {}, 1)).toBe(false);
  });

  it("accepts a code one step before current", async () => {
    const secret = await generateSecret();
    const now = Date.now() - 30_000;
    const code = await generateTOTP(secret, getCurrentTOTPCounter(30, now), {}, now);
    expect(await verifyTOTP(secret, code, {}, 1)).toBe(true);
  });
});

describe("TOTP URI", () => {
  it("builds an otpauth URI", () => {
    const secret = encodeBase32(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
    const uri = buildTOTPURI(secret, { issuer: "Example", label: "user@example.com" });
    const parsed = new URL(uri);
    expect(parsed.protocol).toBe("otpauth:");
    expect(parsed.host).toBe("totp");
    expect(parsed.searchParams.get("secret")).toBe(secret);
    expect(parsed.searchParams.get("issuer")).toBe("Example");
    expect(parsed.searchParams.get("digits")).toBe("6");
    expect(parsed.searchParams.get("period")).toBe("30");
    expect(parsed.searchParams.get("algorithm")).toBe("SHA1");
  });
});
