import type {
  FunctionReference,
  FunctionVisibility,
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
} from "convex/server";

import type { ComponentApi as ConvexAuthComponentApi } from "../component/_generated/component";
import {
  AUTH_MD_CLAIM_ENDPOINT_PATH,
  AUTH_MD_CLAIM_GRANT,
  AUTH_MD_JWT_BEARER_GRANT,
} from "./discovery";
import {
  signAuthMdAccessToken,
  signAuthMdIdentityAssertion,
  verifyAuthMdAccessToken,
  verifyAuthMdIdentityAssertion,
  type AuthMdAccessTokenClaims,
  type AuthMdIdentityAssertionClaims,
  type AuthMdSigningKeyRecord,
} from "./jwt";
import {
  createAuthMdServiceAuthChallenge,
  hashAuthMdLoginHint,
  hashAuthMdSecret,
  hashAuthMdUserCode,
} from "./service-auth";

const DEFAULT_ACCESS_TOKEN_EXPIRES_IN_SECONDS = 60 * 60;
const DEFAULT_IDENTITY_PROVIDER = "convex-auth";

/**
 * Exactly the component functions this runtime calls -- not three whole namespaces.
 *
 * The broader `Pick<ConvexAuthComponentApi, "authMd"|"identity"|"mcp">` obliged every
 * caller and every test double to supply all 23 functions in those namespaces to satisfy
 * a runtime that uses 10, which is why the harness had to cast. Narrowing it makes a
 * complete double possible by construction, and adding a component function no longer
 * breaks consumers.
 */
/**
 * Exactly the component functions this runtime calls, at either visibility.
 *
 * Two things were wrong with `Pick<ConvexAuthComponentApi, "authMd"|"identity"|"mcp">`.
 * It obliged every caller to supply all 23 functions in those namespaces for a runtime
 * that uses 10. And it pinned visibility to `"internal"` -- how a HOST sees a mounted
 * component -- which made the component's own `api` (public inside the component)
 * unassignable, so in-package tests had to fake references and cast.
 *
 * The runtime only ever passes these to `runQuery`/`runMutation`; visibility is not
 * something it can act on. Accepting either lets a host pass `components.convexAuth`
 * and a test pass the real `api`, with no cast at either end. Argument and return
 * types still come from the generated API, so drift is still a compile error.
 */
type AtEitherVisibility<Ref> =
  Ref extends FunctionReference<
    infer Type,
    FunctionVisibility,
    infer Args,
    infer Return,
    infer Name
  >
    ? FunctionReference<Type, "public" | "internal", Args, Return, Name>
    : never;

type PickedRefs<Namespace, Keys extends keyof Namespace> = {
  readonly [K in Keys]: AtEitherVisibility<Namespace[K]>;
};

export type AuthMdServiceAuthComponentHandle = {
  readonly authMd: PickedRefs<
    ConvexAuthComponentApi["authMd"],
    | "registerServiceAuth"
    | "completeServiceAuthClaim"
    | "pollServiceAuthClaim"
    | "consumeServiceAuthAssertion"
    | "introspectServiceAuthCredential"
    | "refreshServiceAuthCredential"
    | "revokeServiceAuthCredentialAsHolder"
    | "revokeServiceAuthRegistration"
  >;
  readonly identity: PickedRefs<ConvexAuthComponentApi["identity"], "getByIdentity">;
  readonly mcp: PickedRefs<ConvexAuthComponentApi["mcp"], "getSigningKey" | "listSigningKeys">;
};

export type AuthMdServiceAuthMutationCtx = Pick<
  GenericMutationCtx<GenericDataModel>,
  "auth" | "runMutation" | "runQuery"
>;

export type AuthMdServiceAuthQueryCtx = Pick<GenericQueryCtx<GenericDataModel>, "runQuery">;

export type AuthMdServiceAuthRegistrationResponse = {
  registration_id: string;
  registration_type: "service_auth";
  claim_url: string;
  claim_token: string;
  claim_token_expires: string;
  post_claim_scopes: string[];
  claim: {
    user_code: string;
    expires_in: number;
    verification_uri: string;
    interval: number;
  };
};

export type AuthMdServiceAuthTokenResponse = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  scope: string;
  identity_assertion?: string;
  assertion_expires?: string;
};

export type AuthMdServiceAuthPollResponse =
  | AuthMdServiceAuthTokenResponse
  | {
      error: "authorization_pending" | "slow_down" | "expired_token" | "access_denied";
      interval?: number;
    };

export type AuthMdServiceAuthPrincipal = {
  kind: "user_delegation";
  credentialId: string;
  registrationId: string;
  userId: string;
  organizationId: string;
  resource: string;
  scopes: string[];
  expiresAt: number;
};

export type CreateAuthMdServiceAuthRuntimeConfig = {
  component: AuthMdServiceAuthComponentHandle;
  issuer: string;
  resource: string;
  scopesSupported: readonly string[];
  buildVerificationUri(claimAttemptToken: string): string;
  identityProvider?: string;
  accessTokenExpiresInSeconds?: number;
  now?: () => number;
};

export type AuthMdServiceAuthRuntime = {
  registerServiceAuth(
    ctx: AuthMdServiceAuthMutationCtx,
    args: { loginHint: string; scopes: readonly string[] },
  ): Promise<AuthMdServiceAuthRegistrationResponse>;
  completeServiceAuthClaim(
    ctx: AuthMdServiceAuthMutationCtx,
    args: {
      claimAttemptToken: string;
      userCode: string;
      organizationId: string;
    },
  ): Promise<{ ok: true; status: "claimed" } | { ok: false; reason: "invalid_claim" }>;
  pollServiceAuthClaim(
    ctx: AuthMdServiceAuthMutationCtx,
    args: { claimToken: string },
  ): Promise<AuthMdServiceAuthPollResponse>;
  exchangeIdentityAssertion(
    ctx: AuthMdServiceAuthMutationCtx,
    args: { assertion: string; resource: string },
  ): Promise<AuthMdServiceAuthTokenResponse>;
  /**
   * Rotates a live access token.
   *
   * Refresh deliberately does NOT go back through the identity assertion: re-presenting
   * an assertion is replaying an authorization code, which is what made a captured
   * assertion a credential factory. The access token is the artifact that already
   * proves a completed ceremony, so it is what a client re-presents.
   */
  refreshAccessToken(
    ctx: AuthMdServiceAuthMutationCtx,
    args: { accessToken: string },
  ): Promise<AuthMdServiceAuthTokenResponse>;
  authenticateAccessToken(
    ctx: AuthMdServiceAuthQueryCtx,
    args: { accessToken: string },
  ): Promise<AuthMdServiceAuthPrincipal>;
  revokeAccessToken(
    ctx: AuthMdServiceAuthMutationCtx,
    args: { accessToken: string },
  ): Promise<{ ok: true }>;
  revokeRegistration(
    ctx: AuthMdServiceAuthMutationCtx,
    args: { registrationId: string },
  ): Promise<{ ok: true }>;
};

export function createAuthMdServiceAuthRuntime(
  config: CreateAuthMdServiceAuthRuntimeConfig,
): AuthMdServiceAuthRuntime {
  const issuer = normalizeIssuer(config.issuer);
  const resource = normalizeResource(config.resource);
  const scopesSupported = normalizeScopes(config.scopesSupported);
  const supportedScopeSet = new Set(scopesSupported);
  const identityProvider = config.identityProvider ?? DEFAULT_IDENTITY_PROVIDER;
  const accessTokenExpiresInSeconds = requireAccessTokenLifetime(
    config.accessTokenExpiresInSeconds ?? DEFAULT_ACCESS_TOKEN_EXPIRES_IN_SECONDS,
  );
  const now = config.now ?? Date.now;

  const signingKey = async (ctx: AuthMdServiceAuthQueryCtx): Promise<AuthMdSigningKeyRecord> => {
    const key = await ctx.runQuery(config.component.mcp.getSigningKey, {});
    if (key === null) {
      throw new Error("auth.md authorization signing key is not configured");
    }
    return key;
  };

  const signingKeys = async (ctx: AuthMdServiceAuthQueryCtx): Promise<AuthMdSigningKeyRecord[]> =>
    await ctx.runQuery(config.component.mcp.listSigningKeys, {
      includeRetired: true,
    });

  const exchangeAssertion = async (
    ctx: AuthMdServiceAuthMutationCtx,
    claims: AuthMdIdentityAssertionClaims,
  ): Promise<AuthMdServiceAuthTokenResponse> => {
    const authority = await ctx.runMutation(config.component.authMd.consumeServiceAuthAssertion, {
      assertionId: claims.assertionId,
      credentialExpiresInSeconds: accessTokenExpiresInSeconds,
    });
    requireAuthorityMatch(authority, claims);
    return await signAccessTokenResponse({
      issuer,
      authority,
      signingKey: await signingKey(ctx),
    });
  };

  return {
    async registerServiceAuth(ctx, args) {
      const requestedScopes = requireSupportedScopes(args.scopes, supportedScopeSet);
      const challenge = await createAuthMdServiceAuthChallenge({ now: now() });
      const verificationUri = normalizeVerificationUri(
        config.buildVerificationUri(challenge.claimViewToken),
        challenge.claimViewToken,
      );
      const registration = await ctx.runMutation(config.component.authMd.registerServiceAuth, {
        resource,
        loginHintHash: await hashAuthMdLoginHint(args.loginHint),
        scopes: requestedScopes,
        claimTokenHash: challenge.claimTokenHash,
        claimViewTokenHash: challenge.claimViewTokenHash,
        userCodeHash: challenge.userCodeHash,
        expiresAt: challenge.expiresAt,
        userCodeExpiresAt: challenge.userCodeExpiresAt,
        pollIntervalSeconds: challenge.interval,
      });
      return {
        registration_id: registration.registrationId,
        registration_type: "service_auth",
        claim_url: `${issuer}${AUTH_MD_CLAIM_ENDPOINT_PATH}`,
        claim_token: challenge.claimToken,
        claim_token_expires: new Date(challenge.expiresAt).toISOString(),
        post_claim_scopes: requestedScopes,
        claim: {
          user_code: challenge.userCode,
          expires_in: challenge.userCodeExpiresIn,
          verification_uri: verificationUri,
          interval: challenge.interval,
        },
      };
    },

    async completeServiceAuthClaim(ctx, args) {
      const userId = await requireAuthenticatedComponentUser(
        ctx,
        config.component,
        identityProvider,
      );
      return await ctx.runMutation(config.component.authMd.completeServiceAuthClaim, {
        claimViewTokenHash: await hashAuthMdSecret(args.claimAttemptToken),
        userCodeHash: await hashAuthMdUserCode(args.userCode),
        userId,
        organizationId: requireIdentifier(args.organizationId, "organizationId"),
      });
    },

    async pollServiceAuthClaim(ctx, args) {
      const poll = await ctx.runMutation(config.component.authMd.pollServiceAuthClaim, {
        claimTokenHash: await hashAuthMdSecret(args.claimToken),
      });
      if (poll.status !== "claimed") {
        return poll.status === "authorization_pending" || poll.status === "slow_down"
          ? { error: poll.status, interval: poll.interval }
          : { error: poll.status };
      }
      const key = await signingKey(ctx);
      const assertionClaims = authorityToAssertionClaims(poll);
      const identityAssertion = await signAuthMdIdentityAssertion({
        signingKey: key,
        issuer,
        claims: assertionClaims,
      });
      const token = await exchangeAssertion(ctx, assertionClaims);
      return {
        ...token,
        identity_assertion: identityAssertion,
        assertion_expires: new Date(poll.expiresAt).toISOString(),
      };
    },

    async exchangeIdentityAssertion(ctx, args) {
      if (args.resource !== resource) {
        throw new Error("auth.md token resource does not match this service");
      }
      const claims = await verifyAuthMdIdentityAssertion({
        assertion: args.assertion,
        signingKeys: await signingKeys(ctx),
        issuer,
        now: now(),
      });
      if (claims.resource !== resource) {
        throw new Error("auth.md assertion resource does not match this service");
      }
      return await exchangeAssertion(ctx, claims);
    },

    /**
     * The component re-checks the delegating authority and revokes the old
     * credential in the same mutation, so exactly one stays live per chain.
     */
    async refreshAccessToken(ctx, args) {
      const claims = await verifyAuthMdAccessToken({
        accessToken: args.accessToken,
        signingKeys: await signingKeys(ctx),
        issuer,
        resource,
        now: now(),
      });
      const authority = await ctx.runMutation(
        config.component.authMd.refreshServiceAuthCredential,
        {
          credentialId: claims.credentialId,
          credentialExpiresInSeconds: accessTokenExpiresInSeconds,
        },
      );
      return await signAccessTokenResponse({
        issuer,
        authority,
        signingKey: await signingKey(ctx),
      });
    },

    async authenticateAccessToken(ctx, args) {
      const claims = await verifyAuthMdAccessToken({
        accessToken: args.accessToken,
        signingKeys: await signingKeys(ctx),
        issuer,
        resource,
        now: now(),
      });
      const authority = await ctx.runQuery(
        config.component.authMd.introspectServiceAuthCredential,
        { credentialId: claims.credentialId },
      );
      if (!authority.active) {
        throw new Error("auth.md access token authority is inactive");
      }
      requireAuthorityMatch(authority, claims);
      return {
        kind: "user_delegation",
        credentialId: authority.credentialId,
        registrationId: authority.registrationId,
        userId: authority.userId,
        organizationId: authority.organizationId,
        resource: authority.resource,
        scopes: [...authority.scopes],
        expiresAt: authority.expiresAt,
      };
    },

    async revokeAccessToken(ctx, args) {
      const claims = await verifyAuthMdAccessToken({
        accessToken: args.accessToken,
        signingKeys: await signingKeys(ctx),
        issuer,
        resource,
        now: now(),
      });
      return await ctx.runMutation(config.component.authMd.revokeServiceAuthCredentialAsHolder, {
        credentialId: claims.credentialId,
      });
    },

    async revokeRegistration(ctx, args) {
      const actorUserId = await requireAuthenticatedComponentUser(
        ctx,
        config.component,
        identityProvider,
      );
      return await ctx.runMutation(config.component.authMd.revokeServiceAuthRegistration, {
        registrationId: requireIdentifier(args.registrationId, "registrationId"),
        actorUserId,
      });
    },
  };
}

async function requireAuthenticatedComponentUser(
  ctx: AuthMdServiceAuthMutationCtx,
  component: AuthMdServiceAuthComponentHandle,
  provider: string,
): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    throw new Error("auth.md claim requires an authenticated Convex account");
  }
  if (identity.emailVerified !== true) {
    throw new Error("auth.md claim requires a verified Convex account");
  }
  const linked = await ctx.runQuery(component.identity.getByIdentity, {
    provider,
    issuer: identity.issuer,
    subject: identity.subject,
  });
  if (linked === null || !linked.emailVerified) {
    throw new Error("auth.md claim account is not linked to Convex Auth");
  }
  return linked.userId;
}

function authorityToAssertionClaims(authority: {
  assertionId: string;
  registrationId: string;
  resource: string;
  userId: string;
  organizationId: string;
  scopes: string[];
  issuedAt: number;
  expiresAt: number;
}): AuthMdIdentityAssertionClaims {
  return {
    assertionId: authority.assertionId,
    registrationId: authority.registrationId,
    resource: authority.resource,
    userId: authority.userId,
    organizationId: authority.organizationId,
    scopes: [...authority.scopes],
    issuedAt: Math.floor(authority.issuedAt / 1000),
    expiresAt: Math.floor(authority.expiresAt / 1000),
  };
}

async function signAccessTokenResponse(args: {
  issuer: string;
  signingKey: AuthMdSigningKeyRecord;
  authority: {
    credentialId: string;
    registrationId: string;
    resource: string;
    userId: string;
    organizationId: string;
    scopes: string[];
    issuedAt: number;
    expiresAt: number;
  };
}): Promise<AuthMdServiceAuthTokenResponse> {
  const claims: AuthMdAccessTokenClaims = {
    credentialId: args.authority.credentialId,
    registrationId: args.authority.registrationId,
    resource: args.authority.resource,
    userId: args.authority.userId,
    organizationId: args.authority.organizationId,
    scopes: [...args.authority.scopes],
    issuedAt: Math.floor(args.authority.issuedAt / 1000),
    expiresAt: Math.floor(args.authority.expiresAt / 1000),
  };
  return {
    access_token: await signAuthMdAccessToken({
      signingKey: args.signingKey,
      issuer: args.issuer,
      claims,
    }),
    token_type: "Bearer",
    expires_in: Math.max(1, claims.expiresAt - claims.issuedAt),
    scope: claims.scopes.join(" "),
  };
}

function requireAuthorityMatch(
  authority: {
    registrationId: string;
    resource: string;
    userId: string;
    organizationId: string;
    scopes: string[];
  },
  claims: {
    registrationId: string;
    resource: string;
    userId: string;
    organizationId: string;
    scopes: string[];
  },
): void {
  if (
    authority.registrationId !== claims.registrationId ||
    authority.resource !== claims.resource ||
    authority.userId !== claims.userId ||
    authority.organizationId !== claims.organizationId ||
    authority.scopes.join("\u0000") !== claims.scopes.join("\u0000")
  ) {
    throw new Error("auth.md signed claims do not match live authority");
  }
}

function requireSupportedScopes(
  values: readonly string[],
  supported: ReadonlySet<string>,
): string[] {
  const scopes = normalizeScopes(values);
  if (scopes.some((scope) => !supported.has(scope))) {
    throw new Error("auth.md requested scope is not supported");
  }
  return scopes;
}

function normalizeScopes(values: readonly string[]): string[] {
  const scopes = values.map((value) => value.trim());
  if (
    scopes.length === 0 ||
    scopes.some((scope) => scope.length === 0 || /\s/u.test(scope)) ||
    new Set(scopes).size !== scopes.length
  ) {
    throw new TypeError("auth.md scopes are invalid");
  }
  return scopes.toSorted();
}

function normalizeVerificationUri(value: string, token: string): string {
  const uri = normalizeResource(value);
  if (new URL(uri).searchParams.get("claim_attempt_token") !== token) {
    throw new Error("auth.md verification URI must carry the claim_attempt_token");
  }
  return uri;
}

function normalizeIssuer(value: string): string {
  const url = new URL(normalizeResource(value));
  if (url.search.length > 0) {
    throw new TypeError("auth.md issuer must not contain a query");
  }
  const normalized = url.toString();
  return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}

function normalizeResource(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError("auth.md URL must be absolute");
  }
  if (
    url.protocol !== "https:" ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.hash.length > 0
  ) {
    throw new TypeError("auth.md URL must be a clean HTTPS URL");
  }
  return url.toString();
}

function requireAccessTokenLifetime(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 60 * 60) {
    throw new TypeError("auth.md access token lifetime must be between 1 and 3600 seconds");
  }
  return value;
}

function requireIdentifier(value: string, name: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new TypeError(`auth.md ${name} is required`);
  }
  return normalized;
}

export const AUTH_MD_SERVICE_AUTH_GRANT_TYPES = [
  AUTH_MD_CLAIM_GRANT,
  AUTH_MD_JWT_BEARER_GRANT,
] as const;
