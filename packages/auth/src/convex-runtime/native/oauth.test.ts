import { exportJWK, generateKeyPair, importJWK, SignJWT } from "jose";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { addNativeOAuthHttpRoutes } from "./oauthHttp.js";
import {
  createDiscordProvider,
  createGitHubProvider,
  createGoogleProvider,
  type DiscordProviderConfig,
  type GitHubProviderConfig,
  type GoogleProviderConfig,
  type NativeOAuthProvider,
} from "./oauth.js";
import { nativeOAuth } from "./oauthActions.js";
import { handleCallback, handleSignIn, type NativeOAuthConfig } from "./oauthHandlers.js";
import {
  generateCodeChallenge,
  generateCodeVerifier,
  mintOAuthState,
  verifyOAuthState,
} from "./oauthState.js";
import { verifyToken } from "./jwt.js";
import { decryptAccountToken } from "./oauthCrypto.js";
import type { NativeOAuthComponentHandle } from "./types.js";
import type { GenericActionCtx } from "convex/server";
import type { DataModel } from "../../component/_generated/dataModel.js";

async function mintGoogleIdToken(payload: Record<string, unknown> = {}) {
  const privateJwk = JSON.parse(process.env.JWT_PRIVATE_KEY!);
  const privateKey = await importJWK(privateJwk, "RS256");
  return await new SignJWT({
    sub: "google-12345",
    name: "Google User",
    email: "google@example.com",
    email_verified: true,
    picture: "https://google-avatar",
    iss: "https://accounts.google.com",
    aud: "google-client-id",
    ...payload,
  })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}

async function setupTestKeys() {
  const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
  const privateJwk = await exportJWK(privateKey);
  const publicJwk = await exportJWK(publicKey);
  process.env.JWT_PRIVATE_KEY = JSON.stringify(privateJwk);
  process.env.JWKS = JSON.stringify({ keys: [publicJwk] });
  process.env.CONVEX_SITE_URL = "https://test.convex.site";

  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  process.env.OAUTH_TOKEN_ENCRYPTION_KEY = btoa(binary);
}

type MockComponent = {
  identity: { provisionFromIdentity: ReturnType<typeof vi.fn> };
  native: {
    accounts: {
      createAccount: ReturnType<typeof vi.fn>;
      updateAccountTokens: ReturnType<typeof vi.fn>;
      getAccountBySubject: ReturnType<typeof vi.fn>;
    };
    sessions: { createSessionAndRefreshToken: ReturnType<typeof vi.fn> };
    users: {
      getUserByEmail: ReturnType<typeof vi.fn>;
      getUserById: ReturnType<typeof vi.fn>;
    };
  };
};

function createMockComponent(): MockComponent {
  return {
    identity: {
      provisionFromIdentity: vi.fn(),
    },
    native: {
      accounts: {
        createAccount: vi.fn(),
        updateAccountTokens: vi.fn(),
        getAccountBySubject: vi.fn().mockResolvedValue(null),
      },
      sessions: {
        createSessionAndRefreshToken: vi.fn(),
      },
      users: {
        getUserByEmail: vi.fn().mockResolvedValue(null),
        getUserById: vi.fn(),
      },
    },
  } as MockComponent;
}

function dispatch(ref: unknown, args: Record<string, unknown>) {
  if (typeof ref === "function") {
    return (ref as (args: Record<string, unknown>) => unknown)(args);
  }
  return undefined;
}

function exec(registered: unknown) {
  if ((typeof registered !== "object" && typeof registered !== "function") || registered === null) {
    throw new TypeError("expected an executable spec");
  }
  const handler = Reflect.get(registered, "_handler");
  if (typeof handler !== "function") {
    throw new TypeError("expected an executable handler");
  }
  return {
    handler: async (ctx: unknown, args: unknown): Promise<unknown> =>
      await Reflect.apply(handler, registered, [ctx, args]),
  };
}

function createContext() {
  return {
    runQuery: vi.fn((ref: unknown, args: Record<string, unknown>) => dispatch(ref, args)),
    runMutation: vi.fn((ref: unknown, args: Record<string, unknown>) => dispatch(ref, args)),
    runAction: vi.fn(),
  };
}

function createMockFetch(): {
  fetch: ReturnType<typeof vi.fn>;
  responses: Map<string, { status?: number; body: unknown; headers?: Record<string, string> }>;
} {
  const responses = new Map<
    string,
    { status?: number; body: unknown; headers?: Record<string, string> }
  >();
  const fetch = vi.fn(async (url: string, _init?: RequestInit) => {
    const key = url;
    const response = responses.get(key);
    if (!response) {
      return new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify(response.body), {
      status: response.status ?? 200,
      headers: {
        "Content-Type": "application/json",
        ...response.headers,
      },
    });
  });
  return { fetch, responses };
}

function createGitHubConfig(overrides: Partial<GitHubProviderConfig> = {}): GitHubProviderConfig {
  const { fetch } = createMockFetch();
  return {
    clientId: "client-id",
    clientSecret: "client-secret",
    fetchImpl: fetch as unknown as typeof globalThis.fetch,
    ...overrides,
  };
}

function createGoogleConfig(overrides: Partial<GoogleProviderConfig> = {}): GoogleProviderConfig {
  const { fetch } = createMockFetch();
  return {
    clientId: "google-client-id",
    clientSecret: "google-client-secret",
    fetchImpl: fetch as unknown as typeof globalThis.fetch,
    ...overrides,
  };
}

function createDiscordConfig(
  overrides: Partial<DiscordProviderConfig> = {},
): DiscordProviderConfig {
  const { fetch } = createMockFetch();
  return {
    clientId: "discord-client-id",
    clientSecret: "discord-client-secret",
    fetchImpl: fetch as unknown as typeof globalThis.fetch,
    ...overrides,
  };
}

function createOAuthConfig(overrides: Partial<NativeOAuthConfig> = {}): NativeOAuthConfig {
  return {
    github: createGitHubConfig(),
    google: createGoogleConfig(),
    redirectURI: "https://app.example.com/api/auth/callback/github",
    sessionTtlMs: 60_000,
    ...overrides,
  };
}

function setupGitHubResponses(
  provider: NativeOAuthProvider,
  responses: ReturnType<typeof createMockFetch>["responses"],
) {
  responses.set("https://github.com/login/oauth/access_token", {
    body: { access_token: "github-access-token", token_type: "bearer" },
  });
  responses.set("https://api.github.com/user", {
    body: {
      id: 12345,
      login: "octocat",
      name: "The Octocat",
      email: null,
      avatar_url: "https://avatar",
    },
  });
  responses.set("https://api.github.com/user/emails", {
    body: [
      { email: "octocat@example.com", primary: true, verified: true, visibility: "public" },
      { email: "other@example.com", primary: false, verified: false, visibility: "private" },
    ],
  });
}

async function setupGoogleResponses(
  responses: ReturnType<typeof createMockFetch>["responses"],
  { idToken }: { idToken?: string } = {},
) {
  responses.set("https://www.googleapis.com/oauth2/v3/certs", {
    body: JSON.parse(process.env.JWKS!),
  });
  responses.set("https://oauth2.googleapis.com/token", {
    body: {
      access_token: "google-access-token",
      token_type: "Bearer",
      id_token: idToken,
    },
  });
  responses.set("https://openidconnect.googleapis.com/v1/userinfo", {
    body: {
      sub: "google-12345",
      name: "Google User",
      email: "google@example.com",
      email_verified: true,
      picture: "https://google-avatar",
    },
  });
}

describe("OAuth state and PKCE", () => {
  beforeAll(setupTestKeys);

  it("generates a verifier and a matching S256 challenge", async () => {
    const verifier = await generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(challenge).not.toEqual(verifier);
  });

  it("round-trips a signed state token", async () => {
    const state = await mintOAuthState({
      provider: "github",
      codeVerifier: "verifier",
      callbackURL: "https://app.example.com/callback",
    });
    const payload = await verifyOAuthState(state);
    expect(payload.provider).toBe("github");
    expect(payload.codeVerifier).toBe("verifier");
    expect(payload.callbackURL).toBe("https://app.example.com/callback");
  });

  it("rejects an expired or tampered state token", async () => {
    const state = await mintOAuthState({ provider: "github", codeVerifier: "verifier" });
    await expect(verifyOAuthState(`${state}x`)).rejects.toThrow();
  });
});

describe("GitHub provider", () => {
  beforeAll(setupTestKeys);

  it("creates an authorization URL with client_id, PKCE, and state", async () => {
    const config = createGitHubConfig();
    const provider = createGitHubProvider(config);
    const codeVerifier = await generateCodeVerifier();
    const url = await provider.createAuthorizationURL({
      state: "state-token",
      codeVerifier,
      redirectURI: "https://app.example.com/api/auth/callback/github",
    });
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    expect(url.origin).toBe("https://github.com");
    expect(url.pathname).toBe("/login/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("state-token");
    expect(url.searchParams.get("code_challenge")).toBe(codeChallenge);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toContain("read:user");
  });

  it("exchanges a code for an access token", async () => {
    const config = createGitHubConfig();
    const { fetch, responses } = createMockFetch();
    config.fetchImpl = fetch as unknown as typeof globalThis.fetch;
    const provider = createGitHubProvider(config);
    responses.set("https://github.com/login/oauth/access_token", {
      body: { access_token: "token-123", token_type: "bearer" },
    });

    const token = await provider.exchangeAuthorizationCode({
      code: "code-123",
      codeVerifier: "verifier",
      redirectURI: "https://app.example.com/api/auth/callback/github",
    });

    expect(token.accessToken).toBe("token-123");
    expect(fetch).toHaveBeenCalledWith(
      "https://github.com/login/oauth/access_token",
      expect.objectContaining({
        method: "POST",
        body: expect.any(URLSearchParams),
      }),
    );
  });

  it("fetches user info and falls back to primary email", async () => {
    const config = createGitHubConfig();
    const { fetch, responses } = createMockFetch();
    config.fetchImpl = fetch as unknown as typeof globalThis.fetch;
    const provider = createGitHubProvider(config);
    setupGitHubResponses(provider, responses);

    const { user } = await provider.getUserInfo({ accessToken: "github-access-token" });

    expect(user.id).toBe("12345");
    expect(user.name).toBe("The Octocat");
    expect(user.email).toBe("octocat@example.com");
    expect(user.image).toBe("https://avatar");
    expect(user.emailVerified).toBe(true);
  });
});

describe("Google provider", () => {
  beforeAll(setupTestKeys);

  it("creates an authorization URL with client_id, PKCE, and state", async () => {
    const config = createGoogleConfig();
    const provider = createGoogleProvider(config);
    const codeVerifier = await generateCodeVerifier();
    const url = await provider.createAuthorizationURL({
      state: "state-token",
      codeVerifier,
      redirectURI: "https://app.example.com/api/auth/callback/google",
    });
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.pathname).toBe("/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("google-client-id");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("state-token");
    expect(url.searchParams.get("code_challenge")).toBe(codeChallenge);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toContain("openid");
  });

  it("applies access_type=offline and a consent prompt by default", async () => {
    const config = createGoogleConfig({ accessType: "offline" });
    const provider = createGoogleProvider(config);
    const url = await provider.createAuthorizationURL({
      state: "state-token",
      codeVerifier: await generateCodeVerifier(),
      redirectURI: "https://app.example.com/api/auth/callback/google",
    });
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
  });

  it("forwards the display parameter", async () => {
    const config = createGoogleConfig({ display: "popup" });
    const provider = createGoogleProvider(config);
    const url = await provider.createAuthorizationURL({
      state: "state-token",
      codeVerifier: await generateCodeVerifier(),
      redirectURI: "https://app.example.com/api/auth/callback/google",
    });
    expect(url.searchParams.get("display")).toBe("popup");
  });

  it("exchanges a code for an access token", async () => {
    const config = createGoogleConfig();
    const { fetch, responses } = createMockFetch();
    config.fetchImpl = fetch as unknown as typeof globalThis.fetch;
    const provider = createGoogleProvider(config);
    responses.set("https://oauth2.googleapis.com/token", {
      body: { access_token: "token-123", token_type: "Bearer" },
    });

    const token = await provider.exchangeAuthorizationCode({
      code: "code-123",
      codeVerifier: "verifier",
      redirectURI: "https://app.example.com/api/auth/callback/google",
    });

    expect(token.accessToken).toBe("token-123");
    expect(fetch).toHaveBeenCalledWith(
      "https://oauth2.googleapis.com/token",
      expect.objectContaining({
        method: "POST",
        body: expect.any(URLSearchParams),
      }),
    );
  });

  it("fetches user info from the OIDC userinfo endpoint", async () => {
    const config = createGoogleConfig();
    const { fetch, responses } = createMockFetch();
    config.fetchImpl = fetch as unknown as typeof globalThis.fetch;
    const provider = createGoogleProvider(config);
    await setupGoogleResponses(responses);

    const { user } = await provider.getUserInfo({ accessToken: "google-access-token" });

    expect(user.id).toBe("google-12345");
    expect(user.name).toBe("Google User");
    expect(user.email).toBe("google@example.com");
    expect(user.image).toBe("https://google-avatar");
    expect(user.emailVerified).toBe(true);
  });

  it("verifies id_token and uses its claims when present", async () => {
    const config = createGoogleConfig();
    const { fetch, responses } = createMockFetch();
    config.fetchImpl = fetch as unknown as typeof globalThis.fetch;
    const provider = createGoogleProvider(config);
    const idToken = await mintGoogleIdToken();
    await setupGoogleResponses(responses, { idToken });

    const { user } = await provider.getUserInfo({
      accessToken: "google-access-token",
      idToken,
    });

    expect(user.id).toBe("google-12345");
    expect(user.name).toBe("Google User");
    expect(user.email).toBe("google@example.com");
    expect(user.image).toBe("https://google-avatar");
    expect(user.emailVerified).toBe(true);
  });
});

describe("Discord provider", () => {
  it("creates an authorization URL with client_id, PKCE, state, and scopes", async () => {
    const config = createDiscordConfig();
    const provider = createDiscordProvider(config);
    const codeVerifier = await generateCodeVerifier();
    const url = await provider.createAuthorizationURL({
      state: "state-token",
      codeVerifier,
      redirectURI: "https://app.example.com/api/auth/callback/discord",
    });
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    expect(url.origin).toBe("https://discord.com");
    expect(url.pathname).toBe("/oauth2/authorize");
    expect(url.searchParams.get("client_id")).toBe("discord-client-id");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("state-token");
    expect(url.searchParams.get("code_challenge")).toBe(codeChallenge);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toContain("identify");
    expect(url.searchParams.get("scope")).toContain("email");
  });

  it("exchanges a code for an access token", async () => {
    const config = createDiscordConfig();
    const { fetch, responses } = createMockFetch();
    config.fetchImpl = fetch as unknown as typeof globalThis.fetch;
    const provider = createDiscordProvider(config);
    responses.set("https://discord.com/api/oauth2/token", {
      body: { access_token: "discord-token", token_type: "Bearer" },
    });

    const token = await provider.exchangeAuthorizationCode({
      code: "code-123",
      codeVerifier: "verifier",
      redirectURI: "https://app.example.com/api/auth/callback/discord",
    });

    expect(token.accessToken).toBe("discord-token");
    expect(fetch).toHaveBeenCalledWith(
      "https://discord.com/api/oauth2/token",
      expect.objectContaining({
        method: "POST",
        body: expect.any(URLSearchParams),
      }),
    );
  });

  it("fetches user info from the Discord user endpoint", async () => {
    const config = createDiscordConfig();
    const { fetch, responses } = createMockFetch();
    config.fetchImpl = fetch as unknown as typeof globalThis.fetch;
    const provider = createDiscordProvider(config);
    responses.set("https://discord.com/api/users/@me", {
      body: {
        id: "discord-12345",
        username: "Discord User",
        email: "discord@example.com",
        verified: true,
        avatar: "avatar-hash",
      },
    });

    const { user } = await provider.getUserInfo({ accessToken: "discord-token" });

    expect(user.id).toBe("discord-12345");
    expect(user.name).toBe("Discord User");
    expect(user.email).toBe("discord@example.com");
    expect(user.image).toBe("https://cdn.discordapp.com/avatars/discord-12345/avatar-hash.png");
    expect(user.emailVerified).toBe(true);
  });
});

describe("OAuth handlers", () => {
  beforeAll(setupTestKeys);

  it("handleSignIn returns a GitHub authorization URL", async () => {
    const config = createOAuthConfig();
    process.env.CONVEX_SITE_URL = "https://app.example.com";

    const { url } = await handleSignIn(config, { provider: "github" });
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/login/oauth/authorize");
    expect(parsed.searchParams.get("client_id")).toBe("client-id");
    expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
    expect(parsed.searchParams.get("state")).toBeTruthy();
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "https://app.example.com/api/auth/callback/github",
    );
  });

  it("handleSignIn prefers AUTH_REDIRECT_URL over CONVEX_SITE_URL", async () => {
    const config = createOAuthConfig({ redirectURI: undefined });
    process.env.AUTH_REDIRECT_URL = "https://auth.example.com";
    process.env.CONVEX_SITE_URL = "https://app.example.com";

    const { url } = await handleSignIn(config, { provider: "github" });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "https://auth.example.com/api/auth/callback/github",
    );
  });

  it("handleCallback provisions a new user and creates a session", async () => {
    const config = createOAuthConfig();
    const component = createMockComponent();
    const { fetch, responses } = createMockFetch();
    config.github.fetchImpl = fetch as unknown as typeof globalThis.fetch;
    setupGitHubResponses(createGitHubProvider(config.github), responses);

    component.identity.provisionFromIdentity.mockResolvedValue({
      userId: "user_1",
      identityId: "identity_1",
      createdUser: true,
      linkedExistingIdentity: false,
    });
    component.native.accounts.getAccountBySubject.mockResolvedValue(null);
    component.native.sessions.createSessionAndRefreshToken.mockResolvedValue("session_doc_1");

    const { url } = await handleSignIn(config, { provider: "github" });
    const state = new URL(url).searchParams.get("state")!;

    const result = await handleCallback(
      createContext() as unknown as GenericActionCtx<DataModel>,
      component as unknown as NativeOAuthComponentHandle,
      config,
      { provider: "github", code: "code-123", state },
    );

    expect(result.createdUser).toBe(true);
    expect(result.userId).toBe("user_1");
    expect(result.identityId).toBe("identity_1");
    expect(result.token).toBeTruthy();
    expect(result.redirectUrl).toBe("/");

    const payload = await verifyToken(result.token);
    expect(payload.sub).toBe("user_1");
    expect(payload.sessionId).toBe(result.sessionId);

    expect(component.identity.provisionFromIdentity).toHaveBeenCalledWith({
      identity: expect.objectContaining({
        provider: "github",
        issuer: "https://github.com/login/oauth",
        subject: "12345",
        identityId: "https://github.com/login/oauth:12345",
        tokenIdentifier: "https://github.com/login/oauth:12345",
      }),
      user: expect.objectContaining({
        name: "The Octocat",
        email: "octocat@example.com",
        image: "https://avatar",
        emailVerified: true,
      }),
    });
    expect(component.native.sessions.createSessionAndRefreshToken).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_1",
        token: result.token,
      }),
    );
    expect(result.refreshToken).toBeDefined();
    expect(result.refreshToken).not.toBe(result.token);
  });

  it("handleCallback redirects to newUserURL for new users", async () => {
    const config = createOAuthConfig();
    const component = createMockComponent();
    const { fetch, responses } = createMockFetch();
    config.github.fetchImpl = fetch as unknown as typeof globalThis.fetch;
    setupGitHubResponses(createGitHubProvider(config.github), responses);

    component.identity.provisionFromIdentity.mockResolvedValue({
      userId: "user_1",
      identityId: "identity_1",
      createdUser: true,
      linkedExistingIdentity: false,
    });
    component.native.accounts.getAccountBySubject.mockResolvedValue(null);
    component.native.sessions.createSessionAndRefreshToken.mockResolvedValue("session_doc_1");

    const { url } = await handleSignIn(config, {
      provider: "github",
      callbackURL: "https://app.example.com/home",
      newUserURL: "https://app.example.com/welcome",
    });
    const state = new URL(url).searchParams.get("state")!;

    const result = await handleCallback(
      createContext() as unknown as GenericActionCtx<DataModel>,
      component as unknown as NativeOAuthComponentHandle,
      config,
      { provider: "github", code: "code-123", state },
    );

    expect(result.redirectUrl).toBe("https://app.example.com/welcome");
  });

  it("handleSignIn returns a Google authorization URL", async () => {
    const config = createOAuthConfig({
      redirectURI: "https://app.example.com/api/auth/callback/google",
    });

    const { url } = await handleSignIn(config, { provider: "google" });
    const parsed = new URL(url);
    expect(parsed.hostname).toBe("accounts.google.com");
    expect(parsed.pathname).toBe("/o/oauth2/v2/auth");
    expect(parsed.searchParams.get("client_id")).toBe("google-client-id");
    expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
    expect(parsed.searchParams.get("state")).toBeTruthy();
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "https://app.example.com/api/auth/callback/google",
    );
  });

  it("handleCallback provisions a new user from Google and creates a session", async () => {
    const config = createOAuthConfig({
      redirectURI: "https://app.example.com/api/auth/callback/google",
    });
    const component = createMockComponent();
    const { fetch, responses } = createMockFetch();
    config.google!.fetchImpl = fetch as unknown as typeof globalThis.fetch;
    const idToken = await mintGoogleIdToken();
    await setupGoogleResponses(responses, { idToken });

    component.identity.provisionFromIdentity.mockResolvedValue({
      userId: "user_2",
      identityId: "identity_2",
      createdUser: true,
      linkedExistingIdentity: false,
    });
    component.native.accounts.getAccountBySubject.mockResolvedValue(null);
    component.native.sessions.createSessionAndRefreshToken.mockResolvedValue("session_doc_2");

    const { url } = await handleSignIn(config, { provider: "google" });
    const state = new URL(url).searchParams.get("state")!;

    const result = await handleCallback(
      createContext() as unknown as GenericActionCtx<DataModel>,
      component as unknown as NativeOAuthComponentHandle,
      config,
      { provider: "google", code: "code-123", state },
    );

    expect(result.createdUser).toBe(true);
    expect(result.userId).toBe("user_2");

    expect(component.identity.provisionFromIdentity).toHaveBeenCalledWith({
      identity: expect.objectContaining({
        provider: "google",
        issuer: "https://accounts.google.com",
        subject: "google-12345",
        identityId: "https://accounts.google.com:google-12345",
        tokenIdentifier: "https://accounts.google.com:google-12345",
      }),
      user: expect.objectContaining({
        name: "Google User",
        email: "google@example.com",
        image: "https://google-avatar",
        emailVerified: true,
      }),
    });
  });

  it("handleCallback returns signup_disabled when disableSignUp is set", async () => {
    const config = createOAuthConfig({
      github: createGitHubConfig({ disableSignUp: true }),
    });
    const component = createMockComponent();
    const { fetch, responses } = createMockFetch();
    config.github!.fetchImpl = fetch as unknown as typeof globalThis.fetch;
    setupGitHubResponses(createGitHubProvider(config.github!), responses);

    const { url } = await handleSignIn(config, {
      provider: "github",
      errorURL: "https://app.example.com/error",
    });
    const state = new URL(url).searchParams.get("state")!;

    const result = await handleCallback(
      createContext() as unknown as GenericActionCtx<DataModel>,
      component as unknown as NativeOAuthComponentHandle,
      config,
      { provider: "github", code: "code-123", state },
    );

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toBe("signup_disabled");
      expect(result.redirectUrl).toBe("https://app.example.com/error");
    }
    expect(component.identity.provisionFromIdentity).not.toHaveBeenCalled();
  });

  it("handleCallback links to an existing user by email when verified", async () => {
    const config = createOAuthConfig();
    const component = createMockComponent();
    const { fetch, responses } = createMockFetch();
    config.github!.fetchImpl = fetch as unknown as typeof globalThis.fetch;
    setupGitHubResponses(createGitHubProvider(config.github!), responses);

    component.native.users.getUserByEmail.mockResolvedValue({
      _id: "existing_user_1",
    });
    component.identity.provisionFromIdentity.mockResolvedValue({
      userId: "existing_user_1",
      identityId: "identity_1",
      createdUser: false,
      linkedExistingIdentity: false,
    });
    component.native.accounts.getAccountBySubject.mockResolvedValue(null);
    component.native.sessions.createSessionAndRefreshToken.mockResolvedValue("session_doc_1");

    const { url } = await handleSignIn(config, { provider: "github" });
    const state = new URL(url).searchParams.get("state")!;

    const result = await handleCallback(
      createContext() as unknown as GenericActionCtx<DataModel>,
      component as unknown as NativeOAuthComponentHandle,
      config,
      { provider: "github", code: "code-123", state },
    );

    expect(result.createdUser).toBe(false);
    expect(result.userId).toBe("existing_user_1");
    expect(component.native.accounts.createAccount).toHaveBeenCalled();
  });

  it("handleCallback blocks linking when email is unverified and provider is not trusted", async () => {
    const config = createOAuthConfig();
    const component = createMockComponent();
    const { fetch, responses } = createMockFetch();
    config.github!.fetchImpl = fetch as unknown as typeof globalThis.fetch;
    responses.set("https://github.com/login/oauth/access_token", {
      body: { access_token: "github-access-token", token_type: "bearer" },
    });
    responses.set("https://api.github.com/user", {
      body: {
        id: 12345,
        login: "octocat",
        name: "The Octocat",
        email: null,
        avatar_url: "https://avatar",
      },
    });
    responses.set("https://api.github.com/user/emails", {
      body: [
        { email: "octocat@example.com", primary: true, verified: false, visibility: "public" },
      ],
    });

    component.native.users.getUserByEmail.mockResolvedValue({
      _id: "existing_user_1",
    });

    const { url } = await handleSignIn(config, {
      provider: "github",
      errorURL: "https://app.example.com/error",
    });
    const state = new URL(url).searchParams.get("state")!;

    const result = await handleCallback(
      createContext() as unknown as GenericActionCtx<DataModel>,
      component as unknown as NativeOAuthComponentHandle,
      config,
      { provider: "github", code: "code-123", state },
    );

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toBe("account_not_linked");
      expect(result.redirectUrl).toBe("https://app.example.com/error");
    }
    expect(component.identity.provisionFromIdentity).not.toHaveBeenCalled();
  });

  it("handleCallback returns email_not_verified when requireEmailVerification is set", async () => {
    const config = createOAuthConfig({
      github: createGitHubConfig({ requireEmailVerification: true }),
    });
    const component = createMockComponent();
    const { fetch, responses } = createMockFetch();
    config.github!.fetchImpl = fetch as unknown as typeof globalThis.fetch;
    responses.set("https://github.com/login/oauth/access_token", {
      body: { access_token: "github-access-token", token_type: "bearer" },
    });
    responses.set("https://api.github.com/user", {
      body: {
        id: 12345,
        login: "octocat",
        name: "The Octocat",
        email: null,
        avatar_url: "https://avatar",
      },
    });
    responses.set("https://api.github.com/user/emails", {
      body: [
        { email: "octocat@example.com", primary: true, verified: false, visibility: "public" },
      ],
    });

    component.identity.provisionFromIdentity.mockResolvedValue({
      userId: "user_1",
      identityId: "identity_1",
      createdUser: true,
      linkedExistingIdentity: false,
    });
    component.native.accounts.getAccountBySubject.mockResolvedValue(null);

    const { url } = await handleSignIn(config, {
      provider: "github",
      errorURL: "https://app.example.com/error",
    });
    const state = new URL(url).searchParams.get("state")!;

    const result = await handleCallback(
      createContext() as unknown as GenericActionCtx<DataModel>,
      component as unknown as NativeOAuthComponentHandle,
      config,
      { provider: "github", code: "code-123", state },
    );

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toBe("email_not_verified");
      expect(result.redirectUrl).toBe("https://app.example.com/error");
    }
    expect(component.identity.provisionFromIdentity).toHaveBeenCalled();
    expect(component.native.sessions.createSessionAndRefreshToken).not.toHaveBeenCalled();
  });

  it("persists OAuth token material on new account creation", async () => {
    const config = createOAuthConfig();
    const component = createMockComponent();
    const { fetch, responses } = createMockFetch();
    config.github!.fetchImpl = fetch as unknown as typeof globalThis.fetch;
    setupGitHubResponses(createGitHubProvider(config.github!), responses);

    component.identity.provisionFromIdentity.mockResolvedValue({
      userId: "user_1",
      identityId: "identity_1",
      createdUser: true,
      linkedExistingIdentity: false,
    });
    component.native.accounts.getAccountBySubject.mockResolvedValue(null);
    component.native.sessions.createSessionAndRefreshToken.mockResolvedValue("session_doc_1");

    const { url } = await handleSignIn(config, { provider: "github" });
    const state = new URL(url).searchParams.get("state")!;

    await handleCallback(
      createContext() as unknown as GenericActionCtx<DataModel>,
      component as unknown as NativeOAuthComponentHandle,
      config,
      { provider: "github", code: "code-123", state },
    );

    const createAccountCall = component.native.accounts.createAccount.mock.calls[0]?.[0];
    expect(createAccountCall).toMatchObject({
      userId: "user_1",
      provider: "github",
      issuer: "https://github.com/login/oauth",
      subject: "12345",
      tokenType: "bearer",
    });
    expect(await decryptAccountToken(createAccountCall.accessToken)).toBe("github-access-token");
  });

  it("blocks sign up when disableImplicitSignUp is set and requestSignUp is not", async () => {
    const config = createOAuthConfig({
      github: createGitHubConfig({ disableImplicitSignUp: true }),
    });
    const component = createMockComponent();
    const { fetch, responses } = createMockFetch();
    config.github!.fetchImpl = fetch as unknown as typeof globalThis.fetch;
    setupGitHubResponses(createGitHubProvider(config.github!), responses);

    component.identity.provisionFromIdentity.mockResolvedValue({
      userId: "user_1",
      identityId: "identity_1",
      createdUser: true,
      linkedExistingIdentity: false,
    });
    component.native.accounts.getAccountBySubject.mockResolvedValue(null);

    const { url } = await handleSignIn(config, { provider: "github" });
    const state = new URL(url).searchParams.get("state")!;

    const result = await handleCallback(
      createContext() as unknown as GenericActionCtx<DataModel>,
      component as unknown as NativeOAuthComponentHandle,
      config,
      { provider: "github", code: "code-123", state },
    );

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toBe("signup_disabled");
    }
    expect(component.identity.provisionFromIdentity).not.toHaveBeenCalled();
  });

  it("allows sign up when disableImplicitSignUp is set and requestSignUp is true", async () => {
    const config = createOAuthConfig({
      github: createGitHubConfig({ disableImplicitSignUp: true }),
    });
    const component = createMockComponent();
    const { fetch, responses } = createMockFetch();
    config.github!.fetchImpl = fetch as unknown as typeof globalThis.fetch;
    setupGitHubResponses(createGitHubProvider(config.github!), responses);

    component.identity.provisionFromIdentity.mockResolvedValue({
      userId: "user_1",
      identityId: "identity_1",
      createdUser: true,
      linkedExistingIdentity: false,
    });
    component.native.accounts.getAccountBySubject.mockResolvedValue(null);
    component.native.sessions.createSessionAndRefreshToken.mockResolvedValue("session_doc_1");

    const { url } = await handleSignIn(config, { provider: "github", requestSignUp: true });
    const state = new URL(url).searchParams.get("state")!;

    const result = await handleCallback(
      createContext() as unknown as GenericActionCtx<DataModel>,
      component as unknown as NativeOAuthComponentHandle,
      config,
      { provider: "github", code: "code-123", state },
    );

    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.userId).toBe("user_1");
    }
  });

  it("blocks link when linkingUserId is missing", async () => {
    const config = createOAuthConfig();
    const component = createMockComponent();
    const { fetch, responses } = createMockFetch();
    config.github!.fetchImpl = fetch as unknown as typeof globalThis.fetch;
    setupGitHubResponses(createGitHubProvider(config.github!), responses);

    const { url } = await handleSignIn(config, { provider: "github", link: true });
    const state = new URL(url).searchParams.get("state")!;

    const result = await handleCallback(
      createContext() as unknown as GenericActionCtx<DataModel>,
      component as unknown as NativeOAuthComponentHandle,
      config,
      { provider: "github", code: "code-123", state },
    );

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toBe("account_not_linked");
    }
  });

  it("links an OAuth account to the current user when link is set and linkingUserId is provided", async () => {
    const config = createOAuthConfig();
    const component = createMockComponent();
    const { fetch, responses } = createMockFetch();
    config.github!.fetchImpl = fetch as unknown as typeof globalThis.fetch;
    setupGitHubResponses(createGitHubProvider(config.github!), responses);

    component.native.users.getUserById.mockResolvedValue({
      _id: "existing_user_1",
      _creationTime: Date.now(),
      email: "existing@example.com",
      emailVerified: true,
      isActive: true,
    });
    component.identity.provisionFromIdentity.mockResolvedValue({
      userId: "existing_user_1",
      identityId: "identity_1",
      createdUser: false,
      linkedExistingIdentity: false,
    });
    component.native.accounts.getAccountBySubject.mockResolvedValue(null);
    component.native.sessions.createSessionAndRefreshToken.mockResolvedValue("session_doc_1");

    const { url } = await handleSignIn(config, { provider: "github", link: true });
    const state = new URL(url).searchParams.get("state")!;

    const result = await handleCallback(
      createContext() as unknown as GenericActionCtx<DataModel>,
      component as unknown as NativeOAuthComponentHandle,
      config,
      { provider: "github", code: "code-123", state, linkingUserId: "existing_user_1" },
    );

    expect("error" in result).toBe(false);
    expect(component.native.users.getUserById).toHaveBeenCalledWith({
      userId: "existing_user_1",
    });
    expect(component.identity.provisionFromIdentity).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.objectContaining({
          email: "existing@example.com",
          emailVerified: true,
        }),
      }),
    );
    if (!("error" in result)) {
      expect(result.userId).toBe("existing_user_1");
    }
  });

  it("blocks link when the OAuth account is already linked to a different user", async () => {
    const config = createOAuthConfig();
    const component = createMockComponent();
    const { fetch, responses } = createMockFetch();
    config.github!.fetchImpl = fetch as unknown as typeof globalThis.fetch;
    setupGitHubResponses(createGitHubProvider(config.github!), responses);

    component.native.accounts.getAccountBySubject.mockResolvedValue({
      _id: "account_1",
      userId: "other_user",
      provider: "github",
      issuer: "https://github.com/login/oauth",
      subject: "12345",
      credentialHash: "",
    });

    const { url } = await handleSignIn(config, { provider: "github", link: true });
    const state = new URL(url).searchParams.get("state")!;

    const result = await handleCallback(
      createContext() as unknown as GenericActionCtx<DataModel>,
      component as unknown as NativeOAuthComponentHandle,
      config,
      { provider: "github", code: "code-123", state, linkingUserId: "existing_user_1" },
    );

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toBe("account_not_linked");
    }
  });

  it("blocks linking when accountLinking.requiresEmailVerification is true and email is unverified", async () => {
    const config = createOAuthConfig({
      github: createGitHubConfig({ requireEmailVerification: false }),
      trustedProviders: ["github"],
      accountLinking: { requiresEmailVerification: true },
    });
    const component = createMockComponent();
    const { fetch, responses } = createMockFetch();
    config.github!.fetchImpl = fetch as unknown as typeof globalThis.fetch;
    responses.set("https://github.com/login/oauth/access_token", {
      body: { access_token: "github-access-token", token_type: "bearer" },
    });
    responses.set("https://api.github.com/user", {
      body: {
        id: 12345,
        login: "octocat",
        name: "The Octocat",
        email: "octocat@example.com",
        avatar_url: "https://avatar",
        verified: false,
      },
    });

    component.native.users.getUserByEmail.mockResolvedValue({
      _id: "existing_user_1",
      _creationTime: Date.now(),
      email: "octocat@example.com",
      emailVerified: true,
      isActive: true,
    });

    const { url } = await handleSignIn(config, { provider: "github" });
    const state = new URL(url).searchParams.get("state")!;

    const result = await handleCallback(
      createContext() as unknown as GenericActionCtx<DataModel>,
      component as unknown as NativeOAuthComponentHandle,
      config,
      { provider: "github", code: "code-123", state },
    );

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toBe("account_not_linked");
    }
  });

  it("allows linking for a trusted provider with an unverified email when requiresEmailVerification is not set", async () => {
    const config = createOAuthConfig({
      github: createGitHubConfig({ requireEmailVerification: false }),
      trustedProviders: ["github"],
    });
    const component = createMockComponent();
    const { fetch, responses } = createMockFetch();
    config.github!.fetchImpl = fetch as unknown as typeof globalThis.fetch;
    responses.set("https://github.com/login/oauth/access_token", {
      body: { access_token: "github-access-token", token_type: "bearer" },
    });
    responses.set("https://api.github.com/user", {
      body: {
        id: 12345,
        login: "octocat",
        name: "The Octocat",
        email: "octocat@example.com",
        avatar_url: "https://avatar",
        verified: false,
      },
    });

    component.native.users.getUserByEmail.mockResolvedValue({
      _id: "existing_user_1",
      _creationTime: Date.now(),
      email: "octocat@example.com",
      emailVerified: true,
      isActive: true,
    });
    component.identity.provisionFromIdentity.mockResolvedValue({
      userId: "existing_user_1",
      identityId: "identity_1",
      createdUser: false,
      linkedExistingIdentity: false,
    });
    component.native.sessions.createSessionAndRefreshToken.mockResolvedValue("session_doc_1");

    const { url } = await handleSignIn(config, { provider: "github" });
    const state = new URL(url).searchParams.get("state")!;

    const result = await handleCallback(
      createContext() as unknown as GenericActionCtx<DataModel>,
      component as unknown as NativeOAuthComponentHandle,
      config,
      { provider: "github", code: "code-123", state },
    );

    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.userId).toBe("existing_user_1");
    }
  });

  it("updates OAuth token material on an existing linked account", async () => {
    const config = createOAuthConfig();
    const component = createMockComponent();
    const { fetch, responses } = createMockFetch();
    config.github!.fetchImpl = fetch as unknown as typeof globalThis.fetch;
    setupGitHubResponses(createGitHubProvider(config.github!), responses);

    component.native.accounts.getAccountBySubject.mockResolvedValue({
      _id: "account_1",
      userId: "user_1",
      provider: "github",
      issuer: "https://github.com/login/oauth",
      subject: "12345",
      credentialHash: "",
    });
    component.identity.provisionFromIdentity.mockResolvedValue({
      userId: "user_1",
      identityId: "identity_1",
      createdUser: false,
      linkedExistingIdentity: false,
    });
    component.native.sessions.createSessionAndRefreshToken.mockResolvedValue("session_doc_1");

    const { url } = await handleSignIn(config, { provider: "github" });
    const state = new URL(url).searchParams.get("state")!;

    await handleCallback(
      createContext() as unknown as GenericActionCtx<DataModel>,
      component as unknown as NativeOAuthComponentHandle,
      config,
      { provider: "github", code: "code-123", state },
    );

    expect(component.native.accounts.createAccount).not.toHaveBeenCalled();
    const updateCall = component.native.accounts.updateAccountTokens.mock.calls[0]?.[0];
    expect(updateCall).toMatchObject({
      accountId: "account_1",
      tokenType: "bearer",
    });
    expect(await decryptAccountToken(updateCall.accessToken)).toBe("github-access-token");
  });
});

describe("nativeOAuth actions", () => {
  beforeAll(setupTestKeys);

  it("returns an authorization URL from the signIn action", async () => {
    const config = createOAuthConfig();
    const component = createMockComponent();
    process.env.CONVEX_SITE_URL = "https://app.example.com";

    const actions = nativeOAuth(component as unknown as NativeOAuthComponentHandle, config);
    const registered = (
      actions.signIn as unknown as {
        _handler: (ctx: unknown, args: Record<string, unknown>) => unknown;
      }
    )._handler;
    const { url } = (await registered(createContext(), { provider: "github" })) as {
      url: string;
    };

    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/login/oauth/authorize");
    expect(parsed.searchParams.get("state")).toBeTruthy();
  });
});

describe("addNativeOAuthHttpRoutes", () => {
  beforeAll(setupTestKeys);

  it("registers signin and callback routes and handles a full flow", async () => {
    const config = createOAuthConfig();
    const component = createMockComponent();
    const { fetch, responses } = createMockFetch();
    config.github.fetchImpl = fetch as unknown as typeof globalThis.fetch;
    setupGitHubResponses(createGitHubProvider(config.github), responses);

    component.identity.provisionFromIdentity.mockResolvedValue({
      userId: "user_1",
      identityId: "identity_1",
      createdUser: true,
      linkedExistingIdentity: false,
    });
    component.native.accounts.getAccountBySubject.mockResolvedValue(null);
    component.native.sessions.createSessionAndRefreshToken.mockResolvedValue("session_doc_1");

    const routes: {
      path?: string;
      pathPrefix?: string;
      method: string;
      handler: (ctx: unknown, request: Request) => Promise<Response>;
    }[] = [];
    const http = {
      route: (r: {
        path?: string;
        pathPrefix?: string;
        method: string;
        handler: (ctx: unknown, request: Request) => Promise<Response>;
      }) => routes.push(r),
    };

    addNativeOAuthHttpRoutes(http as unknown as import("convex/server").HttpRouter, {
      component: component as unknown as NativeOAuthComponentHandle,
      oauth: config,
    });

    expect(routes).toHaveLength(3);
    const signinRoute = routes.find((r) => r.pathPrefix === "/api/auth/signin/")!;
    const callbackRoute = routes.find((r) => r.pathPrefix === "/api/auth/callback/")!;
    const socialRoute = routes.find(
      (r) => r.path === "/api/auth/sign-in/social" && r.method === "POST",
    )!;
    expect(socialRoute).toBeDefined();

    const signinResponse = (await exec(signinRoute.handler).handler(
      createContext(),
      new Request(
        "https://app.example.com/api/auth/signin/github?redirectTo=https://app.example.com/home",
      ),
    )) as Response;
    expect(signinResponse.status).toBe(302);
    const location = signinResponse.headers.get("Location")!;
    const authUrl = new URL(location);
    const state = authUrl.searchParams.get("state")!;
    const code = "code-123";

    const callbackResponse = (await exec(callbackRoute.handler).handler(
      createContext() as unknown as GenericActionCtx<DataModel>,
      new Request(`https://app.example.com/api/auth/callback/github?code=${code}&state=${state}`),
    )) as Response;

    expect(callbackResponse.status).toBe(302);
    const callbackLocation = callbackResponse.headers.get("Location")!;
    const callbackUrl = new URL(callbackLocation);
    expect(callbackUrl.origin + callbackUrl.pathname).toBe("https://app.example.com/home");
    expect(callbackUrl.searchParams.get("token")).toBeTruthy();
    expect(callbackUrl.searchParams.get("refreshToken")).toBeTruthy();
    expect(callbackUrl.searchParams.get("sessionId")).toBeTruthy();
    const setCookie = callbackResponse.headers.get("Set-Cookie");
    expect(setCookie).toMatch(/convex-auth-token=/);
    expect(setCookie).toMatch(/convex-auth-refresh-token=/);
  });

  it("returns invalid_callback_request when the provider is missing", async () => {
    const config = createOAuthConfig();
    const routes: {
      path?: string;
      pathPrefix?: string;
      method: string;
      handler: (ctx: unknown, request: Request) => Promise<Response>;
    }[] = [];
    const http = { route: (r: (typeof routes)[number]) => routes.push(r) };
    addNativeOAuthHttpRoutes(http as unknown as import("convex/server").HttpRouter, {
      component: createMockComponent() as unknown as NativeOAuthComponentHandle,
      oauth: config,
    });
    const signinRoute = routes.find((r) => r.pathPrefix === "/api/auth/signin/")!;
    const response = (await exec(signinRoute.handler).handler(
      createContext(),
      new Request("https://app.example.com/api/auth/signin/"),
    )) as Response;
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      "https://test.convex.site/?error=invalid_callback_request&error_description=Missing+provider",
    );
  });

  it("maps a provider error to provider_error and preserves the absolute errorURL", async () => {
    const config = createOAuthConfig();
    const component = createMockComponent();
    const state = await mintOAuthState({
      provider: "github",
      codeVerifier: await generateCodeVerifier(),
      errorURL: "https://app.example.com/error",
    });
    const routes: {
      path?: string;
      pathPrefix?: string;
      method: string;
      handler: (ctx: unknown, request: Request) => Promise<Response>;
    }[] = [];
    const http = { route: (r: (typeof routes)[number]) => routes.push(r) };
    addNativeOAuthHttpRoutes(http as unknown as import("convex/server").HttpRouter, {
      component: component as unknown as NativeOAuthComponentHandle,
      oauth: config,
    });
    const callbackRoute = routes.find((r) => r.pathPrefix === "/api/auth/callback/")!;
    const response = (await exec(callbackRoute.handler).handler(
      createContext() as unknown as GenericActionCtx<DataModel>,
      new Request(
        `https://app.example.com/api/auth/callback/github?error=access_denied&error_description=user+denied&state=${state}`,
      ),
    )) as Response;
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      "https://app.example.com/error?error=provider_error&error_description=user+denied",
    );
  });

  it("returns invalid_callback_request when state is missing", async () => {
    const config = createOAuthConfig();
    const routes: {
      path?: string;
      pathPrefix?: string;
      method: string;
      handler: (ctx: unknown, request: Request) => Promise<Response>;
    }[] = [];
    const http = { route: (r: (typeof routes)[number]) => routes.push(r) };
    addNativeOAuthHttpRoutes(http as unknown as import("convex/server").HttpRouter, {
      component: createMockComponent() as unknown as NativeOAuthComponentHandle,
      oauth: config,
    });
    const callbackRoute = routes.find((r) => r.pathPrefix === "/api/auth/callback/")!;
    const response = (await exec(callbackRoute.handler).handler(
      createContext() as unknown as GenericActionCtx<DataModel>,
      new Request("https://app.example.com/api/auth/callback/github?code=code-123"),
    )) as Response;
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      "https://test.convex.site/?error=invalid_callback_request&error_description=Missing+state",
    );
  });

  it("returns no_code when code is missing", async () => {
    const config = createOAuthConfig();
    const state = await mintOAuthState({
      provider: "github",
      codeVerifier: await generateCodeVerifier(),
    });
    const routes: {
      path?: string;
      pathPrefix?: string;
      method: string;
      handler: (ctx: unknown, request: Request) => Promise<Response>;
    }[] = [];
    const http = { route: (r: (typeof routes)[number]) => routes.push(r) };
    addNativeOAuthHttpRoutes(http as unknown as import("convex/server").HttpRouter, {
      component: createMockComponent() as unknown as NativeOAuthComponentHandle,
      oauth: config,
    });
    const callbackRoute = routes.find((r) => r.pathPrefix === "/api/auth/callback/")!;
    const response = (await exec(callbackRoute.handler).handler(
      createContext() as unknown as GenericActionCtx<DataModel>,
      new Request(`https://app.example.com/api/auth/callback/github?state=${state}`),
    )) as Response;
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      "https://test.convex.site/?error=no_code&error_description=Missing+code",
    );
  });
});
