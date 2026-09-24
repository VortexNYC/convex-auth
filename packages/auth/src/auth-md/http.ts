import type {
  AuthMdServiceAuthPollResponse,
  AuthMdServiceAuthRegistrationResponse,
  AuthMdServiceAuthTokenResponse,
} from "./convex";
import { AUTH_MD_CLAIM_GRANT, AUTH_MD_JWT_BEARER_GRANT } from "./discovery";

const MAX_REQUEST_BYTES = 64 * 1024;

export const AUTH_MD_SERVICE_AUTH_ENDPOINTS = {
  identity: "/agent/identity",
  token: "/oauth2/token",
  revoke: "/oauth2/revoke",
} as const;

export type AuthMdServiceAuthHttpAuthority<TContext> = {
  authorizeRegistration(ctx: TContext, request: Request): Promise<void>;
  registerServiceAuth(
    ctx: TContext,
    args: { loginHint: string; scopes: readonly string[] },
  ): Promise<AuthMdServiceAuthRegistrationResponse>;
  pollServiceAuthClaim(
    ctx: TContext,
    args: { claimToken: string },
  ): Promise<AuthMdServiceAuthPollResponse>;
  exchangeIdentityAssertion(
    ctx: TContext,
    args: { assertion: string; resource: string },
  ): Promise<AuthMdServiceAuthTokenResponse>;
  revokeAccessToken(ctx: TContext, args: { accessToken: string }): Promise<{ ok: true }>;
};

export type CreateAuthMdServiceAuthHttpServerConfig<TContext> = {
  postClaimScopes: readonly string[];
  authority: AuthMdServiceAuthHttpAuthority<TContext>;
};

export type AuthMdServiceAuthHttpServer<TContext> = {
  handleHttpRequest(ctx: TContext, request: Request): Promise<Response>;
};

/**
 * Serves the service-auth HTTP endpoints (identity registration, token
 * exchange, revocation).
 *
 * The revoke endpoint swallows revocation failures: RFC 7009 requires an
 * invalid or already-revoked token to be indistinguishable from a successful
 * revocation, so the handler always answers 200.
 */
export function createAuthMdServiceAuthHttpServer<TContext>(
  config: CreateAuthMdServiceAuthHttpServerConfig<TContext>,
): AuthMdServiceAuthHttpServer<TContext> {
  const postClaimScopes = normalizeScopes(config.postClaimScopes);
  return {
    async handleHttpRequest(ctx, request) {
      try {
        const url = new URL(request.url);
        if (request.method !== "POST") return oauthError(405, "invalid_request");
        if (url.pathname === AUTH_MD_SERVICE_AUTH_ENDPOINTS.identity) {
          await config.authority.authorizeRegistration(ctx, request);
          const body = await parseJsonObject(request);
          if (body.type !== "service_auth") {
            return oauthError(400, "unsupported_identity_type");
          }
          return jsonResponse(
            201,
            await config.authority.registerServiceAuth(ctx, {
              loginHint: requireString(body.login_hint, "login_hint"),
              scopes: postClaimScopes,
            }),
          );
        }
        if (url.pathname === AUTH_MD_SERVICE_AUTH_ENDPOINTS.token) {
          const body = await parseForm(request);
          const grantType = requireString(body.get("grant_type"), "grant_type");
          if (grantType === AUTH_MD_CLAIM_GRANT) {
            const result = await config.authority.pollServiceAuthClaim(ctx, {
              claimToken: requireString(body.get("claim_token"), "claim_token"),
            });
            return "error" in result
              ? oauthError(400, result.error, result.interval)
              : tokenResponse(result);
          }
          if (grantType === AUTH_MD_JWT_BEARER_GRANT) {
            return tokenResponse(
              await config.authority.exchangeIdentityAssertion(ctx, {
                assertion: requireString(body.get("assertion"), "assertion"),
                resource: requireString(body.get("resource"), "resource"),
              }),
            );
          }
          return oauthError(400, "unsupported_grant_type");
        }
        if (url.pathname === AUTH_MD_SERVICE_AUTH_ENDPOINTS.revoke) {
          const body = await parseForm(request);
          const token = requireString(body.get("token"), "token");
          try {
            await config.authority.revokeAccessToken(ctx, {
              accessToken: token,
            });
          } catch {}
          return new Response(null, { status: 200, headers: noStoreHeaders() });
        }
        return oauthError(404, "invalid_request");
      } catch (error) {
        return oauthError(
          400,
          "invalid_request",
          undefined,
          error instanceof Error ? error.message : "Invalid auth.md request",
        );
      }
    },
  };
}

async function parseJsonObject(request: Request): Promise<Record<string, unknown>> {
  requireContentType(request, "application/json");
  const raw = await readBoundedBody(request);
  const value: unknown = JSON.parse(raw);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("auth.md request body must be an object");
  }
  return Object.fromEntries(Object.entries(value));
}

async function parseForm(request: Request): Promise<URLSearchParams> {
  requireContentType(request, "application/x-www-form-urlencoded");
  return new URLSearchParams(await readBoundedBody(request));
}

async function readBoundedBody(request: Request): Promise<string> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    throw new TypeError("auth.md request body is too large");
  }
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_REQUEST_BYTES) {
    throw new TypeError("auth.md request body is too large");
  }
  return body;
}

function requireContentType(request: Request, expected: string): void {
  const actual = request.headers.get("content-type")?.split(";", 1)[0]?.trim();
  if (actual !== expected) {
    throw new TypeError(`auth.md request content-type must be ${expected}`);
  }
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`auth.md ${field} is required`);
  }
  return value.trim();
}

function normalizeScopes(values: readonly string[]): string[] {
  const scopes = values.map((scope) => requireString(scope, "scope"));
  if (scopes.length === 0 || new Set(scopes).size !== scopes.length) {
    throw new TypeError("auth.md post-claim scopes are invalid");
  }
  return scopes.toSorted();
}

function tokenResponse(body: AuthMdServiceAuthTokenResponse): Response {
  return jsonResponse(200, body);
}

function oauthError(
  status: number,
  error: string,
  interval?: number,
  description?: string,
): Response {
  return jsonResponse(status, {
    error,
    ...(description === undefined ? {} : { error_description: description }),
    ...(interval === undefined ? {} : { interval }),
  });
}

function jsonResponse(status: number, body: unknown): Response {
  const headers = noStoreHeaders();
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { status, headers });
}

function noStoreHeaders(): Headers {
  return new Headers({ "cache-control": "no-store", pragma: "no-cache" });
}
