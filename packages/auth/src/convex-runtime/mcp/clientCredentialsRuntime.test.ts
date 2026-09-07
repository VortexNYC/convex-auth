import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { handleMcpOAuthTokenRequest } from "./runtime";
import type { McpOAuthTokenRequestArgs } from "./runtime";
import type { McpOAuthClient } from "./types";

type Args = McpOAuthTokenRequestArgs<McpOAuthClient>;

const MACHINE_CLIENT: McpOAuthClient = {
  clientId: "svc-hermes",
  name: "Hermes",
  redirectUris: [],
  allowedScopes: ["app:growth:read"],
  grantTypes: ["client_credentials"],
  tokenEndpointAuthMethod: "client_secret_post",
};

function tokenRequest(body: Record<string, string>) {
  return new Request("https://app.example.com/oauth/example-mcp/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
}

/** The user-path collaborators must never be reached by a machine grant. */
const userPathTraps = {
  consumeAuthorizationCode: (): never => {
    throw new Error("authorization code path must not run");
  },
  redeemRefreshToken: (): never => {
    throw new Error("refresh path must not run");
  },
  signAccessToken: (): never => {
    throw new Error("user token signer must not run");
  },
  issueRefreshToken: (): never => {
    throw new Error("refresh issuance must not run");
  },
} satisfies Pick<
  Args,
  "consumeAuthorizationCode" | "redeemRefreshToken" | "signAccessToken" | "issueRefreshToken"
>;

function machineArgs(
  overrides: Partial<NonNullable<Args["clientCredentials"]>> = {},
): Omit<Args, "request"> {
  return {
    resolveClient: () => MACHINE_CLIENT,
    ...userPathTraps,
    clientCredentials: {
      supportedMethods: ["client_secret_post"],
      verifyClientSecret: () => true,
      resolveGrantTarget: () => ({
        ok: true as const,
        organizationId: "org_1",
        audience: "https://app.example.com/mcp",
      }),
      signMachineAccessToken: () => ({
        accessToken: "machine.jwt.token",
        expiresIn: 3600,
        scope: "app:growth:read",
        tokenType: "Bearer",
      }),
      ...overrides,
    },
  };
}

describe("handleMcpOAuthTokenRequest — client_credentials", () => {
  it("issues a machine token without touching the user paths", async () => {
    const response = await handleMcpOAuthTokenRequest({
      request: tokenRequest({
        grant_type: "client_credentials",
        client_id: "svc-hermes",
        client_secret: "s3cret",
        scope: "app:growth:read",
      }),
      ...machineArgs(),
    });

    assert.equal(response.status, 200);
    const body: Record<string, unknown> = await response.json();
    assert.equal(body.access_token, "machine.jwt.token");
    assert.equal(body.token_type, "Bearer");
    // No refresh token: a machine client re-authenticates with its own
    // credential, so a refresh token would be a second standing secret.
    assert.equal(body.refresh_token, undefined);
  });

  it("does not fall through to another grant when the credential is rejected", async () => {
    // The important rule. If a rejected machine credential fell through, it
    // would get a second evaluation as an authorization-code request.
    const response = await handleMcpOAuthTokenRequest({
      request: tokenRequest({
        grant_type: "client_credentials",
        client_id: "svc-hermes",
        client_secret: "wrong",
      }),
      ...machineArgs({ verifyClientSecret: () => false }),
    });

    assert.equal(response.status, 401);
    const body: Record<string, unknown> = await response.json();
    assert.equal(body.error, "invalid_client");
  });

  it("surfaces a refused grant target", async () => {
    const response = await handleMcpOAuthTokenRequest({
      request: tokenRequest({
        grant_type: "client_credentials",
        client_id: "svc-hermes",
        client_secret: "s3cret",
      }),
      ...machineArgs({
        resolveGrantTarget: () => ({
          status: 403,
          body: { error: "access_denied" },
        }),
      }),
    });

    assert.equal(response.status, 403);
  });

  it("leaves the endpoint user-only when the machine grant is not configured", async () => {
    // Omitting clientCredentials must not quietly enable it.
    const response = await handleMcpOAuthTokenRequest({
      request: tokenRequest({
        grant_type: "client_credentials",
        client_id: "svc-hermes",
        client_secret: "s3cret",
      }),
      resolveClient: () => MACHINE_CLIENT,
      ...userPathTraps,
    });

    assert.notEqual(response.status, 200);
  });
});
