import {
  type JWTPayload,
  type JSONWebKeySet,
  SignJWT,
  importJWK,
  calculateJwkThumbprint,
} from "jose";
import { base64urlToBytes } from "./password.js";

export async function getJwtPrivateKey(): Promise<{ key: CryptoKey; kid: string }> {
  const raw = process.env.JWT_PRIVATE_KEY;
  if (!raw) {
    throw new Error("JWT_PRIVATE_KEY environment variable is not set");
  }
  const jwk = JSON.parse(raw) as JsonWebKey & { kid?: string };
  const keyLike = await importJWK(jwk, "RS256");
  if (keyLike instanceof Uint8Array) {
    throw new Error("JWT_PRIVATE_KEY must be an asymmetric key, not a symmetric secret");
  }
  const kid = jwk.kid ?? (await calculateJwkThumbprint(jwk, "sha256"));
  return { key: keyLike, kid };
}

export async function getJwks(): Promise<JSONWebKeySet> {
  const raw = process.env.JWKS;
  if (!raw) {
    throw new Error("JWKS environment variable is not set");
  }
  const jwks = JSON.parse(raw) as JSONWebKeySet;
  const keys = await Promise.all(
    jwks.keys.map(async (jwk) => {
      if (jwk === null || typeof jwk !== "object" || jwk.kid) {
        return jwk;
      }
      return { ...jwk, kid: await calculateJwkThumbprint(jwk, "sha256") };
    }),
  );
  return { keys };
}

const DEFAULT_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

const DEFAULT_AUDIENCE = "convex";

const CLOCK_SKEW_LEEWAY_SECONDS = 300;

function resolveIssuer(): string {
  const issuer = process.env.CONVEX_SITE_URL;
  if (issuer === undefined) {
    throw new Error("CONVEX_SITE_URL environment variable is not set");
  }
  return issuer.endsWith("/") ? issuer.slice(0, -1) : issuer;
}

export async function mintToken(
  sub: string,
  sessionId: string,
  extra: Record<string, unknown> = {},
  options: { expiresInSeconds?: number; audience?: string; issuer?: string } = {},
): Promise<string> {
  const { key, kid } = await getJwtPrivateKey();
  const expiresInSeconds = options.expiresInSeconds ?? DEFAULT_TOKEN_TTL_SECONDS;
  const exp = new Date(Date.now() + expiresInSeconds * 1000);
  const issuer = options.issuer ?? resolveIssuer();
  const audience = options.audience ?? DEFAULT_AUDIENCE;
  const header: { alg: "RS256"; typ: "JWT"; kid?: string } = { alg: "RS256", typ: "JWT" };
  if (kid) {
    header.kid = kid;
  }
  return await new SignJWT({ sessionId, ...extra })
    .setProtectedHeader(header)
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(key);
}

function base64UrlToString(value: string): string {
  return new TextDecoder().decode(base64urlToBytes(value));
}

function base64UrlToBytes(value: string): Uint8Array {
  return base64urlToBytes(value);
}

function arrayBufferFromBytes(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

type JwtHeader = {
  alg: string;
  typ?: string;
  kid?: string;
};

async function importPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: { name: "SHA-256" } },
    false,
    ["verify"],
  );
}

function findPublicKey(jwks: JSONWebKeySet, kid?: string): JsonWebKey | undefined {
  if (kid) {
    return jwks.keys.find((k) => k.kid === kid);
  }
  return jwks.keys[0];
}

export async function verifyToken(token: string): Promise<JWTPayload> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid JWT: expected three segments");
  }

  const [h64, p64, s64] = parts;
  if (!h64 || !p64 || !s64) {
    throw new Error("Invalid JWT: missing segment");
  }

  let header: JwtHeader;
  let payload: JWTPayload;
  try {
    header = JSON.parse(base64UrlToString(h64)) as JwtHeader;
    payload = JSON.parse(base64UrlToString(p64)) as JWTPayload;
  } catch {
    throw new Error("Invalid JWT: malformed header or payload");
  }

  if (header.alg !== "RS256") {
    throw new Error(`Invalid JWT: unsupported algorithm ${header.alg ?? "none"}`);
  }

  const jwks = await getJwks();
  const jwk = findPublicKey(jwks, header.kid);
  if (!jwk) {
    throw new Error("Invalid JWT: no matching public key");
  }

  const key = await importPublicKey(jwk);
  const data = new TextEncoder().encode(`${h64}.${p64}`);
  const signature = arrayBufferFromBytes(base64UrlToBytes(s64));
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, data);
  if (!valid) {
    throw new Error("Invalid JWT: signature verification failed");
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp !== undefined && typeof payload.exp === "number" && now > payload.exp) {
    throw new Error("Invalid JWT: token expired");
  }
  if (payload.nbf !== undefined && typeof payload.nbf === "number" && now < payload.nbf) {
    throw new Error("Invalid JWT: token not yet valid");
  }
  if (
    payload.iat !== undefined &&
    typeof payload.iat === "number" &&
    now < payload.iat - CLOCK_SKEW_LEEWAY_SECONDS
  ) {
    throw new Error("Invalid JWT: issued in the future");
  }

  return payload;
}
