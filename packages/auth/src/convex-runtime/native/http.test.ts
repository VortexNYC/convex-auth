/// <reference types="vite/client" />

import { describe, expect, it, beforeAll, vi } from "vitest";
import { generateKeyPair, exportJWK } from "jose";
import type { HttpRouter } from "convex/server";
import { addNativeAuthHttpRoutes } from "./http.js";
import { mintToken, verifyToken } from "./jwt.js";

const SITE = "https://test.convex.site";

beforeAll(async () => {
  process.env.CONVEX_SITE_URL = SITE;
  const pair = await generateKeyPair("RS256", { extractable: true });
  process.env.JWT_PRIVATE_KEY = JSON.stringify(await exportJWK(pair.privateKey));
  process.env.JWKS = JSON.stringify({
    keys: [{ use: "sig", ...(await exportJWK(pair.publicKey)) }],
  });
});

type RouteHandler = (ctx: unknown, request: Request) => Promise<Response>;

function captureRoutes(
  component: Record<string, unknown>,
  actions?: Record<string, unknown>,
): Map<string, RouteHandler> {
  const routes = new Map<string, RouteHandler>();
  const router = {
    route: (r: { path: string; method: string; handler: { _handler: RouteHandler } }) => {
      routes.set(`${r.method} ${r.path}`, r.handler._handler);
    },
  };
  addNativeAuthHttpRoutes(router as unknown as HttpRouter, component as never, actions as never);
  return routes;
}

const SESSION_REF = "getSessionByToken_ref";
const USER_REF = "getUserById_ref";

function makeComponent() {
  return {
    native: {
      sessions: { getSessionByToken: SESSION_REF },
      users: { getUserById: USER_REF },
    },
  };
}

function makeCtx(handlers: Record<string, unknown>) {
  return {
    runQuery: vi.fn(async (ref: unknown) => handlers[ref as string] ?? null),
  };
}

const user = {
  _id: "user_1",
  email: "shlomo@example.com",
  emailVerified: true,
  createdAt: 0,
  updatedAt: 0,
};

function liveSession(token: string, overrides: Record<string, unknown> = {}) {
  return {
    _id: "session_doc_1",
    sessionId: "session_1",
    userId: "user_1",
    identityId: "identity_1",
    token,
    expiresAt: Date.now() + 60_000,
    ...overrides,
  };
}

async function sessionJwt() {
  return await mintToken("user_1", "session_1", { identityId: "identity_1" });
}

function requestWithToken(path: string, token?: string) {
  const headers: Record<string, string> = {};
  if (token !== undefined) {
    headers.cookie = `convex-auth-token=${token}`;
  }
  return new Request(`${SITE}${path}`, { headers });
}

describe("HTTP transport: /api/auth/convex/token", () => {
  const handlerFor = () => captureRoutes(makeComponent()).get("GET /api/auth/convex/token")!;

  it("rejects when the access-token cookie is absent", async () => {
    const res = await handlerFor()(makeCtx({}), requestWithToken("/api/auth/convex/token"));
    expect(res.status).toBe(401);
  });

  it("rejects a revoked session even when the JWT is valid and unexpired", async () => {
    const token = await sessionJwt();
    const ctx = makeCtx({
      [SESSION_REF]: liveSession(token, { revokedAt: Date.now() }),
      [USER_REF]: user,
    });
    const res = await handlerFor()(ctx, requestWithToken("/api/auth/convex/token", token));
    expect(res.status).toBe(401);
  });

  it("rejects when the session row's sessionId does not match the JWT claim", async () => {
    const token = await sessionJwt();
    const ctx = makeCtx({
      [SESSION_REF]: liveSession(token, { sessionId: "session_OTHER" }),
      [USER_REF]: user,
    });
    const res = await handlerFor()(ctx, requestWithToken("/api/auth/convex/token", token));
    expect(res.status).toBe(401);
  });

  it("round-trips a live session into a fresh Convex token", async () => {
    const token = await sessionJwt();
    const ctx = makeCtx({
      [SESSION_REF]: liveSession(token),
      [USER_REF]: user,
    });
    const res = await handlerFor()(ctx, requestWithToken("/api/auth/convex/token", token));
    expect(res.status).toBe(200);

    const body = (await res.json()) as { token: string };
    const payload = await verifyToken(body.token);
    expect(payload.sub).toBe("user_1");
    expect(payload.sessionId).toBe("session_1");
    expect(payload.identityId).toBe("identity_1");
  });
});

describe("HTTP transport: /api/auth/session", () => {
  const handlerFor = () => captureRoutes(makeComponent()).get("GET /api/auth/session")!;

  it("resolves a revoked session as unauthenticated despite a valid JWT", async () => {
    const token = await sessionJwt();
    const ctx = makeCtx({
      [SESSION_REF]: liveSession(token, { revokedAt: Date.now() }),
      [USER_REF]: user,
    });
    const res = await handlerFor()(ctx, requestWithToken("/api/auth/session", token));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ user: null, sessionId: null });
  });

  it("resolves a live session to the user", async () => {
    const token = await sessionJwt();
    const ctx = makeCtx({
      [SESSION_REF]: liveSession(token),
      [USER_REF]: user,
    });
    const res = await handlerFor()(ctx, requestWithToken("/api/auth/session", token));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ sessionId: "session_1" });
  });
});

describe("HTTP transport: /api/auth/sign-in session mint", () => {
  it("writes the minted token pair to cookies and the response body", async () => {
    const session = {
      token: await sessionJwt(),
      refreshToken: "refresh-token-value",
      userId: "user_1",
      sessionId: "session_1",
    };
    const signIn = vi.fn(async () => session);
    const routes = captureRoutes(makeComponent(), { signIn });
    const handler = routes.get("POST /api/auth/sign-in")!;

    const request = new Request(`${SITE}/api/auth/sign-in`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "shlomo@example.com", password: "pw", rememberMe: true }),
    });
    const res = await handler(makeCtx({}), request);
    expect(res.status).toBe(200);

    const cookies = res.headers.getSetCookie();
    expect(cookies.some((c) => c.startsWith("convex-auth-token="))).toBe(true);
    expect(cookies.some((c) => c.startsWith("convex-auth-refresh-token=refresh-token-value"))).toBe(
      true,
    );

    const body = (await res.json()) as { token: string; refreshToken: string };
    expect(body.refreshToken).toBe("refresh-token-value");
    const payload = await verifyToken(body.token);
    expect(payload.sessionId).toBe("session_1");
  });

  it("writes the 2FA pending token to its cookie when sign-in returns a challenge", async () => {
    const session = {
      token: null,
      refreshToken: null,
      userId: "user_1",
      twoFactorRedirect: true,
      twoFactorChallengeToken: "pending-token-value",
      twoFactorCookieMaxAgeMs: 300_000,
    };
    const signIn = vi.fn(async () => session);
    const routes = captureRoutes(makeComponent(), { signIn });
    const handler = routes.get("POST /api/auth/sign-in")!;

    const request = new Request(`${SITE}/api/auth/sign-in`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "shlomo@example.com", password: "pw" }),
    });
    const res = await handler(makeCtx({}), request);
    expect(res.status).toBe(200);

    const cookies = res.headers.getSetCookie();
    const pending = cookies.find((c) => c.startsWith("convex-auth-two-factor="));
    expect(pending).toBeDefined();
    expect(pending).toContain("pending-token-value");
    expect(pending).toContain("Max-Age=300");

    const body = (await res.json()) as { twoFactorChallengeToken: string };
    expect(body.twoFactorChallengeToken).toBe("pending-token-value");
  });
});

describe("HTTP transport: /api/auth/magic-link/verify", () => {
  it("echoes the session's landingVerifier onto the landing URL", async () => {
    const verifyMagicLink = vi.fn(async () => ({
      token: await sessionJwt(),
      refreshToken: "refresh-token-value",
      sessionId: "session_1",
      userId: "user_1",
      landingVerifier: "lv-bound",
    }));
    const routes = captureRoutes(makeComponent(), { verifyMagicLink });
    const handler = routes.get("GET /api/auth/magic-link/verify")!;

    const res = await handler(
      makeCtx({}),
      new Request(`${SITE}/api/auth/magic-link/verify?token=tok&callbackURL=/dash`),
    );
    expect(res.status).toBe(302);
    const landing = new URL(res.headers.get("Location")!);
    expect(landing.searchParams.get("landingVerifier")).toBe("lv-bound");
    expect(landing.searchParams.get("token")).toBeTruthy();
    expect(verifyMagicLink.mock.calls[0][1]).not.toHaveProperty("landingVerifier");
  });

  it("omits landingVerifier from the landing URL when none was bound", async () => {
    const verifyMagicLink = vi.fn(async () => ({
      token: await sessionJwt(),
      refreshToken: "refresh-token-value",
      sessionId: "session_1",
      userId: "user_1",
    }));
    const routes = captureRoutes(makeComponent(), { verifyMagicLink });
    const handler = routes.get("GET /api/auth/magic-link/verify")!;

    const res = await handler(
      makeCtx({}),
      new Request(`${SITE}/api/auth/magic-link/verify?token=tok&callbackURL=/dash`),
    );
    const landing = new URL(res.headers.get("Location")!);
    expect(landing.searchParams.has("landingVerifier")).toBe(false);
  });

  it("rejects unvalidated errorCallbackURL and newUserCallbackURL origins", async () => {
    const verifyMagicLink = vi.fn(async () => ({
      token: await sessionJwt(),
      refreshToken: "refresh-token-value",
      sessionId: "session_1",
      userId: "user_1",
    }));
    const routes = captureRoutes(makeComponent(), { verifyMagicLink });
    const handler = routes.get("GET /api/auth/magic-link/verify")!;

    const badError = await handler(
      makeCtx({}),
      new Request(
        `${SITE}/api/auth/magic-link/verify?token=tok&callbackURL=/dash&errorCallbackURL=` +
          encodeURIComponent("https://evil.example.com/fake-error"),
      ),
    );
    expect(badError.status).toBe(400);

    const badNewUser = await handler(
      makeCtx({}),
      new Request(
        `${SITE}/api/auth/magic-link/verify?token=tok&callbackURL=/dash&newUserCallbackURL=` +
          encodeURIComponent("https://evil.example.com/welcome"),
      ),
    );
    expect(badNewUser.status).toBe(400);
    expect(verifyMagicLink).not.toHaveBeenCalled();
  });

  it("rejects a protocol-relative callbackURL — it resolves cross-origin", async () => {
    const verifyMagicLink = vi.fn();
    const routes = captureRoutes(makeComponent(), { verifyMagicLink });
    const handler = routes.get("GET /api/auth/magic-link/verify")!;

    const res = await handler(
      makeCtx({}),
      new Request(
        `${SITE}/api/auth/magic-link/verify?token=tok&callbackURL=` +
          encodeURIComponent("//evil.example.com/dash"),
      ),
    );
    expect(res.status).toBe(400);
    expect(verifyMagicLink).not.toHaveBeenCalled();
  });

  it("lands new users on newUserCallbackURL when the session was created", async () => {
    const verifyMagicLink = vi.fn(async () => ({
      token: await sessionJwt(),
      refreshToken: "refresh-token-value",
      sessionId: "session_1",
      userId: "user_1",
      createdUser: true,
    }));
    const routes = captureRoutes(makeComponent(), { verifyMagicLink });
    const handler = routes.get("GET /api/auth/magic-link/verify")!;

    const res = await handler(
      makeCtx({}),
      new Request(
        `${SITE}/api/auth/magic-link/verify?token=tok&callbackURL=/dash&newUserCallbackURL=/welcome`,
      ),
    );
    expect(res.status).toBe(302);
    const landing = new URL(res.headers.get("Location")!);
    expect(landing.pathname).toBe("/welcome");
    expect(landing.searchParams.get("token")).toBeTruthy();
  });
});

describe("HTTP transport: username routes", () => {
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    new Request(`${SITE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

  it("does not register username routes when the actions are absent", () => {
    const routes = captureRoutes(makeComponent());
    expect(routes.has("POST /api/auth/sign-up/username")).toBe(false);
    expect(routes.has("POST /api/auth/sign-in/username")).toBe(false);
  });

  it("sign-up/username forwards parsed args and writes session cookies", async () => {
    const session = {
      token: await sessionJwt(),
      refreshToken: "refresh-token-value",
      userId: "user_1",
      sessionId: "session_1",
    };
    const signUpUsername = vi.fn(async () => session);
    const routes = captureRoutes(makeComponent(), { signUpUsername });
    const handler = routes.get("POST /api/auth/sign-up/username")!;

    const res = await handler(
      makeCtx({}),
      post(
        "/api/auth/sign-up/username",
        { username: "Shlomo_K", password: "pw", displayUsername: "Shlomo_K" },
        { "x-captcha-response": "captcha-token" },
      ),
    );
    expect(res.status).toBe(200);
    expect(signUpUsername).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        username: "Shlomo_K",
        password: "pw",
        displayUsername: "Shlomo_K",
        captchaToken: "captcha-token",
      }),
    );
    const cookies = res.headers.getSetCookie();
    expect(cookies.some((c) => c.startsWith("convex-auth-token="))).toBe(true);
    expect(cookies.some((c) => c.startsWith("convex-auth-refresh-token=refresh-token-value"))).toBe(
      true,
    );
  });

  it("sign-up/username rejects a malformed body with invalid_body", async () => {
    const signUpUsername = vi.fn();
    const routes = captureRoutes(makeComponent(), { signUpUsername });
    const handler = routes.get("POST /api/auth/sign-up/username")!;

    const res = await handler(makeCtx({}), post("/api/auth/sign-up/username", { username: 42 }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ success: false, reason: "invalid_body" });
    expect(signUpUsername).not.toHaveBeenCalled();
  });

  it("sign-up/username maps 'Username is already taken' to username_already_taken", async () => {
    const signUpUsername = vi.fn(async () => {
      throw new Error("Username is already taken");
    });
    const routes = captureRoutes(makeComponent(), { signUpUsername });
    const handler = routes.get("POST /api/auth/sign-up/username")!;

    const res = await handler(
      makeCtx({}),
      post("/api/auth/sign-up/username", { username: "taken", password: "pw" }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "username_already_taken" });
  });

  it("sign-in/username writes session cookies and forwards the trusted-device cookie", async () => {
    const session = {
      token: await sessionJwt(),
      refreshToken: "refresh-token-value",
      userId: "user_1",
      sessionId: "session_1",
    };
    const signInUsername = vi.fn(async () => session);
    const routes = captureRoutes(makeComponent(), { signInUsername });
    const handler = routes.get("POST /api/auth/sign-in/username")!;

    const res = await handler(
      makeCtx({}),
      post(
        "/api/auth/sign-in/username",
        { username: "shlomo", password: "pw" },
        { cookie: "convex-auth-trusted-device=device-token", origin: SITE },
      ),
    );
    expect(res.status).toBe(200);
    expect(signInUsername).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ username: "shlomo", trustedDeviceToken: "device-token" }),
    );
    expect(res.headers.getSetCookie().some((c) => c.startsWith("convex-auth-token="))).toBe(true);
  });

  it("sign-in/username maps 'Invalid username or password' to a 401", async () => {
    const signInUsername = vi.fn(async () => {
      throw new Error("Invalid username or password");
    });
    const routes = captureRoutes(makeComponent(), { signInUsername });
    const handler = routes.get("POST /api/auth/sign-in/username")!;

    const res = await handler(
      makeCtx({}),
      post("/api/auth/sign-in/username", { username: "shlomo", password: "wrong" }),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "invalid_username_or_password" });
  });
});

describe("HTTP transport: /api/auth/two-factor error mapping", () => {
  const postWithPending = (path: string, body: unknown) =>
    new Request(`${SITE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: "convex-auth-two-factor=pending-token",
        origin: SITE,
      },
      body: JSON.stringify(body),
    });

  it("verify-totp maps 'Invalid two factor code' to a 401, not 500", async () => {
    const twoFactorVerifyTOTP = vi.fn(async () => {
      throw new Error("Invalid two factor code");
    });
    const routes = captureRoutes(makeComponent(), { twoFactorVerifyTOTP });
    const handler = routes.get("POST /api/auth/two-factor/verify-totp")!;

    const res = await handler(
      makeCtx({}),
      postWithPending("/api/auth/two-factor/verify-totp", { code: "000000" }),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "invalid_two_factor_code" });
  });

  it("verify-totp maps 'Unauthorized' to a 401 and 'Not enrolled' to a 400", async () => {
    for (const [message, status, code] of [
      ["Unauthorized", 401, "unauthorized"],
      ["Not enrolled", 400, "two_factor_not_enrolled"],
    ] as const) {
      const twoFactorVerifyTOTP = vi.fn(async () => {
        throw new Error(message);
      });
      const routes = captureRoutes(makeComponent(), { twoFactorVerifyTOTP });
      const handler = routes.get("POST /api/auth/two-factor/verify-totp")!;

      const res = await handler(
        makeCtx({}),
        postWithPending("/api/auth/two-factor/verify-totp", { code: "000000" }),
      );
      expect(res.status).toBe(status);
      expect(await res.json()).toMatchObject({ code });
    }
  });

  it("verify-backup-code maps 'Invalid two factor token' and 'Invalid two factor code' to 401s", async () => {
    for (const [message, code] of [
      ["Invalid two factor token", "invalid_two_factor_token"],
      ["Invalid two factor code", "invalid_two_factor_code"],
    ] as const) {
      const twoFactorVerifyBackupCode = vi.fn(async () => {
        throw new Error(message);
      });
      const routes = captureRoutes(makeComponent(), { twoFactorVerifyBackupCode });
      const handler = routes.get("POST /api/auth/two-factor/verify-backup-code")!;

      const res = await handler(
        makeCtx({}),
        postWithPending("/api/auth/two-factor/verify-backup-code", { code: "abcd-efgh" }),
      );
      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({ code });
    }
  });

  it("unknown errors still surface as 500 unknown", async () => {
    const twoFactorVerifyTOTP = vi.fn(async () => {
      throw new Error("database on fire");
    });
    const routes = captureRoutes(makeComponent(), { twoFactorVerifyTOTP });
    const handler = routes.get("POST /api/auth/two-factor/verify-totp")!;

    const res = await handler(
      makeCtx({}),
      postWithPending("/api/auth/two-factor/verify-totp", { code: "000000" }),
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ code: "unknown" });
  });
});
