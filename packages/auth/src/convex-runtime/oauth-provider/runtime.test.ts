import { describe, expect, it } from "vitest";

import { createPkcePair } from "../mcp/pkce.js";

import { handleOidcAuthorizeRequest, handleOidcTokenRequest } from "./runtime.js";

function authorizeUrl(args: {
  clientId?: string;
  redirectUri?: string;
  scope?: string;
  codeChallenge?: string;
  state?: string;
}) {
  const url = new URL("https://example.com/oauth/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", args.clientId ?? "client-123");
  url.searchParams.set("redirect_uri", args.redirectUri ?? "https://app.example.com/callback");
  url.searchParams.set("scope", args.scope ?? "openid email");
  url.searchParams.set("code_challenge", args.codeChallenge ?? "challenge123");
  url.searchParams.set("code_challenge_method", "S256");
  if (args.state) url.searchParams.set("state", args.state);
  return url.toString();
}

describe("oauth provider runtime", () => {
  it("returns a 302 redirect with a code for a valid authorization request", async () => {
    const request = new Request(authorizeUrl({ state: "abc-123" }), {
      headers: { cookie: "convex-auth.session_token=session-token" },
    });
    const createdCodes: unknown[] = [];

    const response = await handleOidcAuthorizeRequest({
      request,
      issuer: "https://example.com",
      resolveClient: async () => ({
        clientId: "client-123",
        name: "Test Client",
        redirectUris: ["https://app.example.com/callback"],
        allowedScopes: ["openid", "email", "profile"],
      }),
      requireAllowedRedirectUri: (client, redirectUri) => {
        if (!client.redirectUris.includes(redirectUri)) {
          throw new Error("invalid_redirect_uri");
        }
      },
      resolveRequestedScopes: (scope) => scope.split(" "),
      resolveSessionFromToken: async () => ({ subjectId: "user_123" }),
      resolveIdentityForSession: async () => ({ userId: "user_123" }),
      authorize: async ({ requestedScopes }) => ({
        ok: true,
        organizationId: "",
        scopes: requestedScopes,
      }),
      createAuthorizationCode: async (input) => {
        createdCodes.push(input);
      },
      generateAuthorizationCode: () => "code-123",
    });

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.searchParams.get("code")).toBe("code-123");
    expect(location.searchParams.get("state")).toBe("abc-123");
    expect(createdCodes).toHaveLength(1);
    const created = createdCodes[0] as { code: string; clientId: string };
    expect(created.code).toBe("code-123");
    expect(created.clientId).toBe("client-123");
  });

  it("exchanges an authorization code for access and refresh tokens", async () => {
    const pair = await createPkcePair();
    const issuer = "https://example.com";
    const consumedCodes: unknown[] = [];

    const request = new Request("https://example.com/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: "code-123",
        client_id: "client-123",
        redirect_uri: "https://app.example.com/callback",
        code_verifier: pair.verifier,
      }),
    });

    const response = await handleOidcTokenRequest({
      request,
      resolveClient: async () => ({
        clientId: "client-123",
        name: "Test Client",
        redirectUris: ["https://app.example.com/callback"],
        allowedScopes: ["openid", "email", "profile"],
      }),
      consumeAuthorizationCode: async (input) => {
        consumedCodes.push(input);
        return {
          clientId: "client-123",
          subjectId: "user_123",
          organizationId: "",
          scopes: ["openid", "email"],
          codeChallenge: pair.challenge,
          codeChallengeMethod: "S256" as const,
          audience: issuer,
          resourceId: issuer,
          expiresAt: Date.now() + 5 * 60 * 1000,
        };
      },
      redeemRefreshToken: async () => ({
        ok: false as const,
        status: 400,
        body: { error: "invalid_grant" },
        reason: "not_refresh_token",
      }),
      signAccessToken: async () => ({
        accessToken: "access-123",
        expiresIn: 900,
        scope: "openid email",
        tokenType: "Bearer" as const,
      }),
      issueRefreshToken: async () => ({ refreshToken: "refresh-123" }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      access_token: "access-123",
      token_type: "Bearer",
      expires_in: 900,
      refresh_token: "refresh-123",
      scope: "openid email",
    });
    expect(consumedCodes).toHaveLength(1);
    const consumed = consumedCodes[0] as { code: string; clientId: string };
    expect(consumed.code).toBe("code-123");
    expect(consumed.clientId).toBe("client-123");
  });

  it("rejects an authorization code exchange with a mismatched code verifier", async () => {
    const pair = await createPkcePair();
    const issuer = "https://example.com";

    const request = new Request("https://example.com/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: "code-123",
        client_id: "client-123",
        redirect_uri: "https://app.example.com/callback",
        code_verifier: "wrong-verifier",
      }),
    });

    const response = await handleOidcTokenRequest({
      request,
      resolveClient: async () => ({
        clientId: "client-123",
        name: "Test Client",
        redirectUris: ["https://app.example.com/callback"],
        allowedScopes: ["openid", "email", "profile"],
      }),
      consumeAuthorizationCode: async () => ({
        clientId: "client-123",
        subjectId: "user_123",
        organizationId: "",
        scopes: ["openid", "email"],
        codeChallenge: pair.challenge,
        codeChallengeMethod: "S256" as const,
        audience: issuer,
        resourceId: issuer,
        expiresAt: Date.now() + 5 * 60 * 1000,
      }),
      redeemRefreshToken: async () => ({
        ok: false as const,
        status: 400,
        body: { error: "invalid_grant" },
        reason: "not_refresh_token",
      }),
      signAccessToken: async () => ({
        accessToken: "access-123",
        expiresIn: 900,
        scope: "openid email",
        tokenType: "Bearer" as const,
      }),
      issueRefreshToken: async () => ({ refreshToken: "refresh-123" }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "invalid_grant",
      error_description: "PKCE verifier mismatch",
    });
  });

  it("exchanges a refresh token for a rotated pair", async () => {
    const issuer = "https://example.com";

    const request = new Request("https://example.com/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: "refresh-old",
        client_id: "client-123",
      }),
    });

    const response = await handleOidcTokenRequest({
      request,
      resolveClient: async () => ({
        clientId: "client-123",
        name: "Test Client",
        redirectUris: ["https://app.example.com/callback"],
        allowedScopes: ["openid", "email", "profile"],
      }),
      consumeAuthorizationCode: async () => null,
      redeemRefreshToken: async () => ({
        ok: true as const,
        subjectId: "user_123",
        organizationId: "",
        audience: issuer,
        resourceId: issuer,
        scopes: ["openid", "email"],
        refreshToken: "refresh-new",
        expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
        inactivityExpiresAt: null,
      }),
      signAccessToken: async () => ({
        accessToken: "access-new",
        expiresIn: 900,
        scope: "openid email",
        tokenType: "Bearer" as const,
      }),
      issueRefreshToken: async () => ({ refreshToken: "should-not-be-called" }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      access_token: "access-new",
      token_type: "Bearer",
      expires_in: 900,
      refresh_token: "refresh-new",
      scope: "openid email",
    });
  });

  it("returns login_required when no session cookie is present", async () => {
    const request = new Request(authorizeUrl({}));

    const response = await handleOidcAuthorizeRequest({
      request,
      issuer: "https://example.com",
      resolveClient: async () => ({
        clientId: "client-123",
        name: "Test Client",
        redirectUris: ["https://app.example.com/callback"],
        allowedScopes: ["openid", "email", "profile"],
      }),
      requireAllowedRedirectUri: () => {},
      resolveRequestedScopes: (scope) => scope.split(" "),
      resolveSessionFromToken: async () => null,
      resolveIdentityForSession: async () => null,
      authorize: async () => ({ ok: true, organizationId: "", scopes: [] }),
      createAuthorizationCode: async () => {},
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "login_required" });
  });

  it("returns invalid_client for an unknown client", async () => {
    const request = new Request(authorizeUrl({}), {
      headers: { cookie: "convex-auth.session_token=session-token" },
    });

    const response = await handleOidcAuthorizeRequest({
      request,
      issuer: "https://example.com",
      resolveClient: async () => null,
      requireAllowedRedirectUri: () => {},
      resolveRequestedScopes: (scope) => scope.split(" "),
      resolveSessionFromToken: async () => ({ subjectId: "user_123" }),
      resolveIdentityForSession: async () => ({ userId: "user_123" }),
      authorize: async () => ({ ok: true, organizationId: "", scopes: [] }),
      createAuthorizationCode: async () => {},
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "invalid_client",
      error_description: "Unknown OAuth client",
    });
  });
});
