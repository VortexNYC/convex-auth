import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { NextFetchEvent } from "next/server";
import type { FunctionReference } from "convex/server";

const mocks = vi.hoisted(() => {
  const makeJar = (initial: Record<string, string> = {}) => {
    const map = new Map(Object.entries(initial));
    return {
      map,
      get size() {
        return map.size;
      },
      get(name: string) {
        const value = map.get(name);
        return value === undefined ? undefined : { name, value };
      },
      set(name: string, value: string) {
        map.set(name, value);
      },
      delete(name: string) {
        map.delete(name);
      },
    };
  };
  return { host: "app.example.com", jar: makeJar(), makeJar };
});

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: mocks.host }),
  cookies: async () => mocks.jar,
}));
vi.mock("convex/nextjs", () => ({
  fetchAction: vi.fn(),
  fetchQuery: vi.fn(),
}));

import { fetchAction, fetchQuery } from "convex/nextjs";
import {
  ConvexAuthNextjsServerProvider,
  convexAuthNextjsCookieState,
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "./index.js";

const fetchActionMock = vi.mocked(fetchAction);
const fetchQueryMock = vi.mocked(fetchQuery);

const actions = {
  signIn: "auth:signIn" as unknown as FunctionReference<"action">,
  signOut: "auth:signOut" as unknown as FunctionReference<"action">,
  updateSession: "auth:updateSession" as unknown as FunctionReference<"action">,
  verifySession: "auth:verifySession" as unknown as FunctionReference<"query">,
};

const options = { actions } as never;
const event = {} as NextFetchEvent;

function makeJwt(claims: { exp?: number; iat?: number }): string {
  const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${b64({ alg: "none" })}.${b64(claims)}.sig`;
}

function getRequest(path: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`https://app.example.com${path}`, {
    headers: { host: "app.example.com", ...headers },
  });
}

beforeEach(() => {
  mocks.host = "app.example.com";
  mocks.jar = mocks.makeJar();
  fetchActionMock.mockReset();
  fetchQueryMock.mockReset();
});

describe("convexAuthNextjsMiddleware", () => {
  it("routes the api route to the auth proxy", async () => {
    const middleware = convexAuthNextjsMiddleware(options);
    const request = new NextRequest("https://app.example.com/api/auth", {
      headers: { host: "app.example.com" },
    });
    const response = await middleware(request, event);
    expect(response?.status).toBe(405);
  });

  it("proxies the api route on POST", async () => {
    const middleware = convexAuthNextjsMiddleware(options);
    const request = new NextRequest("https://app.example.com/api/auth", {
      method: "POST",
      headers: {
        host: "app.example.com",
        "content-type": "application/json",
        origin: "https://app.example.com",
      },
      body: JSON.stringify({ intent: "bogus", args: {} }),
    });
    const response = await middleware(request, event);
    expect(response?.status).toBe(400);
    expect(await response?.text()).toContain("Invalid intent");
  });

  it("honors a custom apiRoute", async () => {
    const middleware = convexAuthNextjsMiddleware({
      ...options,
      apiRoute: "/custom/auth",
    } as never);
    const request = new NextRequest("https://app.example.com/custom/auth", {
      headers: { host: "app.example.com" },
    });
    const response = await middleware(request, event);
    expect(response?.status).toBe(405);
    const other = await middleware(getRequest("/api/auth", { accept: "text/html" }), event);
    expect(other?.headers.get("x-middleware-next")).toBe("1");
  });

  it("lands the session triple into cookies via redirect", async () => {
    const middleware = convexAuthNextjsMiddleware(options);
    const request = getRequest("/app?token=T&refreshToken=R&sessionId=S&landingVerifier=lv-1", {
      accept: "text/html",
      cookie: "__Host-__convexAuthLandingVerifier=lv-1",
    });
    const response = await middleware(request, event);
    expect(response?.status).toBe(307);
    expect(response?.headers.get("Location")).toBe("https://app.example.com/app");
    expect(
      response?.headers.getSetCookie().find((h) => h.startsWith("__Host-__convexAuthToken=T")),
    ).toBeDefined();
  });

  it("rejects the session triple when the landing verifier mismatches", async () => {
    const middleware = convexAuthNextjsMiddleware(options);
    const request = getRequest("/app?token=T&refreshToken=R&sessionId=S&landingVerifier=lv-x", {
      accept: "text/html",
      cookie: "__Host-__convexAuthLandingVerifier=lv-1",
    });
    const response = await middleware(request, event);
    expect(response?.status).toBe(307);
    expect(response?.headers.get("Location")).toBe(
      "https://app.example.com/app?error=landing_verifier_mismatch",
    );
    expect(
      response?.headers.getSetCookie().find((h) => h.startsWith("__Host-__convexAuthToken=")),
    ).toBeUndefined();
  });

  it("mints a landing verifier cookie on same-origin navigations that lack one", async () => {
    const middleware = convexAuthNextjsMiddleware(options);
    const response = await middleware(getRequest("/dashboard", { accept: "text/html" }), event);
    const verifier = response?.headers
      .getSetCookie()
      .find((h) => h.startsWith("__Host-__convexAuthLandingVerifier="));
    expect(verifier).toBeDefined();
    expect(verifier).toContain("Secure");
    expect(verifier).not.toContain("HttpOnly");
  });

  it("passes through a plain authenticated-free request", async () => {
    const middleware = convexAuthNextjsMiddleware(options);
    const response = await middleware(getRequest("/dashboard"), event);
    expect(response?.status).toBe(200);
    expect(response?.headers.get("x-middleware-next")).toBe("1");
  });

  it("rejects a non-positive cookieConfig.maxAge", async () => {
    const middleware = convexAuthNextjsMiddleware({
      ...options,
      cookieConfig: { maxAge: 0 },
    } as never);
    await expect(middleware(getRequest("/"), event)).rejects.toThrow("cookieConfig.maxAge");
  });

  it("exposes token and verified auth to a custom handler", async () => {
    fetchQueryMock.mockResolvedValue({ user: { id: "u1" }, sessionId: "s1" });
    const middleware = convexAuthNextjsMiddleware(async (request, ctx) => {
      expect(await ctx.convexAuth.getToken()).toBe("live-tok");
      expect(await ctx.convexAuth.isAuthenticated()).toBe(true);
      expect(ctx.convexAuth.cookieState().hasSessionCookie).toBe(true);
      return NextResponse.json({ ok: true });
    }, options);
    const request = getRequest("/dashboard", {
      cookie: "__Host-__convexAuthToken=live-tok",
    });
    const response = await middleware(request, event);
    expect(await response?.json()).toEqual({ ok: true });
  });

  it("reports unauthenticated to the handler when verifySession returns no user", async () => {
    fetchQueryMock.mockResolvedValue({ user: null });
    const middleware = convexAuthNextjsMiddleware(async (request, ctx) => {
      const authed = await ctx.convexAuth.isAuthenticated();
      return nextjsMiddlewareRedirect(request, authed ? "/app" : "/login");
    }, options);
    const request = getRequest("/dashboard", {
      cookie: "__Host-__convexAuthToken=tok",
    });
    const response = await middleware(request, event);
    expect(response?.status).toBe(307);
    expect(response?.headers.get("Location")).toBe("https://app.example.com/login");
  });

  it("writes refreshed cookies onto the response and the forwarded request", async () => {
    const soon = Math.floor(Date.now() / 1000) + 30;
    fetchActionMock.mockResolvedValue({
      token: "rotated",
      refreshToken: "rotated-refresh",
    });
    const middleware = convexAuthNextjsMiddleware(options);
    const request = getRequest("/dashboard", {
      cookie: `__Host-__convexAuthToken=${makeJwt({ iat: soon - 600, exp: soon })}; __Host-__convexAuthRefreshToken=old-refresh`,
    });
    mocks.jar = mocks.makeJar({
      "__Host-__convexAuthToken": makeJwt({ iat: soon - 600, exp: soon }),
      "__Host-__convexAuthRefreshToken": "old-refresh",
    });
    const response = await middleware(request, event);
    const setCookies = response?.headers.getSetCookie() ?? [];
    expect(setCookies.find((h) => h.startsWith("__Host-__convexAuthToken=rotated"))).toBeDefined();
    expect(
      setCookies.find((h) => h.startsWith("__Host-__convexAuthRefreshToken=rotated-refresh")),
    ).toBeDefined();
    expect(request.cookies.get("__Host-__convexAuthToken")?.value).toBe("rotated");
    expect(request.cookies.get("__Host-__convexAuthRefreshToken")?.value).toBe("rotated-refresh");
  });

  it("clears cookies downstream when the refresh fails", async () => {
    const soon = Math.floor(Date.now() / 1000) + 30;
    fetchActionMock.mockRejectedValue(new Error("revoked"));
    const middleware = convexAuthNextjsMiddleware(options);
    const request = getRequest("/dashboard", {
      cookie: `__Host-__convexAuthToken=${makeJwt({ iat: soon - 600, exp: soon })}; __Host-__convexAuthRefreshToken=spent`,
    });
    mocks.jar = mocks.makeJar({
      "__Host-__convexAuthToken": makeJwt({ iat: soon - 600, exp: soon }),
      "__Host-__convexAuthRefreshToken": "spent",
    });
    const response = await middleware(request, event);
    expect(
      response?.headers.getSetCookie().find((h) => h.startsWith("__Host-__convexAuthToken=")),
    ).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect(request.cookies.get("__Host-__convexAuthToken")).toBeUndefined();
  });

  it("memoizes isAuthenticated per request and re-verifies on the next", async () => {
    fetchQueryMock.mockResolvedValue({ user: { id: "u1" }, sessionId: "s1" });
    const middleware = convexAuthNextjsMiddleware(async (request, ctx) => {
      expect(await ctx.convexAuth.isAuthenticated()).toBe(true);
      expect(await ctx.convexAuth.isAuthenticated()).toBe(true);
      return NextResponse.next();
    }, options);
    const request = getRequest("/dashboard", {
      cookie: "__Host-__convexAuthToken=live-tok",
    });
    await middleware(request, event);
    expect(fetchQueryMock).toHaveBeenCalledTimes(1);

    await middleware(request, event);
    expect(fetchQueryMock).toHaveBeenCalledTimes(2);
  });

  it("preserves a custom handler's NextResponse body while porting refresh cookies", async () => {
    const soon = Math.floor(Date.now() / 1000) + 30;
    fetchActionMock.mockResolvedValue({
      token: "rotated",
      refreshToken: "rotated-refresh",
    });
    const middleware = convexAuthNextjsMiddleware(async () => {
      return NextResponse.json({ preserved: true }, { status: 201 });
    }, options);
    const request = getRequest("/dashboard", {
      cookie: `__Host-__convexAuthToken=${makeJwt({ iat: soon - 600, exp: soon })}; __Host-__convexAuthRefreshToken=old`,
    });
    mocks.jar = mocks.makeJar({
      "__Host-__convexAuthToken": makeJwt({ iat: soon - 600, exp: soon }),
      "__Host-__convexAuthRefreshToken": "old",
    });
    const response = await middleware(request, event);
    expect(response?.status).toBe(201);
    expect(await response?.json()).toEqual({ preserved: true });
    expect(
      response?.headers
        .getSetCookie()
        .find((h) => h.startsWith("__Host-__convexAuthToken=rotated")),
    ).toBeDefined();
  });

  it("preserves a custom handler's plain Response body when porting cookies", async () => {
    const soon = Math.floor(Date.now() / 1000) + 30;
    fetchActionMock.mockResolvedValue({
      token: "rotated",
      refreshToken: "rotated-refresh",
    });
    const middleware = convexAuthNextjsMiddleware(async () => {
      return new Response("plain-body", {
        status: 202,
        headers: { "x-custom": "kept" },
      });
    }, options);
    const request = getRequest("/dashboard", {
      cookie: `__Host-__convexAuthToken=${makeJwt({ iat: soon - 600, exp: soon })}; __Host-__convexAuthRefreshToken=old`,
    });
    mocks.jar = mocks.makeJar({
      "__Host-__convexAuthToken": makeJwt({ iat: soon - 600, exp: soon }),
      "__Host-__convexAuthRefreshToken": "old",
    });
    const response = await middleware(request, event);
    expect(response?.status).toBe(202);
    expect(await response?.text()).toBe("plain-body");
    expect(response?.headers.get("x-custom")).toBe("kept");
    expect(
      response?.headers
        .getSetCookie()
        .find((h) => h.startsWith("__Host-__convexAuthToken=rotated")),
    ).toBeDefined();
  });
});

describe("ConvexAuthNextjsServerProvider server state", () => {
  async function serverState() {
    const element = await ConvexAuthNextjsServerProvider({
      actions: options.actions,
      children: null,
    });
    return (
      element.props as {
        serverState: {
          token: string | null;
          user: unknown;
          sessionId: string | null;
        };
      }
    ).serverState;
  }

  it("seeds the token when verifySession resolves a session", async () => {
    fetchQueryMock.mockResolvedValue({ user: { id: "u1" }, sessionId: "s1" });
    mocks.jar = mocks.makeJar({ "__Host-__convexAuthToken": "jwt" });
    const state = await serverState();
    expect(state.token).toBe("jwt");
    expect(state.sessionId).toBe("s1");
  });

  it("never seeds a revoked session's JWT — fail closed", async () => {
    fetchQueryMock.mockResolvedValue({ user: null, sessionId: null });
    mocks.jar = mocks.makeJar({ "__Host-__convexAuthToken": "dead-jwt" });
    const state = await serverState();
    expect(state.token).toBeNull();
    expect(state.user).toBeNull();
    expect(state.sessionId).toBeNull();
  });

  it("fails closed when verifySession throws (backend unreachable)", async () => {
    fetchQueryMock.mockRejectedValue(new Error("connection refused"));
    mocks.jar = mocks.makeJar({ "__Host-__convexAuthToken": "jwt" });
    const state = await serverState();
    expect(state.token).toBeNull();
  });
});

describe("convexAuthNextjsCookieState", () => {
  it("reports no session when the cookie is absent", () => {
    const request = getRequest("/");
    expect(convexAuthNextjsCookieState(request)).toEqual({
      hasSessionCookie: false,
      tokenExpired: null,
    });
  });

  it("reports a live session for an unexpired token", () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const request = getRequest("/", {
      cookie: `__Host-__convexAuthToken=${makeJwt({ exp })}`,
    });
    expect(convexAuthNextjsCookieState(request)).toEqual({
      hasSessionCookie: true,
      tokenExpired: false,
    });
  });

  it("reports an expired session for an expired token", () => {
    const exp = Math.floor(Date.now() / 1000) - 10;
    const request = getRequest("/", {
      cookie: `__Host-__convexAuthToken=${makeJwt({ exp })}`,
    });
    expect(convexAuthNextjsCookieState(request)).toEqual({
      hasSessionCookie: true,
      tokenExpired: true,
    });
  });

  it("reports unknown expiry for an undecodable token", () => {
    const request = getRequest("/", {
      cookie: "__Host-__convexAuthToken=garbage",
    });
    expect(convexAuthNextjsCookieState(request)).toEqual({
      hasSessionCookie: true,
      tokenExpired: null,
    });
  });
});

describe("nextjsMiddlewareRedirect", () => {
  it("redirects preserving origin with path and query", () => {
    const request = getRequest("/dashboard?x=1");
    const response = nextjsMiddlewareRedirect(request, "/login?next=/dashboard");
    const location = new URL(response.headers.get("Location")!);
    expect(location.origin).toBe("https://app.example.com");
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/dashboard");
    expect(location.searchParams.get("x")).toBeNull();
  });
});

describe("createRouteMatcher", () => {
  const at = (path: string) => getRequest(path);

  it("matches exact string routes", () => {
    const isProtected = createRouteMatcher("/dashboard");
    expect(isProtected(at("/dashboard"))).toBe(true);
    expect(isProtected(at("/dashboard/settings"))).toBe(false);
    expect(isProtected(at("/other"))).toBe(false);
  });

  it("matches wildcard patterns", () => {
    const isProtected = createRouteMatcher("/dashboard(.*)");
    expect(isProtected(at("/dashboard"))).toBe(true);
    expect(isProtected(at("/dashboard/settings"))).toBe(true);
    expect(isProtected(at("/other"))).toBe(false);
  });

  it("matches slash-anchored wildcard patterns with v6 parity", () => {
    const isProtected = createRouteMatcher("/api/(.*)");
    expect(isProtected(at("/api/"))).toBe(true);
    expect(isProtected(at("/api/x"))).toBe(true);
    expect(isProtected(at("/api/x/y"))).toBe(true);
    // v6 required the slash — bare prefix and glued names must not match.
    expect(isProtected(at("/api"))).toBe(false);
    expect(isProtected(at("/apifoo"))).toBe(false);
    expect(isProtected(at("/apiv2"))).toBe(false);
  });

  it("keeps glued wildcard suffix semantics from v6", () => {
    const isProtected = createRouteMatcher("/dashboard(.*)");
    // `(.*)` glued onto the prefix matched glued strings in v6 too.
    expect(isProtected(at("/dashboardfoo"))).toBe(true);
    expect(isProtected(at("/dashboard"))).toBe(true);
  });

  it("rejects bare-star and unnamed-group patterns like v6 did", () => {
    expect(() => createRouteMatcher("/api/*")).toThrow();
    expect(() => createRouteMatcher("/(a|b)/x")).toThrow();
  });

  it("accepts native v8 splat syntax", () => {
    const isProtected = createRouteMatcher("/files/{*rest}");
    expect(isProtected(at("/files/a/b"))).toBe(true);
    expect(isProtected(at("/files"))).toBe(false);
  });

  it("matches an array of routes", () => {
    const isProtected = createRouteMatcher(["/dashboard", "/settings"]);
    expect(isProtected(at("/dashboard"))).toBe(true);
    expect(isProtected(at("/settings"))).toBe(true);
    expect(isProtected(at("/other"))).toBe(false);
  });

  it("matches regex routes", () => {
    const isProtected = createRouteMatcher(/^\/(dashboard|admin)/);
    expect(isProtected(at("/admin/users"))).toBe(true);
    expect(isProtected(at("/other"))).toBe(false);
  });

  it("matches function routes", () => {
    const isProtected = createRouteMatcher((req) => req.nextUrl.pathname.startsWith("/app"));
    expect(isProtected(at("/app/x"))).toBe(true);
    expect(isProtected(at("/other"))).toBe(false);
  });
});
