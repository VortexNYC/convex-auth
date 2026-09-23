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

import { fetchAction } from "convex/nextjs";
import { proxyAuthActionToConvex, shouldProxyAuthAction } from "./proxy.js";

const fetchActionMock = vi.mocked(fetchAction);

const actionRef = (name: string) => name as unknown as FunctionReference<"action">;

const actions = {
  signUp: actionRef("auth:signUp"),
  signIn: actionRef("auth:signIn"),
  signOut: actionRef("auth:signOut"),
  updateSession: actionRef("auth:updateSession"),
  signInAnonymous: actionRef("auth:signInAnonymous"),
  linkAnonymousAccount: actionRef("auth:linkAnonymousAccount"),
  verifyEmailOtp: actionRef("auth:verifyEmailOtp"),
  callback: actionRef("auth:callback"),
  twoFactorVerifyTOTP: actionRef("auth:twoFactorVerifyTOTP"),
  twoFactorVerifyBackupCode: actionRef("auth:twoFactorVerifyBackupCode"),
  verifyPasskeyAuthentication: actionRef("auth:verifyPasskeyAuthentication"),
};

const options = { actions };

function postRequest(
  body: unknown,
  headers: Record<string, string> = {},
  { omitOrigin = false }: { omitOrigin?: boolean } = {},
): NextRequest {
  return new NextRequest("https://app.example.com/api/auth", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      host: "app.example.com",
      ...(omitOrigin ? {} : { origin: "https://app.example.com" }),
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mocks.host = "app.example.com";
  mocks.jar = mocks.makeJar();
  fetchActionMock.mockReset();
});

describe("request validation", () => {
  it("rejects non-POST requests", async () => {
    const request = new NextRequest("https://app.example.com/api/auth");
    const response = await proxyAuthActionToConvex(request, options);
    expect(response.status).toBe(405);
  });

  it("rejects cross-origin requests", async () => {
    const request = postRequest(
      { intent: "signIn", args: {} },
      { origin: "https://evil.example.com" },
    );
    const response = await proxyAuthActionToConvex(request, options);
    expect(response.status).toBe(403);
  });

  it("rejects a malformed Origin instead of throwing", async () => {
    const request = postRequest({ intent: "signIn", args: {} }, { origin: "not a url" });
    const response = await proxyAuthActionToConvex(request, options);
    expect(response.status).toBe(403);
  });

  it("rejects credentialed requests without a valid Origin (CSRF)", async () => {
    const request = postRequest(
      { intent: "signIn", args: {} },
      { cookie: "__Host-__convexAuthToken=x" },
      { omitOrigin: true },
    );
    const response = await proxyAuthActionToConvex(request, options);
    expect(response.status).toBe(403);
    expect(await response.text()).toContain("missing_or_null_origin");
  });

  it("allows credentialed requests whose Origin matches the request host", async () => {
    fetchActionMock.mockResolvedValue({ success: true });
    mocks.jar = mocks.makeJar({ "__Host-__convexAuthToken": "x" });
    const request = postRequest(
      { intent: "signOut", args: {} },
      { cookie: "__Host-__convexAuthToken=x" },
    );
    const response = await proxyAuthActionToConvex(request, options);
    expect(response.status).toBe(200);
  });

  it("rejects intents outside the allowlist", async () => {
    const response = await proxyAuthActionToConvex(
      postRequest({ intent: "deleteUser", args: {} }),
      options,
    );
    expect(response.status).toBe(400);
    expect(fetchActionMock).not.toHaveBeenCalled();
  });

  it("rejects allowed intents whose action is not configured", async () => {
    const response = await proxyAuthActionToConvex(
      postRequest({ intent: "signInAnonymous", args: {} }),
      { actions: { signIn: actionRef("auth:signIn") } as never },
    );
    expect(response.status).toBe(400);
    expect(fetchActionMock).not.toHaveBeenCalled();
  });
});

describe("session-minting actions", () => {
  it("writes minted tokens to HttpOnly cookies and strips them from the body", async () => {
    fetchActionMock.mockResolvedValue({
      token: "new-token",
      refreshToken: "new-refresh",
      sessionId: "sess_1",
      user: { id: "u1" },
    });
    const response = await proxyAuthActionToConvex(
      postRequest({ intent: "signIn", args: { email: "a@b.c", password: "pw" } }),
      options,
    );
    expect(response.status).toBe(200);
    expect(fetchActionMock).toHaveBeenCalledWith(
      actions.signIn,
      { email: "a@b.c", password: "pw" },
      expect.objectContaining({}),
    );
    const body = await response.json();
    expect(body.token).toBe("new-token");
    expect(body.sessionId).toBe("sess_1");
    expect(body.refreshToken).toBeUndefined();
    const setCookies = response.headers.getSetCookie();
    expect(
      setCookies.find((h) => h.startsWith("__Host-__convexAuthToken=new-token")),
    ).toBeDefined();
    expect(
      setCookies.find((h) => h.startsWith("__Host-__convexAuthRefreshToken=new-refresh")),
    ).toBeDefined();
  });

  it("clears a stale pending-challenge cookie when a session mints", async () => {
    fetchActionMock.mockResolvedValue({
      token: "t",
      refreshToken: "r",
      sessionId: "s",
    });
    const response = await proxyAuthActionToConvex(
      postRequest({ intent: "signIn", args: {} }),
      options,
    );
    const pending = response.headers
      .getSetCookie()
      .find((h) => h.startsWith("__Host-__convexAuthTwoFactorPending="));
    expect(pending).toMatch(/Expires=Thu, 01 Jan 1970/);
  });

  it("writes a 2FA challenge token to the pending cookie with its TTL", async () => {
    fetchActionMock.mockResolvedValue({
      twoFactorRedirect: true,
      twoFactorChallengeToken: "challenge-tok",
      twoFactorCookieMaxAgeMs: 300_000,
    });
    const response = await proxyAuthActionToConvex(
      postRequest({ intent: "signIn", args: { email: "a@b.c" } }),
      options,
    );
    const body = await response.json();
    expect(body.twoFactorRedirect).toBe(true);
    expect(body.twoFactorChallengeToken).toBeUndefined();
    const pending = response.headers
      .getSetCookie()
      .find((h) => h.startsWith("__Host-__convexAuthTwoFactorPending="));
    expect(pending).toContain("challenge-tok");
    expect(pending).toContain("Max-Age=300");
    // A pending challenge supersedes any existing session: the pair is
    // cleared so a stale session can't resurrect on the next server render
    // while the client shows the challenge form.
    const tokenCookie = response.headers
      .getSetCookie()
      .find((h) => h.startsWith("__Host-__convexAuthToken="));
    expect(tokenCookie).toMatch(/Expires=Thu, 01 Jan 1970/);
    const refreshCookie = response.headers
      .getSetCookie()
      .find((h) => h.startsWith("__Host-__convexAuthRefreshToken="));
    expect(refreshCookie).toMatch(/Expires=Thu, 01 Jan 1970/);
  });

  it("writes a trusted-device cookie when the session asks to trust", async () => {
    fetchActionMock.mockResolvedValue({
      token: "t",
      refreshToken: "r",
      sessionId: "s",
      trustDeviceToken: "tdt",
      trustDeviceMaxAgeMs: 86_400_000,
    });
    const response = await proxyAuthActionToConvex(
      postRequest({ intent: "signIn", args: {} }),
      options,
    );
    const trusted = response.headers
      .getSetCookie()
      .find((h) => h.startsWith("__Host-__convexAuthTrustedDevice="));
    expect(trusted).toContain("tdt");
    expect(trusted).toContain("Max-Age=86400");
    const body = await response.json();
    expect(body.trustDeviceToken).toBeUndefined();
    expect(body.trustDeviceMaxAgeMs).toBeUndefined();
  });
});

describe("server-side substitutions", () => {
  it("injects the refresh token cookie into updateSession args", async () => {
    fetchActionMock.mockResolvedValue({
      token: "rotated",
      refreshToken: "rotated-refresh",
      sessionId: "s",
    });
    mocks.jar = mocks.makeJar({
      "__Host-__convexAuthRefreshToken": "cookie-refresh",
    });
    const request = postRequest(
      { intent: "updateSession", args: {} },
      { cookie: "__Host-__convexAuthRefreshToken=cookie-refresh" },
    );
    await proxyAuthActionToConvex(request, options);
    expect(fetchActionMock).toHaveBeenCalledWith(
      actions.updateSession,
      { refreshToken: "cookie-refresh" },
      expect.objectContaining({}),
    );
  });

  it("omits the access token for updateSession so an expired JWT cannot reject the refresh", async () => {
    fetchActionMock.mockResolvedValue({ token: "t2", refreshToken: "r2" });
    mocks.jar = mocks.makeJar({
      "__Host-__convexAuthToken": "expired-jwt",
      "__Host-__convexAuthRefreshToken": "cookie-refresh",
    });
    const request = postRequest(
      { intent: "updateSession", args: {} },
      {
        cookie:
          "__Host-__convexAuthToken=expired-jwt; __Host-__convexAuthRefreshToken=cookie-refresh",
      },
    );
    await proxyAuthActionToConvex(request, options);
    expect(fetchActionMock).toHaveBeenCalledWith(
      actions.updateSession,
      { refreshToken: "cookie-refresh" },
      expect.not.objectContaining({ token: expect.anything() }),
    );
  });

  it("rejects updateSession when no refresh cookie is present", async () => {
    const response = await proxyAuthActionToConvex(
      postRequest({ intent: "updateSession", args: {} }),
      options,
    );
    expect(response.status).toBe(401);
    expect(fetchActionMock).not.toHaveBeenCalled();
  });

  it("overwrites a body-supplied refreshToken with the cookie value", async () => {
    fetchActionMock.mockResolvedValue({
      token: "rotated",
      refreshToken: "rotated-refresh",
      sessionId: "s",
    });
    mocks.jar = mocks.makeJar({
      "__Host-__convexAuthRefreshToken": "cookie-refresh",
    });
    const request = postRequest(
      {
        intent: "updateSession",
        args: { refreshToken: "attacker-supplied" },
      },
      { cookie: "__Host-__convexAuthRefreshToken=cookie-refresh" },
    );
    await proxyAuthActionToConvex(request, options);
    expect(fetchActionMock).toHaveBeenCalledWith(
      actions.updateSession,
      { refreshToken: "cookie-refresh" },
      expect.objectContaining({}),
    );
  });

  it("overwrites a body-supplied 2FA token with the pending cookie", async () => {
    fetchActionMock.mockResolvedValue({
      token: "t",
      refreshToken: "r",
      sessionId: "s",
    });
    mocks.jar = mocks.makeJar({
      "__Host-__convexAuthTwoFactorPending": "pending-tok",
    });
    const request = postRequest(
      {
        intent: "twoFactorVerifyTOTP",
        args: { code: "123456", token: "attacker-supplied" },
      },
      { cookie: "__Host-__convexAuthTwoFactorPending=pending-tok" },
    );
    await proxyAuthActionToConvex(request, options);
    expect(fetchActionMock).toHaveBeenCalledWith(
      actions.twoFactorVerifyTOTP,
      { code: "123456", token: "pending-tok" },
      expect.objectContaining({}),
    );
  });

  it("passes the access token as fetch auth for authenticated intents", async () => {
    fetchActionMock.mockResolvedValue({ token: "t", refreshToken: "r" });
    mocks.jar = mocks.makeJar({ "__Host-__convexAuthToken": "access-tok" });
    const request = postRequest(
      { intent: "linkAnonymousAccount", args: { email: "a@b.c", password: "pw" } },
      { cookie: "__Host-__convexAuthToken=access-tok" },
    );
    await proxyAuthActionToConvex(request, options);
    expect(fetchActionMock).toHaveBeenCalledWith(
      actions.linkAnonymousAccount,
      { email: "a@b.c", password: "pw" },
      expect.objectContaining({ token: "access-tok" }),
    );
  });

  it("substitutes the pending cookie for the 2FA challenge token arg", async () => {
    fetchActionMock.mockResolvedValue({
      token: "t",
      refreshToken: "r",
      sessionId: "s",
    });
    mocks.jar = mocks.makeJar({
      "__Host-__convexAuthTwoFactorPending": "pending-tok",
    });
    const request = postRequest(
      { intent: "twoFactorVerifyTOTP", args: { code: "123456" } },
      { cookie: "__Host-__convexAuthTwoFactorPending=pending-tok" },
    );
    await proxyAuthActionToConvex(request, options);
    expect(fetchActionMock).toHaveBeenCalledWith(
      actions.twoFactorVerifyTOTP,
      { code: "123456", token: "pending-tok" },
      expect.objectContaining({}),
    );
  });

  it("rejects 2FA verification when no pending challenge cookie exists", async () => {
    const response = await proxyAuthActionToConvex(
      postRequest({ intent: "twoFactorVerifyTOTP", args: { code: "123456" } }),
      options,
    );
    expect(response.status).toBe(401);
    expect(fetchActionMock).not.toHaveBeenCalled();
  });

  it("injects the trusted-device cookie into signIn args", async () => {
    fetchActionMock.mockResolvedValue({ token: "t", refreshToken: "r" });
    mocks.jar = mocks.makeJar({
      "__Host-__convexAuthTrustedDevice": "trusted-tok",
    });
    const request = postRequest(
      { intent: "signIn", args: { email: "a@b.c", password: "pw" } },
      { cookie: "__Host-__convexAuthTrustedDevice=trusted-tok" },
    );
    await proxyAuthActionToConvex(request, options);
    expect(fetchActionMock).toHaveBeenCalledWith(
      actions.signIn,
      {
        email: "a@b.c",
        password: "pw",
        trustedDeviceToken: "trusted-tok",
      },
      expect.objectContaining({}),
    );
  });

  it("deletes a body-supplied trustedDeviceToken when the cookie is absent", async () => {
    fetchActionMock.mockResolvedValue({ token: "t", refreshToken: "r" });
    const request = postRequest({
      intent: "signIn",
      args: { email: "a@b.c", password: "pw", trustedDeviceToken: "forged" },
    });
    await proxyAuthActionToConvex(request, options);
    expect(fetchActionMock).toHaveBeenCalledWith(
      actions.signIn,
      { email: "a@b.c", password: "pw" },
      expect.objectContaining({}),
    );
  });

  it("injects the landing-verifier cookie into callback args", async () => {
    fetchActionMock.mockResolvedValue({ token: "t", refreshToken: "r", sessionId: "s" });
    mocks.jar = mocks.makeJar({
      "__Host-__convexAuthLandingVerifier": "lv-cookie",
    });
    const request = postRequest(
      { intent: "callback", args: { provider: "github", code: "c", state: "st" } },
      { cookie: "__Host-__convexAuthLandingVerifier=lv-cookie" },
    );
    await proxyAuthActionToConvex(request, options);
    expect(fetchActionMock).toHaveBeenCalledWith(
      actions.callback,
      { provider: "github", code: "c", state: "st", landingVerifier: "lv-cookie" },
      expect.objectContaining({}),
    );
  });

  it("deletes a body-supplied landingVerifier when the cookie is absent", async () => {
    fetchActionMock.mockResolvedValue({ token: "t", refreshToken: "r", sessionId: "s" });
    const request = postRequest({
      intent: "callback",
      args: { provider: "github", code: "c", state: "st", landingVerifier: "lv-forged" },
    });
    await proxyAuthActionToConvex(request, options);
    expect(fetchActionMock).toHaveBeenCalledWith(
      actions.callback,
      { provider: "github", code: "c", state: "st" },
      expect.objectContaining({}),
    );
  });
});

describe("signOut", () => {
  it("clears every auth cookie on success", async () => {
    fetchActionMock.mockResolvedValue({ success: true });
    mocks.jar = mocks.makeJar({ "__Host-__convexAuthToken": "tok" });
    const request = postRequest(
      { intent: "signOut", args: {} },
      { cookie: "__Host-__convexAuthToken=tok" },
    );
    const response = await proxyAuthActionToConvex(request, options);
    expect(response.status).toBe(200);
    expect(fetchActionMock).toHaveBeenCalledWith(
      actions.signOut,
      expect.objectContaining({ token: "tok" }),
      expect.objectContaining({ token: "tok" }),
    );
    const setCookies = response.headers.getSetCookie();
    for (const name of [
      "__Host-__convexAuthToken",
      "__Host-__convexAuthRefreshToken",
      "__Host-__convexAuthTwoFactorPending",
      "__Host-__convexAuthTrustedDevice",
    ]) {
      const header = setCookies.find((h) => h.startsWith(`${name}=`));
      expect(header, name).toMatch(/Expires=Thu, 01 Jan 1970/);
    }
  });

  it("succeeds without calling the action when no session cookie exists", async () => {
    const response = await proxyAuthActionToConvex(
      postRequest({ intent: "signOut", args: {} }),
      options,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(fetchActionMock).not.toHaveBeenCalled();
  });

  it("still clears cookies when the action throws", async () => {
    fetchActionMock.mockRejectedValue(new Error("backend exploded"));
    mocks.jar = mocks.makeJar({ "__Host-__convexAuthToken": "tok" });
    const request = postRequest(
      { intent: "signOut", args: {} },
      { cookie: "__Host-__convexAuthToken=tok" },
    );
    const response = await proxyAuthActionToConvex(request, options);
    expect(response.status).toBe(400);
    expect(
      response.headers.getSetCookie().find((h) => h.startsWith("__Host-__convexAuthToken=")),
    ).toMatch(/Expires=Thu, 01 Jan 1970/);
  });
});

describe("failure paths", () => {
  it("returns the action error as JSON without minting cookies", async () => {
    fetchActionMock.mockRejectedValue(new Error("Invalid credentials"));
    const response = await proxyAuthActionToConvex(
      postRequest({ intent: "signIn", args: {} }),
      options,
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid credentials" });
    expect(response.headers.getSetCookie()).toHaveLength(0);
  });

  it("clears cookies when updateSession fails", async () => {
    fetchActionMock.mockRejectedValue(new Error("refresh token revoked"));
    mocks.jar = mocks.makeJar({
      "__Host-__convexAuthRefreshToken": "dead-refresh",
    });
    const request = postRequest(
      { intent: "updateSession", args: {} },
      { cookie: "__Host-__convexAuthRefreshToken=dead-refresh" },
    );
    const response = await proxyAuthActionToConvex(request, options);
    expect(response.status).toBe(400);
    expect(
      response.headers.getSetCookie().find((h) => h.startsWith("__Host-__convexAuthToken=")),
    ).toMatch(/Expires=Thu, 01 Jan 1970/);
  });

  it("clears cookies when a mint returns a null-token session", async () => {
    fetchActionMock.mockResolvedValue({ token: null, refreshToken: null });
    mocks.jar = mocks.makeJar({
      "__Host-__convexAuthRefreshToken": "spent",
    });
    const request = postRequest(
      { intent: "updateSession", args: {} },
      { cookie: "__Host-__convexAuthRefreshToken=spent" },
    );
    const response = await proxyAuthActionToConvex(request, options);
    expect(
      response.headers.getSetCookie().find((h) => h.startsWith("__Host-__convexAuthRefreshToken=")),
    ).toMatch(/Expires=Thu, 01 Jan 1970/);
  });
});

describe("shouldProxyAuthAction", () => {
  const at = (path: string) => new NextRequest(`https://app.example.com${path}`);

  it("matches the api route with and without trailing slash", () => {
    expect(shouldProxyAuthAction(at("/api/auth"), "/api/auth")).toBe(true);
    expect(shouldProxyAuthAction(at("/api/auth/"), "/api/auth")).toBe(true);
    expect(shouldProxyAuthAction(at("/api/auth"), "/api/auth/")).toBe(true);
  });

  it("does not match other routes or subpaths", () => {
    expect(shouldProxyAuthAction(at("/api/auth/callback"), "/api/auth")).toBe(false);
    expect(shouldProxyAuthAction(at("/api/other"), "/api/auth")).toBe(false);
    expect(shouldProxyAuthAction(at("/api/authenticate"), "/api/auth")).toBe(false);
  });
});
