import { getCookie, getSessionCookie } from "../helpers/cookies.js";

import { validateMcpOAuthDynamicClientRegistrationInput } from "./clientRegistration";
import {
  buildMcpOAuthDynamicClientRegistrationResponse,
  parseMcpOAuthAuthorizeRequest,
  parseMcpOAuthDynamicClientRegistrationRequest,
  validateMcpOAuthAuthorizationCodeTokenExchange,
  validateMcpOAuthClientCredentialsTokenExchange,
} from "./flow";
import { validateMcpOAuthRefreshTokenGrantRequest } from "./refresh";
import { findMcpOAuthClientDisallowedScope } from "./scopePolicy";
import { buildMcpOAuthTokenResponse } from "./signing";
import type {
  McpOAuthAuthorizationCodeRecord,
  McpOAuthClient,
  McpOAuthClientAssertionResult,
  McpOAuthClientCredentialsTarget,
  McpOAuthClientCredentialsTokenExchangeSuccess,
  McpOAuthDynamicClientRegistrationInput,
  McpOAuthDynamicClientRegistrationResult,
  McpOAuthRefreshTokenGrantFailure,
  McpOAuthRefreshTokenGrantSuccess,
  McpOAuthSignedAccessToken,
  McpOAuthTokenEndpointAuthMethod,
} from "./types";

type McpOAuthErrorBody = {
  error: string;
  error_description?: string;
};

export type McpOAuthHttpFailure = {
  status: number;
  body: McpOAuthErrorBody;
};

export type McpOAuthResolvedSession = {
  subjectId: string;
};

export type McpOAuthResolvedIdentity = {
  userId: string;
};

export type McpOAuthAccessibleOrganizations = {
  organizationIds: readonly string[];
};

export type McpOAuthOrganizationAccess = {
  organizationId: string | null;
  permissions: readonly string[];
};

export type McpOAuthHttpHandlers = {
  handleAuthorizeRequest: (request: Request) => Promise<Response>;
  handleClientRegistrationRequest: (request: Request) => Promise<Response>;
  handleTokenRequest: (request: Request) => Promise<Response>;
};

export type McpOAuthTokenRequestArgs<TClient extends McpOAuthClient> = {
  request: Request;
  resolveClient: (clientId: string) => Promise<TClient | null> | TClient | null;
  consumeAuthorizationCode: (input: {
    code: string;
    clientId: string;
    redirectUri: string;
  }) => Promise<McpOAuthAuthorizationCodeRecord | null> | McpOAuthAuthorizationCodeRecord | null;
  redeemRefreshToken: (input: {
    client: TClient;
    refreshGrant: McpOAuthRefreshTokenGrantSuccess<TClient>;
  }) => Promise<
    | McpOAuthRefreshTokenGrantFailure
    | {
        ok: true;
        subjectId: string;
        organizationId: string;
        audience: string;
        resourceId: string;
        scopes: readonly string[];
        refreshToken: string;
      }
  >;
  signAccessToken: (input: {
    subjectId: string;
    clientId: string;
    organizationId: string;
    scopes: readonly string[];
    audience: string;
  }) =>
    | Promise<McpOAuthSignedAccessToken | McpOAuthHttpFailure>
    | McpOAuthSignedAccessToken
    | McpOAuthHttpFailure;
  /**
   * Machine-to-machine grant, per the MCP `oauth-client-credentials`
   * extension. Omit to keep the endpoint user-only.
   */
  clientCredentials?: {
    /**
     * Required, and never `none`. Client authentication defaults to the
     * public-client method, which is correct for PKCE and catastrophic for a
     * machine grant: a request presenting no credential would authenticate.
     */
    supportedMethods: readonly McpOAuthTokenEndpointAuthMethod[];
    verifyClientSecret?: (input: {
      clientId: string;
      clientSecret: string;
    }) => Promise<boolean> | boolean;
    verifyClientAssertion?: (input: {
      assertion: string;
      assertionType: string;
      clientId: string;
    }) => Promise<McpOAuthClientAssertionResult> | McpOAuthClientAssertionResult;
    /** Resolve which tenant and audience this machine client acts for. */
    resolveGrantTarget: (input: {
      client: TClient;
      scopes: readonly string[];
    }) =>
      | Promise<McpOAuthClientCredentialsTarget | McpOAuthHttpFailure>
      | McpOAuthClientCredentialsTarget
      | McpOAuthHttpFailure;
    /** Sign a token whose subject is the client, carrying no user id. */
    signMachineAccessToken: (input: {
      clientId: string;
      organizationId: string;
      scopes: readonly string[];
      audience: string;
      /**
       * Always "client". Passed explicitly because the token signer defaults
       * to "user", so a consumer that omitted it would mint a machine token
       * that reads as a person's.
       */
      subjectType: "client";
    }) =>
      | Promise<McpOAuthSignedAccessToken | McpOAuthHttpFailure>
      | McpOAuthSignedAccessToken
      | McpOAuthHttpFailure;
  };
  issueRefreshToken: (input: {
    clientId: string;
    subjectId: string;
    organizationId: string;
    scopes: readonly string[];
    audience: string;
    resourceId: string;
  }) => Promise<{ refreshToken: string }> | { refreshToken: string };
};

export type McpOAuthAccessRuntime = {
  resolveIdentityForSession: (
    session: McpOAuthResolvedSession,
  ) => Promise<McpOAuthResolvedIdentity | null>;
  authorize: (input: {
    identity: McpOAuthResolvedIdentity;
    subjectId: string;
    requestedOrganizationId: string | null;
    requestedScopes: readonly string[];
  }) => Promise<McpOAuthAuthorizeAccessResult>;
  signAccessToken: (input: {
    subjectId: string;
    clientId: string;
    organizationId: string;
    scopes: readonly string[];
    audience: string;
  }) => Promise<McpOAuthSignedAccessToken | McpOAuthHttpFailure>;
};

export type McpOAuthAuthorizeAccessResult =
  | {
      ok: true;
      organizationId: string;
      scopes: readonly string[];
    }
  | {
      ok: false;
      status: number;
      body: McpOAuthErrorBody;
    };

export type CreateMcpOAuthAccessRuntimeArgs = {
  resolveIdentityForUser: (
    subjectId: string,
  ) => Promise<McpOAuthResolvedIdentity | null> | McpOAuthResolvedIdentity | null;
  getAccessibleOrganizations: (
    userId: string,
  ) => Promise<McpOAuthAccessibleOrganizations> | McpOAuthAccessibleOrganizations;
  getOrganizationAccess: (input: {
    userId: string;
    requestedOrganizationId: string | null;
    organizationHintId: string | null;
  }) => Promise<McpOAuthOrganizationAccess> | McpOAuthOrganizationAccess;
  normalizeScopes: (requestedScopes: readonly string[]) => readonly string[];
  validateScopes: (input: {
    permissions: readonly string[];
    requestedScopes: readonly string[];
  }) => McpOAuthErrorBody | null;
  requireAccessibleOrganization: (organizationId: string | null) => string;
  signAccessToken: (input: {
    subjectId: string;
    clientId: string;
    organizationId: string;
    scopes: readonly string[];
    audience: string;
  }) => Promise<McpOAuthSignedAccessToken> | McpOAuthSignedAccessToken;
};

export async function authorizeMcpOAuthAccessRequest(args: {
  userId: string;
  requestedOrganizationId: string | null;
  requestedScopes: readonly string[];
  getAccessibleOrganizations: (
    userId: string,
  ) => Promise<McpOAuthAccessibleOrganizations> | McpOAuthAccessibleOrganizations;
  getOrganizationAccess: (input: {
    userId: string;
    requestedOrganizationId: string | null;
    organizationHintId: string | null;
  }) => Promise<McpOAuthOrganizationAccess> | McpOAuthOrganizationAccess;
  normalizeScopes: (requestedScopes: readonly string[]) => readonly string[];
  validateScopes: (input: {
    permissions: readonly string[];
    requestedScopes: readonly string[];
  }) => McpOAuthErrorBody | null;
  requireAccessibleOrganization: (organizationId: string | null) => string;
}): Promise<McpOAuthAuthorizeAccessResult> {
  const accessibleOrganizations = await args.getAccessibleOrganizations(args.userId);
  if (
    args.requestedOrganizationId === null &&
    accessibleOrganizations.organizationIds.length !== 1
  ) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "invalid_request",
        error_description: "organization_id is required for multi-organization users",
      },
    };
  }

  const organizationAccess = await args.getOrganizationAccess({
    userId: args.userId,
    requestedOrganizationId: args.requestedOrganizationId,
    organizationHintId: null,
  });
  const allowedScopes = args.normalizeScopes(args.requestedScopes);
  const scopeAuthorizationError = args.validateScopes({
    permissions: organizationAccess.permissions,
    requestedScopes: allowedScopes,
  });
  if (scopeAuthorizationError !== null) {
    return {
      ok: false,
      status: 403,
      body: scopeAuthorizationError,
    };
  }
  if (
    args.requestedOrganizationId !== null &&
    organizationAccess.organizationId !== args.requestedOrganizationId
  ) {
    return {
      ok: false,
      status: 403,
      body: {
        error: "invalid_target",
        error_description: "Requested organization is not accessible",
      },
    };
  }

  return {
    ok: true,
    organizationId: args.requireAccessibleOrganization(organizationAccess.organizationId),
    scopes: allowedScopes,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

function toInvalidRequestResponse(error: unknown, fallbackMessage: string): Response {
  return jsonResponse(400, {
    error: "invalid_request",
    error_description: error instanceof Error ? error.message : fallbackMessage,
  });
}

function isOAuthErrorBody(value: unknown): value is McpOAuthErrorBody {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof value.error === "string" &&
    (!("error_description" in value) || typeof value.error_description === "string")
  );
}

function isHttpFailure(value: object | McpOAuthHttpFailure): value is McpOAuthHttpFailure {
  return "status" in value && "body" in value;
}

export async function signAuthorizedMcpOAuthAccessToken(args: {
  subjectId: string;
  clientId: string;
  organizationId: string;
  scopes: readonly string[];
  audience: string;
  resolveIdentityForUser: (
    subjectId: string,
  ) => Promise<McpOAuthResolvedIdentity | null> | McpOAuthResolvedIdentity | null;
  authorize: (input: {
    identity: McpOAuthResolvedIdentity;
    subjectId: string;
    requestedOrganizationId: string | null;
    requestedScopes: readonly string[];
  }) => Promise<McpOAuthAuthorizeAccessResult> | McpOAuthAuthorizeAccessResult;
  signAccessToken: (input: {
    subjectId: string;
    clientId: string;
    organizationId: string;
    scopes: readonly string[];
    audience: string;
  }) => Promise<McpOAuthSignedAccessToken> | McpOAuthSignedAccessToken;
}): Promise<McpOAuthSignedAccessToken | McpOAuthHttpFailure> {
  const identity = await args.resolveIdentityForUser(args.subjectId);
  if (identity === null) {
    return {
      status: 401,
      body: {
        error: "invalid_token",
        error_description: "User is not linked",
      },
    };
  }

  const access = await args.authorize({
    identity,
    subjectId: args.subjectId,
    requestedOrganizationId: args.organizationId,
    requestedScopes: args.scopes,
  });
  if (!access.ok) {
    return {
      status: access.status,
      body: access.body,
    };
  }

  return await args.signAccessToken({
    subjectId: args.subjectId,
    clientId: args.clientId,
    organizationId: access.organizationId,
    scopes: access.scopes,
    audience: args.audience,
  });
}

export function createMcpOAuthAccessRuntime(
  args: CreateMcpOAuthAccessRuntimeArgs,
): McpOAuthAccessRuntime {
  return {
    resolveIdentityForSession: async (session) =>
      await args.resolveIdentityForUser(session.subjectId),
    authorize: async ({ identity, requestedOrganizationId, requestedScopes }) =>
      await authorizeMcpOAuthAccessRequest({
        userId: identity.userId,
        requestedOrganizationId,
        requestedScopes,
        getAccessibleOrganizations: args.getAccessibleOrganizations,
        getOrganizationAccess: args.getOrganizationAccess,
        normalizeScopes: args.normalizeScopes,
        validateScopes: args.validateScopes,
        requireAccessibleOrganization: args.requireAccessibleOrganization,
      }),
    signAccessToken: async ({ subjectId, clientId, organizationId, scopes, audience }) =>
      await signAuthorizedMcpOAuthAccessToken({
        subjectId,
        clientId,
        organizationId,
        scopes,
        audience,
        resolveIdentityForUser: args.resolveIdentityForUser,
        authorize: async ({ identity, requestedOrganizationId, requestedScopes }) =>
          await authorizeMcpOAuthAccessRequest({
            userId: identity.userId,
            requestedOrganizationId,
            requestedScopes,
            getAccessibleOrganizations: args.getAccessibleOrganizations,
            getOrganizationAccess: args.getOrganizationAccess,
            normalizeScopes: args.normalizeScopes,
            validateScopes: args.validateScopes,
            requireAccessibleOrganization: args.requireAccessibleOrganization,
          }),
        signAccessToken: args.signAccessToken,
      }),
  };
}

export function getMcpOAuthSessionTokenFromRequest(request: Request): string | null {
  const signedCookie = getSessionCookie(request.headers);

  if (signedCookie) {
    const separatorIndex = signedCookie.indexOf(".");
    return separatorIndex === -1 ? signedCookie : signedCookie.slice(0, separatorIndex);
  }

  // Fallback to the native convex-auth access-token cookie.
  const nativeCookie = getCookie(request.headers, "convex-auth-token");
  if (nativeCookie) {
    return nativeCookie;
  }

  // Fallback to an Authorization: Bearer header.
  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice("bearer ".length).trim();
  }

  return null;
}

export async function handleMcpOAuthAuthorizeRequest<TClient extends McpOAuthClient>(args: {
  request: Request;
  defaultAudience: string;
  defaultResourceId: string;
  allowTestingExpiresInMs?: boolean;
  resolveClient: (clientId: string) => Promise<TClient | null> | TClient | null;
  requireAllowedRedirectUri: (client: TClient, redirectUri: string) => void;
  resolveRequestedScopes: (scope: string) => readonly string[];
  resolveSessionFromToken: (
    sessionToken: string,
  ) => Promise<McpOAuthResolvedSession | null> | McpOAuthResolvedSession | null;
  resolveIdentityForSession: (
    session: McpOAuthResolvedSession,
  ) => Promise<McpOAuthResolvedIdentity | null> | McpOAuthResolvedIdentity | null;
  authorize: (input: {
    identity: McpOAuthResolvedIdentity;
    subjectId: string;
    requestedOrganizationId: string | null;
    requestedScopes: readonly string[];
  }) => Promise<McpOAuthAuthorizeAccessResult> | McpOAuthAuthorizeAccessResult;
  createAuthorizationCode: (input: {
    code: string;
    clientId: string;
    redirectUri: string;
    subjectId: string;
    organizationId: string;
    scopes: readonly string[];
    codeChallenge: string;
    codeChallengeMethod: "S256";
    state?: string;
    audience: string;
    resourceId: string;
    expiresAt: number;
  }) => Promise<void> | void;
  generateAuthorizationCode?: () => string;
  authorizationCodeExpiresInMs?: number;
}): Promise<Response> {
  const params = parseMcpOAuthAuthorizeRequest(args.request, {
    defaultAudience: args.defaultAudience,
    defaultResourceId: args.defaultResourceId,
    allowTestingExpiresInMs: args.allowTestingExpiresInMs,
  });

  const client = await args.resolveClient(params.clientId);
  if (client === null) {
    return jsonResponse(400, {
      error: "invalid_client",
      error_description: "Unknown OAuth client",
    });
  }

  args.requireAllowedRedirectUri(client, params.redirectUri);
  const requestedScopes = args.resolveRequestedScopes(params.scope);
  const disallowedScope = findMcpOAuthClientDisallowedScope(client, requestedScopes);
  if (disallowedScope !== null) {
    return jsonResponse(400, {
      error: "invalid_scope",
      error_description: `Unsupported scope: ${disallowedScope}`,
    });
  }

  const sessionToken = getMcpOAuthSessionTokenFromRequest(args.request);
  if (sessionToken === null) {
    return jsonResponse(401, { error: "login_required" });
  }

  const session = await args.resolveSessionFromToken(sessionToken);
  if (session === null) {
    return jsonResponse(401, { error: "login_required" });
  }

  const identity = await args.resolveIdentityForSession(session);
  if (identity === null) {
    return jsonResponse(401, {
      error: "invalid_token",
      error_description: "User is not linked",
    });
  }

  const access = await args.authorize({
    identity,
    subjectId: session.subjectId,
    requestedOrganizationId: params.organizationId,
    requestedScopes,
  });
  if (!access.ok) {
    return jsonResponse(access.status, access.body);
  }

  const unauthorizedGrantedScope =
    findMcpOAuthClientDisallowedScope(client, access.scopes) ??
    access.scopes.find((scope) => !requestedScopes.includes(scope)) ??
    null;
  if (unauthorizedGrantedScope !== null) {
    return jsonResponse(500, {
      error: "server_error",
      error_description: "Authorization policy returned an unauthorized scope",
    });
  }

  const code = args.generateAuthorizationCode?.() ?? crypto.randomUUID();
  await args.createAuthorizationCode({
    code,
    clientId: params.clientId,
    redirectUri: params.redirectUri,
    subjectId: session.subjectId,
    organizationId: access.organizationId,
    scopes: access.scopes,
    codeChallenge: params.codeChallenge,
    codeChallengeMethod: "S256",
    state: params.state,
    audience: params.audience,
    resourceId: params.resourceId,
    expiresAt:
      Date.now() + (params.expiresInMs ?? args.authorizationCodeExpiresInMs ?? 5 * 60 * 1000),
  });

  const redirect = new URL(params.redirectUri);
  redirect.searchParams.set("code", code);
  if (params.state) {
    redirect.searchParams.set("state", params.state);
  }

  return new Response(null, {
    status: 302,
    headers: { location: redirect.toString() },
  });
}

export async function handleMcpOAuthClientRegistrationRequest(args: {
  request: Request;
  supportedScopes: readonly string[];
  createDynamicClient: (
    input: McpOAuthDynamicClientRegistrationInput,
  ) =>
    | Promise<McpOAuthDynamicClientRegistrationResult & { clientIdIssuedAt: number }>
    | (McpOAuthDynamicClientRegistrationResult & { clientIdIssuedAt: number });
}): Promise<Response> {
  const body = (await args.request.json()) as unknown;
  const registration = parseMcpOAuthDynamicClientRegistrationRequest(body);
  const validationError = validateMcpOAuthDynamicClientRegistrationInput(registration, {
    supportedScopes: args.supportedScopes,
  });
  if (validationError !== null) {
    return jsonResponse(400, validationError);
  }

  const created = await args.createDynamicClient(registration);
  return jsonResponse(
    201,
    buildMcpOAuthDynamicClientRegistrationResponse(created, created.clientIdIssuedAt),
  );
}

export async function handleMcpOAuthTokenRequest<TClient extends McpOAuthClient>(
  args: McpOAuthTokenRequestArgs<TClient>,
): Promise<Response> {
  // Machine grant first: it is the only one with no user, so it must not fall
  // through to a path that assumes one.
  if (args.clientCredentials !== undefined) {
    const machineGrant = await validateMcpOAuthClientCredentialsTokenExchange({
      request: args.request.clone(),
      resolveClient: args.resolveClient,
      supportedMethods: args.clientCredentials.supportedMethods,
      verifyClientSecret: args.clientCredentials.verifyClientSecret,
      verifyClientAssertion: args.clientCredentials.verifyClientAssertion,
    });
    if (machineGrant.ok) {
      return await handleMcpOAuthClientCredentialsExchange(args, machineGrant);
    }
    // Only a grant_type mismatch may fall through; a real failure is terminal,
    // otherwise a rejected machine credential would get a second attempt as a
    // different grant.
    if (machineGrant.body.error !== "unsupported_grant_type") {
      return jsonResponse(machineGrant.status, machineGrant.body);
    }
  }

  const refreshGrant = await validateMcpOAuthRefreshTokenGrantRequest({
    request: args.request.clone(),
    resolveClient: args.resolveClient,
  });

  if (refreshGrant.ok) {
    return await handleMcpOAuthRefreshTokenExchange(args, refreshGrant);
  }

  if (refreshGrant.body.error !== "unsupported_grant_type") {
    return jsonResponse(refreshGrant.status, refreshGrant.body);
  }

  return await handleMcpOAuthAuthorizationCodeExchange(args);
}

async function handleMcpOAuthClientCredentialsExchange<TClient extends McpOAuthClient>(
  args: McpOAuthTokenRequestArgs<TClient>,
  grant: McpOAuthClientCredentialsTokenExchangeSuccess<TClient>,
): Promise<Response> {
  const clientCredentials = args.clientCredentials;
  if (clientCredentials === undefined) {
    return jsonResponse(400, { error: "unsupported_grant_type" });
  }

  const target = await clientCredentials.resolveGrantTarget({
    client: grant.client,
    scopes: grant.scopes,
  });
  if (isHttpFailure(target)) {
    return jsonResponse(target.status, target.body);
  }

  const token = await clientCredentials.signMachineAccessToken({
    clientId: grant.client.clientId,
    organizationId: target.organizationId,
    scopes: grant.scopes,
    audience: target.audience,
    subjectType: "client",
  });
  if (isHttpFailure(token)) {
    return jsonResponse(token.status, token.body);
  }

  // No refresh token: a machine client re-authenticates with its own
  // credential, so a refresh token would only add a second standing secret.
  return jsonResponse(200, {
    access_token: token.accessToken,
    token_type: token.tokenType,
    expires_in: token.expiresIn,
    scope: token.scope,
  });
}

async function handleMcpOAuthRefreshTokenExchange<TClient extends McpOAuthClient>(
  args: McpOAuthTokenRequestArgs<TClient>,
  refreshGrant: McpOAuthRefreshTokenGrantSuccess<TClient>,
): Promise<Response> {
  const redeemed = await args.redeemRefreshToken({
    client: refreshGrant.client,
    refreshGrant,
  });
  if (!redeemed.ok) {
    return jsonResponse(redeemed.status, redeemed.body);
  }

  const token = await args.signAccessToken({
    subjectId: redeemed.subjectId,
    clientId: refreshGrant.client.clientId,
    organizationId: redeemed.organizationId,
    scopes: redeemed.scopes,
    audience: redeemed.audience,
  });
  if (isHttpFailure(token)) {
    return jsonResponse(token.status, token.body);
  }

  return jsonResponse(
    200,
    buildMcpOAuthTokenResponse({
      accessToken: token.accessToken,
      refreshToken: redeemed.refreshToken,
      tokenType: token.tokenType,
      expiresIn: token.expiresIn,
      scope: token.scope,
    }),
  );
}

async function handleMcpOAuthAuthorizationCodeExchange<TClient extends McpOAuthClient>(
  args: McpOAuthTokenRequestArgs<TClient>,
): Promise<Response> {
  const exchange = await validateMcpOAuthAuthorizationCodeTokenExchange({
    request: args.request,
    resolveClient: args.resolveClient,
    consumeAuthorizationCode: args.consumeAuthorizationCode,
  });

  if (!exchange.ok) {
    return jsonResponse(exchange.status, exchange.body);
  }

  const authorizationCode = exchange.authorizationCode;
  const [token, refreshToken] = await Promise.all([
    args.signAccessToken({
      subjectId: authorizationCode.subjectId,
      clientId: authorizationCode.clientId,
      organizationId: authorizationCode.organizationId,
      scopes: authorizationCode.scopes,
      audience: authorizationCode.audience,
    }),
    args.issueRefreshToken({
      clientId: authorizationCode.clientId,
      subjectId: authorizationCode.subjectId,
      organizationId: authorizationCode.organizationId,
      scopes: authorizationCode.scopes,
      audience: authorizationCode.audience,
      resourceId: authorizationCode.resourceId,
    }),
  ]);
  if (isHttpFailure(token)) {
    return jsonResponse(token.status, token.body);
  }

  return jsonResponse(
    200,
    buildMcpOAuthTokenResponse({
      accessToken: token.accessToken,
      refreshToken: refreshToken.refreshToken,
      tokenType: token.tokenType,
      expiresIn: token.expiresIn,
      scope: token.scope,
    }),
  );
}

export function createMcpOAuthHttpHandlers<TClient extends McpOAuthClient>(args: {
  authorize: Omit<Parameters<typeof handleMcpOAuthAuthorizeRequest<TClient>>[0], "request">;
  clientRegistration: Omit<
    Parameters<typeof handleMcpOAuthClientRegistrationRequest>[0],
    "request"
  >;
  token: Omit<Parameters<typeof handleMcpOAuthTokenRequest<TClient>>[0], "request">;
}): McpOAuthHttpHandlers {
  return {
    handleAuthorizeRequest: async (request) => {
      try {
        return await handleMcpOAuthAuthorizeRequest({
          ...args.authorize,
          request,
        });
      } catch (error) {
        return toInvalidRequestResponse(error, "Unknown authorize error");
      }
    },
    handleClientRegistrationRequest: async (request) => {
      try {
        return await handleMcpOAuthClientRegistrationRequest({
          ...args.clientRegistration,
          request,
        });
      } catch (error) {
        if (isOAuthErrorBody(error)) {
          return jsonResponse(400, error);
        }

        return toInvalidRequestResponse(error, "Unknown registration error");
      }
    },
    handleTokenRequest: async (request) => {
      try {
        return await handleMcpOAuthTokenRequest({
          ...args.token,
          request,
        });
      } catch (error) {
        return toInvalidRequestResponse(error, "Unknown token error");
      }
    },
  };
}
