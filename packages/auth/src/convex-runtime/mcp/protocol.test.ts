import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  buildAuthorizationServerMetadata,
  buildEmptyJwks,
  buildMcpOAuthIssuer,
  buildMcpOAuthPaths,
  buildProtectedResourceMetadata,
  createMcpOAuthProtocolConfig,
  resolveRequestOrigin,
} from "./protocol";

const config = {
  resourceSlug: "example-mcp",
  resourceId: "app:mcp",
  audience: "example-mcp",
  scopesSupported: ["app:organization:read", "app:opportunities:write"],
} as const;

describe("mcp protocol helpers", () => {
  it("builds stable default paths", () => {
    assert.deepEqual(buildMcpOAuthPaths(config), {
      issuerPath: "/oauth/example-mcp",
      mcpPath: "/mcp",
      authorizationServerMetadataPath: "/.well-known/oauth-authorization-server/example-mcp",
      protectedResourceMetadataPath: "/.well-known/oauth-protected-resource/example-mcp",
      jwksPath: "/oauth/example-mcp/jwks",
      authorizePath: "/oauth/example-mcp/authorize",
      tokenPath: "/oauth/example-mcp/token",
      registrationPath: "/oauth/example-mcp/register",
    });
  });

  it("builds authorization metadata", () => {
    assert.deepEqual(buildAuthorizationServerMetadata("https://example.com", config), {
      issuer: "https://example.com/oauth/example-mcp",
      authorization_endpoint: "https://example.com/oauth/example-mcp/authorize",
      token_endpoint: "https://example.com/oauth/example-mcp/token",
      registration_endpoint: "https://example.com/oauth/example-mcp/register",
      jwks_uri: "https://example.com/oauth/example-mcp/jwks",
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: ["none"],
      code_challenge_methods_supported: ["S256"],
      scopes_supported: ["app:organization:read", "app:opportunities:write"],
      resource: "app:mcp",
    });
  });

  it("builds protected resource metadata", () => {
    assert.deepEqual(buildProtectedResourceMetadata("https://example.com", config), {
      resource: "app:mcp",
      authorization_servers: ["https://example.com/oauth/example-mcp"],
      jwks_uri: "https://example.com/oauth/example-mcp/jwks",
      bearer_methods_supported: ["header"],
      scopes_supported: ["app:organization:read", "app:opportunities:write"],
    });
  });

  it("normalizes protocol config", () => {
    assert.deepEqual(
      createMcpOAuthProtocolConfig({
        resourceSlug: " example-mcp ",
        resourceId: " app:mcp ",
        audience: " example-mcp ",
        oauthBasePath: "/oauth/",
        scopesSupported: ["app:organization:read", "app:organization:read", "  "],
      }),
      {
        resourceSlug: "example-mcp",
        resourceId: "app:mcp",
        audience: "example-mcp",
        scopesSupported: ["app:organization:read"],
        mcpPath: "/mcp",
        oauthBasePath: "/oauth",
        issuerPath: "/oauth/example-mcp",
        responseTypesSupported: ["code"],
        grantTypesSupported: ["authorization_code", "refresh_token"],
        tokenEndpointAuthMethodsSupported: ["none"],
        codeChallengeMethodsSupported: ["S256"],
        bearerMethodsSupported: ["header"],
        clientIdMetadataDocumentSupported: false,
      },
    );
  });

  it("resolves request origin and empty jwks", () => {
    assert.equal(
      resolveRequestOrigin(new Request("https://example.com/oauth/example-mcp/authorize")),
      "https://example.com",
    );
    assert.equal(
      buildMcpOAuthIssuer("https://example.com", config),
      "https://example.com/oauth/example-mcp",
    );
    assert.deepEqual(buildEmptyJwks(), { keys: [] });
  });
});
