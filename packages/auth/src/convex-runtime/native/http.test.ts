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

// Captures every registered route so handlers can be invoked with a real
// Request — the same code path the HTTP transport exercises, minus TCP.
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
    // Structurally valid, unexpired JWT — but the session row is revoked.
    // The HTTP surface must stay revocation-aware, not just JWT-aware.
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
    // The minted token carries the session's identity through the transport.
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
    // The pending token must survive as a cookie — this is the transport the
    // SSR proxy relies on to substitute the challenge server-side.
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
    // The verify action is called without a verifier — the site route cannot
    // see the app cookie, so the boundary enforces it downstream.
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

    // An error-path redirect target is attacker-controllable too — it must
    // pass the same allowlist as the success target.
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

    // `//evil.example.com` is not `startsWith("http")` yet resolves to an
    // attacker origin — the allowlist must compare resolved origins.
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
