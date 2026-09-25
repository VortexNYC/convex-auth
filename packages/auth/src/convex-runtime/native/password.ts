import { base64url } from "jose";
import {
  hashPassword as wasmHashPassword,
  verifyPassword as wasmVerifyPassword,
} from "argon2id-wasm";
import { bcryptVerify } from "hash-wasm";
import { argon2id } from "@noble/hashes/argon2.js";
import { pbkdf2 } from "@noble/hashes/pbkdf2.js";
import { scrypt } from "@noble/hashes/scrypt.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { hexToBytes } from "@noble/hashes/utils.js";

const PBKDF2_PREFIX = "$pbkdf2$";
const SCRYPT_PREFIX = "$scrypt$";
const ARGON2ID_PREFIX = "$argon2id$";
/**
 * Imported bcrypt digests are only honored at sane parameters: variants 2a/2b/2y
 * ($2x$ was a buggy PHP prefix nobody exports) and cost 4–14 — real vendor
 * exports are 10–12, while cost 31 would DoS every sign-in attempt. This is the
 * shape Clerk's dashboard CSV export emits in its `password_digest` column (and
 * what WorkOS imports hand off).
 */
const BCRYPT_REGEX = /^\$2[aby]\$(?:0[4-9]|1[0-4])\$[./A-Za-z0-9]{53}$/;

/**
 * Imported argon2id PHC strings below this floor are treated as non-native and
 * upgraded on first successful verification. Bounds sit under both standard
 * OWASP profiles (m≥12MiB, t≥2, p≥1) so a WorkOS-style export carrying
 * m=19456,t=2 or m=16384,t=3 stays put while m=1,t=1 garbage gets rehashed.
 */
const ARGON2ID_PARAM_FLOOR = { m: 12288, t: 2, p: 1 } as const;
const DEFAULT_DKLEN = 32;
const DEFAULT_SALT_BYTES = 16;
const DEFAULT_PBKDF2_ITERATIONS = 100_000;
/**
 * Better Auth's default scrypt config, used before migration to convex-auth.
 * It stores hashes as lowercase hex "salt:derivedKey" (salt = 16 bytes, dkLen = 64).
 */
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

/**
 * Hashes a password with Rust/WASM argon2id (~10x faster than pure JS in the
 * isolate), emitting a standard PHC string:
 * `$argon2id$v=19$m=...,t=...,p=...$salt$hash`.
 */
export async function hashPassword(password: string): Promise<string> {
  return await wasmHashPassword(password);
}

export function isBcryptHash(hash: string): boolean {
  return BCRYPT_REGEX.test(hash);
}

function parsePhcParams(segment: string): { m: number; t: number; p: number } | null {
  const opts: Record<string, number> = {};
  for (const pair of segment.split(",")) {
    const [key, value] = pair.split("=");
    const num = Number(value);
    if (!key || !Number.isFinite(num) || num < 0) return null;
    opts[key] = num;
  }
  const { m, t, p } = opts;
  return typeof m === "number" && typeof t === "number" && typeof p === "number"
    ? { m, t, p }
    : null;
}

/**
 * Whether a credential that just verified should be rewritten to native
 * argon2id. True for every non-native format (bcrypt, legacy argon2id, scrypt,
 * pbkdf2, Better Auth digests) and for argon2id PHC strings below the native
 * parameter floor — e.g. a WorkOS export carrying `m=1,t=1` must not survive
 * past first sign-in. Stronger-than-floor PHC params are left alone.
 */
export function shouldRehashAfterVerify(hash: string): boolean {
  if (!hash.startsWith(ARGON2ID_PREFIX)) return true;
  const segments = hash.split("$");
  if (segments.length !== 6) return true;
  const params = parsePhcParams(segments[3] ?? "");
  if (!params) return true;
  return (
    params.m < ARGON2ID_PARAM_FLOOR.m ||
    params.t < ARGON2ID_PARAM_FLOOR.t ||
    params.p < ARGON2ID_PARAM_FLOOR.p
  );
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
  if (isBcryptHash(hash)) {
    return verifyBcrypt(password, hash);
  }
  if (isBetterAuthScryptHash(hash)) {
    return verifyBetterAuthScrypt(password, hash);
  }
  return false;
}

/**
 * Verifies imported bcrypt hashes (Clerk CSV exports, WorkOS handoffs) so
 * migrated users keep their passwords. The sign-in path rehashes to argon2id
 * on first success — bcrypt verification exists only for the lazy-migration
 * bridge, never for new credentials. Uses hash-wasm (WebAssembly) rather than
 * a JS bcrypt port because the isolate does not guarantee setTimeout /
 * setImmediate / node:crypto, which those packages touch at module load or in
 * their async paths.
 */
async function verifyBcrypt(password: string, hash: string): Promise<boolean> {
  try {
    return await bcryptVerify({ password, hash });
  } catch {
    return false;
  }
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

/**
 * Verifies against the argon2id family of stored hashes. PHC format
 * (argon2id-wasm output) has six "$"-separated segments with "v=19" alone in
 * position 2; our legacy format packs all params there, so segment count
 * selects the verifier. Only a malformed PHC string means "wrong hash" — a
 * WASM init failure is infrastructure and fails loudly, not as "wrong
 * password".
 */
async function verifyArgon2id(password: string, hash: string): Promise<boolean> {
  if (hash.split("$").length === 6) {
    try {
      return await wasmVerifyPassword(password, hash);
    } catch (cause) {
      if (cause instanceof Error && cause.message.includes("Failed to initialize")) {
        throw cause;
      }
      return false;
    }
  }
  const parsed = parseArgon2idHash(hash);
  if (!parsed) {
    return false;
  }
  const { salt, expected, t, m, p, version } = parsed;
  try {
    const actual = argon2id(password, salt, {
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
    const actual = scrypt(password, salt, {
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

/**
 * Better Auth's default password hasher uses scrypt with fixed parameters and
 * stores the result as lowercase hex "salt:derivedKey".
 */
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

/**
 * Better Auth passes the salt as a lowercase hex *string* (not the decoded
 * bytes) and NFKC-normalizes the password before scrypt.
 */
function parseBetterAuthScryptHash(hash: string): {
  salt: string;
  expected: Uint8Array;
} | null {
  if (!isBetterAuthScryptHash(hash)) {
    return null;
  }
  try {
    const [saltHex, derivedHex] = hash.split(":") as [string, string];
    return { salt: saltHex, expected: hexToBytes(derivedHex) };
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
    const actual = scrypt(password.normalize("NFKC"), salt, {
      N: BETTER_AUTH_SCRYPT_N,
      r: BETTER_AUTH_SCRYPT_R,
      p: BETTER_AUTH_SCRYPT_P,
      dkLen: expected.length,
      maxmem: 128 * BETTER_AUTH_SCRYPT_N * BETTER_AUTH_SCRYPT_R * 2,
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
