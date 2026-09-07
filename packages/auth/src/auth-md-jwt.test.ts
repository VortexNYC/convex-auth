import assert from "node:assert/strict";

import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { describe, expect, it } from "vitest";

import {
  AUTH_MD_ACCESS_TOKEN_TYPE,
  AUTH_MD_IDENTITY_ASSERTION_TYPE,
  AUTH_MD_SIGNING_ALGORITHM,
  signAuthMdAccessToken,
  signAuthMdIdentityAssertion,
  verifyAuthMdAccessToken,
  verifyAuthMdIdentityAssertion,
  type AuthMdSigningKeyRecord,
} from "./auth-md";

const ISSUER = "https://auth.example.com";
const RESOURCE = "https://chat.example.com/";
const NOW = 1_800_000_000;

describe("auth.md signed transport", () => {
  it("round-trips pinned ES256 identity assertions and access tokens", async () => {
    const signingKey = await createSigningKey("active-key");
    const assertion = await signAuthMdIdentityAssertion({
      signingKey,
      issuer: ISSUER,
      claims: identityClaims(),
    });
    assert.deepEqual(
      await verifyAuthMdIdentityAssertion({
        assertion,
        signingKeys: [signingKey],
        issuer: ISSUER,
        now: (NOW + 1) * 1000,
      }),
      identityClaims(),
    );

    const accessToken = await signAuthMdAccessToken({
      signingKey,
      issuer: ISSUER,
      claims: accessClaims(),
    });
    assert.deepEqual(
      await verifyAuthMdAccessToken({
        accessToken,
        signingKeys: [signingKey],
        issuer: ISSUER,
        resource: RESOURCE,
        now: (NOW + 1) * 1000,
      }),
      accessClaims(),
    );
  });

  it("rejects the wrong issuer, audience, type, key, and tampering", async () => {
    const signingKey = await createSigningKey("active-key");
    const otherKey = await createSigningKey("other-key");
    const assertion = await signAuthMdIdentityAssertion({
      signingKey,
      issuer: ISSUER,
      claims: identityClaims(),
    });
    await expect(
      verifyAuthMdIdentityAssertion({
        assertion,
        signingKeys: [signingKey],
        issuer: "https://wrong.example.com",
        now: (NOW + 1) * 1000,
      }),
    ).rejects.toThrow();
    await expect(
      verifyAuthMdIdentityAssertion({
        assertion,
        signingKeys: [otherKey],
        issuer: ISSUER,
        now: (NOW + 1) * 1000,
      }),
    ).rejects.toThrow("signing key was not found");
    await expect(
      verifyAuthMdIdentityAssertion({
        assertion: tamperSignature(assertion),
        signingKeys: [signingKey],
        issuer: ISSUER,
        now: (NOW + 1) * 1000,
      }),
    ).rejects.toThrow();

    const accessToken = await signAuthMdAccessToken({
      signingKey,
      issuer: ISSUER,
      claims: accessClaims(),
    });
    await expect(
      verifyAuthMdAccessToken({
        accessToken,
        signingKeys: [signingKey],
        issuer: ISSUER,
        resource: "https://app.example.com/",
        now: (NOW + 1) * 1000,
      }),
    ).rejects.toThrow();
    await expect(
      verifyAuthMdIdentityAssertion({
        assertion: accessToken,
        signingKeys: [signingKey],
        issuer: ISSUER,
        now: (NOW + 1) * 1000,
      }),
    ).rejects.toThrow("protected header is invalid");
  });

  it("accepts retained verification keys but enforces expiry and lifetime caps", async () => {
    const retiredKey = await createSigningKey("retired-key");
    const assertion = await signAuthMdIdentityAssertion({
      signingKey: retiredKey,
      issuer: ISSUER,
      claims: identityClaims(),
    });
    assert.equal(
      (
        await verifyAuthMdIdentityAssertion({
          assertion,
          signingKeys: [retiredKey],
          issuer: ISSUER,
          now: (NOW + 1) * 1000,
        })
      ).assertionId,
      "assertion-1",
    );
    await expect(
      verifyAuthMdIdentityAssertion({
        assertion,
        signingKeys: [retiredKey],
        issuer: ISSUER,
        now: (NOW + 301) * 1000,
      }),
    ).rejects.toThrow();
    await expect(
      signAuthMdAccessToken({
        signingKey: retiredKey,
        issuer: ISSUER,
        claims: { ...accessClaims(), expiresAt: NOW + 3601 },
      }),
    ).rejects.toThrow("lifetime is invalid");
  });

  it("rejects signed tokens whose protected type is not the protocol type", async () => {
    const signingKey = await createSigningKey("active-key");
    const privateJwk = parseJsonWebKey(signingKey.privateJwkJson);
    const { importJWK } = await import("jose");
    const key = await importJWK(privateJwk, AUTH_MD_SIGNING_ALGORITHM);
    const assertion = await new SignJWT({
      registration_type: "service_auth",
      assertion_id: "assertion-1",
      user_id: "user-1",
      org_id: "org-1",
      resource: RESOURCE,
      scope: "chat:read chat:write",
    })
      .setProtectedHeader({
        alg: AUTH_MD_SIGNING_ALGORITHM,
        kid: signingKey.keyId,
        typ: AUTH_MD_ACCESS_TOKEN_TYPE,
      })
      .setIssuer(ISSUER)
      .setSubject("registration-1")
      .setAudience(ISSUER)
      .setJti("assertion-1")
      .setIssuedAt(NOW)
      .setExpirationTime(NOW + 300)
      .sign(key);
    await expect(
      verifyAuthMdIdentityAssertion({
        assertion,
        signingKeys: [signingKey],
        issuer: ISSUER,
        now: (NOW + 1) * 1000,
      }),
    ).rejects.toThrow("protected header is invalid");
    assert.notEqual(AUTH_MD_IDENTITY_ASSERTION_TYPE, AUTH_MD_ACCESS_TOKEN_TYPE);
  });
});

function identityClaims() {
  return {
    assertionId: "assertion-1",
    registrationId: "registration-1",
    userId: "user-1",
    organizationId: "org-1",
    resource: RESOURCE,
    scopes: ["chat:read", "chat:write"],
    issuedAt: NOW,
    expiresAt: NOW + 300,
  };
}

function accessClaims() {
  return {
    credentialId: "credential-1",
    registrationId: "registration-1",
    userId: "user-1",
    organizationId: "org-1",
    resource: RESOURCE,
    scopes: ["chat:read", "chat:write"],
    issuedAt: NOW,
    expiresAt: NOW + 3600,
  };
}

async function createSigningKey(keyId: string): Promise<AuthMdSigningKeyRecord> {
  const { publicKey, privateKey } = await generateKeyPair("ES256", {
    extractable: true,
  });
  return {
    keyId,
    algorithm: AUTH_MD_SIGNING_ALGORITHM,
    publicJwkJson: JSON.stringify(await exportJWK(publicKey)),
    privateJwkJson: JSON.stringify(await exportJWK(privateKey)),
  };
}

function tamperSignature(token: string): string {
  const segments = token.split(".");
  assert.equal(segments.length, 3);
  const signature = segments[2]!;
  segments[2] = `${signature.startsWith("a") ? "b" : "a"}${signature.slice(1)}`;
  return segments.join(".");
}

/**
 * JSON.parse returns `any`, so asserting it is a JWK asserts something unchecked.
 * `kty` is the one field every JWK must carry, so checking it is a real narrowing
 * rather than a promise to the compiler.
 */
function parseJsonWebKey(json: string): JsonWebKey {
  const parsed: unknown = JSON.parse(json);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as { kty?: unknown }).kty !== "string"
  ) {
    throw new Error("expected a JSON Web Key with a string kty");
  }
  return parsed;
}
