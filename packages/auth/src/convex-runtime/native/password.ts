import { base64url } from "jose";
import { argon2idAsync } from "@noble/hashes/argon2.js";
import { pbkdf2 } from "@noble/hashes/pbkdf2.js";
import { scryptAsync } from "@noble/hashes/scrypt.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { hexToBytes } from "@noble/hashes/utils.js";

const PBKDF2_PREFIX = "$pbkdf2$";
const SCRYPT_PREFIX = "$scrypt$";
const ARGON2ID_PREFIX = "$argon2id$";
const DEFAULT_DKLEN = 32;
const DEFAULT_SALT_BYTES = 16;
const DEFAULT_PBKDF2_ITERATIONS = 100_000;
// OWASP-recommended baseline for argon2id: 19 MiB, 2 iterations, parallelism 1.
const DEFAULT_ARGON2_T = 2;
const DEFAULT_ARGON2_M = 19456;
const DEFAULT_ARGON2_P = 1;
const DEFAULT_ARGON2_VERSION = 0x13;
// Better Auth's default scrypt config, used before migration to convex-auth.
// It stores hashes as lowercase hex "salt:derivedKey" (salt = 16 bytes, dkLen = 64).
const BETTER_AUTH_SCRYPT_N = 16384;
const BETTER_AUTH_SCRYPT_R = 16;
const BETTER_AUTH_SCRYPT_P = 1;
const BETTER_AUTH_SCRYPT_DKLEN = 64;
const BETTER_AUTH_SCRYPT_SALT_HEX_LENGTH = 32;

export function bytesToBase64url(bytes: Uint8Array): string {
  return base64url.encode(bytes);
}

export function base64urlToBytes(value: string): Uint8Array {
  return base64url.decode(value);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}

function generateSalt(): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(DEFAULT_SALT_BYTES));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = generateSalt();
  const derived = await argon2idAsync(password, salt, {
    t: DEFAULT_ARGON2_T,
    m: DEFAULT_ARGON2_M,
    p: DEFAULT_ARGON2_P,
    dkLen: DEFAULT_DKLEN,
    version: DEFAULT_ARGON2_VERSION,
  });
  const params = `v=${DEFAULT_ARGON2_VERSION},m=${DEFAULT_ARGON2_M},t=${DEFAULT_ARGON2_T},p=${DEFAULT_ARGON2_P}`;
  return `${ARGON2ID_PREFIX}${params}$${bytesToBase64url(salt)}$${bytesToBase64url(derived)}`;
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (hash.startsWith(ARGON2ID_PREFIX)) {
    return verifyArgon2id(password, hash);
  }
  if (hash.startsWith(SCRYPT_PREFIX)) {
    return verifyScrypt(password, hash);
  }
  if (hash.startsWith(PBKDF2_PREFIX)) {
    return verifyPbkdf2(password, hash);
  }
  if (isBetterAuthScryptHash(hash)) {
    return verifyBetterAuthScrypt(password, hash);
  }
  return false;
}

function parseArgon2idHash(hash: string): {
  salt: Uint8Array;
  expected: Uint8Array;
  t: number;
  m: number;
  p: number;
  version: number;
} | null {
  const parts = hash.slice(ARGON2ID_PREFIX.length).split("$");
  if (parts.length !== 3) {
    return null;
  }
  const [params, saltB64, derivedB64] = parts;
  const opts: Record<string, number> = {};
  for (const pair of (params ?? "").split(",")) {
    const [key, value] = pair.split("=");
    if (!key || !value) {
      return null;
    }
    const num = parseInt(value, 10);
    if (!Number.isFinite(num) || num < 0) {
      return null;
    }
    opts[key] = num;
  }
  const { v: version, m, t, p } = opts;
  if (
    typeof version !== "number" ||
    typeof m !== "number" ||
    typeof t !== "number" ||
    typeof p !== "number"
  ) {
    return null;
  }
  try {
    const salt = base64urlToBytes(saltB64 ?? "");
    const expected = base64urlToBytes(derivedB64 ?? "");
    return { salt, expected, t, m, p, version };
  } catch {
    return null;
  }
}

async function verifyArgon2id(password: string, hash: string): Promise<boolean> {
  const parsed = parseArgon2idHash(hash);
  if (!parsed) {
    return false;
  }
  const { salt, expected, t, m, p, version } = parsed;
  try {
    const actual = await argon2idAsync(password, salt, {
      t,
      m,
      p,
      dkLen: expected.length,
      version,
    });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function parseScryptHash(hash: string): {
  salt: Uint8Array;
  expected: Uint8Array;
  N: number;
  r: number;
  p: number;
} | null {
  const parts = hash.slice(SCRYPT_PREFIX.length).split("$");
  if (parts.length !== 3) {
    return null;
  }
  const [params, saltB64, derivedB64] = parts;
  const opts: Record<string, number> = {};
  for (const pair of params.split(",")) {
    const [key, value] = pair.split("=");
    if (!key || !value) {
      return null;
    }
    const num = parseInt(value, 10);
    if (!Number.isFinite(num) || num <= 0) {
      return null;
    }
    opts[key] = num;
  }
  const { N, r, p } = opts;
  if (typeof N !== "number" || typeof r !== "number" || typeof p !== "number") {
    return null;
  }
  try {
    const salt = base64urlToBytes(saltB64 ?? "");
    const expected = base64urlToBytes(derivedB64 ?? "");
    return { salt, expected, N, r, p };
  } catch {
    return null;
  }
}

async function verifyScrypt(password: string, hash: string): Promise<boolean> {
  const parsed = parseScryptHash(hash);
  if (!parsed) {
    return false;
  }
  const { salt, expected, N, r, p } = parsed;
  try {
    const actual = await scryptAsync(password, salt, {
      N,
      r,
      p,
      dkLen: expected.length,
    });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

// Better Auth's default password hasher uses scrypt with fixed parameters and
// stores the result as lowercase hex "salt:derivedKey".
function isBetterAuthScryptHash(hash: string): boolean {
  const [salt, derived] = hash.split(":");
  if (!salt || !derived) {
    return false;
  }
  if (salt.length !== BETTER_AUTH_SCRYPT_SALT_HEX_LENGTH) {
    return false;
  }
  const derivedByteLength = derived.length / 2;
  if (derivedByteLength !== BETTER_AUTH_SCRYPT_DKLEN) {
    return false;
  }
  return /^[0-9a-f]+$/i.test(salt) && /^[0-9a-f]+$/i.test(derived);
}

function parseBetterAuthScryptHash(hash: string): {
  salt: Uint8Array;
  expected: Uint8Array;
} | null {
  if (!isBetterAuthScryptHash(hash)) {
    return null;
  }
  try {
    const [saltHex, derivedHex] = hash.split(":") as [string, string];
    return { salt: hexToBytes(saltHex), expected: hexToBytes(derivedHex) };
  } catch {
    return null;
  }
}

async function verifyBetterAuthScrypt(password: string, hash: string): Promise<boolean> {
  const parsed = parseBetterAuthScryptHash(hash);
  if (!parsed) {
    return false;
  }
  const { salt, expected } = parsed;
  try {
    const actual = await scryptAsync(password, salt, {
      N: BETTER_AUTH_SCRYPT_N,
      r: BETTER_AUTH_SCRYPT_R,
      p: BETTER_AUTH_SCRYPT_P,
      dkLen: expected.length,
      maxmem: 128 * BETTER_AUTH_SCRYPT_R * (BETTER_AUTH_SCRYPT_N + BETTER_AUTH_SCRYPT_P + 1),
    });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function parsePbkdf2Hash(hash: string): {
  salt: Uint8Array;
  expected: Uint8Array;
  iterations: number;
} | null {
  const parts = hash.slice(PBKDF2_PREFIX.length).split("$");
  if (parts.length !== 3) {
    return null;
  }
  const [iterationsStr, saltB64, derivedB64] = parts;
  const iterations = parseInt(iterationsStr ?? "", 10);
  if (!Number.isFinite(iterations) || iterations <= 0) {
    return null;
  }
  try {
    const salt = base64urlToBytes(saltB64 ?? "");
    const expected = base64urlToBytes(derivedB64 ?? "");
    return { salt, expected, iterations };
  } catch {
    return null;
  }
}

function verifyPbkdf2(password: string, hash: string): boolean {
  const parsed = parsePbkdf2Hash(hash);
  if (!parsed) {
    return false;
  }
  const { salt, expected, iterations } = parsed;
  try {
    const actual = pbkdf2(sha256, password, salt, {
      c: iterations,
      dkLen: expected.length,
    });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export async function legacyPbkdf2Hash(
  password: string,
  iterations = DEFAULT_PBKDF2_ITERATIONS,
  saltBytes = DEFAULT_SALT_BYTES,
  dkLen = DEFAULT_DKLEN,
): Promise<string> {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(saltBytes));
  const derived = pbkdf2(sha256, password, salt, { c: iterations, dkLen });
  return `${PBKDF2_PREFIX}${iterations}$${bytesToBase64url(salt)}$${bytesToBase64url(derived)}`;
}
