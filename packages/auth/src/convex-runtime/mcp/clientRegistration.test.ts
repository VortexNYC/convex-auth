import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  normalizeMcpOAuthDynamicClientRegistrationInput,
  registerMcpOAuthClient,
  validateMcpOAuthDynamicClientRegistrationInput,
} from "./clientRegistration";

const policy = {
  supportedScopes: ["app:organization:read", "app:opportunities:write"],
} as const;

describe("mcp dynamic client registration", () => {
  it("registers a public client with normalized metadata", () => {
    assert.deepEqual(
      registerMcpOAuthClient(
        {
          clientName: " Example Desktop ",
          redirectUris: ["http://127.0.0.1:8788/callback", "http://127.0.0.1:8788/callback"],
          scope: "app:organization:read app:opportunities:write",
        },
        policy,
        { clientId: "client_123" },
      ),
      {
        clientId: "client_123",
        name: "Example Desktop",
        redirectUris: ["http://127.0.0.1:8788/callback"],
        allowedScopes: ["app:organization:read", "app:opportunities:write"],
        tokenEndpointAuthMethod: "none",
        pkceRequired: true,
        grantTypes: ["authorization_code", "refresh_token"],
        responseTypes: ["code"],
        softwareId: null,
        softwareVersion: null,
        registrationClientUri: null,
        registrationAccessToken: null,
      },
    );
  });

  it("allows https redirect URIs and empty scopes", () => {
    assert.deepEqual(
      normalizeMcpOAuthDynamicClientRegistrationInput(
        {
          clientName: "Web Client",
          redirectUris: ["https://app.example.com/oauth/callback"],
        },
        policy,
      ),
      {
        name: "Web Client",
        redirectUris: ["https://app.example.com/oauth/callback"],
        allowedScopes: [],
        tokenEndpointAuthMethod: "none",
        pkceRequired: true,
        grantTypes: ["authorization_code", "refresh_token"],
        responseTypes: ["code"],
        softwareId: null,
        softwareVersion: null,
      },
    );
  });

  it("rejects unsupported scopes", () => {
    assert.deepEqual(
      validateMcpOAuthDynamicClientRegistrationInput(
        {
          clientName: "Bad Scope",
          redirectUris: ["https://app.example.com/oauth/callback"],
          scope: "app:tasks:read",
        },
        policy,
      ),
      {
        error: "invalid_client_metadata",
        error_description: "Unsupported scope: app:tasks:read",
      },
    );
  });

  it("rejects non-https non-localhost redirect URIs", () => {
    assert.deepEqual(
      validateMcpOAuthDynamicClientRegistrationInput(
        {
          clientName: "Bad Redirect",
          redirectUris: ["http://evil.test/callback"],
        },
        policy,
      ),
      {
        error: "invalid_client_metadata",
        error_description:
          "Redirect URI must use https or localhost http: http://evil.test/callback",
      },
    );
  });

  it("accepts refresh tokens and rejects unsupported token auth methods and grant types", () => {
    assert.deepEqual(
      normalizeMcpOAuthDynamicClientRegistrationInput(
        {
          clientName: "Refreshable Client",
          redirectUris: ["https://app.example.com/oauth/callback"],
          grantTypes: ["authorization_code", "refresh_token"],
        },
        policy,
      ).grantTypes,
      ["authorization_code", "refresh_token"],
    );

    assert.deepEqual(
      validateMcpOAuthDynamicClientRegistrationInput(
        {
          clientName: "Confidential Maybe Later",
          redirectUris: ["https://app.example.com/oauth/callback"],
          tokenEndpointAuthMethod: "client_secret_post",
        },
        policy,
      ),
      {
        error: "invalid_client_metadata",
        error_description: "Unsupported token_endpoint_auth_method: client_secret_post",
      },
    );

    assert.deepEqual(
      validateMcpOAuthDynamicClientRegistrationInput(
        {
          clientName: "Wrong Grant",
          redirectUris: ["https://app.example.com/oauth/callback"],
          grantTypes: ["client_credentials"],
        },
        policy,
      ),
      {
        error: "invalid_client_metadata",
        error_description: "Unsupported grant_types value: client_credentials",
      },
    );
  });
});
