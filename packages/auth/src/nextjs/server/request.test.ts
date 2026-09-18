import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
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
// The server barrel imports the client provider chain; keep this test on the
// request boundary only.
vi.mock("./index.js", () => ({}));

import { fetchAction } from "convex/nextjs";
import { handleAuthenticationInRequest } from "./request.js";

const fetchActionMock = vi.mocked(fetchAction);

const options = {
  actions: {
    updateSession: "auth:updateSession" as unknown as FunctionReference<"action">,
    verifySession: "auth:verifySession" as unknown as FunctionReference<"query">,
  },
} as never;

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

const HTML = { accept: "text/html,application/xhtml+xml" };

beforeEach(() => {
  mocks.host = "app.example.com";
  mocks.jar = mocks.makeJar();
  fetchActionMock.mockReset();
});

describe("session-triple landing", () => {
  it("moves ?token&refreshToken&sessionId into HttpOnly cookies and strips the URL", async () => {
    const request = getRequest(
      "/dashboard?token=TOK&refreshToken=REF&sessionId=SESS&other=1",
      HTML,
    );
    const result = await handleAuthenticationInRequest(request, options);
    expect(result.kind).toBe("redirect");
    if (result.kind !== "redirect") throw new Error("unreachable");
    const location = new URL(result.response.headers.get("Location")!);
    expect(location.pathname).toBe("/dashboard");
    expect(location.searchParams.get("token")).toBeNull();
    expect(location.searchParams.get("refreshToken")).toBeNull();
    expect(location.searchParams.get("sessionId")).toBeNull();
    // Unrelated params survive the strip
    expect(location.searchParams.get("other")).toBe("1");
    const setCookies = result.response.headers.getSetCookie();
    expect(
      setCookies.find((h) => h.startsWith("__Host-__convexAuthToken=TOK")),
    ).toBeDefined();
    expect(
      setCookies.find((h) =>
        h.startsWith("__Host-__convexAuthRefreshToken=REF"),
      ),
    ).toBeDefined();
  });

  it("ignores a lone ?token (password-reset links carry one)", async () => {
    const request = getRequest("/reset?token=RESETTOK&reset=1", HTML);
    const result = await handleAuthenticationInRequest(request, options);
    expect(result.kind).toBe("refreshTokens");
  });

  it("does not intercept the triple on non-GET requests", async () => {
    const request = new NextRequest(
      "https://app.example.com/d?token=T&refreshToken=R&sessionId=S",
      { method: "POST", headers: { ...HTML, host: "app.example.com" } },
    );
    const result = await handleAuthenticationInRequest(request, options);
    expect(result.kind).toBe("refreshTokens");
  });

  it("does not intercept the triple on non-HTML requests", async () => {
    const request = getRequest(
      "/d?token=T&refreshToken=R&sessionId=S",
      { accept: "application/json" },
    );
    const result = await handleAuthenticationInRequest(request, options);
    expect(result.kind).toBe("refreshTokens");
  });
});

describe("proactive refresh", () => {
  const soon = Math.floor(Date.now() / 1000) + 30; // expires in 30s
  const later = Math.floor(Date.now() / 1000) + 3600;

  it("returns undefined when no cookies exist", async () => {
    const request = getRequest("/dashboard", HTML);
    const result = await handleAuthenticationInRequest(request, options);
    expect(result).toEqual({ kind: "refreshTokens", refreshTokens: undefined });
    expect(fetchActionMock).not.toHaveBeenCalled();
  });

  it("refreshes when the access token is near expiry", async () => {
    mocks.jar = mocks.makeJar({
      "__Host-__convexAuthToken": makeJwt({ iat: soon - 600, exp: soon }),
      "__Host-__convexAuthRefreshToken": "refresh-tok",
    });
    fetchActionMock.mockResolvedValue({
      token: "new-token",
      refreshToken: "new-refresh",
    });
    const request = getRequest("/dashboard", HTML);
    const result = await handleAuthenticationInRequest(request, options);
    expect(fetchActionMock).toHaveBeenCalledWith(
      options.actions.updateSession,
      { refreshToken: "refresh-tok" },
      expect.objectContaining({}),
    );
    expect(result).toEqual({
      kind: "refreshTokens",
      refreshTokens: { token: "new-token", refreshToken: "new-refresh" },
    });
  });

  it("does not refresh a token with plenty of lifetime left", async () => {
    mocks.jar = mocks.makeJar({
      "__Host-__convexAuthToken": makeJwt({ iat: later - 600, exp: later }),
      "__Host-__convexAuthRefreshToken": "refresh-tok",
    });
    const request = getRequest("/dashboard", HTML);
    const result = await handleAuthenticationInRequest(request, options);
    expect(result).toEqual({ kind: "refreshTokens", refreshTokens: undefined });
    expect(fetchActionMock).not.toHaveBeenCalled();
  });

  it("returns null (clear cookies) when one of the pair is missing", async () => {
    mocks.jar = mocks.makeJar({
      "__Host-__convexAuthToken": makeJwt({ iat: soon - 600, exp: later }),
    });
    const request = getRequest("/dashboard", HTML);
    const result = await handleAuthenticationInRequest(request, options);
    expect(result).toEqual({ kind: "refreshTokens", refreshTokens: null });
  });

  it("returns null when the token is undecodable", async () => {
    mocks.jar = mocks.makeJar({
      "__Host-__convexAuthToken": "not-a-jwt",
      "__Host-__convexAuthRefreshToken": "refresh-tok",
    });
    const request = getRequest("/dashboard", HTML);
    const result = await handleAuthenticationInRequest(request, options);
    expect(result).toEqual({ kind: "refreshTokens", refreshTokens: null });
  });

  it("returns null when the refresh action denies the rotation", async () => {
    mocks.jar = mocks.makeJar({
      "__Host-__convexAuthToken": makeJwt({ iat: soon - 600, exp: soon }),
      "__Host-__convexAuthRefreshToken": "spent",
    });
    fetchActionMock.mockResolvedValue({ token: null });
    const request = getRequest("/dashboard", HTML);
    const result = await handleAuthenticationInRequest(request, options);
    expect(result).toEqual({ kind: "refreshTokens", refreshTokens: null });
  });

  it("returns null when the refresh action throws", async () => {
    mocks.jar = mocks.makeJar({
      "__Host-__convexAuthToken": makeJwt({ iat: soon - 600, exp: soon }),
      "__Host-__convexAuthRefreshToken": "spent",
    });
    fetchActionMock.mockRejectedValue(new Error("family revoked"));
    const request = getRequest("/dashboard", HTML);
    const result = await handleAuthenticationInRequest(request, options);
    expect(result).toEqual({ kind: "refreshTokens", refreshTokens: null });
  });
});

describe("CORS", () => {
  it("strips auth cookies from cross-origin requests", async () => {
    const request = getRequest("/dashboard", {
      origin: "https://evil.example.com",
      cookie:
        "__Host-__convexAuthToken=tok; __Host-__convexAuthRefreshToken=ref",
    });
    await handleAuthenticationInRequest(request, options);
    expect(request.cookies.get("__Host-__convexAuthToken")).toBeUndefined();
    expect(request.cookies.get("__Host-__convexAuthRefreshToken")).toBeUndefined();
  });

  it("leaves cookies alone for same-origin requests", async () => {
    const request = getRequest("/dashboard", {
      origin: "https://app.example.com",
      cookie:
        "__Host-__convexAuthToken=tok; __Host-__convexAuthRefreshToken=ref",
    });
    await handleAuthenticationInRequest(request, options);
    expect(request.cookies.get("__Host-__convexAuthToken")?.value).toBe("tok");
  });
});
