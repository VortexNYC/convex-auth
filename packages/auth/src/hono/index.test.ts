import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FunctionReference } from "convex/server";
import {
  convexAuthCookieState,
  convexAuthMiddleware,
  convexAuthProxyHandler,
  getAuthServerState,
  getConvexAuthSession,
  getConvexAuthToken,
  type ConvexAuthHonoOptions,
} from "./index.js";
import type { AuthTransport } from "../ssr/transport.js";

const actionRef = (name: string) =>
  name as unknown as FunctionReference<"action" | "query", "public">;

const actions = {
  signIn: actionRef("auth:signIn") as FunctionReference<"action", "public">,
  signUp: actionRef("auth:signUp") as FunctionReference<"action", "public">,
  signOut: actionRef("auth:signOut") as FunctionReference<"action", "public">,
  updateSession: actionRef("auth:updateSession") as FunctionReference<"action", "public">,
  verifySession: actionRef("auth:verifySession") as FunctionReference<"query", "public">,
};

const transport: AuthTransport = {
  query: vi.fn(),
  action: vi.fn(),
};
const actionMock = vi.mocked(transport.action);
const queryMock = vi.mocked(transport.query);

const options: ConvexAuthHonoOptions = { actions: actions as never, transport };

function jwt(exp: number, iat: number): string {
  const payload = Buffer.from(JSON.stringify({ exp, iat })).toString("base64url");
  return `h.${payload}.s`;
}

function createApp(opts: ConvexAuthHonoOptions = options) {
  const app = new Hono();
  app.use("*", convexAuthMiddleware(opts));
  app.get("/dash", (c) => c.text("page"));
  app.get("/elsewhere", (c) => c.text("redirected-page"));
  app.get("/session", async (c) => {
    const session = await getConvexAuthSession(c, { actions, transport });
    return c.json(session);
  });
  app.get("/token", (c) => c.json({ token: getConvexAuthToken(c) }));
  app.get("/cookie-state", (c) => c.json(convexAuthCookieState(c)));
  app.get("/server-state", async (c) => {
    const state = await getAuthServerState(c, { actions, transport });
    return c.json(state);
  });
  return app;
}

beforeEach(() => {
  actionMock.mockReset();
  queryMock.mockReset();
});

describe("convexAuthMiddleware", () => {
  it("intercepts apiRoute POSTs and returns the proxy response", async () => {
    actionMock.mockResolvedValue({ token: "t", refreshToken: "r" });
    const res = await createApp().request("https://app.example.com/api/auth", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        host: "app.example.com",
        origin: "https://app.example.com",
      },
      body: JSON.stringify({ intent: "signIn", args: {} }),
    });
    expect(res.status).toBe(200);
    expect(actionMock).toHaveBeenCalledWith(actions.signIn, {}, {});
    expect(
      res.headers.getSetCookie().find((h) => h.startsWith("__Host-__convexAuthToken=t")),
    ).toBeDefined();
    // The downstream route must not have run — the proxy response is terminal.
    expect(await res.text()).not.toBe("page");
  });

  it("honors a custom apiRoute", async () => {
    actionMock.mockResolvedValue({ token: "t", refreshToken: "r" });
    const res = await createApp({ ...options, apiRoute: "/auth/api" }).request(
      "https://app.example.com/auth/api",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          host: "app.example.com",
          origin: "https://app.example.com",
        },
        body: JSON.stringify({ intent: "signIn", args: {} }),
      },
    );
    expect(res.status).toBe(200);
    expect(actionMock).toHaveBeenCalled();
  });

  it("rejects the apiRoute on non-POST methods", async () => {
    const res = await createApp().request("https://app.example.com/api/auth", {
      method: "GET",
      headers: { host: "app.example.com" },
    });
    expect(res.status).toBe(405);
    expect(actionMock).not.toHaveBeenCalled();
  });

  it("lands a verifier-bound session triple as a redirect with cookies", async () => {
    const res = await createApp().request(
      "https://app.example.com/dash?token=jwt&refreshToken=ref&sessionId=s&landingVerifier=lv-1",
      {
        headers: {
          host: "app.example.com",
          accept: "text/html",
          cookie: "__Host-__convexAuthLandingVerifier=lv-1",
        },
      },
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("https://app.example.com/dash");
    expect(
      res.headers.getSetCookie().find((h) => h.startsWith("__Host-__convexAuthToken=jwt")),
    ).toBeDefined();
  });

  it("rejects an unbound session triple without writing auth cookies", async () => {
    const res = await createApp().request(
      "https://app.example.com/dash?token=jwt&refreshToken=ref&sessionId=s&landingVerifier=lv-attacker",
      {
        headers: {
          host: "app.example.com",
          accept: "text/html",
          cookie: "__Host-__convexAuthLandingVerifier=lv-victim",
        },
      },
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toContain("error=landing_verifier_mismatch");
    expect(
      res.headers.getSetCookie().find((h) => h.includes("__convexAuthToken=")),
    ).toBeUndefined();
  });

  it("mints a landing-verifier cookie on navigations that lack one", async () => {
    const res = await createApp().request("https://app.example.com/dash", {
      headers: { host: "app.example.com", accept: "text/html" },
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("page");
    const verifier = res.headers
      .getSetCookie()
      .find((h) => h.startsWith("__Host-__convexAuthLandingVerifier="));
    expect(verifier).toBeDefined();
    expect(verifier).toContain("Secure");
    expect(verifier).not.toContain("HttpOnly");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("does not re-mint a verifier the request already carries", async () => {
    const res = await createApp().request("https://app.example.com/dash", {
      headers: {
        host: "app.example.com",
        accept: "text/html",
        cookie: "__Host-__convexAuthLandingVerifier=lv-existing",
      },
    });
    expect(
      res.headers.getSetCookie().find((h) => h.startsWith("__Host-__convexAuthLandingVerifier=")),
    ).toBeUndefined();
  });

  it("decorates the downstream response with rotated cookies", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = jwt(now + 30, now - 3600);
    actionMock.mockResolvedValue({ token: "t2", refreshToken: "r2" });
    const res = await createApp().request("https://app.example.com/dash", {
      headers: {
        host: "app.example.com",
        accept: "text/html",
        cookie: `__Host-__convexAuthToken=${token}; __Host-__convexAuthRefreshToken=old`,
      },
    });
    expect(res.status).toBe(200);
    const setCookies = res.headers.getSetCookie();
    expect(setCookies.find((h) => h.startsWith("__Host-__convexAuthToken=t2"))).toBeDefined();
    expect(
      setCookies.find((h) => h.startsWith("__Host-__convexAuthRefreshToken=r2")),
    ).toBeDefined();
  });

  it("clears cookies when refresh fails", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = jwt(now + 30, now - 3600);
    actionMock.mockResolvedValue({ token: null });
    const res = await createApp().request("https://app.example.com/dash", {
      headers: {
        host: "app.example.com",
        accept: "text/html",
        cookie: `__Host-__convexAuthToken=${token}; __Host-__convexAuthRefreshToken=old`,
      },
    });
    expect(
      res.headers
        .getSetCookie()
        .find(
          (h) =>
            h.startsWith("__Host-__convexAuthToken=") && h.includes("Expires=Thu, 01 Jan 1970"),
        ),
    ).toBeDefined();
  });

  it("rebuilds immutable downstream responses so rotated cookies reach the browser", async () => {
    const now = Math.floor(Date.now() / 1000);
    const oldToken = jwt(now + 30, now - 3600);
    actionMock.mockResolvedValue({ token: "t2", refreshToken: "r2" });
    const app = new Hono();
    app.use("*", convexAuthMiddleware(options));
    // Response.redirect produces immutable headers — the real-world case for
    // the rebuild path.
    app.get("/dash", () => Response.redirect("https://app.example.com/elsewhere", 302));
    const res = await app.request("https://app.example.com/dash", {
      headers: {
        host: "app.example.com",
        accept: "text/html",
        cookie: `__Host-__convexAuthToken=${oldToken}; __Host-__convexAuthRefreshToken=old`,
      },
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://app.example.com/elsewhere");
    const setCookies = res.headers.getSetCookie();
    expect(setCookies.find((h) => h.startsWith("__Host-__convexAuthToken=t2"))).toBeDefined();
  });
});

describe("standalone proxy handler", () => {
  it("serves the proxy when mounted as an explicit route", async () => {
    actionMock.mockResolvedValue({ token: "t", refreshToken: "r" });
    const app = new Hono();
    app.post("/api/auth", convexAuthProxyHandler(options));
    const res = await app.request("https://app.example.com/api/auth", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        host: "app.example.com",
        origin: "https://app.example.com",
      },
      body: JSON.stringify({ intent: "signIn", args: {} }),
    });
    expect(res.status).toBe(200);
    expect(actionMock).toHaveBeenCalled();
  });
});

describe("session helpers against a real Hono app", () => {
  it("getConvexAuthSession uses the rotated token, not the dead cookie", async () => {
    const now = Math.floor(Date.now() / 1000);
    const oldToken = jwt(now + 30, now - 3600);
    actionMock.mockResolvedValue({ token: "t2", refreshToken: "r2" });
    queryMock.mockResolvedValue({ user: { id: "u1" }, sessionId: "s1" });
    const res = await createApp().request("https://app.example.com/session", {
      headers: {
        host: "app.example.com",
        cookie: `__Host-__convexAuthToken=${oldToken}; __Host-__convexAuthRefreshToken=old`,
      },
    });
    expect(await res.json()).toEqual({ user: { id: "u1" }, sessionId: "s1" });
    expect(queryMock).toHaveBeenCalledWith(actions.verifySession, { token: "t2" });
  });

  it("resolves signed-out when refresh killed the session", async () => {
    const now = Math.floor(Date.now() / 1000);
    const oldToken = jwt(now + 30, now - 3600);
    actionMock.mockResolvedValue({ token: null });
    const res = await createApp().request("https://app.example.com/session", {
      headers: {
        host: "app.example.com",
        cookie: `__Host-__convexAuthToken=${oldToken}; __Host-__convexAuthRefreshToken=old`,
      },
    });
    expect(await res.json()).toBeNull();
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("getConvexAuthToken returns the rotated token", async () => {
    const now = Math.floor(Date.now() / 1000);
    const oldToken = jwt(now + 30, now - 3600);
    actionMock.mockResolvedValue({ token: "t2", refreshToken: "r2" });
    const res = await createApp().request("https://app.example.com/token", {
      headers: {
        host: "app.example.com",
        cookie: `__Host-__convexAuthToken=${oldToken}; __Host-__convexAuthRefreshToken=old`,
      },
    });
    expect(await res.json()).toEqual({ token: "t2" });
  });

  it("cross-origin requests resolve anonymous downstream", async () => {
    const res = await createApp().request("https://app.example.com/session", {
      headers: {
        host: "app.example.com",
        origin: "https://evil.example.com",
        cookie: "__Host-__convexAuthToken=abc; __Host-__convexAuthRefreshToken=r",
      },
    });
    expect(await res.json()).toBeNull();
    const state = await createApp().request("https://app.example.com/cookie-state", {
      headers: {
        host: "app.example.com",
        origin: "https://evil.example.com",
        cookie: "__Host-__convexAuthToken=abc; __Host-__convexAuthRefreshToken=r",
      },
    });
    expect(await state.json()).toEqual({ hasSessionCookie: false, tokenExpired: null });
  });

  it("convexAuthCookieState reports expiry without a Convex call", async () => {
    const now = Math.floor(Date.now() / 1000);
    // A live-shaped JWT + refresh token survives the boundary pass untouched,
    // so the helper reads the real cookie jar (a token-only jar reads as a
    // dead session — refresh tokens are the source of truth).
    const live = jwt(now + 3600, now);
    const res = await createApp().request("https://app.example.com/cookie-state", {
      headers: {
        host: "app.example.com",
        cookie: `__Host-__convexAuthToken=${live}; __Host-__convexAuthRefreshToken=r`,
      },
    });
    expect(await res.json()).toEqual({ hasSessionCookie: true, tokenExpired: false });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("getAuthServerState seeds a live session and fails closed on revoked", async () => {
    const now = Math.floor(Date.now() / 1000);
    const live = jwt(now + 3600, now);
    const cookie = `__Host-__convexAuthToken=${live}; __Host-__convexAuthRefreshToken=r`;
    queryMock.mockResolvedValueOnce({ user: { id: "u1" }, sessionId: "s1" });
    const app = createApp();
    const liveRes = await app.request("https://app.example.com/server-state", {
      headers: { host: "app.example.com", cookie },
    });
    const liveState = (await liveRes.json()) as {
      token: string | null;
      isAuthenticated: boolean;
    };
    expect(liveState.token).toBe(live);
    expect(liveState.isAuthenticated).toBe(true);

    queryMock.mockResolvedValueOnce({ user: null });
    const revoked = await app.request("https://app.example.com/server-state", {
      headers: { host: "app.example.com", cookie },
    });
    const revokedState = (await revoked.json()) as { token: string | null };
    expect(revokedState.token).toBeNull();
  });
});

describe("options validation", () => {
  it("rejects a non-positive cookieConfig.maxAge", () => {
    expect(() => convexAuthMiddleware({ ...options, cookieConfig: { maxAge: 0 } })).toThrow(
      "maxAge",
    );
    expect(() => convexAuthMiddleware({ ...options, cookieConfig: { maxAge: -5 } })).toThrow(
      "maxAge",
    );
  });
});
