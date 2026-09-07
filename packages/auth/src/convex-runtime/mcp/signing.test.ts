import assert from "node:assert/strict";

import { decodeProtectedHeader, SignJWT } from "jose";
import { describe, it } from "vitest";

import {
  buildMcpOAuthJwks,
  buildMcpOAuthTokenResponse,
  createMcpOAuthSigningKeyRecord,
  MCP_OAUTH_RETIRED_SIGNING_KEY_RETENTION_MS,
  shouldPublishMcpOAuthSigningKey,
  signMcpOAuthAccessToken,
  verifyMcpOAuthAccessToken,
} from "./signing";

describe("mcp oauth signing helpers", () => {
  it("builds signing keys with aligned kid and alg", async () => {
    const key = await createMcpOAuthSigningKeyRecord({
      keyId: "example-mcp-key-1",
    });

    assert.equal(key.algorithm, "ES256");
    const publicJwk: unknown = JSON.parse(key.publicJwkJson);
    const privateJwk: unknown = JSON.parse(key.privateJwkJson);
    assert.equal(
      typeof publicJwk === "object" && publicJwk !== null
        ? Reflect.get(publicJwk, "kid")
        : undefined,
      "example-mcp-key-1",
    );
    assert.equal(
      typeof privateJwk === "object" && privateJwk !== null
        ? Reflect.get(privateJwk, "kid")
        : undefined,
      "example-mcp-key-1",
    );
  });

  it("signs and verifies access tokens", async () => {
    const key = await createMcpOAuthSigningKeyRecord({
      keyId: "example-mcp-key-2",
    });

    const now = Math.floor(Date.now() / 1000);
    const signed = await signMcpOAuthAccessToken({
      signingKey: key,
      issuer: "https://example.com/oauth/example-mcp",
      audience: "example-mcp",
      subject: "user_123",
      claims: {
        clientId: "example-mcp-dev-client",
        subjectId: "user_123",
        resourceId: "app:mcp",
        scopes: ["app:organization:read", "app:tasks:read"],
        organizationId: "org_123",
        organizationSlug: "acme",
      },
      now,
      expiresInSeconds: 900,
    });

    assert.equal(decodeProtectedHeader(signed.accessToken).kid, "example-mcp-key-2");
    assert.equal(signed.tokenType, "Bearer");
    assert.equal(signed.scope, "app:organization:read app:tasks:read");
    assert.equal(signed.expiresIn, 900);

    const verified = await verifyMcpOAuthAccessToken({
      accessToken: signed.accessToken,
      signingKeys: [key],
      issuer: "https://example.com/oauth/example-mcp",
      audience: "example-mcp",
    });

    assert.equal(verified.keyId, "example-mcp-key-2");
    assert.equal(verified.subject, "user_123");
    assert.equal(verified.clientId, "example-mcp-dev-client");
    assert.equal(verified.subjectId, "user_123");
    assert.equal(verified.organizationId, "org_123");
    assert.equal(verified.organizationSlug, "acme");
    assert.equal(verified.resourceId, "app:mcp");
    assert.equal(verified.scope, "app:organization:read app:tasks:read");
    assert.equal(verified.issuedAt, now);
    assert.equal(verified.expiresAt, now + 900);
  });

  it("rejects an access token signed with a non-pinned algorithm", async () => {
    // The verifier pins `algorithms: [key.algorithm]` (ES256) and must never
    // trust the token header's `alg`. Forge a token with the SAME kid but a
    // symmetric HS256 signature — an algorithm-substitution attempt — and prove
    // it is rejected rather than verified. (With the current EC-only key this
    // also fails on key type; the test LOCKS the rejection so a future key-type
    // change can't silently widen the accepted algorithm set.)
    const key = await createMcpOAuthSigningKeyRecord({
      keyId: "example-mcp-key-3",
    });
    const now = Math.floor(Date.now() / 1000);
    const forged = await new SignJWT({ scope: "app:organization:read" })
      .setProtectedHeader({ alg: "HS256", kid: "example-mcp-key-3" })
      .setIssuer("https://example.com/oauth/example-mcp")
      .setAudience("example-mcp")
      .setSubject("attacker")
      .setIssuedAt(now)
      .setExpirationTime(now + 900)
      .sign(new TextEncoder().encode("attacker-controlled-secret"));

    await assert.rejects(
      verifyMcpOAuthAccessToken({
        accessToken: forged,
        signingKeys: [key],
        issuer: "https://example.com/oauth/example-mcp",
        audience: "example-mcp",
      }),
    );
  });

  it("keeps retired keys in jwks only during retention overlap", async () => {
    const active = await createMcpOAuthSigningKeyRecord({
      keyId: "active-key",
    });
    const retired = await createMcpOAuthSigningKeyRecord({
      keyId: "retired-key",
    });
    const now = Date.now();

    assert.equal(
      shouldPublishMcpOAuthSigningKey({
        key: { status: "active", retiredAt: null },
        now,
      }),
      true,
    );
    assert.equal(
      shouldPublishMcpOAuthSigningKey({
        key: {
          status: "retired",
          retiredAt: now - MCP_OAUTH_RETIRED_SIGNING_KEY_RETENTION_MS + 1,
        },
        now,
      }),
      true,
    );
    assert.equal(
      shouldPublishMcpOAuthSigningKey({
        key: {
          status: "retired",
          retiredAt: now - MCP_OAUTH_RETIRED_SIGNING_KEY_RETENTION_MS - 1,
        },
        now,
      }),
      false,
    );

    assert.deepEqual(
      buildMcpOAuthJwks({
        now,
        keys: [
          { ...active, status: "active", retiredAt: null },
          {
            ...retired,
            status: "retired",
            retiredAt: now - MCP_OAUTH_RETIRED_SIGNING_KEY_RETENTION_MS + 1,
          },
        ],
      }).keys.map((key) => (key as { kid?: string }).kid),
      ["active-key", "retired-key"],
    );
  });

  it("builds token response with optional refresh token", () => {
    assert.deepEqual(
      buildMcpOAuthTokenResponse({
        accessToken: "access_123",
        expiresIn: 900,
        scope: "app:organization:read",
        refreshToken: "refresh_123",
      }),
      {
        access_token: "access_123",
        refresh_token: "refresh_123",
        token_type: "Bearer",
        expires_in: 900,
        scope: "app:organization:read",
      },
    );
  });
});
