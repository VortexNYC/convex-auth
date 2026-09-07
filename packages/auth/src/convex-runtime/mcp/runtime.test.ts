import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  authorizeMcpOAuthAccessRequest,
  createMcpOAuthAccessRuntime,
  createMcpOAuthHttpHandlers,
  getMcpOAuthSessionTokenFromRequest,
  handleMcpOAuthAuthorizeRequest,
  handleMcpOAuthClientRegistrationRequest,
  handleMcpOAuthTokenRequest,
  signAuthorizedMcpOAuthAccessToken,
} from "./runtime";

describe("mcp oauth runtime helpers", () => {
  it("authorizes oauth access requests with org and scope checks", async () => {
    const authorized = await authorizeMcpOAuthAccessRequest({
      userId: "user_123",
      requestedOrganizationId: "org_123",
      requestedScopes: ["app:organization:read"],
      getAccessibleOrganizations: () => ({ organizationIds: ["org_123"] }),
      getOrganizationAccess: () => ({
        organizationId: "org_123",
        permissions: ["organization:read"],
      }),
      normalizeScopes: (requestedScopes) => requestedScopes,
      validateScopes: () => null,
      requireAccessibleOrganization: (organizationId) => organizationId ?? "",
    });

    assert.deepEqual(authorized, {
      ok: true,
      organizationId: "org_123",
      scopes: ["app:organization:read"],
    });

    const requiresOrganization = await authorizeMcpOAuthAccessRequest({
      userId: "user_123",
      requestedOrganizationId: null,
      requestedScopes: ["app:organization:read"],
      getAccessibleOrganizations: () => ({
        organizationIds: ["org_123", "org_456"],
      }),
      getOrganizationAccess: () => ({
        organizationId: "org_123",
        permissions: ["organization:read"],
      }),
      normalizeScopes: (requestedScopes) => requestedScopes,
      validateScopes: () => null,
      requireAccessibleOrganization: (organizationId) => organizationId ?? "",
    });

    assert.deepEqual(requiresOrganization, {
      ok: false,
      status: 400,
      body: {
        error: "invalid_request",
        error_description: "organization_id is required for multi-organization users",
      },
    });
  });

  it("signs access tokens only after linked-user reauthorization", async () => {
    const token = await signAuthorizedMcpOAuthAccessToken({
      subjectId: "ba_user_123",
      clientId: "mcp_client_123",
      organizationId: "org_123",
      scopes: ["app:organization:read"],
      audience: "https://api.example.com",
      resolveIdentityForUser: async () => ({ userId: "user_123" }),
      authorize: async () => ({
        ok: true,
        organizationId: "org_123",
        scopes: ["app:organization:read"],
      }),
      signAccessToken: async () => ({
        accessToken: "access_123",
        expiresIn: 900,
        scope: "app:organization:read",
        tokenType: "Bearer",
      }),
    });

    assert.deepEqual(token, {
      accessToken: "access_123",
      expiresIn: 900,
      scope: "app:organization:read",
      tokenType: "Bearer",
    });

    const unlinked = await signAuthorizedMcpOAuthAccessToken({
      subjectId: "ba_user_123",
      clientId: "mcp_client_123",
      organizationId: "org_123",
      scopes: ["app:organization:read"],
      audience: "https://api.example.com",
      resolveIdentityForUser: async () => null,
      authorize: async () => ({
        ok: true,
        organizationId: "org_123",
        scopes: ["app:organization:read"],
      }),
      signAccessToken: async () => ({
        accessToken: "access_123",
        expiresIn: 900,
        scope: "app:organization:read",
        tokenType: "Bearer",
      }),
    });

    assert.deepEqual(unlinked, {
      status: 401,
      body: {
        error: "invalid_token",
        error_description: "User is not linked",
      },
    });
  });

  it("creates reusable mcp oauth access runtime", async () => {
    const runtime = createMcpOAuthAccessRuntime({
      resolveIdentityForUser: async () => ({ userId: "user_123" }),
      getAccessibleOrganizations: async () => ({
        organizationIds: ["org_123"],
      }),
      getOrganizationAccess: async () => ({
        organizationId: "org_123",
        permissions: ["organization:read"],
      }),
      normalizeScopes: (requestedScopes) => requestedScopes,
      validateScopes: () => null,
      requireAccessibleOrganization: (organizationId) => organizationId ?? "",
      signAccessToken: async () => ({
        accessToken: "access_123",
        expiresIn: 900,
        scope: "app:organization:read",
        tokenType: "Bearer",
      }),
    });

    assert.deepEqual(
      await runtime.resolveIdentityForSession({
        subjectId: "ba_user_123",
      }),
      { userId: "user_123" },
    );

    assert.deepEqual(
      await runtime.authorize({
        identity: { userId: "user_123" },
        subjectId: "ba_user_123",
        requestedOrganizationId: "org_123",
        requestedScopes: ["app:organization:read"],
      }),
      {
        ok: true,
        organizationId: "org_123",
        scopes: ["app:organization:read"],
      },
    );

    assert.deepEqual(
      await runtime.signAccessToken({
        subjectId: "ba_user_123",
        clientId: "mcp_client_123",
        organizationId: "org_123",
        scopes: ["app:organization:read"],
        audience: "https://api.example.com",
      }),
      {
        accessToken: "access_123",
        expiresIn: 900,
        scope: "app:organization:read",
        tokenType: "Bearer",
      },
    );
  });

  it("reads session token from signed cookie payload", () => {
    const request = new Request("https://example.com/oauth/example-mcp/authorize", {
      headers: {
        cookie: "convex-auth.session_token=session_token_123.signature",
      },
    });

    assert.equal(getMcpOAuthSessionTokenFromRequest(request), "session_token_123");
  });

  it("rejects management-client scope escalation before session or code creation", async () => {
    let createdCode = false;
    const response = await handleMcpOAuthAuthorizeRequest({
      request: new Request(
        "https://example.com/oauth/example-mcp/authorize?response_type=code&client_id=management-client&redirect_uri=https%3A%2F%2Fmanagement.example.com%2Fcallback&scope=app%3Agrowth%3Awrite&code_challenge=challenge&code_challenge_method=S256",
      ),
      defaultAudience: "https://api.example.com",
      defaultResourceId: "example-mcp",
      resolveClient: async () => ({
        clientId: "management-client",
        name: "Convex Management",
        redirectUris: ["https://management.example.com/callback"],
        allowedScopes: ["app:organization:read"],
      }),
      requireAllowedRedirectUri: () => {},
      resolveRequestedScopes: (scope) => scope.split(" "),
      resolveSessionFromToken: async () => {
        throw new Error("invalid scope must fail before session resolution");
      },
      resolveIdentityForSession: async () => {
        throw new Error("invalid scope must fail before identity resolution");
      },
      authorize: async () => {
        throw new Error("invalid scope must fail before authorization");
      },
      createAuthorizationCode: async () => {
        createdCode = true;
      },
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: "invalid_scope",
      error_description: "Unsupported scope: app:growth:write",
    });
    assert.equal(createdCode, false);
  });

  it("stores an allowed client-scope subset after user authorization", async () => {
    let storedScopes: readonly string[] | null = null;
    const response = await handleMcpOAuthAuthorizeRequest({
      request: new Request(
        "https://example.com/oauth/example-mcp/authorize?response_type=code&client_id=management-client&redirect_uri=https%3A%2F%2Fmanagement.example.com%2Fcallback&scope=app%3Aorganization%3Aread&code_challenge=challenge&code_challenge_method=S256",
        {
          headers: {
            cookie: "convex-auth.session_token=session_123.signature",
          },
        },
      ),
      defaultAudience: "https://api.example.com",
      defaultResourceId: "example-mcp",
      resolveClient: async () => ({
        clientId: "management-client",
        name: "Convex Management",
        redirectUris: ["https://management.example.com/callback"],
        allowedScopes: ["app:organization:read", "app:opportunities:write"],
      }),
      requireAllowedRedirectUri: () => {},
      resolveRequestedScopes: (scope) => scope.split(" "),
      resolveSessionFromToken: async () => ({
        subjectId: "external-user-1",
      }),
      resolveIdentityForSession: async () => ({ userId: "user-1" }),
      authorize: async ({ requestedScopes }) => ({
        ok: true,
        organizationId: "organization-1",
        scopes: requestedScopes,
      }),
      createAuthorizationCode: async ({ scopes }) => {
        storedScopes = scopes;
      },
      generateAuthorizationCode: () => "authorization-code-1",
    });

    assert.equal(response.status, 302);
    assert.deepEqual(storedScopes, ["app:organization:read"]);
    assert.equal(
      new URL(response.headers.get("location") ?? "").searchParams.get("code"),
      "authorization-code-1",
    );
  });

  it("rejects authorization policy scope widening before code creation", async () => {
    let createdCode = false;
    const response = await handleMcpOAuthAuthorizeRequest({
      request: new Request(
        "https://example.com/oauth/example-mcp/authorize?response_type=code&client_id=management-client&redirect_uri=https%3A%2F%2Fmanagement.example.com%2Fcallback&scope=app%3Aorganization%3Aread&code_challenge=challenge&code_challenge_method=S256",
        {
          headers: {
            cookie: "convex-auth.session_token=session_123.signature",
          },
        },
      ),
      defaultAudience: "https://api.example.com",
      defaultResourceId: "example-mcp",
      resolveClient: async () => ({
        clientId: "management-client",
        name: "Convex Management",
        redirectUris: ["https://management.example.com/callback"],
        allowedScopes: ["app:organization:read", "app:growth:write"],
      }),
      requireAllowedRedirectUri: () => {},
      resolveRequestedScopes: (scope) => scope.split(" "),
      resolveSessionFromToken: async () => ({
        subjectId: "external-user-1",
      }),
      resolveIdentityForSession: async () => ({ userId: "user-1" }),
      authorize: async () => ({
        ok: true,
        organizationId: "organization-1",
        scopes: ["app:organization:read", "app:growth:write"],
      }),
      createAuthorizationCode: async () => {
        createdCode = true;
      },
    });

    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error: "server_error",
      error_description: "Authorization policy returned an unauthorized scope",
    });
    assert.equal(createdCode, false);
  });

  it("handles dynamic client registration with package validation", async () => {
    const response = await handleMcpOAuthClientRegistrationRequest({
      request: new Request("https://example.com/oauth/example-mcp/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          client_name: "Example Desktop",
          redirect_uris: ["https://app.example.com/oauth/callback"],
          scope: "app:organization:read",
        }),
      }),
      supportedScopes: ["app:organization:read"],
      createDynamicClient: async (input) => ({
        clientId: "mcp_client_123",
        name: input.clientName,
        redirectUris: [...input.redirectUris],
        allowedScopes: ["app:organization:read"],
        tokenEndpointAuthMethod: "none",
        grantTypes: ["authorization_code"],
        responseTypes: ["code"],
        pkceRequired: true,
        softwareId: null,
        softwareVersion: null,
        clientIdIssuedAt: 1_700_000_000,
      }),
    });

    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), {
      client_id: "mcp_client_123",
      client_id_issued_at: 1_700_000_000,
      client_name: "Example Desktop",
      redirect_uris: ["https://app.example.com/oauth/callback"],
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: "app:organization:read",
    });
  });

  it("returns refresh token grant errors directly", async () => {
    const response = await handleMcpOAuthTokenRequest({
      request: new Request("https://example.com/oauth/example-mcp/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: "refresh_123",
          client_id: "unknown-client",
        }),
      }),
      resolveClient: async () => null,
      consumeAuthorizationCode: async () => null,
      redeemRefreshToken: async () => ({
        ok: false,
        status: 400,
        body: { error: "invalid_grant" },
      }),
      signAccessToken: async () => ({
        accessToken: "access_123",
        expiresIn: 900,
        scope: "app:organization:read",
        tokenType: "Bearer",
      }),
      issueRefreshToken: async () => ({ refreshToken: "refresh_456" }),
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: "invalid_client",
      error_description: "Unknown OAuth client",
    });
  });

  it("does not mint tokens from a legacy code with disallowed client scopes", async () => {
    const response = await handleMcpOAuthTokenRequest({
      request: new Request("https://example.com/oauth/example-mcp/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: "legacy-code",
          client_id: "management-client",
          redirect_uri: "http://127.0.0.1:8788/callback",
          code_verifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
        }),
      }),
      resolveClient: async () => ({
        clientId: "management-client",
        name: "Convex Management",
        redirectUris: ["http://127.0.0.1:8788/callback"],
        allowedScopes: ["app:organization:read"],
      }),
      consumeAuthorizationCode: async () => ({
        clientId: "management-client",
        subjectId: "external-user-1",
        organizationId: "organization-1",
        scopes: ["app:growth:write"],
        codeChallenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
        codeChallengeMethod: "S256",
        audience: "https://api.example.com",
        resourceId: "example-mcp",
        expiresAt: Date.now() + 60_000,
      }),
      redeemRefreshToken: async () => ({
        ok: false,
        status: 400,
        body: { error: "invalid_grant" },
      }),
      signAccessToken: async () => {
        throw new Error("disallowed code scopes must not reach token signing");
      },
      issueRefreshToken: async () => {
        throw new Error("disallowed code scopes must not reach refresh-token issuance");
      },
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: "invalid_grant",
      error_description: "Authorization code scope is not allowed for client",
    });
  });

  it("returns sign-access-token failures during refresh grants", async () => {
    const client = {
      clientId: "mcp_client_123",
      name: "CLI Client",
      redirectUris: ["https://app.example.com/oauth/callback"],
      allowedScopes: ["app:organization:read"],
      tokenEndpointAuthMethod: "none" as const,
      pkceRequired: true,
      grantTypes: ["authorization_code", "refresh_token"],
      responseTypes: ["code"],
    };

    const response = await handleMcpOAuthTokenRequest({
      request: new Request("https://example.com/oauth/example-mcp/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: "refresh_123",
          client_id: client.clientId,
        }),
      }),
      resolveClient: async () => client,
      consumeAuthorizationCode: async () => null,
      redeemRefreshToken: async () => ({
        ok: true,
        subjectId: "ba_user_123",
        organizationId: "org_123",
        audience: "https://api.example.com",
        resourceId: "example-mcp",
        scopes: ["app:organization:read"],
        refreshToken: "refresh_456",
      }),
      signAccessToken: async () => ({
        status: 403,
        body: {
          error: "invalid_target",
          error_description: "Requested organization is not accessible",
        },
      }),
      issueRefreshToken: async () => ({ refreshToken: "refresh_789" }),
    });

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      error: "invalid_target",
      error_description: "Requested organization is not accessible",
    });
  });

  it("creates route-safe oauth handlers", async () => {
    const handlers = createMcpOAuthHttpHandlers({
      authorize: {
        defaultAudience: "https://api.example.com",
        defaultResourceId: "example-mcp",
        resolveClient: async () => {
          throw new Error("authorize exploded");
        },
        requireAllowedRedirectUri: () => {},
        resolveRequestedScopes: () => [],
        resolveSessionFromToken: async () => null,
        resolveIdentityForSession: async () => null,
        authorize: async () => ({
          ok: false,
          status: 403,
          body: { error: "invalid_target" },
        }),
        createAuthorizationCode: async () => {},
      },
      clientRegistration: {
        supportedScopes: ["app:organization:read"],
        createDynamicClient: async () => {
          throw {
            error: "invalid_client_metadata",
            error_description: "bad registration",
          };
        },
      },
      token: {
        resolveClient: async () => {
          throw new Error("token exploded");
        },
        consumeAuthorizationCode: async () => null,
        redeemRefreshToken: async () => ({
          ok: false,
          status: 400,
          body: { error: "invalid_grant" },
        }),
        signAccessToken: async () => ({
          accessToken: "access_123",
          expiresIn: 900,
          scope: "app:organization:read",
          tokenType: "Bearer",
        }),
        issueRefreshToken: async () => ({ refreshToken: "refresh_123" }),
      },
    });

    const authorizeResponse = await handlers.handleAuthorizeRequest(
      new Request(
        "https://example.com/oauth/example-mcp/authorize?response_type=code&client_id=test&redirect_uri=https%3A%2F%2Fapp.example.com%2Fcallback&scope=app%3Aorganization%3Aread&code_challenge=abc&code_challenge_method=S256",
      ),
    );
    assert.equal(authorizeResponse.status, 400);
    assert.deepEqual(await authorizeResponse.json(), {
      error: "invalid_request",
      error_description: "authorize exploded",
    });

    const registrationResponse = await handlers.handleClientRegistrationRequest(
      new Request("https://example.com/oauth/example-mcp/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          client_name: "Example Desktop",
          redirect_uris: ["https://app.example.com/oauth/callback"],
        }),
      }),
    );
    assert.equal(registrationResponse.status, 400);
    assert.deepEqual(await registrationResponse.json(), {
      error: "invalid_client_metadata",
      error_description: "bad registration",
    });

    const tokenResponse = await handlers.handleTokenRequest(
      new Request("https://example.com/oauth/example-mcp/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: "refresh_123",
          client_id: "mcp_client_123",
        }),
      }),
    );
    assert.equal(tokenResponse.status, 400);
    assert.deepEqual(await tokenResponse.json(), {
      error: "invalid_request",
      error_description: "token exploded",
    });
  });
});
