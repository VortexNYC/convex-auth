export const BETTER_AUTH_IDENTITY_PROVIDER = "better-auth" as const;
export const AUTH_SENTINEL_PREFIX = "CONVX_AUTH:";

export type BetterAuthIdentityClaims = Record<string, unknown> & {
  subject: string;
  issuer?: string | null;
  tokenIdentifier?: string | null;
};

export type BetterAuthIssuerEnvironment = Record<string, string | undefined>;

export type ResolveBetterAuthIdentityIssuerArgs = {
  issuer?: string | null;
  baseURL?: string | null;
  convexSiteUrl?: string | null;
  env?: BetterAuthIssuerEnvironment;
};

export function getBetterAuthIdentityProvider(): typeof BETTER_AUTH_IDENTITY_PROVIDER {
  return BETTER_AUTH_IDENTITY_PROVIDER;
}

/**
 * Canonical name for {@link resolveBetterAuthIdentityIssuer}.
 *
 * Naming parity with {@link getBetterAuthIdentityProvider}: both are the
 * 'First decision' helpers a consumer reaches for when wiring the
 * canonical glue. Codex audit (2026-05-28) caught that the example
 * imported `getBetterAuthIdentityIssuer` from the package but only
 * `resolveBetterAuthIdentityIssuer` was exported — a consumer was working
 * around the asymmetry with a local alias in lib/authIdentities.ts.
 *
 * Both names ship from the package going forward. New consumers should
 * prefer `get*` for naming symmetry; the `resolve*` name remains as a
 * synonym for back-compat and to surface the parameterized variant.
 */
export function getBetterAuthIdentityIssuer(
  args: ResolveBetterAuthIdentityIssuerArgs = {},
): string {
  return resolveBetterAuthIdentityIssuer(args);
}

export function resolveBetterAuthIdentityIssuer(
  args: ResolveBetterAuthIdentityIssuerArgs = {},
): string {
  const explicitIssuer = readNonEmptyString(args.issuer);
  if (explicitIssuer !== null) {
    return trimTrailingSlash(explicitIssuer);
  }

  const explicitBaseUrl = readNonEmptyString(args.baseURL);
  if (explicitBaseUrl !== null) {
    return new URL(explicitBaseUrl).origin;
  }

  const explicitConvexSiteUrl = readNonEmptyString(args.convexSiteUrl);
  if (explicitConvexSiteUrl !== null) {
    return trimTrailingSlash(explicitConvexSiteUrl);
  }

  const env = args.env ?? readDefaultEnvironment();
  const envIssuer = readNonEmptyString(env.BETTER_AUTH_ISSUER);
  if (envIssuer !== null) {
    return trimTrailingSlash(envIssuer);
  }

  const envBetterAuthUrl = readNonEmptyString(env.BETTER_AUTH_URL);
  if (envBetterAuthUrl !== null) {
    return new URL(envBetterAuthUrl).origin;
  }

  const envConvexSiteUrl = readNonEmptyString(env.CONVEX_SITE_URL);
  if (envConvexSiteUrl !== null) {
    return trimTrailingSlash(envConvexSiteUrl);
  }

  // CONVEX_SITE_URL is only injected for HTTP action contexts. The
  // user-sync trigger resolves the issuer inside a mutation/component
  // context where it is absent — but CONVEX_CLOUD_URL is injected into
  // every Convex execution context. The .site origin is the .cloud
  // origin with the host suffix swapped, so derive it. This is what
  // makes single-origin work with zero env in any context.
  const envConvexCloudUrl = readNonEmptyString(env.CONVEX_CLOUD_URL);
  if (envConvexCloudUrl !== null) {
    return trimTrailingSlash(envConvexCloudUrl).replace(".convex.cloud", ".convex.site");
  }

  throw new Error(
    "Better Auth issuer is not configured. Set BETTER_AUTH_ISSUER, BETTER_AUTH_URL, CONVEX_SITE_URL, or CONVEX_CLOUD_URL.",
  );
}

export function resolveOptionalBetterAuthIdentityIssuer(
  args: ResolveBetterAuthIdentityIssuerArgs = {},
): string | null {
  try {
    return resolveBetterAuthIdentityIssuer(args);
  } catch {
    return null;
  }
}

export function buildBetterAuthIdentityId(betterAuthUserId: string, issuer: string): string {
  return `${BETTER_AUTH_IDENTITY_PROVIDER}|${trimTrailingSlash(issuer)}|${betterAuthUserId}`;
}

export function buildBetterAuthTokenIdentifier(betterAuthUserId: string, issuer: string): string {
  return `${trimTrailingSlash(issuer)}|${betterAuthUserId}`;
}

export function buildAuthSentinelId(authUserId: string): string {
  return `${AUTH_SENTINEL_PREFIX}${authUserId}`;
}

export function isAuthSentinelId(value: string): boolean {
  return value.startsWith(AUTH_SENTINEL_PREFIX);
}

export function isBetterAuthIdentity(
  identity: { issuer?: string | null; tokenIdentifier?: string | null },
  args: ResolveBetterAuthIdentityIssuerArgs = {},
): boolean {
  const issuer = readNonEmptyString(identity.issuer);
  if (issuer === null) {
    return false;
  }

  return trimTrailingSlash(issuer) === resolveOptionalBetterAuthIdentityIssuer(args);
}

export function readRequiredIdentityEmail(identity: BetterAuthIdentityClaims): string {
  const email = readOptionalIdentityString(identity, "email");
  if (email !== undefined) {
    return email;
  }

  throw new Error("Authenticated Better Auth identity is missing email claim.");
}

export function readIdentityEmailVerified(identity: BetterAuthIdentityClaims): boolean {
  return identity.emailVerified === true;
}

export function readIdentitySessionId(identity: BetterAuthIdentityClaims): string | null {
  const sessionId = readOptionalIdentityString(identity, "sessionId");
  if (sessionId !== undefined) {
    return sessionId;
  }

  const sid = readOptionalIdentityString(identity, "sid");
  return sid ?? null;
}

export function readOptionalIdentityString(
  identity: BetterAuthIdentityClaims,
  key: string,
): string | undefined {
  const value = identity[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readNonEmptyString(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? null : trimmed;
}

function readDefaultEnvironment(): BetterAuthIssuerEnvironment {
  return (globalThis as { process?: { env?: BetterAuthIssuerEnvironment } }).process?.env ?? {};
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}
