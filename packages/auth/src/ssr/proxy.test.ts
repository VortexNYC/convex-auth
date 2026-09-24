import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FunctionReference } from "convex/server";
import { proxyAuthActionToConvex, shouldProxyAuthAction } from "./proxy.js";
import type { AuthTransport } from "./transport.js";

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

const transport: AuthTransport = {
  query: vi.fn(),
  action: vi.fn(),
};
const actionMock = vi.mocked(transport.action);

const options = { actions, transport };

function postRequest(
  body: unknown,
  headers: Record<string, string> = {},
  { omitOrigin = false }: { omitOrigin?: boolean } = {},
): Request {
  return new Request("https://app.example.com/api/auth", {
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
  actionMock.mockReset();
});

describe("request validation", () => {
  it("rejects non-POST requests", async () => {
    const request = new Request("https://app.example.com/api/auth");
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
    actionMock.mockResolvedValue({ success: true });
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
    expect(actionMock).not.toHaveBeenCalled();
  });

  it("rejects allowed intents whose action is not configured", async () => {
    const response = await proxyAuthActionToConvex(
      postRequest({ intent: "signInAnonymous", args: {} }),
      {
        actions: { signIn: actionRef("auth:signIn") } as never,
        transport,
      },
    );
    expect(response.status).toBe(400);
    expect(actionMock).not.toHaveBeenCalled();
  });
});

describe("session-minting actions", () => {
  it("writes minted tokens to HttpOnly cookies and strips them from the body", async () => {
    actionMock.mockResolvedValue({
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
    expect(actionMock).toHaveBeenCalledWith(
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
    actionMock.mockResolvedValue({
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
    actionMock.mockResolvedValue({
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
    actionMock.mockResolvedValue({
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

describe("cookie substitutions", () => {
  it("updateSession substitutes the refresh token from cookies", async () => {
    actionMock.mockResolvedValue({ token: "t2", refreshToken: "r2" });
    const response = await proxyAuthActionToConvex(
      postRequest(
        { intent: "updateSession", args: {} },
        { cookie: "__Host-__convexAuthRefreshToken=old-refresh" },
      ),
      options,
    );
    expect(response.status).toBe(200);
    expect(actionMock).toHaveBeenCalledWith(
      actions.updateSession,
      { refreshToken: "old-refresh" },
      expect.objectContaining({}),
    );
    const setCookies = response.headers.getSetCookie();
    expect(setCookies.find((h) => h.startsWith("__Host-__convexAuthToken=t2"))).toBeDefined();
  });

  it("updateSession omits the access token so an expired JWT cannot reject the refresh", async () => {
    actionMock.mockResolvedValue({ token: "t2", refreshToken: "r2" });
    const response = await proxyAuthActionToConvex(
      postRequest(
        { intent: "updateSession", args: {} },
        {
          cookie:
            "__Host-__convexAuthToken=expired-jwt; __Host-__convexAuthRefreshToken=old-refresh",
        },
      ),
      options,
    );
    expect(response.status).toBe(200);
    expect(actionMock).toHaveBeenCalledWith(
      actions.updateSession,
      { refreshToken: "old-refresh" },
      {},
    );
  });

  it("updateSession without a refresh cookie returns 401", async () => {
    const response = await proxyAuthActionToConvex(
      postRequest({ intent: "updateSession", args: {} }),
      options,
    );
    expect(response.status).toBe(401);
    expect(actionMock).not.toHaveBeenCalled();
  });

  it("2FA verify substitutes the pending token from its cookie", async () => {
    actionMock.mockResolvedValue({ token: "t", refreshToken: "r" });
    await proxyAuthActionToConvex(
      postRequest(
        { intent: "twoFactorVerifyTOTP", args: { code: "123456" } },
        { cookie: "__Host-__convexAuthTwoFactorPending=pending-tok" },
      ),
      options,
    );
    expect(actionMock).toHaveBeenCalledWith(
      actions.twoFactorVerifyTOTP,
      { code: "123456", token: "pending-tok" },
      expect.objectContaining({}),
    );
  });

  it("2FA verify without a pending cookie returns 401", async () => {
    const response = await proxyAuthActionToConvex(
      postRequest({ intent: "twoFactorVerifyTOTP", args: { code: "123456" } }),
      options,
    );
    expect(response.status).toBe(401);
    expect(actionMock).not.toHaveBeenCalled();
  });

  it("signIn forwards a trusted-device cookie as trustedDeviceToken", async () => {
    actionMock.mockResolvedValue({ token: "t", refreshToken: "r" });
    await proxyAuthActionToConvex(
      postRequest(
        { intent: "signIn", args: { email: "a@b.c" } },
        { cookie: "__Host-__convexAuthTrustedDevice=td" },
      ),
      options,
    );
    expect(actionMock).toHaveBeenCalledWith(
      actions.signIn,
      { email: "a@b.c", trustedDeviceToken: "td" },
      expect.objectContaining({}),
    );
  });

  it("signIn drops a body-supplied trustedDeviceToken when no cookie is present", async () => {
    actionMock.mockResolvedValue({ token: "t", refreshToken: "r" });
    await proxyAuthActionToConvex(
      postRequest({
        intent: "signIn",
        args: { email: "a@b.c", trustedDeviceToken: "attacker-supplied" },
      }),
      options,
    );
    expect(actionMock).toHaveBeenCalledWith(
      actions.signIn,
      { email: "a@b.c" },
      expect.objectContaining({}),
    );
  });

  it("signIn's trusted-device cookie overwrites a body-supplied value", async () => {
    actionMock.mockResolvedValue({ token: "t", refreshToken: "r" });
    await proxyAuthActionToConvex(
      postRequest(
        {
          intent: "signIn",
          args: { email: "a@b.c", trustedDeviceToken: "attacker-supplied" },
        },
        { cookie: "__Host-__convexAuthTrustedDevice=real-device" },
      ),
      options,
    );
    expect(actionMock).toHaveBeenCalledWith(
      actions.signIn,
      { email: "a@b.c", trustedDeviceToken: "real-device" },
      expect.objectContaining({}),
    );
  });

  it("signIn injects the landing-verifier cookie and drops a forged body value", async () => {
    actionMock.mockResolvedValue({ token: "t", refreshToken: "r" });
    await proxyAuthActionToConvex(
      postRequest(
        {
          intent: "signIn",
          args: { email: "a@b.c", landingVerifier: "lv-forged" },
        },
        { cookie: "__Host-__convexAuthLandingVerifier=lv-cookie" },
      ),
      options,
    );
    expect(actionMock).toHaveBeenCalledWith(
      actions.signIn,
      { email: "a@b.c", landingVerifier: "lv-cookie" },
      expect.objectContaining({}),
    );
  });

  it("signIn drops a body-supplied landingVerifier when no cookie is present", async () => {
    actionMock.mockResolvedValue({ token: "t", refreshToken: "r" });
    await proxyAuthActionToConvex(
      postRequest({
        intent: "signIn",
        args: { email: "a@b.c", landingVerifier: "lv-forged" },
      }),
      options,
    );
    expect(actionMock).toHaveBeenCalledWith(
      actions.signIn,
      { email: "a@b.c" },
      expect.objectContaining({}),
    );
  });

  it("updateSession's refresh cookie overwrites a body-supplied refreshToken", async () => {
    actionMock.mockResolvedValue({ token: "t2", refreshToken: "r2" });
    await proxyAuthActionToConvex(
      postRequest(
        { intent: "updateSession", args: { refreshToken: "attacker-supplied" } },
        { cookie: "__Host-__convexAuthRefreshToken=real-refresh" },
      ),
      options,
    );
    expect(actionMock).toHaveBeenCalledWith(
      actions.updateSession,
      { refreshToken: "real-refresh" },
      expect.objectContaining({}),
    );
  });

  it("callback injects the landing-verifier cookie as args.landingVerifier", async () => {
    actionMock.mockResolvedValue({ token: "t", refreshToken: "r", sessionId: "s" });
    await proxyAuthActionToConvex(
      postRequest(
        { intent: "callback", args: { provider: "github", code: "c", state: "st" } },
        { cookie: "__Host-__convexAuthLandingVerifier=lv-cookie" },
      ),
      options,
    );
    expect(actionMock).toHaveBeenCalledWith(
      actions.callback,
      { provider: "github", code: "c", state: "st", landingVerifier: "lv-cookie" },
      expect.objectContaining({}),
    );
  });

  it("callback drops a body-supplied landingVerifier when no cookie is present", async () => {
    actionMock.mockResolvedValue({ token: "t", refreshToken: "r", sessionId: "s" });
    await proxyAuthActionToConvex(
      postRequest({
        intent: "callback",
        args: { provider: "github", code: "c", state: "st", landingVerifier: "lv-forged" },
      }),
      options,
    );
    expect(actionMock).toHaveBeenCalledWith(
      actions.callback,
      { provider: "github", code: "c", state: "st" },
      expect.objectContaining({}),
    );
  });

  it("callback's verifier cookie overwrites a body-supplied value", async () => {
    actionMock.mockResolvedValue({ token: "t", refreshToken: "r", sessionId: "s" });
    await proxyAuthActionToConvex(
      postRequest(
        {
          intent: "callback",
          args: { provider: "github", code: "c", state: "st", landingVerifier: "lv-forged" },
        },
        { cookie: "__Host-__convexAuthLandingVerifier=lv-cookie" },
      ),
      options,
    );
    expect(actionMock).toHaveBeenCalledWith(
      actions.callback,
      { provider: "github", code: "c", state: "st", landingVerifier: "lv-cookie" },
      expect.objectContaining({}),
    );
  });

  it("passes the session token as the caller's auth on action calls", async () => {
    actionMock.mockResolvedValue({ success: true });
    await proxyAuthActionToConvex(
      postRequest({ intent: "signOut", args: {} }, { cookie: "__Host-__convexAuthToken=the-jwt" }),
      options,
    );
    expect(actionMock).toHaveBeenCalledWith(
      actions.signOut,
      { token: "the-jwt" },
      expect.objectContaining({ token: "the-jwt" }),
    );
  });
});

describe("signOut", () => {
  it("succeeds with no session cookie and still clears cookies", async () => {
    const response = await proxyAuthActionToConvex(
      postRequest({ intent: "signOut", args: {} }),
      options,
    );
    expect(response.status).toBe(200);
    expect(actionMock).not.toHaveBeenCalled();
    const setCookies = response.headers.getSetCookie();
    expect(
      setCookies.find(
        (h) => h.startsWith("__Host-__convexAuthToken=") && h.includes("Expires=Thu, 01 Jan 1970"),
      ),
    ).toBeDefined();
  });

  it("clears cookies even when the action throws", async () => {
    actionMock.mockRejectedValue(new Error("backend down"));
    const response = await proxyAuthActionToConvex(
      postRequest({ intent: "signOut", args: {} }, { cookie: "__Host-__convexAuthToken=x" }),
      options,
    );
    expect(response.status).toBe(400);
    const setCookies = response.headers.getSetCookie();
    expect(
      setCookies.find(
        (h) => h.startsWith("__Host-__convexAuthToken=") && h.includes("Expires=Thu, 01 Jan 1970"),
      ),
    ).toBeDefined();
  });
});

describe("localhost cookie naming", () => {
  it("drops the __Host- prefix on localhost", async () => {
    actionMock.mockResolvedValue({ token: "t", refreshToken: "r" });
    const request = new Request("http://localhost:3000/api/auth", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        host: "localhost:3000",
        origin: "http://localhost:3000",
      },
      body: JSON.stringify({ intent: "signIn", args: {} }),
    });
    const response = await proxyAuthActionToConvex(request, options);
    const setCookies = response.headers.getSetCookie();
    expect(setCookies.find((h) => h.startsWith("__convexAuthToken=t"))).toBeDefined();
    expect(setCookies.find((h) => h.startsWith("__Host-"))).toBeUndefined();
    expect(setCookies.every((h) => !h.includes("Secure"))).toBe(true);
  });
});

describe("cookieConfig", () => {
  it("rejects a non-positive maxAge", async () => {
    await expect(
      proxyAuthActionToConvex(postRequest({ intent: "signIn", args: {} }), {
        ...options,
        cookieConfig: { maxAge: 0 },
      }),
    ).rejects.toThrow("cookieConfig.maxAge");
    await expect(
      proxyAuthActionToConvex(postRequest({ intent: "signIn", args: {} }), {
        ...options,
        cookieConfig: { maxAge: -60 },
      }),
    ).rejects.toThrow("cookieConfig.maxAge");
    expect(actionMock).not.toHaveBeenCalled();
  });
});

describe("shouldProxyAuthAction", () => {
  const req = (path: string) => new Request(`https://app.example.com${path}`);
  it("matches the api route with and without trailing slash", () => {
    expect(shouldProxyAuthAction(req("/api/auth"), "/api/auth")).toBe(true);
    expect(shouldProxyAuthAction(req("/api/auth/"), "/api/auth")).toBe(true);
    expect(shouldProxyAuthAction(req("/api/auth"), "/api/auth/")).toBe(true);
  });
  it("does not match subpaths or other routes", () => {
    expect(shouldProxyAuthAction(req("/api/auth/sign-in"), "/api/auth")).toBe(false);
    expect(shouldProxyAuthAction(req("/api/authx"), "/api/auth")).toBe(false);
    expect(shouldProxyAuthAction(req("/other"), "/api/auth")).toBe(false);
  });
});
