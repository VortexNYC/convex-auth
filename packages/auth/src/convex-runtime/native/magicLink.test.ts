import { beforeAll, describe, expect, it, vi } from "vitest";
import type { FunctionReference } from "convex/server";
import type { NativeEmailAndPasswordComponentHandle } from "./types.js";
import { nativeMagicLink, type NativeMagicLinkConfig } from "./magicLink.js";

function exec(registered: unknown) {
  if ((typeof registered !== "object" && typeof registered !== "function") || registered === null) {
    throw new TypeError("expected an executable spec");
  }
  const handler = Reflect.get(registered, "_handler");
  if (typeof handler !== "function") {
    throw new TypeError("expected an executable handler");
  }
  return {
    handler: async (ctx: unknown, args: Record<string, unknown>): Promise<unknown> =>
      await Reflect.apply(handler, registered, [ctx, args]),
  };
}

function dispatch(ref: unknown, args: Record<string, unknown>) {
  if (typeof ref === "function") {
    return (ref as (args: Record<string, unknown>) => unknown)(args);
  }
  if (typeof ref === "object" && ref !== null) {
    const handler = Reflect.get(ref, "_handler");
    if (typeof handler === "function") {
      return Reflect.apply(handler, ref, [{}, args]);
    }
  }
  return undefined;
}

function createContext() {
  return {
    runQuery: vi.fn((ref: unknown, args: Record<string, unknown>) => dispatch(ref, args)),
    runMutation: vi.fn((ref: unknown, args: Record<string, unknown>) => dispatch(ref, args)),
    runAction: vi.fn(),
  };
}

type Mockify<T> = {
  [K in keyof T]: T[K] extends FunctionReference<
    infer _Type,
    infer _Visibility,
    infer Args,
    infer Return,
    infer _ComponentPath
  >
    ? ReturnType<typeof vi.fn> extends (args: Args) => Promise<Awaited<Return>>
      ? ReturnType<typeof vi.fn>
      : ReturnType<typeof vi.fn>
    : T[K] extends Record<string, unknown>
      ? Mockify<T[K]>
      : T[K];
};

function createMockComponent(): Mockify<NativeEmailAndPasswordComponentHandle> {
  return {
    identity: {
      provisionFromIdentity: vi.fn(),
      getUserAndAccount: vi.fn(),
      verifyEmail: vi.fn(),
      resetPassword: vi.fn(),
    },
    native: {
      accounts: {
        createAccount: vi.fn(),
        updateCredentialHash: vi.fn(),
        getAccountBySubject: vi.fn(),
      },
      sessions: {
        createSession: vi.fn(),
        createSessionAndRefreshToken: vi.fn(),
        revokeSession: vi.fn(),
        listSessionsByUser: vi.fn(),
        getSessionByToken: vi.fn(),
        getSessionBySessionId: vi.fn(),
        revokeSessionsForUser: vi.fn(),
        rotateSession: vi.fn(),
      },
      refreshTokens: {
        createRefreshToken: vi.fn(),
        getRefreshTokenByTokenHash: vi.fn(),
        consumeRefreshToken: vi.fn(),
        revokeRefreshTokensForSession: vi.fn(),
        revokeRefreshTokensForUser: vi.fn(),
      },
      identities: {
        getNativeIdentityByUser: vi.fn(),
        markEmailVerified: vi.fn(),
      },
      users: {
        getUserByEmail: vi.fn(),
        getUserById: vi.fn(),
        markEmailVerified: vi.fn(),
        setTwoFactor: vi.fn(),
        consumeBackupCode: vi.fn(),
      },
      codes: {
        createVerificationCode: vi.fn(),
        getVerificationCodeByTokenHash: vi.fn(),
        consumeVerificationCode: vi.fn(),
        revokeVerificationCodesForUser: vi.fn(),
      },
      verifiers: {
        createVerifier: vi.fn(),
        getVerifierByVerifierId: vi.fn(),
        consumeVerifier: vi.fn(),
      },
    },
  } as unknown as Mockify<NativeEmailAndPasswordComponentHandle>;
}

function createConfig(overrides: Partial<NativeMagicLinkConfig> = {}): NativeMagicLinkConfig {
  return {
    sendMagicLink: vi.fn().mockResolvedValue("email_1"),
    ...overrides,
  };
}

describe("nativeMagicLink", () => {
  beforeAll(() => {
    process.env.CONVEX_SITE_URL = "https://test.convex.site";
  });

  it("signInMagicLink creates a verifier and sends a magic link", async () => {
    const component = createMockComponent();
    const sendMagicLink = vi.fn().mockResolvedValue("email_1");
    const { signInMagicLink } = nativeMagicLink(
      component as unknown as NativeEmailAndPasswordComponentHandle,
      {
        sendMagicLink,
      },
    );
    const { handler } = exec(signInMagicLink);

    const ctx = createContext();
    const result = await handler(ctx, {
      email: "Shlomo@example.com ",
      callbackURL: "/dashboard",
    });

    expect(result).toMatchObject({ status: "queued" });

    const createCall = component.native.verifiers.createVerifier.mock.calls[0]?.[0];
    expect(createCall).toMatchObject({
      type: "magic-link",
    });
    expect(typeof createCall.verifierId).toBe("string");
    expect(typeof createCall.expiresAt).toBe("number");

    const metadata = JSON.parse(createCall.metadata);
    expect(metadata.email).toBe("shlomo@example.com");

    expect(sendMagicLink).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "shlomo@example.com",
        url: expect.stringMatching(
          /https:\/\/test\.convex\.site\/api\/auth\/magic-link\/verify\?token=[a-f0-9]+&callbackURL=%2Fdashboard$/,
        ),
      }),
    );
  });

  it("rejects an invalid email", async () => {
    const component = createMockComponent();
    const { signInMagicLink } = nativeMagicLink(
      component as unknown as NativeEmailAndPasswordComponentHandle,
      createConfig(),
    );
    const { handler } = exec(signInMagicLink);

    const ctx = createContext();
    await expect(handler(ctx, { email: "not-an-email" })).rejects.toThrow("Invalid email");
    expect((component as any).native.verifiers.createVerifier).not.toHaveBeenCalled();
  });

  it("rejects when disabled", async () => {
    const component = createMockComponent();
    const { signInMagicLink } = nativeMagicLink(
      component as unknown as NativeEmailAndPasswordComponentHandle,
      {
        ...createConfig(),
        enabled: false,
      },
    );
    const { handler } = exec(signInMagicLink);

    const ctx = createContext();
    await expect(handler(ctx, { email: "shlomo@example.com" })).rejects.toThrow(
      "Magic link authentication is disabled",
    );
  });

  it("verifyMagicLink creates a user and returns a session", async () => {
    const component = createMockComponent();
    const sendMagicLink = vi.fn().mockResolvedValue("email_1");
    const { signInMagicLink, verifyMagicLink } = nativeMagicLink(
      component as unknown as NativeEmailAndPasswordComponentHandle,
      { sendMagicLink },
    );

    const ctx = createContext();
    await exec(signInMagicLink).handler(ctx, {
      email: "Shlomo@example.com ",
      callbackURL: "/dashboard",
    });

    const token = sendMagicLink.mock.calls[0][0].token;

    component.native.verifiers.consumeVerifier = vi.fn().mockResolvedValue({
      _id: "verifier_1",
      verifierId: token,
      type: "magic-link",
      metadata: JSON.stringify({ email: "shlomo@example.com", name: "Shlomo" }),
      expiresAt: Date.now() + 5 * 60 * 1000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    component.native.users.getUserByEmail = vi.fn().mockResolvedValue(null);
    component.identity.provisionFromIdentity = vi.fn().mockResolvedValue({
      userId: "user_1",
      identityId: "identity_1",
      createdUser: true,
      linkedExistingIdentity: false,
      token: "jwt_1",
      sessionId: "session_1",
      user: {
        _id: "user_1",
        email: "shlomo@example.com",
        name: "Shlomo",
        emailVerified: true,
        twoFactorEnabled: false,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    });

    const result = await exec(verifyMagicLink).handler(ctx, { token });

    expect(result).toMatchObject({
      token: "jwt_1",
      refreshToken: expect.any(String),
      sessionId: "session_1",
      userId: "user_1",
      identityId: "identity_1",
      user: { email: "shlomo@example.com" },
    });

    const consumeCall = (component as any).native.verifiers.consumeVerifier.mock.calls[0][0];
    expect(typeof consumeCall.verifierId).toBe("string");

    const provisionCall = (component as any).identity.provisionFromIdentity.mock.calls[0][0];
    expect(provisionCall.identity).toMatchObject({
      provider: "magicLink",
      issuer: "native",
      subject: "shlomo@example.com",
      email: "shlomo@example.com",
      emailVerified: true,
    });
    expect(provisionCall.user).toMatchObject({
      email: "shlomo@example.com",
      name: "Shlomo",
      emailVerified: true,
    });
    expect(provisionCall.allowLink).toBe(true);
  });

  it("verifyMagicLink binds the session to the requesting browser's landingVerifier", async () => {
    const component = createMockComponent();
    const sendMagicLink = vi.fn().mockResolvedValue("email_1");
    const { signInMagicLink, verifyMagicLink } = nativeMagicLink(
      component as unknown as NativeEmailAndPasswordComponentHandle,
      { sendMagicLink },
    );

    const ctx = createContext();
    await exec(signInMagicLink).handler(ctx, {
      email: "shlomo@example.com",
      callbackURL: "/dashboard",
      landingVerifier: "lv-requester",
    });

    const createCall = component.native.verifiers.createVerifier.mock.calls[0]?.[0];
    expect(JSON.parse(createCall.metadata).landingVerifier).toBe("lv-requester");

    const token = sendMagicLink.mock.calls[0][0].token;
    component.native.verifiers.consumeVerifier = vi.fn().mockResolvedValue({
      _id: "verifier_1",
      verifierId: "h",
      type: "magic-link",
      metadata: JSON.stringify({
        email: "shlomo@example.com",
        landingVerifier: "lv-requester",
      }),
      expiresAt: Date.now() + 5 * 60 * 1000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await expect(
      exec(verifyMagicLink).handler(ctx, { token, landingVerifier: "lv-attacker" }),
    ).rejects.toThrow("INVALID_TOKEN");

    component.native.users.getUserByEmail = vi.fn().mockResolvedValue(null);
    component.identity.provisionFromIdentity = vi.fn().mockResolvedValue({
      userId: "user_1",
      identityId: "identity_1",
      createdUser: true,
      linkedExistingIdentity: false,
      token: "jwt_1",
      sessionId: "session_1",
      user: {
        _id: "user_1",
        email: "shlomo@example.com",
        emailVerified: true,
        twoFactorEnabled: false,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    });

    const result = await exec(verifyMagicLink).handler(ctx, {
      token,
      landingVerifier: "lv-requester",
    });
    expect(result).toMatchObject({
      token: "jwt_1",
      sessionId: "session_1",
      landingVerifier: "lv-requester",
    });
  });

  it("verifyMagicLink still works with no verifier bound (native/mobile flow)", async () => {
    const component = createMockComponent();
    const { verifyMagicLink } = nativeMagicLink(
      component as unknown as NativeEmailAndPasswordComponentHandle,
      createConfig(),
    );
    component.native.verifiers.consumeVerifier = vi.fn().mockResolvedValue({
      _id: "verifier_1",
      verifierId: "h",
      type: "magic-link",
      metadata: JSON.stringify({ email: "shlomo@example.com" }),
      expiresAt: Date.now() + 5 * 60 * 1000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    component.native.users.getUserByEmail = vi.fn().mockResolvedValue({
      _id: "user_1",
      email: "shlomo@example.com",
      emailVerified: true,
      twoFactorEnabled: false,
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    component.identity.provisionFromIdentity = vi.fn().mockResolvedValue({
      userId: "user_1",
      identityId: "identity_1",
      createdUser: false,
      linkedExistingIdentity: false,
      token: "jwt_1",
      sessionId: "session_1",
      user: {
        _id: "user_1",
        email: "shlomo@example.com",
        emailVerified: true,
        twoFactorEnabled: false,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    });

    const ctx = createContext();
    const result = await exec(verifyMagicLink).handler(ctx, { token: "tok" });
    expect(result).toMatchObject({ token: "jwt_1", sessionId: "session_1" });
    expect((result as { landingVerifier?: string }).landingVerifier).toBeUndefined();
  });

  it("verifyMagicLink rejects an invalid token", async () => {
    const component = createMockComponent();
    const { verifyMagicLink } = nativeMagicLink(
      component as unknown as NativeEmailAndPasswordComponentHandle,
      createConfig(),
    );
    component.native.verifiers.consumeVerifier = vi.fn().mockResolvedValue(null);

    const ctx = createContext();
    await expect(exec(verifyMagicLink).handler(ctx, { token: "nope" })).rejects.toThrow(
      "INVALID_TOKEN",
    );
  });

  it("verifyMagicLink respects disableSignUp", async () => {
    const component = createMockComponent();
    const { verifyMagicLink } = nativeMagicLink(
      component as unknown as NativeEmailAndPasswordComponentHandle,
      { ...createConfig(), disableSignUp: true },
    );
    component.native.verifiers.consumeVerifier = vi.fn().mockResolvedValue({
      _id: "verifier_1",
      verifierId: "verifier_1",
      type: "magic-link",
      metadata: JSON.stringify({ email: "shlomo@example.com" }),
      expiresAt: Date.now() + 5 * 60 * 1000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    component.native.users.getUserByEmail = vi.fn().mockResolvedValue(null);

    const ctx = createContext();
    await expect(exec(verifyMagicLink).handler(ctx, { token: "nope" })).rejects.toThrow(
      "SIGN_UP_DISABLED",
    );
    expect((component as any).identity.provisionFromIdentity).not.toHaveBeenCalled();
  });
});
