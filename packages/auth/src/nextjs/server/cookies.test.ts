import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

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

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: mocks.host }),
  cookies: async () => mocks.jar,
}));

import { getRequestCookies, getRequestCookiesInMiddleware, getResponseCookies } from "./cookies.js";

beforeEach(() => {
  mocks.host = "app.example.com";
  mocks.jar = mocks.makeJar();
});

function setCookieHeaders(response: NextResponse): string[] {
  return response.headers.getSetCookie();
}

describe("getRequestCookies", () => {
  it("reads unprefixed names on localhost", async () => {
    mocks.host = "localhost:3000";
    mocks.jar = mocks.makeJar({
      __convexAuthToken: "tok",
      __convexAuthRefreshToken: "ref",
    });
    const cookies = await getRequestCookies();
    expect(cookies.token).toBe("tok");
    expect(cookies.refreshToken).toBe("ref");
  });

  it("reads __Host- prefixed names in production", async () => {
    mocks.jar = mocks.makeJar({
      "__Host-__convexAuthToken": "tok",
      "__Host-__convexAuthRefreshToken": "ref",
    });
    const cookies = await getRequestCookies();
    expect(cookies.token).toBe("tok");
    expect(cookies.refreshToken).toBe("ref");
  });

  it("does not read unprefixed names in production", async () => {
    mocks.jar = mocks.makeJar({
      __convexAuthToken: "tok",
      __convexAuthRefreshToken: "ref",
    });
    const cookies = await getRequestCookies();
    expect(cookies.token).toBeNull();
    expect(cookies.refreshToken).toBeNull();
  });

  it("treats *.localhost and loopback IPs as localhost", async () => {
    for (const host of ["127.0.0.1:3000", "[::1]:3000", "dev.localhost"]) {
      mocks.host = host;
      mocks.jar = mocks.makeJar({ __convexAuthToken: "tok" });
      expect((await getRequestCookies()).token).toBe("tok");
    }
  });
});

describe("getRequestCookiesInMiddleware", () => {
  it("reads from the request's own cookie jar", async () => {
    const request = new NextRequest("https://app.example.com/dashboard", {
      headers: {
        cookie: "__Host-__convexAuthToken=tok; __Host-__convexAuthRefreshToken=ref",
      },
    });
    const cookies = await getRequestCookiesInMiddleware(request);
    expect(cookies.token).toBe("tok");
    expect(cookies.refreshToken).toBe("ref");
  });
});

describe("getResponseCookies", () => {
  it("writes HttpOnly, Secure, SameSite=Lax cookies with __Host- prefix", async () => {
    const response = new NextResponse(null);
    const cookies = await getResponseCookies(response, { maxAge: null });
    cookies.token = "tok";
    cookies.refreshToken = "ref";
    const headers = setCookieHeaders(response);
    const tokenHeader = headers.find((h) => h.startsWith("__Host-__convexAuthToken="));
    const refreshHeader = headers.find((h) => h.startsWith("__Host-__convexAuthRefreshToken="));
    expect(tokenHeader).toContain("__Host-__convexAuthToken=tok");
    expect(refreshHeader).toContain("__Host-__convexAuthRefreshToken=ref");
    for (const header of [tokenHeader, refreshHeader]) {
      expect(header).toContain("HttpOnly");
      expect(header).toContain("Secure");
      expect(header).toContain("SameSite=lax");
      expect(header).toContain("Path=/");
    }
  });

  it("omits the prefix and Secure on localhost", async () => {
    mocks.host = "localhost:3000";
    const response = new NextResponse(null);
    const cookies = await getResponseCookies(response, { maxAge: null });
    cookies.token = "tok";
    const header = setCookieHeaders(response).find((h) => h.startsWith("__convexAuthToken="));
    expect(header).toBeDefined();
    expect(header).not.toContain("__Host-");
    expect(header).toContain("HttpOnly");
    expect(header).not.toContain("Secure");
  });

  it("writes the configured maxAge", async () => {
    const response = new NextResponse(null);
    const cookies = await getResponseCookies(response, { maxAge: 3600 });
    cookies.token = "tok";
    const header = setCookieHeaders(response).find((h) =>
      h.startsWith("__Host-__convexAuthToken="),
    );
    expect(header).toContain("Max-Age=3600");
  });

  it("honors per-cookie maxAgeMs for 2FA pending and trusted device", async () => {
    const response = new NextResponse(null);
    const cookies = await getResponseCookies(response, { maxAge: null });
    cookies.setTwoFactorPending("challenge", 600_000);
    cookies.setTrustedDevice("trusted", 86_400_000);
    const headers = setCookieHeaders(response);
    expect(headers.find((h) => h.startsWith("__Host-__convexAuthTwoFactorPending="))).toContain(
      "Max-Age=600",
    );
    expect(headers.find((h) => h.startsWith("__Host-__convexAuthTrustedDevice="))).toContain(
      "Max-Age=86400",
    );
  });

  it("clears cookies with an expired Set-Cookie", async () => {
    const response = new NextResponse(null);
    const cookies = await getResponseCookies(response, { maxAge: null });
    cookies.token = null;
    cookies.setTwoFactorPending(null);
    const headers = setCookieHeaders(response);
    const tokenHeader = headers.find((h) => h.startsWith("__Host-__convexAuthToken="));
    const pendingHeader = headers.find((h) => h.startsWith("__Host-__convexAuthTwoFactorPending="));
    expect(tokenHeader).toContain("__Host-__convexAuthToken=;");
    expect(tokenHeader).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect(pendingHeader).toMatch(/Expires=Thu, 01 Jan 1970/);
  });
});
