import { exportJWK, generateKeyPair } from "jose";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { FunctionReference } from "convex/server";
import type { Mock } from "vitest";
import { nativeUsername, type NativeUsernameConfig } from "./username.js";
import { hashPassword, verifyPassword } from "./password.js";
import { hashToken } from "./tokens.js";
import type {
  NativeAccountDoc,
  NativeEmailAndPasswordComponentHandle,
  NativeIdentityDoc,
  NativeUserDoc,
} from "./types.js";

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
    auth: { getUserIdentity: vi.fn() },
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
    ? Mock<(args: Args) => Promise<Awaited<Return>>>
    : T[K] extends Record<string, unknown>
      ? Mockify<T[K]>
      : T[K];
};

type MockedComponent = Mockify<NativeEmailAndPasswordComponentHandle>;

function createMockComponent(): MockedComponent {
  return {
    identity: {
      provisionFromIdentity: vi.fn(),
      getUserAndAccount: vi.fn(),
      getUserAndAccountByUsername: vi.fn(),
      verifyEmail: vi.fn(),
      resetPassword: vi.fn(),
      changeEmail: vi.fn(),
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
      rateLimits: {
        recordAttempt: vi.fn().mockResolvedValue({ allowed: true }),
        checkRateLimit: vi.fn(),
      },
    },
  } as unknown as MockedComponent;
}

const DEFAULT_PASSWORD = "hunter2!-unique-password-for-tests";

function makeUser(overrides: Partial<NativeUserDoc> = {}): NativeUserDoc {
  return {
    _id: "user_1",
    _creationTime: 0,
    username: "shlomo",
    displayUsername: "Shlomo",
    emailVerified: false,
    isActive: true,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function makeIdentity(overrides: Partial<NativeIdentityDoc> = {}): NativeIdentityDoc {
  return {
    _id: "identity_1",
    _creationTime: 0,
    identityId: "subject_1",
    userId: "user_1",
    provider: "username",
    issuer: "native",
    subject: "subject_1",
    tokenIdentifier: "subject_1",
    emailVerified: false,
    sessionId: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function makeAccount(
  credentialHash: string,
  overrides: Partial<NativeAccountDoc> = {},
): NativeAccountDoc {
  return {
    _id: "account_1",
    _creationTime: 0,
    userId: "user_1",
    provider: "username",
    issuer: "native",
    subject: "subject_1",
    credentialHash,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  } as NativeAccountDoc;
}

describe("nativeUsername", () => {
  beforeAll(async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
    process.env.JWT_PRIVATE_KEY = JSON.stringify(await exportJWK(privateKey));
    process.env.JWKS = JSON.stringify({ keys: [await exportJWK(publicKey)] });
    process.env.CONVEX_SITE_URL = "https://test.convex.site";
  });

  describe("signUpUsername", () => {
    it("creates a user with normalized username and preserved displayUsername", async () => {
      const component = createMockComponent();
      const actions = nativeUsername(component, { checkBreach: false });
      const ctx = createContext();
      component.identity.provisionFromIdentity.mockResolvedValue({
        userId: "user_1",
        identityId: "identity_1",
        createdUser: true,
        linkedExistingIdentity: false,
        user: makeUser({ username: "shlomo", displayUsername: "Shlomo" }),
        sessionId: "session_1",
        token: "tok",
      });

      const result = (await exec(actions.signUpUsername).handler(ctx, {
        username: "  Shlomo ",
        password: DEFAULT_PASSWORD,
      })) as { token: string; refreshToken: string; user: NativeUserDoc };

      expect(result.token).toBe("tok");
      expect(result.refreshToken).toBeTypeOf("string");
      expect(component.identity.provisionFromIdentity).toHaveBeenCalledWith(
        expect.objectContaining({
          identity: expect.objectContaining({ provider: "username", issuer: "native" }),
          user: expect.objectContaining({
            username: "shlomo",
            displayUsername: "Shlomo",
            emailVerified: false,
          }),
          allowLink: false,
        }),
      );
    });

    it("returns no session when autoSignIn is disabled", async () => {
      const component = createMockComponent();
      const actions = nativeUsername(component, { checkBreach: false, autoSignIn: false });
      const ctx = createContext();
      component.identity.provisionFromIdentity.mockResolvedValue({
        userId: "user_1",
        identityId: "identity_1",
        createdUser: true,
        linkedExistingIdentity: false,
        user: makeUser(),
      });

      const result = (await exec(actions.signUpUsername).handler(ctx, {
        username: "shlomo",
        password: DEFAULT_PASSWORD,
      })) as { token: string | null };

      expect(result.token).toBeNull();
      expect(component.identity.provisionFromIdentity).toHaveBeenCalledWith(
        expect.objectContaining({ initialSession: undefined }),
      );
    });

    it("rejects a taken username from the serialized mutation path", async () => {
      const component = createMockComponent();
      const onExistingUserSignUp = vi.fn();
      const actions = nativeUsername(component, { checkBreach: false, onExistingUserSignUp });
      const ctx = createContext();
      component.identity.provisionFromIdentity.mockResolvedValue({
        userId: "user_existing",
        createdUser: false,
        linkedExistingIdentity: false,
        duplicate: true,
        duplicateField: "username",
        user: makeUser({ _id: "user_existing" }),
      });

      await expect(
        exec(actions.signUpUsername).handler(ctx, {
          username: "Shlomo",
          password: DEFAULT_PASSWORD,
        }),
      ).rejects.toThrow("Username is already taken");
      expect(onExistingUserSignUp).toHaveBeenCalled();
    });

    it("rejects an email collision as user_already_exists", async () => {
      const component = createMockComponent();
      const actions = nativeUsername(component, { checkBreach: false });
      const ctx = createContext();
      component.identity.provisionFromIdentity.mockResolvedValue({
        userId: "user_existing",
        createdUser: false,
        linkedExistingIdentity: false,
        duplicate: true,
        duplicateField: "email",
        user: makeUser({ _id: "user_existing" }),
      });

      await expect(
        exec(actions.signUpUsername).handler(ctx, {
          username: "newbie",
          email: "taken@example.com",
          password: DEFAULT_PASSWORD,
        }),
      ).rejects.toThrow("User already exists");
    });

    it.each(["bad name", "a@b.com", "UPPER_ok but space", "ab", "x".repeat(33)])(
      "rejects invalid username %j",
      async (username) => {
        const component = createMockComponent();
        const actions = nativeUsername(component, { checkBreach: false });
        const ctx = createContext();
        await expect(
          exec(actions.signUpUsername).handler(ctx, { username, password: DEFAULT_PASSWORD }),
        ).rejects.toThrow(/Username|username/);
        expect(component.identity.provisionFromIdentity).not.toHaveBeenCalled();
      },
    );

    it("applies the custom usernameValidator against the normalized value", async () => {
      const component = createMockComponent();
      const usernameValidator = vi.fn().mockResolvedValue(false);
      const actions = nativeUsername(component, { checkBreach: false, usernameValidator });
      const ctx = createContext();

      await expect(
        exec(actions.signUpUsername).handler(ctx, {
          username: "  Admin  ",
          password: DEFAULT_PASSWORD,
        }),
      ).rejects.toThrow("Invalid username");
      expect(usernameValidator).toHaveBeenCalledWith("admin");
    });

    it("rejects when disabled and when sign-up is disabled", async () => {
      for (const overrides of [
        { enabled: false },
        { disableSignUp: true },
      ] satisfies Partial<NativeUsernameConfig>[]) {
        const component = createMockComponent();
        const actions = nativeUsername(component, { checkBreach: false, ...overrides });
        const ctx = createContext();
        await expect(
          exec(actions.signUpUsername).handler(ctx, {
            username: "shlomo",
            password: DEFAULT_PASSWORD,
          }),
        ).rejects.toThrow(/disabled/);
      }
    });

    it("rejects an invalid email when one is attached", async () => {
      const component = createMockComponent();
      const actions = nativeUsername(component, { checkBreach: false });
      const ctx = createContext();
      await expect(
        exec(actions.signUpUsername).handler(ctx, {
          username: "shlomo",
          email: "not-an-email",
          password: DEFAULT_PASSWORD,
        }),
      ).rejects.toThrow("Invalid email");
      expect(component.identity.provisionFromIdentity).not.toHaveBeenCalled();
    });
  });

  describe("signInUsername", () => {
    async function seedCredential(password = DEFAULT_PASSWORD) {
      const credentialHash = await hashPassword(password);
      return { credentialHash };
    }

    it("signs in with valid credentials and normalizes the lookup", async () => {
      const component = createMockComponent();
      const actions = nativeUsername(component);
      const ctx = createContext();
      const { credentialHash } = await seedCredential();
      component.identity.getUserAndAccountByUsername.mockResolvedValue({
        user: makeUser(),
        identity: makeIdentity(),
        account: makeAccount(credentialHash),
      });
      component.native.sessions.createSessionAndRefreshToken.mockResolvedValue(undefined);

      const result = (await exec(actions.signInUsername).handler(ctx, {
        username: "  Shlomo ",
        password: DEFAULT_PASSWORD,
      })) as { token: string; refreshToken: string; sessionId: string };

      expect(component.identity.getUserAndAccountByUsername).toHaveBeenCalledWith({
        username: "shlomo",
      });
      expect(result.token).toBeTypeOf("string");
      expect(result.refreshToken).toBeTypeOf("string");
      expect(result.sessionId).toBeTypeOf("string");
    });

    it("rejects a wrong password with a generic error", async () => {
      const component = createMockComponent();
      const actions = nativeUsername(component);
      const ctx = createContext();
      const { credentialHash } = await seedCredential();
      component.identity.getUserAndAccountByUsername.mockResolvedValue({
        user: makeUser(),
        identity: makeIdentity(),
        account: makeAccount(credentialHash),
      });

      await expect(
        exec(actions.signInUsername).handler(ctx, {
          username: "shlomo",
          password: "wrong-password-123",
        }),
      ).rejects.toThrow("Invalid username or password");
    });

    it("rejects an unknown username with the same generic error", async () => {
      const component = createMockComponent();
      const actions = nativeUsername(component);
      const ctx = createContext();
      component.identity.getUserAndAccountByUsername.mockResolvedValue(null);

      await expect(
        exec(actions.signInUsername).handler(ctx, {
          username: "ghost",
          password: DEFAULT_PASSWORD,
        }),
      ).rejects.toThrow("Invalid username or password");
    });

    it("enforces the sign-in rate limit", async () => {
      const component = createMockComponent();
      const actions = nativeUsername(component, { rateLimit: { maxAttempts: 1 } });
      const ctx = createContext();
      component.native.rateLimits.recordAttempt.mockResolvedValue({ allowed: false });

      await expect(
        exec(actions.signInUsername).handler(ctx, {
          username: "shlomo",
          password: DEFAULT_PASSWORD,
        }),
      ).rejects.toThrow("Too many requests");
      expect(component.native.rateLimits.recordAttempt).toHaveBeenCalledWith(
        expect.objectContaining({ identifier: "sign-in:username:shlomo" }),
      );
    });

    it("rehashes an imported bcrypt credential on successful sign-in", async () => {
      const component = createMockComponent();
      const actions = nativeUsername(component);
      const ctx = createContext();
      const bcryptHash = "$2a$10$DprdJOxGXADLAHm6zgiHeeYJIMX.UqFj0gRoy7VHEhAfnX8nwxbJe"; // "hunter2!"
      const account = makeAccount(bcryptHash);
      component.identity.getUserAndAccountByUsername.mockResolvedValue({
        user: makeUser(),
        identity: makeIdentity(),
        account,
      });
      component.native.sessions.createSessionAndRefreshToken.mockResolvedValue(undefined);

      await exec(actions.signInUsername).handler(ctx, {
        username: "shlomo",
        password: "hunter2!",
      });

      expect(component.native.accounts.updateCredentialHash).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: "account_1",
          expectedCredentialHash: bcryptHash,
        }),
      );
      const newHash = component.native.accounts.updateCredentialHash.mock.calls[0][0]
        .credentialHash as string;
      expect(newHash).toMatch(/^\$argon2id\$/);
      expect(await verifyPassword("hunter2!", newHash)).toBe(true);
    });

    it("returns a two-factor challenge for a 2FA user instead of a session", async () => {
      const component = createMockComponent();
      const actions = nativeUsername(component);
      const ctx = createContext();
      const { credentialHash } = await seedCredential();
      component.identity.getUserAndAccountByUsername.mockResolvedValue({
        user: makeUser({ twoFactorEnabled: true }),
        identity: makeIdentity(),
        account: makeAccount(credentialHash),
      });

      const result = (await exec(actions.signInUsername).handler(ctx, {
        username: "shlomo",
        password: DEFAULT_PASSWORD,
      })) as { token: string | null; twoFactorChallengeToken?: string };

      expect(result.token).toBeNull();
      expect(result.twoFactorChallengeToken).toBeTypeOf("string");
      expect(component.native.codes.createVerificationCode).toHaveBeenCalledWith(
        expect.objectContaining({ type: "two_factor_pending" }),
      );
    });

    it("issues a session directly for a trusted 2FA device", async () => {
      const component = createMockComponent();
      const actions = nativeUsername(component);
      const ctx = createContext();
      const { credentialHash } = await seedCredential();
      const trustedDeviceToken = "trusted-device-token";
      component.identity.getUserAndAccountByUsername.mockResolvedValue({
        user: makeUser({ twoFactorEnabled: true }),
        identity: makeIdentity(),
        account: makeAccount(credentialHash),
      });
      component.native.codes.getVerificationCodeByTokenHash.mockResolvedValue({
        tokenHash: await hashToken(trustedDeviceToken),
        userId: "user_1",
        type: "two_factor_trusted_device",
        expiresAt: Date.now() + 60_000,
      });
      component.native.sessions.createSessionAndRefreshToken.mockResolvedValue(undefined);

      const result = (await exec(actions.signInUsername).handler(ctx, {
        username: "shlomo",
        password: DEFAULT_PASSWORD,
        trustedDeviceToken,
      })) as { token: string | null; twoFactorChallengeToken?: string };

      expect(result.token).toBeTypeOf("string");
      expect(result.twoFactorChallengeToken).toBeUndefined();
    });

    it("denies an unverified email when requireVerifiedEmail is set, allows username-only users", async () => {
      const component = createMockComponent();
      const actions = nativeUsername(component, { requireVerifiedEmail: true });
      const ctx = createContext();
      const { credentialHash } = await seedCredential();
      component.identity.getUserAndAccountByUsername.mockResolvedValue({
        user: makeUser({ email: "unverified@example.com", emailVerified: false }),
        identity: makeIdentity(),
        account: makeAccount(credentialHash),
      });

      await expect(
        exec(actions.signInUsername).handler(ctx, {
          username: "shlomo",
          password: DEFAULT_PASSWORD,
        }),
      ).rejects.toThrow("Email not verified");

      component.identity.getUserAndAccountByUsername.mockResolvedValue({
        user: makeUser({ email: undefined }),
        identity: makeIdentity(),
        account: makeAccount(credentialHash),
      });
      component.native.sessions.createSessionAndRefreshToken.mockResolvedValue(undefined);

      const result = (await exec(actions.signInUsername).handler(ctx, {
        username: "shlomo",
        password: DEFAULT_PASSWORD,
      })) as { token: string | null };
      expect(result.token).toBeTypeOf("string");
    });
  });
});
