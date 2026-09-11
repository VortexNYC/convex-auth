import { exportJWK, generateKeyPair, importJWK, SignJWT } from "jose";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { createGenericOAuthProvider, type GenericOAuthProviderConfig } from "./oauth.js";

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
  const privateJwk = await exportJWK(privateKey);
  const publicJwk = await exportJWK(publicKey);
  process.env.JWT_PRIVATE_KEY = JSON.stringify(privateJwk);
  process.env.JWKS = JSON.stringify({ keys: [publicJwk] });
});

const config: GenericOAuthProviderConfig = {
  clientId: "test-client",
  clientSecret: "test-secret",
  authorizationEndpoint: "https://example.com/oauth/authorize",
  tokenEndpoint: "https://example.com/oauth/token",
  userInfoEndpoint: "https://example.com/oauth/userinfo",
  scopes: ["openid", "email", "profile"],
};

describe("createGenericOAuthProvider", () => {
  it("builds an authorization URL with PKCE and scopes", async () => {
    const provider = createGenericOAuthProvider("example", config);
    const url = await provider.createAuthorizationURL({
      state: "state-123",
      codeVerifier: "verifier-123",
      redirectURI: "http://localhost:5174/api/auth/callback/example",
    });

    expect(url.searchParams.get("client_id")).toBe("test-client");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:5174/api/auth/callback/example",
    );
    expect(url.searchParams.get("state")).toBe("state-123");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toBe("openid email profile");
  });

  it("extracts userinfo using default mapping", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sub: "user-123",
        name: "Test User",
        email: "test@example.com",
        picture: "https://example.com/avatar.png",
        email_verified: true,
      }),
    });
    const provider = createGenericOAuthProvider("example", { ...config, fetchImpl });
    const result = await provider.getUserInfo({ accessToken: "token-123" });

    expect(fetchImpl).toHaveBeenCalledWith("https://example.com/oauth/userinfo", {
      headers: {
        Authorization: "Bearer token-123",
        Accept: "application/json",
      },
    });
    expect(result.user).toEqual({
      id: "user-123",
      name: "Test User",
      email: "test@example.com",
      image: "https://example.com/avatar.png",
      emailVerified: true,
    });
  });

  it("allows custom userinfo mapping", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        user_id: "u-456",
        username: "Custom",
        mail: "custom@example.com",
        avatar: "https://example.com/a.png",
        verified: "true",
      }),
    });
    const provider = createGenericOAuthProvider("example", {
      ...config,
      userInfo: {
        id: "user_id",
        name: "username",
        email: "mail",
        image: "avatar",
        emailVerified: "verified",
      },
      fetchImpl,
    });
    const result = await provider.getUserInfo({ accessToken: "token" });

    expect(result.user).toEqual({
      id: "u-456",
      name: "Custom",
      email: "custom@example.com",
      image: "https://example.com/a.png",
      emailVerified: true,
    });
  });

  it("allows a custom profile function", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ externalId: "ext-789", email: "external@example.com" }),
    });
    const provider = createGenericOAuthProvider("example", {
      ...config,
      profile: (data) => ({
        id: (data as { externalId: string }).externalId,
        name: "External",
        email: (data as { email: string }).email,
        image: undefined,
        emailVerified: true,
      }),
      fetchImpl,
    });
    const result = await provider.getUserInfo({ accessToken: "token" });

    expect(result.user).toEqual({
      id: "ext-789",
      name: "External",
      email: "external@example.com",
      image: undefined,
      emailVerified: true,
    });
  });

  it("fetches endpoints from an OIDC discovery document", async () => {
    const fetchImpl = vi.fn().mockImplementation((url: string) => {
      if (url === "https://example.com/.well-known/openid-configuration") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            issuer: "https://example.com",
            authorization_endpoint: "https://example.com/oidc/authorize",
            token_endpoint: "https://example.com/oidc/token",
            userinfo_endpoint: "https://example.com/oidc/userinfo",
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    const provider = createGenericOAuthProvider("example", {
      clientId: "test-client",
      clientSecret: "test-secret",
      issuer: "https://example.com",
      discovery: true,
      scopes: ["openid", "email", "profile"],
      fetchImpl,
    });
    const url = await provider.createAuthorizationURL({
      state: "state-123",
      codeVerifier: "verifier",
      redirectURI: "http://localhost:5174/api/auth/callback/example",
    });

    expect(url.hostname).toBe("example.com");
    expect(url.pathname).toBe("/oidc/authorize");
    expect(url.searchParams.get("client_id")).toBe("test-client");
  });

  it("verifies an ID token when useIdToken is enabled", async () => {
    const privateJwk = JSON.parse(process.env.JWT_PRIVATE_KEY!);
    const idToken = await new SignJWT({
      sub: "id-token-user",
      name: "Id Token User",
      email: "idtoken@example.com",
      email_verified: true,
      picture: "https://example.com/pic.png",
    })
      .setProtectedHeader({ alg: "RS256", typ: "JWT" })
      .setAudience("test-client")
      .setIssuer("https://example.com")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(await importJWK(privateJwk, "RS256"));

    const fetchImpl = vi.fn().mockImplementation((url: string) => {
      if (url === "https://example.com/.well-known/jwks.json") {
        return Promise.resolve({
          ok: true,
          json: async () => JSON.parse(process.env.JWKS!),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    const provider = createGenericOAuthProvider("example", {
      clientId: "test-client",
      clientSecret: "test-secret",
      issuer: "https://example.com",
      authorizationEndpoint: "https://example.com/oauth/authorize",
      tokenEndpoint: "https://example.com/oauth/token",
      jwksUri: "https://example.com/.well-known/jwks.json",
      useIdToken: true,
      scopes: ["openid", "email", "profile"],
      fetchImpl,
    });
    const result = await provider.getUserInfo({
      accessToken: "token",
      idToken,
    });

    expect(result.user).toEqual({
      id: "id-token-user",
      name: "Id Token User",
      email: "idtoken@example.com",
      image: "https://example.com/pic.png",
      emailVerified: true,
    });
  });
});
