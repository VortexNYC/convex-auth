import assert from "node:assert/strict";

import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { describe, it } from "vitest";

import {
  MCP_OAUTH_CLIENT_ASSERTION_MAX_LIFETIME_SECONDS,
  MCP_OAUTH_CLIENT_ASSERTION_TYPE,
  verifyMcpOAuthClientAssertion,
} from "./clientAssertion";
import type { McpOAuthClientAssertionKey } from "./types";

const TOKEN_ENDPOINT = "https://auth.example.com/oauth/example-mcp/token";
const CLIENT_ID = "svc-hermes";

async function keyPair(keyId = "k1") {
  const { privateKey, publicKey } = await generateKeyPair("ES256", {
    extractable: true,
  });
  const key: McpOAuthClientAssertionKey = {
    keyId,
    publicJwk: { ...(await exportJWK(publicKey)) },
    algorithm: "ES256",
  };
  return { privateKey, key };
}

async function assertionFor(
  privateKey: CryptoKey,
  claims: {
    iss?: string;
    sub?: string;
    aud?: string;
    expSeconds?: number;
    kid?: string | null;
    jti?: string;
  } = {},
) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const jwt = new SignJWT({ jti: claims.jti ?? "assertion-1" })
    .setProtectedHeader(
      claims.kid === null ? { alg: "ES256" } : { alg: "ES256", kid: claims.kid ?? "k1" },
    )
    .setIssuer(claims.iss ?? CLIENT_ID)
    .setSubject(claims.sub ?? CLIENT_ID)
    .setAudience(claims.aud ?? TOKEN_ENDPOINT)
    .setIssuedAt(nowSeconds)
    .setExpirationTime(nowSeconds + (claims.expSeconds ?? 60));
  return await jwt.sign(privateKey);
}

describe("verifyMcpOAuthClientAssertion", () => {
  it("accepts a well-formed assertion", async () => {
    const { privateKey, key } = await keyPair();
    const result = await verifyMcpOAuthClientAssertion({
      assertion: await assertionFor(privateKey),
      assertionType: MCP_OAUTH_CLIENT_ASSERTION_TYPE,
      clientId: CLIENT_ID,
      clientKeys: [key],
      tokenEndpoint: TOKEN_ENDPOINT,
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.clientId, CLIENT_ID);
    assert.equal(result.keyId, "k1");
    // `jti` is surfaced so the caller can reject replays.
    assert.equal(result.assertionId, "assertion-1");
  });

  it("rejects an assertion signed by a key we do not hold", async () => {
    const { privateKey } = await keyPair();
    const { key: otherKey } = await keyPair();
    const result = await verifyMcpOAuthClientAssertion({
      assertion: await assertionFor(privateKey),
      assertionType: MCP_OAUTH_CLIENT_ASSERTION_TYPE,
      clientId: CLIENT_ID,
      clientKeys: [otherKey],
      tokenEndpoint: TOKEN_ENDPOINT,
    });

    assert.equal(result.ok, false);
  });

  it("rejects an assertion minted for another audience", async () => {
    // Otherwise an assertion captured by one authorization server could be
    // replayed against another.
    const { privateKey, key } = await keyPair();
    const result = await verifyMcpOAuthClientAssertion({
      assertion: await assertionFor(privateKey, {
        aud: "https://evil.example.com/token",
      }),
      assertionType: MCP_OAUTH_CLIENT_ASSERTION_TYPE,
      clientId: CLIENT_ID,
      clientKeys: [key],
      tokenEndpoint: TOKEN_ENDPOINT,
    });

    assert.equal(result.ok, false);
  });

  it("rejects an assertion naming a different client", async () => {
    const { privateKey, key } = await keyPair();
    const result = await verifyMcpOAuthClientAssertion({
      assertion: await assertionFor(privateKey, { sub: "someone-else" }),
      assertionType: MCP_OAUTH_CLIENT_ASSERTION_TYPE,
      clientId: CLIENT_ID,
      clientKeys: [key],
      tokenEndpoint: TOKEN_ENDPOINT,
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.errorDescription, /iss and sub/u);
  });

  it("rejects an expired assertion", async () => {
    const { privateKey, key } = await keyPair();
    const assertion = await assertionFor(privateKey, { expSeconds: 30 });
    const result = await verifyMcpOAuthClientAssertion({
      assertion,
      assertionType: MCP_OAUTH_CLIENT_ASSERTION_TYPE,
      clientId: CLIENT_ID,
      clientKeys: [key],
      tokenEndpoint: TOKEN_ENDPOINT,
      now: Date.now() + 120_000,
    });

    assert.equal(result.ok, false);
  });

  it("caps assertion lifetime so it cannot become a standing secret", async () => {
    const { privateKey, key } = await keyPair();
    const result = await verifyMcpOAuthClientAssertion({
      assertion: await assertionFor(privateKey, {
        expSeconds: MCP_OAUTH_CLIENT_ASSERTION_MAX_LIFETIME_SECONDS + 3600,
      }),
      assertionType: MCP_OAUTH_CLIENT_ASSERTION_TYPE,
      clientId: CLIENT_ID,
      clientKeys: [key],
      tokenEndpoint: TOKEN_ENDPOINT,
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.errorDescription, /maximum lifetime/u);
  });

  it("rejects an unsupported assertion type", async () => {
    const { privateKey, key } = await keyPair();
    const result = await verifyMcpOAuthClientAssertion({
      assertion: await assertionFor(privateKey),
      assertionType: "urn:example:saml",
      clientId: CLIENT_ID,
      clientKeys: [key],
      tokenEndpoint: TOKEN_ENDPOINT,
    });

    assert.equal(result.ok, false);
  });

  it("rejects a client with no registered key", async () => {
    const { privateKey } = await keyPair();
    const result = await verifyMcpOAuthClientAssertion({
      assertion: await assertionFor(privateKey),
      assertionType: MCP_OAUTH_CLIENT_ASSERTION_TYPE,
      clientId: CLIENT_ID,
      clientKeys: [],
      tokenEndpoint: TOKEN_ENDPOINT,
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.errorDescription, /no registered assertion key/u);
  });
});
