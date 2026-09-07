import assert from "node:assert/strict";

import { exportJWK, generateKeyPair, SignJWT, type JWK, type JWTPayload } from "jose";
import { describe, it } from "vitest";

import {
  createBetterAuthApiTokenVerifier,
  createBetterAuthApiTokenVerifierFromConvexAuthConfig,
} from "./createBetterAuthApiTokenVerifier";

async function createSigningKeyPair(): Promise<{
  publicJwk: JWK;
  privateJwk: JWK;
}> {
  const { publicKey, privateKey } = await generateKeyPair("RS256", {
    extractable: true,
  });

  return {
    publicJwk: await exportJWK(publicKey),
    privateJwk: await exportJWK(privateKey),
  };
}

async function signToken(args: {
  privateJwk: JWK;
  issuer: string;
  audience: string;
  subject?: string;
  claims?: JWTPayload;
  scope?: string;
  sessionId?: string;
  expiresAt?: string | number;
  notBefore?: string | number;
}) {
  let jwt = new SignJWT({
    scope: args.scope ?? "profile:read org:read",
    sid: args.sessionId ?? "session_123",
    ...args.claims,
  })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(args.issuer)
    .setAudience(args.audience)
    .setIssuedAt()
    .setExpirationTime(args.expiresAt ?? "5m");

  if (args.subject !== undefined) {
    jwt = jwt.setSubject(args.subject);
  }

  if (args.notBefore !== undefined) {
    jwt = jwt.setNotBefore(args.notBefore);
  }

  return jwt.sign(await importRsaSigningKey(args.privateJwk));
}

async function importRsaSigningKey(privateJwk: JWK): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "jwk",
    privateJwk,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );
}

async function createVerifierFixture() {
  const issuer = "https://auth.example.com";
  const audience = "example-api";
  const { publicJwk, privateJwk } = await createSigningKeyPair();
  const verifier = createBetterAuthApiTokenVerifier({
    issuer,
    audience,
    jwks: {
      keys: [{ ...publicJwk, alg: "RS256", use: "sig" }],
    },
  });

  return { audience, issuer, privateJwk, verifier };
}

function encodeJwtPart(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function createUnsignedJwt(args: { issuer: string; audience: string; subject: string }): string {
  return [
    encodeJwtPart({ alg: "none", typ: "JWT" }),
    encodeJwtPart({
      iss: args.issuer,
      aud: args.audience,
      sub: args.subject,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 300,
    }),
    "",
  ].join(".");
}

function tamperSignature(token: string): string {
  const parts = token.split(".");
  assert.equal(parts.length, 3);
  const [header, payload, signature] = parts;
  if (header === undefined || payload === undefined || !signature) {
    throw new Error("expected a three-part JWT with a signature");
  }
  const replacement = signature[0] === "A" ? "B" : "A";
  return `${header}.${payload}.${replacement}${signature.slice(1)}`;
}

describe("createBetterAuthApiTokenVerifier", () => {
  it("verifies a Better Auth JWT and normalizes package token shape", async () => {
    const issuer = "https://auth.example.com";
    const audience = "example-api";
    const { publicJwk, privateJwk } = await createSigningKeyPair();
    const verifier = createBetterAuthApiTokenVerifier({
      issuer,
      audience,
      jwks: {
        keys: [{ ...publicJwk, alg: "RS256", use: "sig" }],
      },
    });

    const token = await signToken({
      privateJwk,
      issuer,
      audience,
      subject: "user_123",
    });

    const verifiedToken = await verifier.verifyUserBearerToken(token);

    assert.deepStrictEqual(verifiedToken, {
      credentialType: "userBearer",
      provider: "better-auth",
      issuer,
      subject: "user_123",
      tokenIdentifier: `${issuer}|user_123`,
      sessionId: "session_123",
      scopes: ["profile:read", "org:read"],
      audience,
      rawClaims: verifiedToken.rawClaims,
    });
    assert.equal(verifiedToken.rawClaims.sub, "user_123");
  });

  it("uses sessionId claim when sid is absent", async () => {
    const issuer = "https://auth.example.com";
    const audience = "example-api";
    const { publicJwk, privateJwk } = await createSigningKeyPair();
    const verifier = createBetterAuthApiTokenVerifier({
      issuer,
      audience,
      jwks: {
        keys: [{ ...publicJwk, alg: "RS256", use: "sig" }],
      },
    });

    const token = await new SignJWT({
      scope: "profile:read",
      sessionId: "session_from_claim",
    })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(issuer)
      .setAudience(audience)
      .setSubject("user_456")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(
        await crypto.subtle.importKey(
          "jwk",
          privateJwk,
          {
            name: "RSASSA-PKCS1-v1_5",
            hash: "SHA-256",
          },
          false,
          ["sign"],
        ),
      );

    const verifiedToken = await verifier.verifyUserBearerToken(token);

    assert.equal(verifiedToken.sessionId, "session_from_claim");
    assert.deepStrictEqual(verifiedToken.scopes, ["profile:read"]);
  });

  it("creates a verifier from inline Convex auth config JWKS", async () => {
    const issuer = "https://auth.example.com";
    const audience = "example-api";
    const { publicJwk, privateJwk } = await createSigningKeyPair();
    const jwks = {
      keys: [{ ...publicJwk, alg: "RS256", use: "sig" }],
    };
    const verifier = createBetterAuthApiTokenVerifierFromConvexAuthConfig(
      {
        issuer,
        jwks: `data:text/plain;charset=utf-8;base64,${Buffer.from(JSON.stringify(jwks)).toString("base64")}`,
      },
      { audience },
    );

    const token = await signToken({
      privateJwk,
      issuer,
      audience,
      subject: "user_from_config",
      scope: "app:organization:read",
    });

    const verifiedToken = await verifier.verifyUserBearerToken(token);

    assert.equal(verifiedToken.subject, "user_from_config");
    assert.deepEqual(verifiedToken.scopes, ["app:organization:read"]);
  });

  describe("JWT tampering rejection", () => {
    it("accepts a correctly signed in-audience, in-issuer, unexpired token", async () => {
      const { audience, issuer, privateJwk, verifier } = await createVerifierFixture();
      const token = await signToken({
        privateJwk,
        issuer,
        audience,
        subject: "user_happy_path",
      });

      const verifiedToken = await verifier.verifyUserBearerToken(token);

      assert.equal(verifiedToken.issuer, issuer);
      assert.equal(verifiedToken.subject, "user_happy_path");
      assert.equal(verifiedToken.audience, audience);
      assert.equal(verifiedToken.tokenIdentifier, `${issuer}|user_happy_path`);
    });

    it("rejects malformed, non-JWT, and structurally broken tokens", async () => {
      const { verifier } = await createVerifierFixture();
      const brokenTokens = [
        "",
        "not-a-jwt",
        "header.payload",
        `${encodeJwtPart({ alg: "RS256" })}.${encodeJwtPart({ sub: "user_123" })}.not_base64url!`,
      ];

      await Promise.all(
        brokenTokens.map((token) => assert.rejects(() => verifier.verifyUserBearerToken(token))),
      );
    });

    it("rejects tokens with an unpinned signing algorithm", async () => {
      const { audience, issuer, verifier } = await createVerifierFixture();
      const token = createUnsignedJwt({
        issuer,
        audience,
        subject: "user_123",
      });

      await assert.rejects(() => verifier.verifyUserBearerToken(token));
    });

    it("rejects tokens with a tampered signature", async () => {
      const { audience, issuer, privateJwk, verifier } = await createVerifierFixture();
      const token = await signToken({
        privateJwk,
        issuer,
        audience,
        subject: "user_123",
      });

      await assert.rejects(() => verifier.verifyUserBearerToken(tamperSignature(token)));
    });

    it("rejects tokens with the wrong audience", async () => {
      const { issuer, privateJwk, verifier } = await createVerifierFixture();
      const token = await signToken({
        privateJwk,
        issuer,
        audience: "wrong-audience",
        subject: "user_123",
      });

      await assert.rejects(() => verifier.verifyUserBearerToken(token));
    });

    it("rejects tokens with the wrong issuer", async () => {
      const { audience, privateJwk, verifier } = await createVerifierFixture();
      const token = await signToken({
        privateJwk,
        issuer: "https://wrong-issuer.example.com",
        audience,
        subject: "user_123",
      });

      await assert.rejects(() => verifier.verifyUserBearerToken(token));
    });

    it("rejects expired tokens", async () => {
      const { audience, issuer, privateJwk, verifier } = await createVerifierFixture();
      const token = await signToken({
        privateJwk,
        issuer,
        audience,
        subject: "user_123",
        expiresAt: 1,
      });

      await assert.rejects(() => verifier.verifyUserBearerToken(token));
    });

    it("rejects not-yet-valid tokens", async () => {
      const { audience, issuer, privateJwk, verifier } = await createVerifierFixture();
      const token = await signToken({
        privateJwk,
        issuer,
        audience,
        subject: "user_123",
        notBefore: "1h",
      });

      await assert.rejects(() => verifier.verifyUserBearerToken(token));
    });

    it("rejects spoofed domain-truth claims when the canonical subject is absent", async () => {
      const { audience, issuer, privateJwk, verifier } = await createVerifierFixture();
      const token = await signToken({
        privateJwk,
        issuer,
        audience,
        claims: {
          tokenIdentifier: `${issuer}|victim_user`,
          userId: "victim_user",
          organizationId: "victim_org",
          roleKeys: ["owner"],
          permissions: ["*"],
        },
      });

      await assert.rejects(() => verifier.verifyUserBearerToken(token), /missing subject/);
    });
  });

  it("requires audience (rejects cross-service token confusion)", () => {
    const inlineJwks = `data:text/plain;charset=utf-8;base64,${Buffer.from(
      JSON.stringify({ keys: [] }),
    ).toString("base64")}`;
    const missingAudienceOptions = Object.defineProperty(
      { audience: "runtime-placeholder" },
      "audience",
      { value: undefined },
    );
    assert.throws(
      () =>
        createBetterAuthApiTokenVerifierFromConvexAuthConfig(
          { issuer: "https://auth.example.com", jwks: inlineJwks },
          missingAudienceOptions,
        ),
      /audience` is required/,
    );
    assert.throws(
      () =>
        createBetterAuthApiTokenVerifierFromConvexAuthConfig(
          { issuer: "https://auth.example.com", jwks: inlineJwks },
          { audience: "" },
        ),
      /audience` is required/,
    );
  });

  it("rejects SSRF / non-https jwksUrl", () => {
    const issuer = "https://auth.example.com";
    assert.throws(
      () =>
        createBetterAuthApiTokenVerifier({
          issuer,
          audience: "api",
          jwksUrl: "http://example.com/jwks",
        }),
      /must use https/,
    );
    assert.throws(
      () =>
        createBetterAuthApiTokenVerifier({
          issuer,
          audience: "api",
          jwksUrl: "https://169.254.169.254/jwks",
        }),
      /not deliverable/,
    );
    assert.throws(
      () =>
        createBetterAuthApiTokenVerifier({
          issuer,
          audience: "api",
          jwksUrl: "https://localhost/jwks",
        }),
      /not deliverable/,
    );
    // A public https endpoint constructs fine (no fetch until first verify).
    assert.doesNotThrow(() =>
      createBetterAuthApiTokenVerifier({
        issuer,
        audience: "api",
        jwksUrl: "https://auth.example.com/.well-known/jwks.json",
      }),
    );
  });
});
