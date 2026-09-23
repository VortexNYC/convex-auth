import { exportJWK, generateKeyPair } from "jose";
import type { HttpRouter } from "convex/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { addNativeAuthHttpRoutes } from "./http.js";
import { mintToken } from "./jwt.js";
import { nativeAuthQueries } from "./queries.js";
import type { NativeEmailAndPasswordFunctionReferences } from "./provider.js";
import type { NativeEmailAndPasswordComponentHandle } from "./types.js";

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

async function setupTestKeys() {
  const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
  const privateJwk = await exportJWK(privateKey);
  const publicJwk = await exportJWK(publicKey);
  process.env.JWT_PRIVATE_KEY = JSON.stringify(privateJwk);
  process.env.JWKS = JSON.stringify({ keys: [publicJwk] });
  process.env.CONVEX_SITE_URL = "https://test.convex.site";
}

type MockComponent = NativeEmailAndPasswordComponentHandle & {
  native: {
    users: {
      getUserById: ReturnType<typeof vi.fn>;
    };
    sessions: {
      getSessionByToken: ReturnType<typeof vi.fn>;
    };
    codes: {
      getVerificationCodeByTokenHash: ReturnType<typeof vi.fn>;
    };
  };
};

function createMockComponent(): MockComponent {
  return {
    identity: {
      provisionFromIdentity: vi.fn(),
      getUserAndAccount: vi.fn(),
      verifyEmail: vi.fn(),
      resetPassword: vi.fn(),
    } as unknown as NativeEmailAndPasswordComponentHandle["identity"],
    native: {
      accounts: {} as unknown as NativeEmailAndPasswordComponentHandle["native"]["accounts"],
      users: {
        getUserByEmail: vi.fn(),
        getUserById: vi.fn(),
        markEmailVerified: vi.fn(),
      },
      identities: {
        getNativeIdentityByUser: vi.fn(),
        markEmailVerified: vi.fn(),
      } as unknown as NativeEmailAndPasswordComponentHandle["native"]["identities"],
      sessions: {
        createSession: vi.fn(),
        revokeSession: vi.fn(),
        listSessionsByUser: vi.fn(),
        getSessionByToken: vi.fn(),
        getSessionBySessionId: vi.fn(),
        revokeSessionsForUser: vi.fn(),
      },
      refreshTokens: {
        createRefreshToken: vi.fn(),
        getRefreshTokenByTokenHash: vi.fn(),
        consumeRefreshToken: vi.fn(),
        revokeRefreshTokensForSession: vi.fn(),
        revokeRefreshTokensForUser: vi.fn(),
      },
      codes: {
        createVerificationCode: vi.fn(),
        getVerificationCodeByTokenHash: vi.fn(),
        consumeVerificationCode: vi.fn(),
        revokeVerificationCodesForUser: vi.fn(),
      },
    },
  } as unknown as MockComponent;
}

function createContext(authIdentity?: {
  tokenIdentifier: string;
  issuer: string;
  subject: string;
}) {
  return {
    auth: {
      getUserIdentity: vi.fn().mockResolvedValue(authIdentity ?? null),
    },
    runQuery: vi.fn(
      (ref: (args: Record<string, unknown>) => unknown, args: Record<string, unknown>) => ref(args),
    ),
    runMutation: vi.fn(
      (ref: (args: Record<string, unknown>) => unknown, args: Record<string, unknown>) => ref(args),
    ),
    runAction: vi.fn(
      (ref: (args: Record<string, unknown>) => unknown, args: Record<string, unknown>) => ref(args),
    ),
    db: {},
  };
}

describe("nativeAuthQueries", () => {
  beforeAll(setupTestKeys);

  it("verifySession returns the user and session id for a valid token", async () => {
    const component = createMockComponent();
    const user = {
      _id: "user_1",
      email: "shlomo@example.com",
      name: "Shlomo",
      emailVerified: true,
      createdAt: 0,
      updatedAt: 0,
    };
    component.native.users.getUserById.mockResolvedValue(user);
    component.native.sessions.getSessionByToken.mockResolvedValue({
      _id: "session_doc_1",
      sessionId: "session_1",
      userId: "user_1",
      token: "the-token",
      expiresAt: Date.now() + 60_000,
    });

    const { verifySession } = nativeAuthQueries(component);
    const { handler } = exec(verifySession);

    const token = await mintToken("user_1", "session_1");
    const result = (await handler(createContext(), { token })) as {
      user?: { id: string };
      sessionId?: string;
    };
    expect(result.user).toEqual({
      id: "user_1",
      email: "shlomo@example.com",
      name: "Shlomo",
      emailVerified: true,
      twoFactorEnabled: false,
      isActive: true,
      createdAt: 0,
      updatedAt: 0,
    });
    expect(result.sessionId).toBe("session_1");
  });

  it("verifySession returns an empty object for a missing session", async () => {
    const component = createMockComponent();
    component.native.sessions.getSessionByToken.mockResolvedValue(null);

    const { verifySession } = nativeAuthQueries(component);
    const { handler } = exec(verifySession);

    const token = await mintToken("user_1", "session_1");
    const result = await handler(createContext(), { token });
    expect(result).toEqual({});
  });

  it("verifySession returns an empty object for an invalid token", async () => {
    const component = createMockComponent();

    const { verifySession } = nativeAuthQueries(component);
    const { handler } = exec(verifySession);

    const result = await handler(createContext(), { token: "not-a-token" });
    expect(result).toEqual({});
  });

  it("isAuthenticated returns true when ctx.auth resolves an identity", async () => {
    const component = createMockComponent();
    const { isAuthenticated } = nativeAuthQueries(component);
    const { handler } = exec(isAuthenticated);
    const result = await handler(
      createContext({
        tokenIdentifier: "tid",
        issuer: "https://test.convex.site",
        subject: "user_1",
      }),
      {},
    );
    expect(result).toBe(true);
  });

  it("isAuthenticated returns false when ctx.auth resolves null", async () => {
    const component = createMockComponent();
    const { isAuthenticated } = nativeAuthQueries(component);
    const { handler } = exec(isAuthenticated);
    const result = await handler(createContext(), {});
    expect(result).toBe(false);
  });
});

describe("addNativeAuthHttpRoutes", () => {
  beforeAll(setupTestKeys);

  it("serves /.well-known/jwks.json", async () => {
    const routes: {
      path: string;
      method: string;
      handler: (ctx: unknown, request: Request) => Promise<Response>;
    }[] = [];
    const http: HttpRouter = {
      route: (r) => {
        routes.push(r);
        return http;
      },
    } as unknown as HttpRouter;

    addNativeAuthHttpRoutes(http);
    const jwksRoute = routes.find((r) => r.path === "/.well-known/jwks.json" && r.method === "GET");
    expect(jwksRoute).toBeDefined();

    const response = await exec(jwksRoute!.handler).handler(
      createContext(),
      new Request("http://localhost/.well-known/jwks.json"),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { keys: unknown[] };
    expect(body.keys).toBeInstanceOf(Array);
  });

  it("verifies an email and redirects when callbackURL is provided", async () => {
    const component = createMockComponent();
    const token = "verify-token";
    component.identity.verifyEmail.mockResolvedValue({ success: true });

    const routes: {
      path: string;
      method: string;
      handler: (ctx: unknown, request: Request) => Promise<Response>;
    }[] = [];
    const http: HttpRouter = {
      route: (r) => {
        routes.push(r);
        return http;
      },
    } as unknown as HttpRouter;

    const callbackURL = "https://app.example.com/welcome";
    addNativeAuthHttpRoutes(http, component, undefined, { trustedOrigins: [callbackURL] });
    const verifyRoute = routes.find(
      (r) => r.path === "/api/auth/verify-email" && r.method === "GET",
    );
    expect(verifyRoute).toBeDefined();

    const response = await exec(verifyRoute!.handler).handler(
      createContext(),
      new Request(
        "https://api.example.com/api/auth/verify-email?token=" +
          encodeURIComponent(token) +
          "&callbackURL=" +
          encodeURIComponent(callbackURL),
      ),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(callbackURL + "?token=" + token);
    expect(component.identity.verifyEmail).toHaveBeenCalledWith({
      tokenHash: expect.any(String),
      provider: "password",
      issuer: "native",
    });
  });

  it("redirects a valid reset token to the callback URL with the token", async () => {
    const component = createMockComponent();
    component.native.codes.getVerificationCodeByTokenHash.mockResolvedValue({
      _id: "code_1",
      tokenHash: "hashed",
      userId: "user_1",
      type: "password_reset",
      expiresAt: Date.now() + 60_000,
    });
    const routes: {
      path?: string;
      pathPrefix?: string;
      method: string;
      handler: (ctx: unknown, request: Request) => Promise<Response>;
    }[] = [];
    const http: HttpRouter = {
      route: (r) => {
        routes.push(r as any);
        return http;
      },
    } as unknown as HttpRouter;

    const callbackURL = "https://app.example.com/reset";
    addNativeAuthHttpRoutes(http, component, undefined, { trustedOrigins: [callbackURL] });
    const resetRoute = routes.find(
      (r) => r.pathPrefix === "/api/auth/reset-password/" && r.method === "GET",
    );
    expect(resetRoute).toBeDefined();

    const response = await exec(resetRoute!.handler).handler(
      createContext(),
      new Request(
        "https://api.example.com/api/auth/reset-password/the-token?callbackURL=" +
          encodeURIComponent(callbackURL),
      ),
    );
    expect(response.status).toBe(302);
    const location = response.headers.get("Location");
    expect(location).toBe(callbackURL + "?token=the-token");
  });

  it("redirects an invalid reset token to the callback URL with an error", async () => {
    const component = createMockComponent();
    component.native.codes.getVerificationCodeByTokenHash.mockResolvedValue(null);
    const routes: {
      path?: string;
      pathPrefix?: string;
      method: string;
      handler: (ctx: unknown, request: Request) => Promise<Response>;
    }[] = [];
    const http: HttpRouter = {
      route: (r) => {
        routes.push(r as any);
        return http;
      },
    } as unknown as HttpRouter;

    const callbackURL = "https://app.example.com/reset";
    addNativeAuthHttpRoutes(http, component, undefined, { trustedOrigins: [callbackURL] });
    const resetRoute = routes.find(
      (r) => r.pathPrefix === "/api/auth/reset-password/" && r.method === "GET",
    );
    expect(resetRoute).toBeDefined();

    const response = await exec(resetRoute!.handler).handler(
      createContext(),
      new Request(
        "https://api.example.com/api/auth/reset-password/bad-token?callbackURL=" +
          encodeURIComponent(callbackURL),
      ),
    );
    expect(response.status).toBe(302);
    const location = response.headers.get("Location");
    expect(location).toBe(callbackURL + "?error=INVALID_TOKEN");
  });

  it("rejects a reset callbackURL with an untrusted origin", async () => {
    const component = createMockComponent();
    const routes: {
      path?: string;
      pathPrefix?: string;
      method: string;
      handler: (ctx: unknown, request: Request) => Promise<Response>;
    }[] = [];
    const http: HttpRouter = {
      route: (r) => {
        routes.push(r as any);
        return http;
      },
    } as unknown as HttpRouter;

    addNativeAuthHttpRoutes(http, component, undefined, {
      trustedOrigins: ["https://app.example.com"],
    });
    const resetRoute = routes.find(
      (r) => r.pathPrefix === "/api/auth/reset-password/" && r.method === "GET",
    );
    expect(resetRoute).toBeDefined();

    const response = await exec(resetRoute!.handler).handler(
      createContext(),
      new Request(
        "https://api.example.com/api/auth/reset-password/the-token?callbackURL=" +
          encodeURIComponent("https://evil.example.com/callback"),
      ),
    );
    expect(response.status).toBe(400);
  });

  it("rejects a sign-out callbackURL with an untrusted origin", async () => {
    const component = createMockComponent();
    const routes: {
      path?: string;
      pathPrefix?: string;
      method: string;
      handler: (ctx: unknown, request: Request) => Promise<Response>;
    }[] = [];
    const http: HttpRouter = {
      route: (r) => {
        routes.push(r as any);
        return http;
      },
    } as unknown as HttpRouter;

    addNativeAuthHttpRoutes(
      http,
      component,
      { signOut: vi.fn() } as unknown as NativeEmailAndPasswordFunctionReferences,
      { trustedOrigins: ["https://app.example.com"] },
    );
    const signOutRoute = routes.find((r) => r.path === "/api/auth/sign-out" && r.method === "POST");
    expect(signOutRoute).toBeDefined();

    const response = await exec(signOutRoute!.handler).handler(
      createContext(),
      new Request("https://api.example.com/api/auth/sign-out", {
        method: "POST",
        body: JSON.stringify({
          callbackURL: "https://evil.example.com/signed-out",
        }),
      }),
    );
    expect(response.status).toBe(400);
  });

  it("allows same-origin POST sign-in requests", async () => {
    const component = createMockComponent();
    const routes: {
      path?: string;
      pathPrefix?: string;
      method: string;
      handler: (ctx: unknown, request: Request) => Promise<Response>;
    }[] = [];
    const http: HttpRouter = {
      route: (r) => {
        routes.push(r as any);
        return http;
      },
    } as unknown as HttpRouter;

    addNativeAuthHttpRoutes(
      http,
      component,
      {
        signIn: vi.fn(() => ({
          token: "token",
          user: { id: "user_1", email: "shlomo@example.com", emailVerified: true },
        })),
      } as unknown as NativeEmailAndPasswordFunctionReferences,
      { trustedOrigins: ["https://app.example.com"] },
    );
    const signInRoute = routes.find((r) => r.path === "/api/auth/sign-in" && r.method === "POST");
    expect(signInRoute).toBeDefined();

    const response = await exec(signInRoute!.handler).handler(
      createContext(),
      new Request("https://api.example.com/api/auth/sign-in", {
        method: "POST",
        headers: { origin: "https://api.example.com" },
        body: JSON.stringify({ email: "shlomo@example.com", password: "password" }),
      }),
    );
    expect(response.status).toBe(200);
  });

  it("blocks cross-site navigate POST sign-in attempts", async () => {
    const component = createMockComponent();
    const routes: {
      path?: string;
      pathPrefix?: string;
      method: string;
      handler: (ctx: unknown, request: Request) => Promise<Response>;
    }[] = [];
    const http: HttpRouter = {
      route: (r) => {
        routes.push(r as any);
        return http;
      },
    } as unknown as HttpRouter;

    addNativeAuthHttpRoutes(
      http,
      component,
      {
        signIn: vi.fn(() => ({
          token: "token",
          user: { id: "user_1", email: "shlomo@example.com", emailVerified: true },
        })),
      } as unknown as NativeEmailAndPasswordFunctionReferences,
      { trustedOrigins: ["https://app.example.com"] },
    );
    const signInRoute = routes.find((r) => r.path === "/api/auth/sign-in" && r.method === "POST");
    expect(signInRoute).toBeDefined();

    const response = await exec(signInRoute!.handler).handler(
      createContext(),
      new Request("https://api.example.com/api/auth/sign-in", {
        method: "POST",
        headers: {
          "sec-fetch-site": "cross-site",
          "sec-fetch-mode": "navigate",
          "sec-fetch-dest": "document",
        },
        body: JSON.stringify({ email: "shlomo@example.com", password: "password" }),
      }),
    );
    expect(response.status).toBe(403);
  });

  it("blocks same-site POSTs from an untrusted sibling origin", async () => {
    const component = createMockComponent();
    const routes: {
      path?: string;
      pathPrefix?: string;
      method: string;
      handler: (ctx: unknown, request: Request) => Promise<Response>;
    }[] = [];
    const http: HttpRouter = {
      route: (r) => {
        routes.push(r as any);
        return http;
      },
    } as unknown as HttpRouter;

    addNativeAuthHttpRoutes(
      http,
      component,
      {
        signIn: vi.fn(() => ({
          token: "token",
          user: { id: "user_1", email: "shlomo@example.com", emailVerified: true },
        })),
      } as unknown as NativeEmailAndPasswordFunctionReferences,
      { trustedOrigins: ["https://app.example.com"] },
    );
    const signInRoute = routes.find((r) => r.path === "/api/auth/sign-in" && r.method === "POST");
    expect(signInRoute).toBeDefined();

    // A same-site sibling (subdomain) is still cross-origin to us — our
    // SameSite=Lax cookies flow on the request, so the Origin must validate
    // exactly like a cross-site POST. `same-site` was previously trusted
    // unconditionally, letting any sibling mint sessions into the victim's
    // cookies (login CSRF).
    const hostile = await exec(signInRoute!.handler).handler(
      createContext(),
      new Request("https://api.example.com/api/auth/sign-in", {
        method: "POST",
        headers: {
          "sec-fetch-site": "same-site",
          origin: "https://evil.example.com",
          cookie: "convex-auth-token=x",
        },
        body: JSON.stringify({ email: "shlomo@example.com", password: "password" }),
      }),
    );
    expect(hostile.status).toBe(403);

    // Trusted sibling origins still pass.
    const trusted = await exec(signInRoute!.handler).handler(
      createContext(),
      new Request("https://api.example.com/api/auth/sign-in", {
        method: "POST",
        headers: {
          "sec-fetch-site": "same-site",
          origin: "https://app.example.com",
        },
        body: JSON.stringify({ email: "shlomo@example.com", password: "password" }),
      }),
    );
    expect(trusted.status).toBe(200);

    // Browsers always send Origin on cross-origin POSTs — a same-site POST
    // with no origin signal at all is a forged-metadata client, not a page.
    const noOrigin = await exec(signInRoute!.handler).handler(
      createContext(),
      new Request("https://api.example.com/api/auth/sign-in", {
        method: "POST",
        headers: { "sec-fetch-site": "same-site" },
        body: JSON.stringify({ email: "shlomo@example.com", password: "password" }),
      }),
    );
    expect(noOrigin.status).toBe(403);
  });

  it("rejects contradictory metadata — same-site claim with a foreign Origin", async () => {
    const component = createMockComponent();
    const routes: {
      path?: string;
      pathPrefix?: string;
      method: string;
      handler: (ctx: unknown, request: Request) => Promise<Response>;
    }[] = [];
    const http: HttpRouter = {
      route: (r) => {
        routes.push(r as any);
        return http;
      },
    } as unknown as HttpRouter;

    addNativeAuthHttpRoutes(
      http,
      component,
      {
        signIn: vi.fn(() => ({
          token: "token",
          user: { id: "user_1", email: "shlomo@example.com", emailVerified: true },
        })),
      } as unknown as NativeEmailAndPasswordFunctionReferences,
      { trustedOrigins: ["https://app.example.com"] },
    );
    const signInRoute = routes.find((r) => r.path === "/api/auth/sign-in" && r.method === "POST");

    // No browser can produce `same-origin` + a foreign Origin — a client
    // sending contradictory headers fails closed rather than trusting the
    // weaker signal.
    const response = await exec(signInRoute!.handler).handler(
      createContext(),
      new Request("https://api.example.com/api/auth/sign-in", {
        method: "POST",
        headers: {
          "sec-fetch-site": "same-origin",
          origin: "https://evil.example.com",
        },
        body: JSON.stringify({ email: "shlomo@example.com", password: "password" }),
      }),
    );
    expect(response.status).toBe(403);
  });
});
