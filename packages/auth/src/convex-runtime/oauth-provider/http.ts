import {
  httpActionGeneric,
  type GenericActionCtx,
  type GenericDataModel,
  type HttpRouter,
} from "convex/server";

import type { ComponentApi as FullComponentApi } from "../../component/_generated/component.js";
import {
  buildMcpOAuthJwks,
  createMcpOAuthSigningKeyRecord,
  signMcpOAuthAccessToken,
  verifyMcpOAuthAccessToken,
} from "../mcp/signing.js";
import { ensureMcpOAuthSigningKey } from "../mcp/signingRuntime.js";
import type {
  McpOAuthSigningKeyPublicationRecord,
  McpOAuthSigningKeyRecord,
} from "../mcp/types.js";
import {
  handleOidcAuthorizeRequest,
  handleOidcTokenRequest,
  type OidcAuthorizeRequestArgs,
  type OidcProviderClient,
  type OidcTokenRequestArgs,
} from "./runtime.js";

export type { OidcProviderClient } from "./runtime.js";

export type OidcProviderConfig = {
  issuer?: string;
  clients: OidcProviderClient[];
  supportedScopes?: string[];
  loginUrl?: string;
  consentUrl?: string;
  authorizationCodeExpiresInMs?: number;
  generateAuthorizationCode?: () => string;
};

export type OidcProviderStorageAdapter<TClient extends OidcProviderClient> = {
  getSessionByToken: (
    token: string,
  ) => Promise<{ userId: string } | null> | { userId: string } | null;
  getUserById: (
    userId: string,
  ) =>
    | Promise<{ _id: string; email?: string; name?: string; emailVerified?: boolean } | null>
    | { _id: string; email?: string; name?: string; emailVerified?: boolean }
    | null;
  createAuthorizationCode: OidcAuthorizeRequestArgs<TClient>["createAuthorizationCode"];
  consumeAuthorizationCode: OidcTokenRequestArgs<TClient>["consumeAuthorizationCode"];
  issueRefreshToken: OidcTokenRequestArgs<TClient>["issueRefreshToken"];
  redeemRefreshToken: OidcTokenRequestArgs<TClient>["redeemRefreshToken"];
  getSigningKey: () => Promise<McpOAuthSigningKeyRecord | null> | McpOAuthSigningKeyRecord | null;
  upsertSigningKey: (key: McpOAuthSigningKeyRecord) => Promise<void> | void;
  listSigningKeys?: () =>
    | Promise<readonly (McpOAuthSigningKeyRecord & McpOAuthSigningKeyPublicationRecord)[]>
    | readonly (McpOAuthSigningKeyRecord & McpOAuthSigningKeyPublicationRecord)[];
};

export type OidcProviderHttpHandlersArgs<TClient extends OidcProviderClient> = {
  issuer: string;
  clients: TClient[];
  storage: OidcProviderStorageAdapter<TClient>;
  supportedScopes?: string[];
  loginUrl?: string;
  consentUrl?: string;
  authorizationCodeExpiresInMs?: number;
  generateAuthorizationCode?: () => string;
  authorize?: OidcAuthorizeRequestArgs<TClient>["authorize"];
};

export type OidcProviderHttpHandlers = {
  handleAuthorizeRequest: (request: Request) => Promise<Response>;
  handleTokenRequest: (request: Request) => Promise<Response>;
  handleDiscoveryRequest: (request: Request) => Response;
  handleAuthorizationServerRequest: (request: Request) => Response;
  handleJwksRequest: (request: Request) => Promise<Response>;
  handleUserInfoRequest: (request: Request) => Promise<Response>;
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function withMutableScopes<T extends { scopes: readonly string[] }>(
  input: T,
): Omit<T, "scopes"> & { scopes: string[] } {
  const { scopes, ...rest } = input;
  return { ...rest, scopes: [...scopes] } as Omit<T, "scopes"> & { scopes: string[] };
}

function isAllowedCorsOrigin(origin: string, trustedOrigins?: string[]): boolean {
  if (trustedOrigins === undefined || trustedOrigins.length === 0) return true;
  return trustedOrigins.includes(origin);
}

function corsHeaders(request: Request, trustedOrigins?: string[]): Headers {
  const headers = new Headers();
  const origin = request.headers.get("origin");
  if (origin && isAllowedCorsOrigin(origin, trustedOrigins)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  headers.set("Access-Control-Allow-Credentials", "true");
  return headers;
}

function applyCors(response: Response, request: Request, trustedOrigins?: string[]): Response {
  const headers = new Headers(response.headers);
  const origin = request.headers.get("origin");
  if (origin && isAllowedCorsOrigin(origin, trustedOrigins)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function normalizeClient(client: OidcProviderClient): OidcProviderClient {
  return {
    ...client,
    redirectUris: client.redirectUris.map((uri) => uri.trim()).filter(Boolean),
    allowedScopes: client.allowedScopes.map((scope) => scope.trim()).filter(Boolean),
    pkceRequired: client.pkceRequired ?? true,
    tokenEndpointAuthMethod: client.tokenEndpointAuthMethod ?? "none",
    grantTypes: client.grantTypes ?? ["authorization_code"],
    responseTypes: client.responseTypes ?? ["code"],
  };
}

export function createOidcProviderHttpHandlers<TClient extends OidcProviderClient>(
  args: OidcProviderHttpHandlersArgs<TClient>,
): OidcProviderHttpHandlers {
  const issuer = args.issuer.replace(/\/$/, "");
  const clients = args.clients.map(normalizeClient);
  const supportedScopes = new Set(args.supportedScopes ?? ["openid", "email", "profile"]);

  const resolveClient = (clientId: string): TClient | null => {
    const client = clients.find((c) => c.clientId === clientId);
    return (client as TClient | undefined) ?? null;
  };

  const resolveRequestedScopes = (scope: string): string[] => {
    const requested = scope.split(" ").filter((s) => s.length > 0);
    const withDefault = requested.length > 0 ? requested : ["openid"];
    return withDefault.filter((s) => supportedScopes.has(s));
  };

  const authorize: OidcAuthorizeRequestArgs<TClient>["authorize"] =
    args.authorize ??
    (async ({ requestedScopes }) => ({
      ok: true,
      organizationId: "",
      scopes: requestedScopes,
    }));

  const requireAllowedRedirectUri = (client: TClient, redirectUri: string): void => {
    if (!client.redirectUris.includes(redirectUri)) {
      throw new Error("invalid_redirect_uri");
    }
  };

  const handleAuthorizeRequest = async (request: Request): Promise<Response> => {
    try {
      const response = await handleOidcAuthorizeRequest({
        request,
        issuer,
        resolveClient,
        requireAllowedRedirectUri,
        resolveRequestedScopes,
        resolveSessionFromToken: async (token) => {
          const session = await args.storage.getSessionByToken(token);
          return session ? { subjectId: session.userId } : null;
        },
        resolveIdentityForSession: async (session) => {
          const user = await args.storage.getUserById(session.subjectId);
          return user ? { userId: user._id } : null;
        },
        authorize,
        createAuthorizationCode: args.storage.createAuthorizationCode,
        generateAuthorizationCode: args.generateAuthorizationCode,
        authorizationCodeExpiresInMs: args.authorizationCodeExpiresInMs,
        consentUrl: args.consentUrl,
      });

      if (response.status === 401 && args.loginUrl) {
        const login = new URL(args.loginUrl, request.url);
        login.searchParams.set("redirect_to", request.url);
        return new Response(null, {
          status: 302,
          headers: { location: login.toString() },
        });
      }

      return response;
    } catch (error) {
      return jsonResponse(400, {
        error: "invalid_request",
        error_description: error instanceof Error ? error.message : "Unknown authorize error",
      });
    }
  };

  const handleTokenRequest = async (request: Request): Promise<Response> => {
    try {
      return await handleOidcTokenRequest({
        request,
        resolveClient,
        consumeAuthorizationCode: args.storage.consumeAuthorizationCode,
        redeemRefreshToken: args.storage.redeemRefreshToken,
        signAccessToken: async (input) => {
          const signingKey = await ensureMcpOAuthSigningKey({
            loadActiveSigningKey: args.storage.getSigningKey,
            persistSigningKey: args.storage.upsertSigningKey,
            createSigningKey: createMcpOAuthSigningKeyRecord,
          });
          return signMcpOAuthAccessToken({
            signingKey,
            issuer,
            audience: input.audience,
            subject: input.subjectId,
            claims: {
              clientId: input.clientId,
              subjectId: input.subjectId,
              resourceId: input.audience,
              scopes: input.scopes,
              organizationId: input.organizationId,
            },
          });
        },
        issueRefreshToken: args.storage.issueRefreshToken,
      });
    } catch (error) {
      return jsonResponse(400, {
        error: "invalid_request",
        error_description: error instanceof Error ? error.message : "Unknown token error",
      });
    }
  };

  const discoveryBody = {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    userinfo_endpoint: `${issuer}/oauth/userinfo`,
    jwks_uri: `${issuer}/oauth/jwks`,
    scopes_supported: [...supportedScopes],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["ES256"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
  };

  const handleDiscoveryRequest = (_request: Request): Response => {
    return jsonResponse(200, discoveryBody);
  };

  const handleAuthorizationServerRequest = (_request: Request): Response => {
    return jsonResponse(200, discoveryBody);
  };

  const handleJwksRequest = async (_request: Request): Promise<Response> => {
    const keys = args.storage.listSigningKeys ? await args.storage.listSigningKeys() : [];
    const jwks = buildMcpOAuthJwks({ keys: [...keys] });
    return jsonResponse(200, jwks);
  };

  const handleUserInfoRequest = async (request: Request): Promise<Response> => {
    const authHeader = request.headers.get("authorization") ?? "";
    const match = /^Bearer\s+(.+)$/i.exec(authHeader);
    if (!match) {
      return new Response(JSON.stringify({ error: "invalid_token" }), {
        status: 401,
        headers: {
          "content-type": "application/json",
          "www-authenticate": 'Bearer error="invalid_token"',
        },
      });
    }
    const accessToken = match[1]!;
    if (!args.storage.listSigningKeys) {
      return jsonResponse(500, {
        error: "server_error",
        error_description: "Signing keys not configured",
      });
    }
    try {
      const keys = await args.storage.listSigningKeys();
      const verified = await verifyMcpOAuthAccessToken({
        accessToken,
        signingKeys: [...keys],
        issuer,
        audience: issuer,
      });
      if (verified.subject === null) {
        return jsonResponse(401, {
          error: "invalid_token",
          error_description: "Token has no subject",
        });
      }
      const scope = verified.scope ?? "";
      const scopeSet = new Set(scope.split(" "));
      const response: Record<string, unknown> = { sub: verified.subject };
      if (scopeSet.has("email") || scopeSet.has("profile")) {
        const user = await args.storage.getUserById(verified.subject);
        if (user) {
          if (scopeSet.has("email")) {
            if (user.email) response.email = user.email;
            if (user.emailVerified !== undefined) response.email_verified = user.emailVerified;
          }
          if (scopeSet.has("profile") && user.name) {
            response.name = user.name;
          }
        }
      }
      return jsonResponse(200, response);
    } catch (error) {
      return jsonResponse(401, {
        error: "invalid_token",
        error_description: error instanceof Error ? error.message : "Token verification failed",
      });
    }
  };

  return {
    handleAuthorizeRequest,
    handleTokenRequest,
    handleDiscoveryRequest,
    handleAuthorizationServerRequest,
    handleJwksRequest,
    handleUserInfoRequest,
  };
}

export type OidcProviderHttpConfig = {
  component: FullComponentApi<"convexAuth">;
  oauthProvider: OidcProviderConfig;
  trustedOrigins?: string[];
};

type CreateAuthorizationCodeInput = Parameters<
  OidcAuthorizeRequestArgs<OidcProviderClient>["createAuthorizationCode"]
>[0];
type ConsumeAuthorizationCodeInput = Parameters<
  OidcTokenRequestArgs<OidcProviderClient>["consumeAuthorizationCode"]
>[0];
type IssueRefreshTokenInput = Parameters<
  OidcTokenRequestArgs<OidcProviderClient>["issueRefreshToken"]
>[0];
type RedeemRefreshTokenInput = Parameters<
  OidcTokenRequestArgs<OidcProviderClient>["redeemRefreshToken"]
>[0];

function createStorageAdapter(
  ctx: GenericActionCtx<GenericDataModel>,
  config: OidcProviderHttpConfig,
) {
  return {
    getSessionByToken: async (token: string) =>
      ctx.runQuery(config.component.native.sessions.getSessionByToken, { token }),
    getUserById: async (userId: string) =>
      ctx.runQuery(config.component.native.users.getUserById, { userId }),
    createAuthorizationCode: async (input: CreateAuthorizationCodeInput) => {
      await ctx.runMutation(config.component.mcp.createAuthorizationCode, withMutableScopes(input));
    },
    consumeAuthorizationCode: async (input: ConsumeAuthorizationCodeInput) =>
      ctx.runMutation(config.component.mcp.consumeAuthorizationCode, input),
    issueRefreshToken: async (input: IssueRefreshTokenInput) =>
      ctx.runMutation(config.component.mcp.issueRefreshToken, withMutableScopes(input)),
    redeemRefreshToken: async (input: RedeemRefreshTokenInput) =>
      ctx.runMutation(config.component.mcp.redeemRefreshToken, {
        client: {
          clientId: input.client.clientId,
          name: input.client.name,
          redirectUris: [...input.client.redirectUris],
          allowedScopes: [...input.client.allowedScopes],
          tokenEndpointAuthMethod:
            input.client.tokenEndpointAuthMethod === "none" ? "none" : undefined,
          pkceRequired: input.client.pkceRequired,
          grantTypes: input.client.grantTypes ? [...input.client.grantTypes] : undefined,
          responseTypes: input.client.responseTypes ? [...input.client.responseTypes] : undefined,
          softwareId: input.client.softwareId,
          softwareVersion: input.client.softwareVersion,
        },
        refreshToken: input.refreshGrant.refreshToken,
        requestedScopes: [...input.refreshGrant.requestedScopes],
      }),
    getSigningKey: async () => ctx.runQuery(config.component.mcp.getSigningKey, {}),
    upsertSigningKey: async (key: McpOAuthSigningKeyRecord) => {
      await ctx.runMutation(config.component.mcp.upsertSigningKey, key);
    },
    listSigningKeys: async () =>
      ctx.runQuery(config.component.mcp.listSigningKeys, { includeRetired: true }),
  };
}

export function addOidcProviderHttpRoutes(http: HttpRouter, config: OidcProviderHttpConfig): void {
  const clients = config.oauthProvider.clients.map(normalizeClient);

  const handlersFor = (ctx: GenericActionCtx<GenericDataModel>, issuer: string) =>
    createOidcProviderHttpHandlers({
      issuer,
      clients,
      supportedScopes: config.oauthProvider.supportedScopes,
      loginUrl: config.oauthProvider.loginUrl,
      consentUrl: config.oauthProvider.consentUrl ?? config.oauthProvider.loginUrl,
      authorizationCodeExpiresInMs: config.oauthProvider.authorizationCodeExpiresInMs,
      generateAuthorizationCode: config.oauthProvider.generateAuthorizationCode,
      storage: createStorageAdapter(ctx, config),
    });

  http.route({
    path: "/.well-known/openid-configuration",
    method: "GET",
    handler: httpActionGeneric(async (ctx, request) => {
      const issuer = config.oauthProvider.issuer ?? new URL(request.url).origin;
      return handlersFor(ctx, issuer).handleDiscoveryRequest(request);
    }),
  });

  http.route({
    path: "/.well-known/oauth-authorization-server",
    method: "GET",
    handler: httpActionGeneric(async (ctx, request) => {
      const issuer = config.oauthProvider.issuer ?? new URL(request.url).origin;
      return handlersFor(ctx, issuer).handleAuthorizationServerRequest(request);
    }),
  });

  http.route({
    path: "/oauth/jwks",
    method: "GET",
    handler: httpActionGeneric(async (ctx, request) => {
      const issuer = config.oauthProvider.issuer ?? new URL(request.url).origin;
      return handlersFor(ctx, issuer).handleJwksRequest(request);
    }),
  });

  http.route({
    path: "/oauth/authorize",
    method: "GET",
    handler: httpActionGeneric(async (ctx, request) => {
      const issuer = config.oauthProvider.issuer ?? new URL(request.url).origin;
      return handlersFor(ctx, issuer).handleAuthorizeRequest(request);
    }),
  });

  const tokenHandler = httpActionGeneric(async (ctx, request) => {
    const issuer = config.oauthProvider.issuer ?? new URL(request.url).origin;
    const response = await handlersFor(ctx, issuer).handleTokenRequest(request);
    return applyCors(response, request, config.trustedOrigins);
  });

  http.route({ path: "/oauth/token", method: "POST", handler: tokenHandler });
  http.route({
    path: "/oauth/token",
    method: "OPTIONS",
    handler: httpActionGeneric(
      async (_ctx, request) =>
        new Response(null, { status: 204, headers: corsHeaders(request, config.trustedOrigins) }),
    ),
  });

  const userinfoHandler = httpActionGeneric(async (ctx, request) => {
    const issuer = config.oauthProvider.issuer ?? new URL(request.url).origin;
    const response = await handlersFor(ctx, issuer).handleUserInfoRequest(request);
    return applyCors(response, request, config.trustedOrigins);
  });

  http.route({ path: "/oauth/userinfo", method: "GET", handler: userinfoHandler });
  http.route({
    path: "/oauth/userinfo",
    method: "OPTIONS",
    handler: httpActionGeneric(
      async (_ctx, request) =>
        new Response(null, { status: 204, headers: corsHeaders(request, config.trustedOrigins) }),
    ),
  });
}
