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
// NextFetchEvent has no public constructor; the middleware only forwards it.
const event = {} as NextFetchEvent;

function makeJwt(claims: { exp?: number; iat?: number }): string {
  const b64 = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${b64({ alg: "none" })}.${b64(claims)}.sig`;
}

function getRequest(
  path: string,
  headers: Record<string, string> = {},
): NextRequest {
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
    expect(response?.status).toBe(405); // GET hits the proxy → method rejected
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
    // A non-matching path passes through untouched
    const other = await middleware(
      getRequest("/api/auth", { accept: "text/html" }),
      event,
    );
    expect(other?.headers.get("x-middleware-next")).toBe("1");
  });

  it("lands the session triple into cookies via redirect", async () => {
    const middleware = convexAuthNextjsMiddleware(options);
    const request = getRequest("/app?token=T&refreshToken=R&sessionId=S", {
      accept: "text/html",
    });
    const response = await middleware(request, event);
    expect(response?.status).toBe(307);
    expect(response?.headers.get("Location")).toBe(
      "https://app.example.com/app",
    );
    expect(
      response?.headers
        .getSetCookie()
        .find((h) => h.startsWith("__Host-__convexAuthToken=T")),
    ).toBeDefined();
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
    await expect(middleware(getRequest("/"), event)).rejects.toThrow(
      "cookieConfig.maxAge",
    );
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
    expect(response?.headers.get("Location")).toBe(
      "https://app.example.com/login",
    );
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
    // getRefreshedTokens reads the next/headers jar — keep it in sync with
    // the request cookie header.
    mocks.jar = mocks.makeJar({
      "__Host-__convexAuthToken": makeJwt({ iat: soon - 600, exp: soon }),
      "__Host-__convexAuthRefreshToken": "old-refresh",
    });
    const response = await middleware(request, event);
    const setCookies = response?.headers.getSetCookie() ?? [];
    expect(
      setCookies.find((h) => h.startsWith("__Host-__convexAuthToken=rotated")),
    ).toBeDefined();
    expect(
      setCookies.find((h) =>
        h.startsWith("__Host-__convexAuthRefreshToken=rotated-refresh"),
      ),
    ).toBeDefined();
    // And the downstream handler sees the rotated pair
    expect(request.cookies.get("__Host-__convexAuthToken")?.value).toBe(
      "rotated",
    );
    expect(request.cookies.get("__Host-__convexAuthRefreshToken")?.value).toBe(
      "rotated-refresh",
    );
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
      response?.headers
        .getSetCookie()
        .find((h) => h.startsWith("__Host-__convexAuthToken=")),
    ).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect(request.cookies.get("__Host-__convexAuthToken")).toBeUndefined();
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
    // The original query is replaced, not merged
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
    const isProtected = createRouteMatcher(
      (req) => req.nextUrl.pathname.startsWith("/app"),
    );
    expect(isProtected(at("/app/x"))).toBe(true);
    expect(isProtected(at("/other"))).toBe(false);
  });
});
