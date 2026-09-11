import { exportJWK, generateKeyPair } from "jose";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { nativeAnonymous } from "./anonymous.js";
import type { NativeUserDoc } from "./types.js";
import type { NativeAnonymousComponentHandle } from "./anonymous.js";

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
  return undefined;
}

function createContext(identity: { subject: string } | null = null) {
  const ctx = {
    runQuery: vi.fn((ref: unknown, args: Record<string, unknown>) => dispatch(ref, args)),
    runMutation: vi.fn((ref: unknown, args: Record<string, unknown>) => dispatch(ref, args)),
    runAction: vi.fn(),
    auth: {
      getUserIdentity: vi.fn().mockResolvedValue(identity),
    },
  };
  return ctx;
}

type MockComponent = {
  [K in keyof NativeAnonymousComponentHandle]: {
    [S in keyof NativeAnonymousComponentHandle[K]]: {
      [F in keyof NativeAnonymousComponentHandle[K][S]]: ReturnType<typeof vi.fn>;
    };
  };
};

function createMockComponent(): MockComponent {
  return {
    anonymous: {
      createAnonymousUser: vi.fn().mockResolvedValue({ userId: "user_1", identityId: "identity_1" }),
      linkAnonymousUser: vi.fn().mockResolvedValue({ success: true }),
    },
    sessions: {
      createSessionAndRefreshToken: vi.fn().mockResolvedValue(undefined),
    },
    users: {
      getUserById: vi.fn().mockResolvedValue(makeUser()),
      getUserByEmail: vi.fn().mockResolvedValue(null),
    },
    accounts: {
      createAccount: vi.fn().mockResolvedValue("account_1"),
      getAccountBySubject: vi.fn().mockResolvedValue(null),
    },
    identities: {
      createIdentity: vi.fn().mockResolvedValue("identity_2"),
      getNativeIdentityByUser: vi.fn().mockResolvedValue(null),
    },
  } as unknown as MockComponent;
}

function makeUser(overrides: Partial<NativeUserDoc> = {}): NativeUserDoc {
  return {
    _id: "user_1",
    _creationTime: 0,
    email: "anon-user-1@convex-auth.anonymous",
    emailVerified: false,
    isActive: true,
    isAnonymous: true,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
  const privateJwk = await exportJWK(privateKey);
  const publicJwk = await exportJWK(publicKey);
  process.env.JWT_PRIVATE_KEY = JSON.stringify(privateJwk);
  process.env.JWKS = JSON.stringify({ keys: [publicJwk] });
  process.env.CONVEX_SITE_URL = "https://test.convex.site";
});

describe("nativeAnonymous", () => {
  it("signs in an anonymous user and returns a session", async () => {
    const component = createMockComponent();
    const auth = nativeAnonymous(component as unknown as NativeAnonymousComponentHandle, { emailDomain: "test.anonymous" });
    const { handler } = exec(auth.signInAnonymous);
    const ctx = createContext();

    const result = await handler(ctx, {});

    expect(component.anonymous.createAnonymousUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: expect.stringMatching(/@test\.anonymous$/),
        name: expect.stringMatching(/^Guest\s/),
      }),
    );
    expect(component.sessions.createSessionAndRefreshToken).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      token: expect.any(String),
      user: expect.objectContaining({
        id: "user_1",
        isAnonymous: true,
      }),
      userId: "user_1",
      identityId: "identity_1",
    });
  });

  it("links an anonymous user to an email/password account", async () => {
    const component = createMockComponent();
    component.users.getUserById.mockResolvedValue(makeUser({ isAnonymous: true }));
    component.users.getUserByEmail.mockResolvedValue(null);
    component.accounts.getAccountBySubject.mockResolvedValue(null);
    component.identities.createIdentity.mockResolvedValue("identity_2");
    const auth = nativeAnonymous(component as unknown as NativeAnonymousComponentHandle, {});
    const { handler } = exec(auth.linkAnonymousAccount);
    const ctx = createContext({ subject: "user_1" });

    const result = await handler(ctx, {
      email: "shlomo@example.com",
      password: "hunter2!",
      name: "Shlomo",
    });

    expect(component.anonymous.linkAnonymousUser).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_1",
        email: "shlomo@example.com",
        name: "Shlomo",
      }),
    );
    expect(component.accounts.createAccount).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      token: expect.any(String),
      userId: "user_1",
      identityId: "identity_2",
    });
  });

  it("throws if anonymous is not configured", () => {
    expect(() => nativeAnonymous(createMockComponent() as unknown as NativeAnonymousComponentHandle, undefined)).toThrow(
      "nativeAnonymous called without config",
    );
  });
});
