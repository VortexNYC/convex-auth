import {
  decodeProtectedHeader,
  exportJWK,
  generateKeyPair,
  importJWK,
  jwtVerify,
  SignJWT,
} from "jose";

import type {
  McpOAuthAccessTokenClaims,
  McpOAuthAccessTokenVerificationResult,
  McpOAuthJwks,
  McpOAuthSignedAccessToken,
  McpOAuthSigningAlgorithm,
  McpOAuthSigningKeyPublicationRecord,
  McpOAuthSigningKeyRecord,
} from "./types";

const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

function parseJsonObject(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new TypeError("Expected a JSON object");
  }
  return Object.fromEntries(Object.entries(parsed));
}

export const MAX_MCP_OAUTH_ACCESS_TOKEN_TTL_SECONDS = DEFAULT_ACCESS_TOKEN_TTL_SECONDS;
export const MCP_OAUTH_RETIRED_SIGNING_KEY_RETENTION_MS = DEFAULT_ACCESS_TOKEN_TTL_SECONDS * 1000;

export function shouldPublishMcpOAuthSigningKey(args: {
  key: McpOAuthSigningKeyPublicationRecord;
  now: number;
  retentionWindowMs?: number;
}): boolean {
  const retentionWindowMs = args.retentionWindowMs ?? MCP_OAUTH_RETIRED_SIGNING_KEY_RETENTION_MS;
  return (
    args.key.status === "active" ||
    (args.key.retiredAt !== null && args.now - args.key.retiredAt <= retentionWindowMs)
  );
}

export async function createMcpOAuthSigningKeyRecord(args?: {
  keyId?: string;
  algorithm?: McpOAuthSigningAlgorithm;
}): Promise<McpOAuthSigningKeyRecord> {
  const algorithm = args?.algorithm ?? "ES256";
  const { privateKey, publicKey } = await generateKeyPair(algorithm, {
    extractable: true,
  });
  const publicJwk = await exportJWK(publicKey);
  const privateJwk = await exportJWK(privateKey);
  const keyId = args?.keyId ?? crypto.randomUUID();

  publicJwk.kid = keyId;
  publicJwk.alg = algorithm;
  publicJwk.use = "sig";
  privateJwk.kid = keyId;
  privateJwk.alg = algorithm;
  privateJwk.use = "sig";

  return {
    keyId,
    algorithm,
    publicJwkJson: JSON.stringify(publicJwk),
    privateJwkJson: JSON.stringify(privateJwk),
  };
}

export function buildMcpOAuthJwks(args: {
  keys: readonly (McpOAuthSigningKeyRecord & McpOAuthSigningKeyPublicationRecord)[];
  now?: number;
  retentionWindowMs?: number;
}): McpOAuthJwks {
  const now = args.now ?? Date.now();

  return {
    keys: args.keys
      .filter((key) =>
        shouldPublishMcpOAuthSigningKey({
          key,
          now,
          retentionWindowMs: args.retentionWindowMs,
        }),
      )
      .map((key) => parseJsonObject(key.publicJwkJson)),
  };
}

export async function signMcpOAuthAccessToken(args: {
  signingKey: McpOAuthSigningKeyRecord;
  issuer: string;
  audience: string;
  subject: string;
  claims: McpOAuthAccessTokenClaims;
  expiresInSeconds?: number;
  now?: number;
}): Promise<McpOAuthSignedAccessToken> {
  const privateJwk = parseJsonObject(args.signingKey.privateJwkJson);
  const signingKey = await importJWK(privateJwk, args.signingKey.algorithm);
  const now = args.now ?? Math.floor(Date.now() / 1000);
  const expiresInSeconds =
    args.expiresInSeconds !== undefined && Number.isFinite(args.expiresInSeconds)
      ? Math.max(1, Math.floor(args.expiresInSeconds))
      : DEFAULT_ACCESS_TOKEN_TTL_SECONDS;
  const expiresAt = now + expiresInSeconds;

  const jwt = await new SignJWT({
    scope: args.claims.scopes.join(" "),
    azp: args.claims.clientId,
    subject_type: args.claims.subjectType ?? "user",
    ...(args.claims.subjectId === undefined ? {} : { subject_id: args.claims.subjectId }),
    resource: args.claims.resourceId,
    ...(args.claims.organizationId !== undefined ? { org_id: args.claims.organizationId } : {}),
    ...(args.claims.organizationSlug !== undefined
      ? { org_slug: args.claims.organizationSlug }
      : {}),
    ...args.claims.extraClaims,
  })
    .setProtectedHeader({
      alg: args.signingKey.algorithm,
      kid: args.signingKey.keyId,
      typ: "JWT",
    })
    .setIssuer(args.issuer)
    .setSubject(args.subject)
    .setAudience(args.audience)
    .setIssuedAt(now)
    .setExpirationTime(expiresAt)
    .sign(signingKey);

  return {
    accessToken: jwt,
    expiresIn: expiresAt - now,
    scope: args.claims.scopes.join(" "),
    tokenType: "Bearer",
  };
}

/**
 * Verify an MCP access token against the registered signing keys.
 *
 * The algorithm is pinned to the key's own (`ES256`) — never the token
 * header's `alg`. Trusting the header would admit algorithm-substitution
 * attacks; this matches the RS256-pinned user-bearer verifier.
 */
export async function verifyMcpOAuthAccessToken(args: {
  accessToken: string;
  signingKeys: readonly McpOAuthSigningKeyRecord[];
  issuer: string;
  audience: string;
}): Promise<McpOAuthAccessTokenVerificationResult> {
  const header = decodeProtectedHeader(args.accessToken);
  if (typeof header.kid !== "string") {
    throw new Error("Signing key id missing");
  }

  const key = args.signingKeys.find((candidate) => candidate.keyId === header.kid) ?? null;
  if (key === null) {
    throw new Error("Signing key not found");
  }

  const publicJwk = parseJsonObject(key.publicJwkJson);
  const verificationKey = await importJWK(publicJwk, key.algorithm);
  const { payload } = await jwtVerify(args.accessToken, verificationKey, {
    issuer: args.issuer,
    audience: args.audience,
    algorithms: [key.algorithm],
  });

  return {
    keyId: header.kid,
    audience: normalizeJwtAudience(payload.aud),
    issuer: typeof payload.iss === "string" ? payload.iss : null,
    subject: typeof payload.sub === "string" ? payload.sub : null,
    clientId: typeof payload.azp === "string" ? payload.azp : null,
    subjectId: typeof payload.subject_id === "string" ? payload.subject_id : null,
    organizationId: typeof payload.org_id === "string" ? payload.org_id : null,
    organizationSlug: typeof payload.org_slug === "string" ? payload.org_slug : null,
    resourceId: typeof payload.resource === "string" ? payload.resource : null,
    scope: typeof payload.scope === "string" ? payload.scope : "",
    subjectType: typeof payload.subject_type === "string" ? payload.subject_type : null,
    issuedAt: typeof payload.iat === "number" ? payload.iat : null,
    expiresAt: typeof payload.exp === "number" ? payload.exp : null,
    claims: payload,
  };
}

function normalizeJwtAudience(audience: unknown): string[] {
  if (Array.isArray(audience)) {
    return audience.filter((value): value is string => typeof value === "string");
  }
  return typeof audience === "string" ? [audience] : [];
}

export function buildMcpOAuthTokenResponse(args: {
  accessToken: string;
  tokenType?: "Bearer";
  expiresIn: number;
  scope: string;
  refreshToken?: string;
}): {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  scope: string;
  refresh_token?: string;
} {
  return {
    access_token: args.accessToken,
    token_type: args.tokenType ?? "Bearer",
    expires_in: args.expiresIn,
    scope: args.scope,
    ...(args.refreshToken !== undefined ? { refresh_token: args.refreshToken } : {}),
  };
}
