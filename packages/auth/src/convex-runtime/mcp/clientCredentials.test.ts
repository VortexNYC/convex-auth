import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { validateMcpOAuthClientCredentialsTokenExchange } from "./flow";
import type { McpOAuthClient } from "./types";

const MACHINE_CLIENT: McpOAuthClient = {
  clientId: "svc-hermes",
  name: "Hermes",
  redirectUris: [],
  allowedScopes: ["app:growth:read", "app:growth:write"],
  grantTypes: ["client_credentials"],
  tokenEndpointAuthMethod: "client_secret_post",
};

const CONFIDENTIAL = ["client_secret_post"] as const;

/** Registered for assertions rather than a secret. */
const ASSERTION_CLIENT: McpOAuthClient = {
  ...MACHINE_CLIENT,
  tokenEndpointAuthMethod: "private_key_jwt",
};

/** Stands in for the caller's secret check; verification is its job. */
const acceptSecret = () => true;

function tokenRequest(body: Record<string, string>, headers?: Record<string, string>) {
  return new Request("https://auth.example.com/oauth/example-mcp/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      ...headers,
    },
    body: new URLSearchParams(body).toString(),
  });
}

describe("validateMcpOAuthClientCredentialsTokenExchange", () => {
  it("issues the client's full ceiling when scope is omitted", async () => {
    const result = await validateMcpOAuthClientCredentialsTokenExchange({
      request: tokenRequest({
        grant_type: "client_credentials",
        client_id: "svc-hermes",
        client_secret: "s3cret",
      }),
      resolveClient: () => MACHINE_CLIENT,
      supportedMethods: CONFIDENTIAL,
      verifyClientSecret: acceptSecret,
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    // Omitted scope must mean the client's entitlement, never everything the
    // server offers.
    assert.deepEqual(result.scopes, ["app:growth:read", "app:growth:write"]);
  });

  it("narrows to the requested subset", async () => {
    const result = await validateMcpOAuthClientCredentialsTokenExchange({
      request: tokenRequest({
        grant_type: "client_credentials",
        client_id: "svc-hermes",
        client_secret: "s3cret",
        scope: "app:growth:read",
      }),
      resolveClient: () => MACHINE_CLIENT,
      supportedMethods: CONFIDENTIAL,
      verifyClientSecret: acceptSecret,
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.scopes, ["app:growth:read"]);
  });

  it("refuses to widen beyond the registered ceiling", async () => {
    const result = await validateMcpOAuthClientCredentialsTokenExchange({
      request: tokenRequest({
        grant_type: "client_credentials",
        client_id: "svc-hermes",
        client_secret: "s3cret",
        scope: "app:growth:read app:opportunities:write",
      }),
      resolveClient: () => MACHINE_CLIENT,
      supportedMethods: CONFIDENTIAL,
      verifyClientSecret: acceptSecret,
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.body.error, "invalid_scope");
    assert.match(result.body.error_description ?? "", /app:opportunities:write/u);
  });

  it("refuses a client that did not register for the grant", async () => {
    // Otherwise any authorization-code client could mint itself a user-less token.
    const result = await validateMcpOAuthClientCredentialsTokenExchange({
      request: tokenRequest({
        grant_type: "client_credentials",
        client_id: "svc-hermes",
        client_secret: "s3cret",
      }),
      resolveClient: () => ({
        ...MACHINE_CLIENT,
        grantTypes: ["authorization_code", "refresh_token"],
      }),
      supportedMethods: CONFIDENTIAL,
      verifyClientSecret: acceptSecret,
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.body.error, "unauthorized_client");
  });

  it("refuses when the deployment has not enabled a confidential method", async () => {
    // Default `none` deployments must not silently accept machine credentials.
    const result = await validateMcpOAuthClientCredentialsTokenExchange({
      request: tokenRequest({
        grant_type: "client_credentials",
        client_id: "svc-hermes",
        client_secret: "s3cret",
      }),
      resolveClient: () => MACHINE_CLIENT,
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.status, 401);
    assert.equal(result.body.error, "invalid_client");
  });

  it("refuses an unknown client", async () => {
    const result = await validateMcpOAuthClientCredentialsTokenExchange({
      request: tokenRequest({
        grant_type: "client_credentials",
        client_id: "ghost",
        client_secret: "s3cret",
      }),
      resolveClient: () => null,
      supportedMethods: CONFIDENTIAL,
      verifyClientSecret: acceptSecret,
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.body.error, "invalid_client");
  });

  it("refuses an assertion when the deployment cannot verify one", async () => {
    // Fail closed: a missing verifier must never read as a verified assertion.
    const result = await validateMcpOAuthClientCredentialsTokenExchange({
      request: tokenRequest({
        grant_type: "client_credentials",
        client_id: "svc-hermes",
        client_assertion: "eyJhbGciOiJFUzI1NiJ9.e30.sig",
        client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      }),
      resolveClient: () => ASSERTION_CLIENT,
      supportedMethods: ["private_key_jwt"],
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.status, 401);
    assert.match(result.body.error_description ?? "", /cannot verify/u);
  });

  it("surfaces an assertion verification failure", async () => {
    const result = await validateMcpOAuthClientCredentialsTokenExchange({
      request: tokenRequest({
        grant_type: "client_credentials",
        client_id: "svc-hermes",
        client_assertion: "eyJhbGciOiJFUzI1NiJ9.e30.sig",
        client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      }),
      resolveClient: () => ASSERTION_CLIENT,
      supportedMethods: ["private_key_jwt"],
      verifyClientAssertion: () => ({
        ok: false,
        error: "invalid_client",
        errorDescription: "client_assertion signature or claims are invalid",
      }),
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.status, 401);
    assert.match(result.body.error_description ?? "", /signature or claims/u);
  });

  it("accepts a verified assertion", async () => {
    const result = await validateMcpOAuthClientCredentialsTokenExchange({
      request: tokenRequest({
        grant_type: "client_credentials",
        client_id: "svc-hermes",
        client_assertion: "eyJhbGciOiJFUzI1NiJ9.e30.sig",
        client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
        scope: "app:growth:read",
      }),
      resolveClient: () => ASSERTION_CLIENT,
      supportedMethods: ["private_key_jwt"],
      verifyClientAssertion: () => ({
        ok: true,
        clientId: "svc-hermes",
        keyId: "k1",
        assertionId: "assertion-1",
        expiresAt: Math.floor(Date.now() / 1000) + 60,
      }),
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.scopes, ["app:growth:read"]);
  });

  it("refuses a secret when the deployment cannot verify one", async () => {
    // Same fail-closed rule as assertions: no verifier must not read as verified.
    const result = await validateMcpOAuthClientCredentialsTokenExchange({
      request: tokenRequest({
        grant_type: "client_credentials",
        client_id: "svc-hermes",
        client_secret: "s3cret",
      }),
      resolveClient: () => MACHINE_CLIENT,
      supportedMethods: CONFIDENTIAL,
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.status, 401);
    assert.match(result.body.error_description ?? "", /cannot verify secrets/u);
  });

  it("refuses an invalid secret", async () => {
    const result = await validateMcpOAuthClientCredentialsTokenExchange({
      request: tokenRequest({
        grant_type: "client_credentials",
        client_id: "svc-hermes",
        client_secret: "wrong",
      }),
      resolveClient: () => MACHINE_CLIENT,
      supportedMethods: CONFIDENTIAL,
      verifyClientSecret: () => false,
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.status, 401);
  });

  it("refuses a method the client did not register for", async () => {
    // Downgrade guard: advertising two confidential methods must not let a
    // client authenticate with one it never registered.
    const result = await validateMcpOAuthClientCredentialsTokenExchange({
      request: tokenRequest(
        {
          grant_type: "client_credentials",
          client_id: "svc-hermes",
        },
        { authorization: "Basic c3ZjOnMzY3JldA==" },
      ),
      resolveClient: () => MACHINE_CLIENT, // registered client_secret_post
      supportedMethods: ["client_secret_post", "client_secret_basic"],
      verifyClientSecret: acceptSecret,
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.status, 401);
    assert.match(result.body.error_description ?? "", /registered for client_secret_post/u);
  });

  it("refuses a confidential client that presents no credential", async () => {
    // The bypass: client authentication defaults to `none`, so a request with
    // no secret and no assertion passed, the registered-method guard was
    // skipped (nothing presented), and both verification blocks were skipped
    // too — minting a token with nothing checked.
    const result = await validateMcpOAuthClientCredentialsTokenExchange({
      request: tokenRequest({
        grant_type: "client_credentials",
        client_id: "svc-hermes",
      }),
      resolveClient: () => MACHINE_CLIENT, // registered client_secret_post
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.status, 401);
    assert.match(result.body.error_description ?? "", /must authenticate with client_secret_post/u);
  });

  it("refuses a no-credential request even when the deployment allows none", async () => {
    const result = await validateMcpOAuthClientCredentialsTokenExchange({
      request: tokenRequest({
        grant_type: "client_credentials",
        client_id: "svc-hermes",
      }),
      resolveClient: () => MACHINE_CLIENT,
      supportedMethods: ["none", "client_secret_post"],
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.status, 401);
  });

  it("refuses a mismatched grant type", async () => {
    const result = await validateMcpOAuthClientCredentialsTokenExchange({
      request: tokenRequest({
        grant_type: "authorization_code",
        client_id: "svc-hermes",
        client_secret: "s3cret",
      }),
      resolveClient: () => MACHINE_CLIENT,
      supportedMethods: CONFIDENTIAL,
      verifyClientSecret: acceptSecret,
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.body.error, "unsupported_grant_type");
  });
});
