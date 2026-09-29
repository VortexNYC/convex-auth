import { beforeAll, describe, expect, it, vi } from "vitest";
import { exportJWK, generateKeyPair, importJWK, SignJWT } from "jose";
import { nativeOneTap, type NativeOneTapConfig } from "./oneTap.js";

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
}

function createMockFetch(): {
  fetch: ReturnType<typeof vi.fn>;
  responses: Map<string, { status?: number; body: unknown }>;
} {
  const responses = new Map<string, { status?: number; body: unknown }>();
  const fetch = vi.fn(async (url: string) => {
    const response = responses.get(url);
    if (!response) {
      return new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify(response.body), {
      status: response.status ?? 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  return { fetch, responses };
}

function createMockComponent() {
  return {
    identity: {
      provisionFromIdentity: vi.fn().mockResolvedValue({
        identityId: "identity-1",
        userId: "user-1",
        user: {
          _id: "user-1",
          email: "google@example.com",
          emailVerified: true,
          name: "Google User",
        },
        token: "session-token",
        sessionId: "session-1",
        createdUser: true,
      }),
    },
    native: {
      accounts: {
        createAccount: vi.fn().mockResolvedValue("account-1"),
        getAccountBySubject: vi.fn().mockResolvedValue(null),
      },
      rateLimits: {
        recordAttempt: vi.fn().mockResolvedValue({ allowed: true }),
      },
      users: {
        getUserByEmail: vi.fn().mockResolvedValue(null),
      },
    },
  };
}

function dispatch(component: ReturnType<typeof createMockComponent>) {
  return (ref: unknown, args: Record<string, unknown>) => {
    for (const group of [
      component.identity,
      component.native.accounts,
      component.native.users,
      component.native.rateLimits,
    ]) {
      for (const value of Object.values(group)) {
        if (value === ref) {
          return (ref as (args: Record<string, unknown>) => unknown)(args);
        }
      }
    }
    return undefined;
  };
}

function createContext(component: ReturnType<typeof createMockComponent>) {
  const run = dispatch(component);
  return {
    runQuery: vi.fn((ref: unknown, args: Record<string, unknown>) => run(ref, args)),
    runMutation: vi.fn((ref: unknown, args: Record<string, unknown>) => run(ref, args)),
    runAction: vi.fn(),
  };
}

function exec(registered: unknown) {
  const handler = Reflect.get(registered as object, "_handler");
  return {
    handler: async (ctx: unknown, args: unknown): Promise<unknown> =>
      await Reflect.apply(handler as (...a: unknown[]) => unknown, registered, [ctx, args]),
  };
}

function createOneTap(
  component: ReturnType<typeof createMockComponent>,
  overrides: Partial<NativeOneTapConfig> = {},
) {
  const { fetch, responses } = createMockFetch();
  responses.set("https://www.googleapis.com/oauth2/v3/certs", {
    body: JSON.parse(process.env.JWKS!),
  });
  const actions = nativeOneTap(component as never, {
    clientId: "google-client-id",
    fetchImpl: fetch as unknown as typeof globalThis.fetch,
    ...overrides,
  });
  return { actions, fetch, responses };
}

async function signIn(
  actions: ReturnType<typeof nativeOneTap>,
  ctx: unknown,
  args: Record<string, unknown>,
) {
  return (await exec(actions.signInOneTap).handler(ctx, args)) as Record<string, unknown>;
}

describe("nativeOneTap signInOneTap", () => {
  beforeAll(setupTestKeys);

  it("verifies a valid Google ID token and mints a session", async () => {
    const component = createMockComponent();
    const { actions } = createOneTap(component);
    const ctx = createContext(component);
    const idToken = await mintGoogleIdToken();

    const result = await signIn(actions, ctx, { idToken });

    expect(result.token).toBe("session-token");
    expect(result.sessionId).toBe("session-1");
    expect(result.refreshToken).toEqual(expect.any(String));
    expect(result.createdUser).toBe(true);
    expect(component.identity.provisionFromIdentity).toHaveBeenCalledWith(
      expect.objectContaining({
        identity: expect.objectContaining({
          provider: "google",
          issuer: "https://accounts.google.com",
          subject: "google-12345",
          identityId: "https://accounts.google.com:google-12345",
        }),
        initialSession: expect.objectContaining({
          refreshTokenHash: expect.any(String),
        }),
      }),
    );
    expect(component.native.accounts.createAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "google",
        issuer: "https://accounts.google.com",
        subject: "google-12345",
      }),
    );
  });

  it("rejects a malformed token", async () => {
    const component = createMockComponent();
    const { actions } = createOneTap(component);
    await expect(signIn(actions, createContext(component), { idToken: "garbage" })).rejects.toThrow(
      "INVALID_ID_TOKEN",
    );
  });

  it("rejects an empty idToken without touching the provider", async () => {
    const component = createMockComponent();
    const { actions, fetch } = createOneTap(component);
    await expect(signIn(actions, createContext(component), { idToken: " " })).rejects.toThrow(
      "INVALID_ID_TOKEN",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a token with no sub claim", async () => {
    const component = createMockComponent();
    const { actions } = createOneTap(component);
    const privateJwk = JSON.parse(process.env.JWT_PRIVATE_KEY!);
    const privateKey = await importJWK(privateJwk, "RS256");
    const idToken = await new SignJWT({
      iss: "https://accounts.google.com",
      aud: "google-client-id",
      email: "google@example.com",
    })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
    await expect(signIn(actions, createContext(component), { idToken })).rejects.toThrow(
      "INVALID_ID_TOKEN",
    );
  });

  it("rejects a token with the wrong audience", async () => {
    const component = createMockComponent();
    const { actions } = createOneTap(component);
    const idToken = await mintGoogleIdToken({ aud: "other-client-id" });
    await expect(signIn(actions, createContext(component), { idToken })).rejects.toThrow(
      "INVALID_ID_TOKEN",
    );
  });

  it("rejects a token with the wrong issuer", async () => {
    const component = createMockComponent();
    const { actions } = createOneTap(component);
    const idToken = await mintGoogleIdToken({ iss: "https://evil.example.com" });
    await expect(signIn(actions, createContext(component), { idToken })).rejects.toThrow(
      "INVALID_ID_TOKEN",
    );
  });

  it("rejects an expired token", async () => {
    const component = createMockComponent();
    const { actions } = createOneTap(component);
    const privateJwk = JSON.parse(process.env.JWT_PRIVATE_KEY!);
    const privateKey = await importJWK(privateJwk, "RS256");
    const idToken = await new SignJWT({
      sub: "google-12345",
      iss: "https://accounts.google.com",
      aud: "google-client-id",
    })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 1800)
      .sign(privateKey);
    await expect(signIn(actions, createContext(component), { idToken })).rejects.toThrow(
      "INVALID_ID_TOKEN",
    );
  });

  it("rejects a hosted-domain mismatch as an invalid token", async () => {
    const component = createMockComponent();
    const { actions } = createOneTap(component, { hd: "corp.example.com" });
    const idToken = await mintGoogleIdToken({ hd: "other.example.com" });
    await expect(signIn(actions, createContext(component), { idToken })).rejects.toThrow(
      "INVALID_ID_TOKEN",
    );
  });

  it("propagates JWKS upstream failures instead of flattening to INVALID_ID_TOKEN", async () => {
    const component = createMockComponent();
    const { actions, responses } = createOneTap(component);
    responses.set("https://www.googleapis.com/oauth2/v3/certs", {
      status: 500,
      body: { error: "upstream" },
    });
    const idToken = await mintGoogleIdToken();
    await expect(signIn(actions, createContext(component), { idToken })).rejects.toThrow(
      "Google JWKS request failed",
    );
  });

  it("propagates a malformed JWKS body as an infra error", async () => {
    const component = createMockComponent();
    const { actions, responses } = createOneTap(component);
    responses.set("https://www.googleapis.com/oauth2/v3/certs", {
      body: { keys: [{ kty: "RSA" }] },
    });
    const idToken = await mintGoogleIdToken();
    let thrown: unknown;
    try {
      await signIn(actions, createContext(component), { idToken });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).not.toBe("INVALID_ID_TOKEN");
  });

  it("caches the JWKS across sign-ins", async () => {
    const component = createMockComponent();
    const { actions, fetch } = createOneTap(component);
    const ctx = createContext(component);
    await signIn(actions, ctx, { idToken: await mintGoogleIdToken() });
    await signIn(actions, ctx, { idToken: await mintGoogleIdToken({ sub: "google-999" }) });
    const jwksCalls = fetch.mock.calls.filter(([url]) => String(url).includes("oauth2/v3/certs"));
    expect(jwksCalls).toHaveLength(1);
  });

  it("refetches the JWKS once when the kid is unknown (key rotation)", async () => {
    const component = createMockComponent();
    const rotatedKey = await generateKeyPair("RS256", { extractable: true });
    const staleJwks = {
      keys: [{ ...(await exportJWK(rotatedKey.publicKey)), kid: "old-key" }],
    };
    const freshJwks = {
      keys: [{ ...JSON.parse(process.env.JWKS!).keys[0], kid: "new-key" }],
    };
    let jwksCalls = 0;
    const fetch = vi.fn(async () => {
      const body = jwksCalls++ === 0 ? staleJwks : freshJwks;
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const actions = nativeOneTap(component as never, {
      clientId: "google-client-id",
      fetchImpl: fetch as unknown as typeof globalThis.fetch,
    });
    const privateJwk = JSON.parse(process.env.JWT_PRIVATE_KEY!);
    const privateKey = await importJWK(privateJwk, "RS256");
    const idToken = await new SignJWT({
      sub: "google-12345",
      email: "google@example.com",
      email_verified: true,
      iss: "https://accounts.google.com",
      aud: "google-client-id",
    })
      .setProtectedHeader({ alg: "RS256", kid: "new-key" })
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);

    const result = await signIn(actions, createContext(component), { idToken });
    expect(result.token).toBe("session-token");
    expect(jwksCalls).toBe(2);
  });

  it("rate-limits replay of the same token before verification", async () => {
    const component = createMockComponent();
    component.native.rateLimits.recordAttempt
      .mockResolvedValueOnce({ allowed: false })
      .mockResolvedValue({ allowed: true });
    const { actions } = createOneTap(component);
    await expect(
      signIn(actions, createContext(component), { idToken: await mintGoogleIdToken() }),
    ).rejects.toThrow("Too many requests");
    expect(component.native.rateLimits.recordAttempt).toHaveBeenCalledTimes(1);
    expect(component.native.rateLimits.recordAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: expect.stringMatching(/^one-tap-token:/) }),
    );
  });

  it("rate-limits per subject after verification", async () => {
    const component = createMockComponent();
    component.native.rateLimits.recordAttempt
      .mockResolvedValueOnce({ allowed: true })
      .mockResolvedValueOnce({ allowed: false });
    const { actions } = createOneTap(component);
    await expect(
      signIn(actions, createContext(component), { idToken: await mintGoogleIdToken() }),
    ).rejects.toThrow("Too many requests");
    expect(component.native.rateLimits.recordAttempt).toHaveBeenLastCalledWith(
      expect.objectContaining({ identifier: "one-tap:google-12345" }),
    );
  });

  it("rejects when a pinned nonce does not match the token claim", async () => {
    const component = createMockComponent();
    const { actions } = createOneTap(component);
    const idToken = await mintGoogleIdToken({ nonce: "server-nonce" });
    await expect(
      signIn(actions, createContext(component), { idToken, nonce: "different-nonce" }),
    ).rejects.toThrow("INVALID_ID_TOKEN");
  });

  it("accepts when the nonce claim matches", async () => {
    const component = createMockComponent();
    const { actions } = createOneTap(component);
    const idToken = await mintGoogleIdToken({ nonce: "server-nonce" });
    const result = await signIn(actions, createContext(component), {
      idToken,
      nonce: "server-nonce",
    });
    expect(result.token).toBe("session-token");
  });

  it("signs in an existing account without re-creating it", async () => {
    const component = createMockComponent();
    component.native.accounts.getAccountBySubject.mockResolvedValue({ _id: "account-1" });
    component.identity.provisionFromIdentity.mockResolvedValue({
      identityId: "identity-1",
      userId: "user-1",
      user: { _id: "user-1", email: "google@example.com", emailVerified: true },
      token: "session-token",
      sessionId: "session-1",
      createdUser: false,
    });
    const { actions } = createOneTap(component);
    const result = await signIn(actions, createContext(component), {
      idToken: await mintGoogleIdToken(),
    });
    expect(result.createdUser).toBe(false);
    expect(component.native.accounts.createAccount).not.toHaveBeenCalled();
  });

  it("rejects new users when sign-up is disabled", async () => {
    const component = createMockComponent();
    const { actions } = createOneTap(component, { disableSignUp: true });
    await expect(
      signIn(actions, createContext(component), { idToken: await mintGoogleIdToken() }),
    ).rejects.toThrow("SIGN_UP_DISABLED");
  });

  it("blocks implicit email linking when the provider is untrusted and the email is unverified", async () => {
    const component = createMockComponent();
    component.native.users.getUserByEmail.mockResolvedValue({ _id: "user-existing" });
    const { actions } = createOneTap(component);
    const idToken = await mintGoogleIdToken({ email_verified: false });
    await expect(signIn(actions, createContext(component), { idToken })).rejects.toThrow(
      "ACCOUNT_NOT_LINKED",
    );
  });

  it("implicitly links a verified Google email to an existing user", async () => {
    const component = createMockComponent();
    component.native.users.getUserByEmail.mockResolvedValue({ _id: "user-existing" });
    const { actions } = createOneTap(component, { trustedProvider: true });
    const result = await signIn(actions, createContext(component), {
      idToken: await mintGoogleIdToken(),
    });
    expect(result.token).toBe("session-token");
    expect(component.identity.provisionFromIdentity).toHaveBeenCalledWith(
      expect.objectContaining({ allowUnverifiedEmailLink: true }),
    );
  });

  it("rejects linking when accountLinking is disabled", async () => {
    const component = createMockComponent();
    component.native.users.getUserByEmail.mockResolvedValue({ _id: "user-existing" });
    const { actions } = createOneTap(component, {
      trustedProvider: true,
      accountLinking: { enabled: false },
    });
    await expect(
      signIn(actions, createContext(component), { idToken: await mintGoogleIdToken() }),
    ).rejects.toThrow("ACCOUNT_NOT_LINKED");
  });

  it("passes the effective link policy into the mutation (TOCTOU)", async () => {
    const component = createMockComponent();
    /* No existing user at query time — but allowLink must still travel to the
     * mutation so a user created between the two cannot be linked into. */
    const { actions } = createOneTap(component, { accountLinking: { enabled: false } });
    await signIn(actions, createContext(component), { idToken: await mintGoogleIdToken() });
    expect(component.identity.provisionFromIdentity).toHaveBeenCalledWith(
      expect.objectContaining({ allowLink: false }),
    );
  });

  it("passes allowUnverifiedEmailLink: false when linking requires verification", async () => {
    const component = createMockComponent();
    const { actions } = createOneTap(component, {
      trustedProvider: true,
      accountLinking: { requiresEmailVerification: true },
    });
    const idToken = await mintGoogleIdToken({ email_verified: false });
    await signIn(actions, createContext(component), { idToken });
    expect(component.identity.provisionFromIdentity).toHaveBeenCalledWith(
      expect.objectContaining({ allowUnverifiedEmailLink: false }),
    );
  });

  it("rejects unverified emails when requireEmailVerification is set", async () => {
    const component = createMockComponent();
    const { actions } = createOneTap(component, { requireEmailVerification: true });
    const idToken = await mintGoogleIdToken({ email_verified: false });
    await expect(signIn(actions, createContext(component), { idToken })).rejects.toThrow(
      "EMAIL_NOT_VERIFIED",
    );
  });

  it("enforces the rate limit", async () => {
    const component = createMockComponent();
    component.native.rateLimits.recordAttempt.mockResolvedValue({ allowed: false });
    const { actions } = createOneTap(component);
    await expect(
      signIn(actions, createContext(component), { idToken: await mintGoogleIdToken() }),
    ).rejects.toThrow("Too many requests");
  });

  it("skips the rate limit when rateLimit: false", async () => {
    const component = createMockComponent();
    const { actions } = createOneTap(component, { rateLimit: false });
    await signIn(actions, createContext(component), { idToken: await mintGoogleIdToken() });
    expect(component.native.rateLimits.recordAttempt).not.toHaveBeenCalled();
  });

  it("maps provisioning duplicates to ACCOUNT_NOT_LINKED", async () => {
    const component = createMockComponent();
    component.identity.provisionFromIdentity.mockResolvedValue({ duplicate: true });
    const { actions } = createOneTap(component);
    await expect(
      signIn(actions, createContext(component), { idToken: await mintGoogleIdToken() }),
    ).rejects.toThrow("ACCOUNT_NOT_LINKED");
  });

  it("throws when disabled", async () => {
    const component = createMockComponent();
    const { actions } = createOneTap(component, { enabled: false });
    await expect(
      signIn(actions, createContext(component), { idToken: await mintGoogleIdToken() }),
    ).rejects.toThrow("One Tap authentication is disabled");
  });
});
