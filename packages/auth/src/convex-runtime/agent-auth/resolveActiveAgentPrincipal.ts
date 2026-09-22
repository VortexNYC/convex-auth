import { decodeProtectedHeader, decodeJwt, importJWK, jwtVerify } from "jose";

import { bytesToBase64url } from "../native/password.js";
import type { AgentCapabilityConstraint, AgentPrincipal } from "../coreTypes";
import { resolveAgentPrincipal } from "../principal";

const MAX_TOKEN_LIFETIME_SECONDS = 90;
const CLOCK_TOLERANCE_SECONDS = 5;

export type AgentCredentialVerificationMaterial = {
  agentId: string;
  hostId: string;
  organizationId: string;
  generation: number;
  thumbprint: string;
  publicJwkJson: string;
};

export type AgentCredentialAuthorityResult = {
  kind: "agent";
  agentId: string;
  hostId: string;
  organizationId: string;
  mode: "delegated" | "autonomous";
  delegatedUserId: string | null;
  credentialId: string;
  permissions: string[];
  capabilityGrants: Array<{
    capability: string;
    constraintsJson?: string;
    expiresAt?: number;
  }>;
  isRestricted: boolean;
  restrictedReason: string | null;
};

export type AgentCredentialAuthorityAdapter = {
  getVerificationMaterial(input: {
    thumbprint: string;
  }): Promise<AgentCredentialVerificationMaterial | null>;
  consumeCredential(input: {
    agentId: string;
    keyGeneration: number;
    replayIdHash: string;
    replayExpiresAt: number;
    requestedOrganizationId?: string;
    claimedPermissions: string[];
    claimedCapabilities: string[];
  }): Promise<AgentCredentialAuthorityResult>;
};

export type AgentRequestBinding = {
  method: string;
  url: string;
  bodySha256: string;
};

export type ResolveAgentPrincipalInput = {
  token: string;
  audience: string;
  requestedOrganizationId?: string;
  requestBinding?: AgentRequestBinding;
  now?: number;
};

export async function resolveActiveAgentPrincipal(
  adapter: AgentCredentialAuthorityAdapter,
  input: ResolveAgentPrincipalInput,
): Promise<AgentPrincipal> {
  const header = decodeProtectedHeader(input.token);
  if (header.alg !== "EdDSA" || header.typ !== "JWT") {
    throw new Error("Agent credential algorithm or type is invalid");
  }
  const thumbprint = requireClaim(header.kid, "kid");
  const material = await adapter.getVerificationMaterial({ thumbprint });
  if (material === null || material.thumbprint !== thumbprint) {
    throw new Error("Agent credential key is unknown");
  }
  const unverified = decodeJwt(input.token);
  if (unverified.sub !== material.agentId) {
    throw new Error("Agent credential subject is invalid");
  }
  const publicJwk = parsePublicEd25519Jwk(material.publicJwkJson);
  const key = await importJWK(publicJwk, "EdDSA");
  const nowSeconds = Math.floor((input.now ?? Date.now()) / 1000);
  const { payload } = await jwtVerify(input.token, key, {
    algorithms: ["EdDSA"],
    audience: requireClaim(input.audience, "audience"),
    issuer: thumbprint,
    subject: material.agentId,
    clockTolerance: CLOCK_TOLERANCE_SECONDS,
    currentDate: new Date(nowSeconds * 1000),
  });
  const issuedAt = requireNumericClaim(payload.iat, "iat");
  const expiresAt = requireNumericClaim(payload.exp, "exp");
  if (issuedAt > nowSeconds + CLOCK_TOLERANCE_SECONDS) {
    throw new Error("Agent credential issued-at time is invalid");
  }
  if (expiresAt <= issuedAt || expiresAt - issuedAt > MAX_TOKEN_LIFETIME_SECONDS) {
    throw new Error("Agent credential lifetime is invalid");
  }
  const replayId = requireClaim(payload.jti, "jti");
  const permissions = requireStringArrayClaim(payload.permissions, "permissions");
  const capabilities = requireStringArrayClaim(payload.capabilities, "capabilities");
  if (input.requestBinding !== undefined) {
    requireRequestBinding(payload, input.requestBinding);
  }
  const replayIdHash = await sha256Base64Url(`${material.agentId}\u0000${replayId}`);
  const authority = await adapter.consumeCredential({
    agentId: material.agentId,
    keyGeneration: material.generation,
    replayIdHash,
    replayExpiresAt: expiresAt * 1000,
    requestedOrganizationId: input.requestedOrganizationId,
    claimedPermissions: permissions,
    claimedCapabilities: capabilities,
  });
  if (
    authority.agentId !== material.agentId ||
    authority.hostId !== material.hostId ||
    authority.organizationId !== material.organizationId
  ) {
    throw new Error("Agent authority response does not match verified key");
  }
  return resolveAgentPrincipal({
    ...authority,
    capabilityGrants: authority.capabilityGrants.map((grant) => ({
      capability: grant.capability,
      constraints: parseConstraints(grant.constraintsJson),
      expiresAt: grant.expiresAt ?? null,
    })),
  });
}

function requireRequestBinding(payload: Record<string, unknown>, expected: AgentRequestBinding) {
  if (
    payload.htm !== expected.method.toUpperCase() ||
    payload.htu !== expected.url ||
    payload.body_sha256 !== expected.bodySha256
  ) {
    throw new Error("Agent credential request binding is invalid");
  }
}

function parsePublicEd25519Jwk(value: string) {
  const parsed: unknown = JSON.parse(value);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new TypeError("Agent public JWK is invalid");
  }
  const jwk = Object.fromEntries(Object.entries(parsed));
  if (
    jwk.kty !== "OKP" ||
    jwk.crv !== "Ed25519" ||
    typeof jwk.x !== "string" ||
    Object.hasOwn(jwk, "d")
  ) {
    throw new TypeError("Agent public JWK is not Ed25519 public material");
  }
  return jwk;
}

function parseConstraints(
  value: string | undefined,
): Readonly<Record<string, AgentCapabilityConstraint>> | null {
  if (value === undefined) return null;
  const parsed: unknown = JSON.parse(value);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new TypeError("Agent capability constraints are invalid");
  }
  return Object.fromEntries(
    Object.entries(parsed).map(([key, constraint]) => [key, parseConstraint(constraint)]),
  );
}

function parseConstraint(value: unknown): AgentCapabilityConstraint {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Agent capability constraint is invalid");
  }
  const record = Object.fromEntries(Object.entries(value));
  const parsed: Exclude<AgentCapabilityConstraint, string | number | boolean> = {};
  if (record.eq !== undefined) parsed.eq = requirePrimitive(record.eq);
  if (record.min !== undefined) parsed.min = requireFiniteNumber(record.min);
  if (record.max !== undefined) parsed.max = requireFiniteNumber(record.max);
  if (record.in !== undefined) parsed.in = requirePrimitiveArray(record.in);
  const notIn = record.notIn ?? record.not_in;
  if (notIn !== undefined) parsed.notIn = requirePrimitiveArray(notIn);
  return parsed;
}

function requireStringArrayClaim(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new TypeError(`Agent credential ${name} claim is invalid`);
  }
  return [...new Set(value.map((item) => requireClaim(item, name)))].sort();
}

function requirePrimitive(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
    throw new TypeError("Agent capability primitive is invalid");
  }
  return value;
}

function requirePrimitiveArray(value: unknown) {
  if (!Array.isArray(value)) {
    throw new TypeError("Agent capability primitive array is invalid");
  }
  return value.map(requirePrimitive);
}

function requireFiniteNumber(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError("Agent capability numeric constraint is invalid");
  }
  return value;
}

function requireNumericClaim(value: unknown, name: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new TypeError(`Agent credential ${name} claim is invalid`);
  }
  return value;
}

function requireClaim(value: unknown, name: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`Agent credential ${name} claim is invalid`);
  }
  return value.trim();
}

async function sha256Base64Url(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToBase64url(new Uint8Array(digest));
}
