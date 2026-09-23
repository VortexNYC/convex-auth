import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FunctionReference } from "convex/server";
import { handleConvexAuthRequest } from "./middleware.js";
import {
  convexAuthCookieState,
  getAuthServerState,
  getConvexAuthSession,
  getConvexAuthToken,
} from "./state.js";
import type { AuthTransport } from "../../ssr/transport.js";

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

const options = { actions: actions as never, transport };

function jwt(exp: number, iat: number): string {
  const payload = Buffer.from(JSON.stringify({ exp, iat })).toString("base64url");
  return `h.${payload}.s`;
}

const nextDownstream = () => Promise.resolve({ response: new Response("page", { status: 200 }) });

beforeEach(() => {
  actionMock.mockReset();
  queryMock.mockReset();
});

describe("handleConvexAuthRequest", () => {
  it("intercepts apiRoute POSTs and returns the proxy response", async () => {
    actionMock.mockResolvedValue({ token: "t", refreshToken: "r" });
    const request = new Request("https://app.example.com/api/auth", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        host: "app.example.com",
        origin: "https://app.example.com",
      },
      body: JSON.stringify({ intent: "signIn", args: {} }),
    });
    const next = vi.fn(nextDownstream);
    const res = await handleConvexAuthRequest(request, next, options);
    expect(next).not.toHaveBeenCalled();
    expect(res).toBeInstanceOf(Response);
    const response = res as Response;
    expect(response.status).toBe(200);
    expect(
      response.headers.getSetCookie().find((h) => h.startsWith("__Host-__convexAuthToken=t")),
    ).toBeDefined();
  });

  it("honors a custom apiRoute", async () => {
    const request = new Request("https://app.example.com/auth/api", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        host: "app.example.com",
        origin: "https://app.example.com",
      },
      body: JSON.stringify({ intent: "signIn", args: {} }),
    });
    const next = vi.fn(nextDownstream);
    actionMock.mockResolvedValue({ token: "t", refreshToken: "r" });
    await handleConvexAuthRequest(request, next, { ...options, apiRoute: "/auth/api" });
    expect(next).not.toHaveBeenCalled();
    expect(actionMock).toHaveBeenCalled();
  });

  it("lands a session triple as a redirect with cookies", async () => {
    const request = new Request(
      "https://app.example.com/dash?token=jwt&refreshToken=ref&sessionId=s",
      { headers: { host: "app.example.com", accept: "text/html" } },
    );
    const next = vi.fn(nextDownstream);
    const res = await handleConvexAuthRequest(request, next, options);
    expect(next).not.toHaveBeenCalled();
    const response = res as Response;
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("https://app.example.com/dash");
    const setCookies = response.headers.getSetCookie();
    expect(setCookies.find((h) => h.startsWith("__Host-__convexAuthToken=jwt"))).toBeDefined();
  });

  it("passes ordinary requests through and decorates with rotated cookies", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = jwt(now + 30, now - 3600);
    actionMock.mockResolvedValue({ token: "t2", refreshToken: "r2" });
    const request = new Request("https://app.example.com/dash", {
      headers: {
        host: "app.example.com",
        accept: "text/html",
        cookie: `__Host-__convexAuthToken=${token}; __Host-__convexAuthRefreshToken=old`,
      },
    });
    const res = await handleConvexAuthRequest(request, nextDownstream, options);
    const response = (res as { response: Response }).response;
    const setCookies = response.headers.getSetCookie();
    expect(setCookies.find((h) => h.startsWith("__Host-__convexAuthToken=t2"))).toBeDefined();
    expect(
      setCookies.find((h) => h.startsWith("__Host-__convexAuthRefreshToken=r2")),
    ).toBeDefined();
  });

  it("clears cookies when refresh fails", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = jwt(now + 30, now - 3600);
    actionMock.mockResolvedValue({ token: null });
    const request = new Request("https://app.example.com/dash", {
      headers: {
        host: "app.example.com",
        accept: "text/html",
        cookie: `__Host-__convexAuthToken=${token}; __Host-__convexAuthRefreshToken=old`,
      },
    });
    const res = await handleConvexAuthRequest(request, nextDownstream, options);
    const response = (res as { response: Response }).response;
    const setCookies = response.headers.getSetCookie();
    expect(
      setCookies.find(
        (h) => h.startsWith("__Host-__convexAuthToken=") && h.includes("Expires=Thu, 01 Jan 1970"),
      ),
    ).toBeDefined();
  });

  it("rebuilds immutable responses so rotated cookies still reach the browser", async () => {
    const now = Math.floor(Date.now() / 1000);
    const oldToken = jwt(now + 30, now - 3600);
    actionMock.mockResolvedValue({ token: "t2", refreshToken: "r2" });
    const request = new Request("https://app.example.com/dash", {
      headers: {
        host: "app.example.com",
        accept: "text/html",
        cookie: `__Host-__convexAuthToken=${oldToken}; __Host-__convexAuthRefreshToken=old`,
      },
    });
    // Redirect responses carry immutable headers — appending must not throw.
    const downstream = () =>
      Promise.resolve({ response: Response.redirect("https://app.example.com/elsewhere") });
    const res = await handleConvexAuthRequest(request, downstream, options);
    const response = (res as { response: Response }).response;
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://app.example.com/elsewhere");
    const setCookies = response.headers.getSetCookie();
    expect(setCookies.find((h) => h.startsWith("__Host-__convexAuthToken=t2"))).toBeDefined();
    expect(
      setCookies.find((h) => h.startsWith("__Host-__convexAuthRefreshToken=r2")),
    ).toBeDefined();
  });
});

describe("rotation-aware session resolution", () => {
  it("uses the rotated token downstream, not the dead cookie", async () => {
    const now = Math.floor(Date.now() / 1000);
    const oldToken = jwt(now + 30, now - 3600);
    actionMock.mockResolvedValue({ token: "t2", refreshToken: "r2" });
    const request = new Request("https://app.example.com/dash", {
      headers: {
        host: "app.example.com",
        accept: "text/html",
        cookie: `__Host-__convexAuthToken=${oldToken}; __Host-__convexAuthRefreshToken=old`,
      },
    });
    await handleConvexAuthRequest(request, nextDownstream, options);

    // Downstream helpers resolve the ROTATED token — the request's cookie
    // still holds the revoked predecessor.
    queryMock.mockResolvedValue({ user: { id: "u1" }, sessionId: "s1" });
    const session = await getConvexAuthSession(request, {
      actions: { verifySession: actions.verifySession },
      transport,
    });
    expect(session).toEqual({ user: { id: "u1" }, sessionId: "s1" });
    expect(queryMock).toHaveBeenCalledWith(actions.verifySession, { token: "t2" });
    expect(getConvexAuthToken(request)).toBe("t2");
  });

  it("resolves signed-out when refresh killed the session", async () => {
    const now = Math.floor(Date.now() / 1000);
    const oldToken = jwt(now + 30, now - 3600);
    actionMock.mockResolvedValue({ token: null });
    const request = new Request("https://app.example.com/dash", {
      headers: {
        host: "app.example.com",
        accept: "text/html",
        cookie: `__Host-__convexAuthToken=${oldToken}; __Host-__convexAuthRefreshToken=old`,
      },
    });
    await handleConvexAuthRequest(request, nextDownstream, options);
    const session = await getConvexAuthSession(request, {
      actions: { verifySession: actions.verifySession },
      transport,
    });
    expect(session).toBeNull();
    expect(queryMock).not.toHaveBeenCalled();
    expect(getConvexAuthToken(request)).toBeNull();
  });

  it("memoizes verifySession per request", async () => {
    const request = new Request("https://app.example.com/dash", {
      headers: {
        host: "app.example.com",
        cookie: "__Host-__convexAuthToken=abc",
      },
    });
    queryMock.mockResolvedValue({ user: { id: "u" }, sessionId: "s" });
    const a = await getConvexAuthSession(request, {
      actions: { verifySession: actions.verifySession },
      transport,
    });
    const b = await getConvexAuthSession(request, {
      actions: { verifySession: actions.verifySession },
      transport,
    });
    expect(a).toEqual(b);
    expect(queryMock).toHaveBeenCalledTimes(1);
  });
});

describe("CORS strip", () => {
  it("cross-origin requests resolve anonymous downstream", async () => {
    const request = new Request("https://app.example.com/dash", {
      headers: {
        host: "app.example.com",
        accept: "text/html",
        origin: "https://evil.example.com",
        cookie: "__Host-__convexAuthToken=abc; __Host-__convexAuthRefreshToken=r",
      },
    });
    await handleConvexAuthRequest(request, nextDownstream, options);
    const session = await getConvexAuthSession(request, {
      actions: { verifySession: actions.verifySession },
      transport,
    });
    expect(session).toBeNull();
    expect(convexAuthCookieState(request).hasSessionCookie).toBe(false);
  });

  it("physically strips auth cookies from the request header when mutable", async () => {
    const request = new Request("https://app.example.com/dash", {
      headers: {
        host: "app.example.com",
        accept: "text/html",
        origin: "https://evil.example.com",
        cookie: "__Host-__convexAuthToken=abc; other-cookie=keep",
      },
    });
    await handleConvexAuthRequest(request, nextDownstream, options);
    // Undici Request headers are mutable — the strip applied, keeping
    // non-auth cookies. Where a runtime makes them immutable the WeakSet
    // marker (asserted above) still guards session helpers.
    expect(request.headers.get("cookie")).toBe("other-cookie=keep");
  });
});

describe("options validation", () => {
  it("rejects a non-positive cookieConfig.maxAge", async () => {
    const request = new Request("https://app.example.com/");
    await expect(
      handleConvexAuthRequest(request, nextDownstream, {
        ...options,
        cookieConfig: { maxAge: 0 },
      }),
    ).rejects.toThrow("maxAge");
    await expect(
      handleConvexAuthRequest(request, nextDownstream, {
        ...options,
        cookieConfig: { maxAge: -5 },
      }),
    ).rejects.toThrow("maxAge");
  });
});

describe("getAuthServerState", () => {
  it("returns the provider seed for a live session", async () => {
    const request = new Request("https://app.example.com/", {
      headers: { host: "app.example.com", cookie: "__Host-__convexAuthToken=jwt" },
    });
    queryMock.mockResolvedValue({ user: { id: "u1", name: "N" }, sessionId: "s1" });
    const state = await getAuthServerState(request, {
      actions: { verifySession: actions.verifySession },
      transport,
    });
    expect(state.token).toBe("jwt");
    expect(state.refreshToken).toBeNull();
    expect(state.user).toEqual({ id: "u1", name: "N" });
    expect(state.sessionId).toBe("s1");
    expect(state._timeFetched).toBeGreaterThan(0);
  });

  it("returns anonymous state for a revoked session (fail closed)", async () => {
    const request = new Request("https://app.example.com/", {
      headers: { host: "app.example.com", cookie: "__Host-__convexAuthToken=jwt" },
    });
    queryMock.mockResolvedValue({ user: null });
    const state = await getAuthServerState(request, {
      actions: { verifySession: actions.verifySession },
      transport,
    });
    expect(state.token).toBeNull();
    expect(state.user).toBeNull();
  });

  it("returns anonymous state when transport throws", async () => {
    const request = new Request("https://app.example.com/", {
      headers: { host: "app.example.com", cookie: "__Host-__convexAuthToken=jwt" },
    });
    queryMock.mockRejectedValue(new Error("backend down"));
    const state = await getAuthServerState(request, {
      actions: { verifySession: actions.verifySession },
      transport,
    });
    expect(state.token).toBeNull();
  });

  it("returns anonymous state with no cookie", async () => {
    const request = new Request("https://app.example.com/", {
      headers: { host: "app.example.com" },
    });
    const state = await getAuthServerState(request, {
      actions: { verifySession: actions.verifySession },
      transport,
    });
    expect(state.token).toBeNull();
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe("convexAuthCookieState", () => {
  it("reports expiry from the JWT claims without a Convex call", () => {
    const now = Math.floor(Date.now() / 1000);
    const live = jwt(now + 3600, now);
    const dead = jwt(now - 10, now - 4000);
    const liveReq = new Request("https://app.example.com/", {
      headers: { host: "app.example.com", cookie: `__Host-__convexAuthToken=${live}` },
    });
    const deadReq = new Request("https://app.example.com/", {
      headers: { host: "app.example.com", cookie: `__Host-__convexAuthToken=${dead}` },
    });
    expect(convexAuthCookieState(liveReq)).toEqual({
      hasSessionCookie: true,
      tokenExpired: false,
    });
    expect(convexAuthCookieState(deadReq)).toEqual({
      hasSessionCookie: true,
      tokenExpired: true,
    });
    expect(queryMock).not.toHaveBeenCalled();
  });
});
