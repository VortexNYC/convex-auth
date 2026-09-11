import { describe, expect, it } from "vitest";

import { createMcpOAuthSigningKeyRecord, signMcpOAuthAccessToken } from "../mcp/signing.js";
import { createPkcePair } from "../mcp/pkce.js";

import { createOidcProviderHttpHandlers } from "./http.js";

const testClient = {
  clientId: "client-123",
  name: "Test Client",
  redirectUris: ["https://app.example.com/callback"],
  allowedScopes: ["openid", "email", "profile"],
};

describe("createOidcProviderHttpHandlers", () => {
  it("returns a 302 redirect with an authorization code for a logged-in user", async () => {
    const createdCodes: unknown[] = [];

    const handlers = createOidcProviderHttpHandlers({
      issuer: "https://example.com",
      clients: [testClient],
      storage: {
        getSessionByToken: async () => ({ userId: "user_123" }),
        getUserById: async () => ({ _id: "user_123" }),
        createAuthorizationCode: async (input) => {
          createdCodes.push(input);
        },
        consumeAuthorizationCode: async () => null,
        issueRefreshToken: async () => ({ refreshToken: "refresh-123" }),
        redeemRefreshToken: async () => ({
          ok: false as const,
          status: 400,
          body: { error: "invalid_grant" },
          reason: "not_refresh_token",
        }),
        getSigningKey: async () => null,
        upsertSigningKey: async () => {},
      },
      generateAuthorizationCode: () => "code-123",
    });

    const request = new Request(
      "https://example.com/oauth/authorize?response_type=code&client_id=client-123&redirect_uri=https%3A%2F%2Fapp.example.com%2Fcallback&scope=openid%20email&code_challenge=challenge&code_challenge_method=S256&state=abc",
      {
        headers: { cookie: "convex-auth.session_token=session-token" },
      },
    );

    const response = await handlers.handleAuthorizeRequest(request);

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.searchParams.get("code")).toBe("code-123");
    expect(location.searchParams.get("state")).toBe("abc");
    expect(createdCodes).toHaveLength(1);
    const created = createdCodes[0] as { code: string; clientId: string };
    expect(created.code).toBe("code-123");
    expect(created.clientId).toBe("client-123");
  });

  it("redirects to loginUrl when the user is not logged in", async () => {
    const handlers = createOidcProviderHttpHandlers({
      issuer: "https://example.com",
      clients: [testClient],
      loginUrl: "/login",
      storage: {
        getSessionByToken: async () => null,
        getUserById: async () => null,
        createAuthorizationCode: async () => {},
        consumeAuthorizationCode: async () => null,
        issueRefreshToken: async () => ({ refreshToken: "refresh-123" }),
        redeemRefreshToken: async () => ({
          ok: false as const,
          status: 400,
          body: { error: "invalid_grant" },
          reason: "not_refresh_token",
        }),
        getSigningKey: async () => null,
        upsertSigningKey: async () => {},
      },
    });

    const request = new Request(
      "https://example.com/oauth/authorize?response_type=code&client_id=client-123&redirect_uri=https%3A%2F%2Fapp.example.com%2Fcallback&scope=openid&code_challenge=challenge&code_challenge_method=S256",
    );

    const response = await handlers.handleAuthorizeRequest(request);

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("redirect_to")).toBe(request.url);
  });

  it("exchanges an authorization code for access and refresh tokens", async () => {
    const pair = await createPkcePair();
    const issuer = "https://example.com";
    const consumedCodes: unknown[] = [];

    const handlers = createOidcProviderHttpHandlers({
      issuer,
      clients: [testClient],
      storage: {
        getSessionByToken: async () => null,
        getUserById: async () => null,
        createAuthorizationCode: async () => {},
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
        issueRefreshToken: async () => ({ refreshToken: "refresh-123" }),
        redeemRefreshToken: async () => ({
          ok: false as const,
          status: 400,
          body: { error: "invalid_grant" },
          reason: "not_refresh_token",
        }),
        getSigningKey: async () => null,
        upsertSigningKey: async () => {},
      },
    });

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

    const response = await handlers.handleTokenRequest(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(typeof body.access_token).toBe("string");
    expect(body.token_type).toBe("Bearer");
    expect(typeof body.expires_in).toBe("number");
    expect(body.refresh_token).toBe("refresh-123");
    expect(body.scope).toBe("openid email");
    expect(consumedCodes).toHaveLength(1);
  });

  it("serves an OIDC discovery document", async () => {
    const handlers = createOidcProviderHttpHandlers({
      issuer: "https://example.com",
      clients: [testClient],
      supportedScopes: ["openid", "email"],
      storage: {
        getSessionByToken: async () => null,
        getUserById: async () => null,
        createAuthorizationCode: async () => {},
        consumeAuthorizationCode: async () => null,
        issueRefreshToken: async () => ({ refreshToken: "refresh-123" }),
        redeemRefreshToken: async () => ({
          ok: false as const,
          status: 400,
          body: { error: "invalid_grant" },
          reason: "not_refresh_token",
        }),
        getSigningKey: async () => null,
        upsertSigningKey: async () => {},
      },
    });

    const request = new Request("https://example.com/.well-known/openid-configuration");
    const response = handlers.handleDiscoveryRequest(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.issuer).toBe("https://example.com");
    expect(body.authorization_endpoint).toBe("https://example.com/oauth/authorize");
    expect(body.token_endpoint).toBe("https://example.com/oauth/token");
    expect(body.userinfo_endpoint).toBe("https://example.com/oauth/userinfo");
    expect(body.jwks_uri).toBe("https://example.com/oauth/jwks");
    expect(body.scopes_supported).toEqual(["openid", "email"]);
    expect(body.code_challenge_methods_supported).toEqual(["S256"]);
  });

  it("returns userinfo for a valid access token", async () => {
    const issuer = "https://example.com";
    const signingKey = await createMcpOAuthSigningKeyRecord({ keyId: "userinfo-test-key" });
    const accessToken = await signMcpOAuthAccessToken({
      signingKey,
      issuer,
      audience: issuer,
      subject: "user_123",
      claims: {
        clientId: "client-123",
        subjectId: "user_123",
        resourceId: issuer,
        scopes: ["openid", "email", "profile"],
      },
    });

    const handlers = createOidcProviderHttpHandlers({
      issuer,
      clients: [testClient],
      storage: {
        getSessionByToken: async () => null,
        getUserById: async () => ({
          _id: "user_123",
          email: "user@example.com",
          emailVerified: true,
          name: "Test User",
        }),
        createAuthorizationCode: async () => {},
        consumeAuthorizationCode: async () => null,
        issueRefreshToken: async () => ({ refreshToken: "refresh-123" }),
        redeemRefreshToken: async () => ({
          ok: false as const,
          status: 400,
          body: { error: "invalid_grant" },
          reason: "not_refresh_token",
        }),
        getSigningKey: async () => null,
        upsertSigningKey: async () => {},
        listSigningKeys: async () => [signingKey],
      },
    });

    const request = new Request("https://example.com/oauth/userinfo", {
      headers: { authorization: `Bearer ${accessToken.accessToken}` },
    });

    const response = await handlers.handleUserInfoRequest(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.sub).toBe("user_123");
    expect(body.email).toBe("user@example.com");
    expect(body.email_verified).toBe(true);
    expect(body.name).toBe("Test User");
  });

  it("rejects an authorize request with missing PKCE", async () => {
    const handlers = createOidcProviderHttpHandlers({
      issuer: "https://example.com",
      clients: [testClient],
      storage: {
        getSessionByToken: async () => ({ userId: "user_123" }),
        getUserById: async () => ({ _id: "user_123" }),
        createAuthorizationCode: async () => {},
        consumeAuthorizationCode: async () => null,
        issueRefreshToken: async () => ({ refreshToken: "refresh-123" }),
        redeemRefreshToken: async () => ({
          ok: false as const,
          status: 400,
          body: { error: "invalid_grant" },
          reason: "not_refresh_token",
        }),
        getSigningKey: async () => null,
        upsertSigningKey: async () => {},
      },
    });

    const request = new Request(
      "https://example.com/oauth/authorize?response_type=code&client_id=client-123&redirect_uri=https%3A%2F%2Fapp.example.com%2Fcallback&scope=openid",
      {
        headers: { cookie: "convex-auth.session_token=session-token" },
      },
    );

    const response = await handlers.handleAuthorizeRequest(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("invalid_request");
    expect(body.error_description).toContain("PKCE");
  });

  it("rejects an authorize request with an unregistered redirect URI", async () => {
    const handlers = createOidcProviderHttpHandlers({
      issuer: "https://example.com",
      clients: [testClient],
      storage: {
        getSessionByToken: async () => ({ userId: "user_123" }),
        getUserById: async () => ({ _id: "user_123" }),
        createAuthorizationCode: async () => {},
        consumeAuthorizationCode: async () => null,
        issueRefreshToken: async () => ({ refreshToken: "refresh-123" }),
        redeemRefreshToken: async () => ({
          ok: false as const,
          status: 400,
          body: { error: "invalid_grant" },
          reason: "not_refresh_token",
        }),
        getSigningKey: async () => null,
        upsertSigningKey: async () => {},
      },
    });

    const request = new Request(
      "https://example.com/oauth/authorize?response_type=code&client_id=client-123&redirect_uri=https%3A%2F%2Fevil.example.com%2Fcallback&scope=openid&code_challenge=challenge&code_challenge_method=S256",
      {
        headers: { cookie: "convex-auth.session_token=session-token" },
      },
    );

    const response = await handlers.handleAuthorizeRequest(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("invalid_request");
    expect(body.error_description).toContain("invalid_redirect_uri");
  });

  it("rejects an authorize request with a scope not allowed for the client", async () => {
    const handlers = createOidcProviderHttpHandlers({
      issuer: "https://example.com",
      clients: [{ ...testClient, allowedScopes: ["openid", "email"] }],
      supportedScopes: ["openid", "email", "profile"],
      storage: {
        getSessionByToken: async () => ({ userId: "user_123" }),
        getUserById: async () => ({ _id: "user_123" }),
        createAuthorizationCode: async () => {},
        consumeAuthorizationCode: async () => null,
        issueRefreshToken: async () => ({ refreshToken: "refresh-123" }),
        redeemRefreshToken: async () => ({
          ok: false as const,
          status: 400,
          body: { error: "invalid_grant" },
          reason: "not_refresh_token",
        }),
        getSigningKey: async () => null,
        upsertSigningKey: async () => {},
      },
    });

    const request = new Request(
      "https://example.com/oauth/authorize?response_type=code&client_id=client-123&redirect_uri=https%3A%2F%2Fapp.example.com%2Fcallback&scope=openid%20profile&code_challenge=challenge&code_challenge_method=S256",
      {
        headers: { cookie: "convex-auth.session_token=session-token" },
      },
    );

    const response = await handlers.handleAuthorizeRequest(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("invalid_scope");
  });

  it("rejects a token exchange with an unknown client", async () => {
    const pair = await createPkcePair();

    const handlers = createOidcProviderHttpHandlers({
      issuer: "https://example.com",
      clients: [testClient],
      storage: {
        getSessionByToken: async () => null,
        getUserById: async () => null,
        createAuthorizationCode: async () => {},
        consumeAuthorizationCode: async () => null,
        issueRefreshToken: async () => ({ refreshToken: "refresh-123" }),
        redeemRefreshToken: async () => ({
          ok: false as const,
          status: 400,
          body: { error: "invalid_grant" },
          reason: "not_refresh_token",
        }),
        getSigningKey: async () => null,
        upsertSigningKey: async () => {},
      },
    });

    const request = new Request("https://example.com/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: "code-123",
        client_id: "unknown-client",
        redirect_uri: "https://app.example.com/callback",
        code_verifier: pair.verifier,
      }),
    });

    const response = await handlers.handleTokenRequest(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("invalid_client");
  });

  it("rejects a token exchange with an unregistered redirect URI", async () => {
    const pair = await createPkcePair();

    const handlers = createOidcProviderHttpHandlers({
      issuer: "https://example.com",
      clients: [testClient],
      storage: {
        getSessionByToken: async () => null,
        getUserById: async () => null,
        createAuthorizationCode: async () => {},
        consumeAuthorizationCode: async () => null,
        issueRefreshToken: async () => ({ refreshToken: "refresh-123" }),
        redeemRefreshToken: async () => ({
          ok: false as const,
          status: 400,
          body: { error: "invalid_grant" },
          reason: "not_refresh_token",
        }),
        getSigningKey: async () => null,
        upsertSigningKey: async () => {},
      },
    });

    const request = new Request("https://example.com/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: "code-123",
        client_id: "client-123",
        redirect_uri: "https://evil.example.com/callback",
        code_verifier: pair.verifier,
      }),
    });

    const response = await handlers.handleTokenRequest(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("invalid_grant");
    expect(body.error_description).toContain("redirect URI");
  });

  it("rejects a token exchange with a mismatched PKCE verifier", async () => {
    const handlers = createOidcProviderHttpHandlers({
      issuer: "https://example.com",
      clients: [testClient],
      storage: {
        getSessionByToken: async () => null,
        getUserById: async () => null,
        createAuthorizationCode: async () => {},
        consumeAuthorizationCode: async () => ({
          clientId: "client-123",
          subjectId: "user_123",
          organizationId: "",
          scopes: ["openid", "email"],
          codeChallenge: "challenge-123",
          codeChallengeMethod: "S256" as const,
          audience: "https://example.com",
          resourceId: "https://example.com",
          expiresAt: Date.now() + 5 * 60 * 1000,
        }),
        issueRefreshToken: async () => ({ refreshToken: "refresh-123" }),
        redeemRefreshToken: async () => ({
          ok: false as const,
          status: 400,
          body: { error: "invalid_grant" },
          reason: "not_refresh_token",
        }),
        getSigningKey: async () => null,
        upsertSigningKey: async () => {},
      },
    });

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

    const response = await handlers.handleTokenRequest(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("invalid_grant");
    expect(body.error_description).toContain("PKCE");
  });

  it("rejects a token exchange with an expired authorization code", async () => {
    const pair = await createPkcePair();

    const handlers = createOidcProviderHttpHandlers({
      issuer: "https://example.com",
      clients: [testClient],
      storage: {
        getSessionByToken: async () => null,
        getUserById: async () => null,
        createAuthorizationCode: async () => {},
        consumeAuthorizationCode: async () => ({
          clientId: "client-123",
          subjectId: "user_123",
          organizationId: "",
          scopes: ["openid", "email"],
          codeChallenge: pair.challenge,
          codeChallengeMethod: "S256" as const,
          audience: "https://example.com",
          resourceId: "https://example.com",
          expiresAt: Date.now() - 1000,
        }),
        issueRefreshToken: async () => ({ refreshToken: "refresh-123" }),
        redeemRefreshToken: async () => ({
          ok: false as const,
          status: 400,
          body: { error: "invalid_grant" },
          reason: "not_refresh_token",
        }),
        getSigningKey: async () => null,
        upsertSigningKey: async () => {},
      },
    });

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

    const response = await handlers.handleTokenRequest(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("invalid_grant");
    expect(body.error_description).toContain("expired");
  });

  it("rejects a token exchange when the authorization code is reused", async () => {
    const pair = await createPkcePair();
    let consumed = false;

    const handlers = createOidcProviderHttpHandlers({
      issuer: "https://example.com",
      clients: [testClient],
      storage: {
        getSessionByToken: async () => null,
        getUserById: async () => null,
        createAuthorizationCode: async () => {},
        consumeAuthorizationCode: async () => {
          if (consumed) return null;
          consumed = true;
          return {
            clientId: "client-123",
            subjectId: "user_123",
            organizationId: "",
            scopes: ["openid", "email"],
            codeChallenge: pair.challenge,
            codeChallengeMethod: "S256" as const,
            audience: "https://example.com",
            resourceId: "https://example.com",
            expiresAt: Date.now() + 5 * 60 * 1000,
          };
        },
        issueRefreshToken: async () => ({ refreshToken: "refresh-123" }),
        redeemRefreshToken: async () => ({
          ok: false as const,
          status: 400,
          body: { error: "invalid_grant" },
          reason: "not_refresh_token",
        }),
        getSigningKey: async () => null,
        upsertSigningKey: async () => {},
      },
    });

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

    const first = await handlers.handleTokenRequest(request.clone());
    expect(first.status).toBe(200);

    const second = await handlers.handleTokenRequest(request.clone());
    expect(second.status).toBe(400);
    const body = await second.json();
    expect(body.error).toBe("invalid_grant");
    expect(body.error_description).toContain("not found or already consumed");
  });

  it("rejects userinfo requests without a bearer token", async () => {
    const handlers = createOidcProviderHttpHandlers({
      issuer: "https://example.com",
      clients: [testClient],
      storage: {
        getSessionByToken: async () => null,
        getUserById: async () => null,
        createAuthorizationCode: async () => {},
        consumeAuthorizationCode: async () => null,
        issueRefreshToken: async () => ({ refreshToken: "refresh-123" }),
        redeemRefreshToken: async () => ({
          ok: false as const,
          status: 400,
          body: { error: "invalid_grant" },
          reason: "not_refresh_token",
        }),
        getSigningKey: async () => null,
        upsertSigningKey: async () => {},
      },
    });

    const response = await handlers.handleUserInfoRequest(
      new Request("https://example.com/oauth/userinfo"),
    );

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("invalid_token");
  });
});
