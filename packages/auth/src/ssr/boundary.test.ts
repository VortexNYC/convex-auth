import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FunctionReference } from "convex/server";
import { handleAuthRequestBoundary } from "./boundary.js";
import type { AuthTransport } from "./transport.js";

const updateSession = "auth:updateSession" as unknown as FunctionReference<"action", "public">;

const transport: AuthTransport = {
  query: vi.fn(),
  action: vi.fn(),
};
const actionMock = vi.mocked(transport.action);

const options = { actions: { updateSession }, transport };

function jwt(exp: number, iat: number): string {
  const payload = Buffer.from(JSON.stringify({ exp, iat })).toString("base64url");
  return `h.${payload}.s`;
}

function pageRequest(headers: Record<string, string> = {}, url = "https://app.example.com/") {
  return new Request(url, {
    headers: { host: "app.example.com", accept: "text/html", ...headers },
  });
}

beforeEach(() => {
  actionMock.mockReset();
});

describe("session-triple landing", () => {
  it("lands a verifier-bound triple into cookies and redirects stripped", async () => {
    const request = pageRequest(
      { cookie: "__Host-__convexAuthLandingVerifier=lv-1" },
      "https://app.example.com/dash?token=jwt-x&refreshToken=ref-y&sessionId=s1&landingVerifier=lv-1&other=keep",
    );
    const result = await handleAuthRequestBoundary(request, options);
    expect(result.kind).toBe("redirect");
    if (result.kind !== "redirect") return;
    expect(result.response.status).toBe(302);
    const location = result.response.headers.get("Location") ?? "";
    expect(location).toBe("https://app.example.com/dash?other=keep");
    const setCookies = result.response.headers.getSetCookie();
    expect(setCookies.find((h) => h.startsWith("__Host-__convexAuthToken=jwt-x"))).toBeDefined();
    expect(
      setCookies.find((h) => h.startsWith("__Host-__convexAuthRefreshToken=ref-y")),
    ).toBeDefined();
  });

  it("rejects a triple with no landingVerifier param and writes no auth cookies", async () => {
    const request = pageRequest(
      { cookie: "__Host-__convexAuthLandingVerifier=lv-1" },
      "https://app.example.com/dash?token=jwt-x&refreshToken=ref-y",
    );
    const result = await handleAuthRequestBoundary(request, options);
    expect(result.kind).toBe("redirect");
    if (result.kind !== "redirect") return;
    const setCookies = result.response.headers.getSetCookie();
    expect(setCookies.find((h) => h.includes("__convexAuthToken="))).toBeUndefined();
    expect(setCookies.find((h) => h.includes("__convexAuthRefreshToken="))).toBeUndefined();
  });

  it("rejects a triple whose landingVerifier mismatches the cookie", async () => {
    const request = pageRequest(
      { cookie: "__Host-__convexAuthLandingVerifier=lv-victim" },
      "https://app.example.com/dash?token=jwt-x&refreshToken=ref-y&landingVerifier=lv-attacker",
    );
    const result = await handleAuthRequestBoundary(request, options);
    if (result.kind !== "redirect") throw new Error("expected redirect");
    const setCookies = result.response.headers.getSetCookie();
    expect(setCookies.find((h) => h.includes("__convexAuthToken="))).toBeUndefined();
    // The victim's own verifier cookie is left untouched — no rotation.
    expect(
      setCookies.find((h) => h.startsWith("__Host-__convexAuthLandingVerifier=")),
    ).toBeUndefined();
  });

  it("rejects a verifier-bound triple when the browser has no cookie, and mints one", async () => {
    const request = pageRequest(
      {},
      "https://app.example.com/dash?token=jwt-x&refreshToken=ref-y&landingVerifier=lv-attacker",
    );
    const result = await handleAuthRequestBoundary(request, options);
    if (result.kind !== "redirect") throw new Error("expected redirect");
    const setCookies = result.response.headers.getSetCookie();
    expect(setCookies.find((h) => h.includes("__convexAuthToken="))).toBeUndefined();
    const verifierCookie = setCookies.find((h) =>
      h.startsWith("__Host-__convexAuthLandingVerifier="),
    );
    expect(verifierCookie).toBeDefined();
    expect(verifierCookie).toContain("Secure");
    expect(verifierCookie).not.toContain("HttpOnly");
  });

  it("rejects an empty landingVerifier param even against an empty cookie value", async () => {
    // `?landingVerifier=` parses to "" and an empty-valued cookie reads "" —
    // both normalize to absent so empty==empty can never satisfy the check.
    const request = pageRequest(
      { cookie: "__Host-__convexAuthLandingVerifier=" },
      "https://app.example.com/dash?token=jwt-x&refreshToken=ref-y&landingVerifier=",
    );
    const result = await handleAuthRequestBoundary(request, options);
    if (result.kind !== "redirect") throw new Error("expected redirect");
    const setCookies = result.response.headers.getSetCookie();
    expect(setCookies.find((h) => h.includes("__convexAuthToken="))).toBeUndefined();
  });

  it("lands a param-free triple when requireLandingVerifier is disabled", async () => {
    const request = pageRequest({}, "https://app.example.com/dash?token=jwt-x&refreshToken=ref-y");
    const result = await handleAuthRequestBoundary(request, {
      ...options,
      requireLandingVerifier: false,
    });
    if (result.kind !== "redirect") throw new Error("expected redirect");
    const setCookies = result.response.headers.getSetCookie();
    expect(setCookies.find((h) => h.startsWith("__Host-__convexAuthToken=jwt-x"))).toBeDefined();
  });

  it("never lands a triple on a cross-origin request, even in compat mode", async () => {
    // A credentialed cross-origin fetch can carry `accept: text/html` and the
    // session triple — CORS-failed responses still reach the browser's cookie
    // store, so writing auth cookies here is a login-CSRF write. Compat mode
    // relaxes the verifier check, never the same-origin requirement.
    const request = pageRequest(
      { origin: "https://evil.example.com" },
      "https://app.example.com/dash?token=jwt-x&refreshToken=ref-y&landingVerifier=lv-1",
    );
    const result = await handleAuthRequestBoundary(request, {
      ...options,
      requireLandingVerifier: false,
    });
    if (result.kind !== "redirect") throw new Error("expected redirect");
    const location = result.response.headers.get("Location") ?? "";
    expect(location).not.toContain("token=");
    const setCookies = result.response.headers.getSetCookie();
    expect(setCookies.find((h) => h.includes("__convexAuthToken="))).toBeUndefined();
    expect(setCookies.find((h) => h.includes("__convexAuthRefreshToken="))).toBeUndefined();
    // No verifier mint on a cross-origin response either — Set-Cookie is
    // reserved for same-origin traffic.
    expect(setCookies.find((h) => h.includes("__convexAuthLandingVerifier="))).toBeUndefined();
  });

  it("mints a landing verifier on navigations that lack the cookie", async () => {
    const result = await handleAuthRequestBoundary(pageRequest(), options);
    if (result.kind !== "refreshTokens") throw new Error("expected refreshTokens");
    expect(result.landingVerifier).toBeDefined();
    expect(typeof result.landingVerifier).toBe("string");
  });

  it("does not re-mint when the verifier cookie is already present", async () => {
    const result = await handleAuthRequestBoundary(
      pageRequest({ cookie: "__Host-__convexAuthLandingVerifier=lv-existing" }),
      options,
    );
    if (result.kind !== "refreshTokens") throw new Error("expected refreshTokens");
    expect(result.landingVerifier).toBeUndefined();
  });

  it("does not mint on non-navigation requests", async () => {
    const result = await handleAuthRequestBoundary(
      new Request("https://app.example.com/api/data", {
        headers: { host: "app.example.com", accept: "application/json" },
      }),
      options,
    );
    if (result.kind !== "refreshTokens") throw new Error("expected refreshTokens");
    expect(result.landingVerifier).toBeUndefined();
  });

  it("ignores a lone ?token= (password-reset link)", async () => {
    const request = pageRequest({}, "https://app.example.com/reset?token=abc");
    const result = await handleAuthRequestBoundary(request, options);
    expect(result.kind).toBe("refreshTokens");
  });

  it("ignores the triple on non-GET requests", async () => {
    const request = new Request("https://app.example.com/?token=a&refreshToken=b", {
      method: "POST",
      headers: { host: "app.example.com", accept: "text/html" },
    });
    const result = await handleAuthRequestBoundary(request, options);
    expect(result.kind).toBe("refreshTokens");
  });

  it("ignores the triple on non-HTML requests", async () => {
    const request = new Request("https://app.example.com/?token=a&refreshToken=b", {
      headers: { host: "app.example.com", accept: "application/json" },
    });
    const result = await handleAuthRequestBoundary(request, options);
    expect(result.kind).toBe("refreshTokens");
  });
});

describe("proactive refresh", () => {
  it("returns undefined when there are no tokens", async () => {
    const result = await handleAuthRequestBoundary(pageRequest(), options);
    expect(result.kind).toBe("refreshTokens");
    if (result.kind !== "refreshTokens") return;
    expect(result.refreshTokens).toBeUndefined();
    expect(actionMock).not.toHaveBeenCalled();
  });

  it("returns null when only one cookie is present", async () => {
    const result = await handleAuthRequestBoundary(
      pageRequest({ cookie: "__Host-__convexAuthToken=x" }),
      options,
    );
    if (result.kind !== "refreshTokens") throw new Error("expected refreshTokens");
    expect(result.refreshTokens).toBeNull();
  });

  it("does not refresh a token with plenty of life left", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = jwt(now + 3600, now);
    const result = await handleAuthRequestBoundary(
      pageRequest({
        cookie: `__Host-__convexAuthToken=${token}; __Host-__convexAuthRefreshToken=ref`,
      }),
      options,
    );
    if (result.kind !== "refreshTokens") throw new Error("expected refreshTokens");
    expect(result.refreshTokens).toBeUndefined();
    expect(actionMock).not.toHaveBeenCalled();
  });

  it("refreshes a near-expiry token and returns the new pair", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = jwt(now + 30, now - 3600);
    actionMock.mockResolvedValue({ token: "t2", refreshToken: "r2" });
    const result = await handleAuthRequestBoundary(
      pageRequest({
        cookie: `__Host-__convexAuthToken=${token}; __Host-__convexAuthRefreshToken=old-ref`,
      }),
      options,
    );
    if (result.kind !== "refreshTokens") throw new Error("expected refreshTokens");
    expect(result.refreshTokens).toEqual({ token: "t2", refreshToken: "r2" });
    expect(actionMock).toHaveBeenCalledWith(updateSession, { refreshToken: "old-ref" });
  });

  it("returns null when the action fails to mint", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = jwt(now + 30, now - 3600);
    actionMock.mockResolvedValue({ token: null });
    const result = await handleAuthRequestBoundary(
      pageRequest({
        cookie: `__Host-__convexAuthToken=${token}; __Host-__convexAuthRefreshToken=old-ref`,
      }),
      options,
    );
    if (result.kind !== "refreshTokens") throw new Error("expected refreshTokens");
    expect(result.refreshTokens).toBeNull();
  });

  it("returns null on undecodable tokens", async () => {
    const result = await handleAuthRequestBoundary(
      pageRequest({
        cookie: `__Host-__convexAuthToken=garbage; __Host-__convexAuthRefreshToken=ref`,
      }),
      options,
    );
    if (result.kind !== "refreshTokens") throw new Error("expected refreshTokens");
    expect(result.refreshTokens).toBeNull();
  });
});

describe("CORS strip", () => {
  it("returns a stripped cookie header for cross-origin requests", async () => {
    const request = pageRequest({
      origin: "https://evil.example.com",
      cookie: "__Host-__convexAuthToken=jwt; __Host-__convexAuthRefreshToken=ref; theme=dark",
    });
    const result = await handleAuthRequestBoundary(request, options);
    if (result.kind !== "refreshTokens") throw new Error("expected refreshTokens");
    expect(result.strippedCookieHeader).toBe("theme=dark");
  });

  it("returns null stripped header when only auth cookies were present", async () => {
    const request = pageRequest({
      origin: "https://evil.example.com",
      cookie: "__Host-__convexAuthToken=jwt",
    });
    const result = await handleAuthRequestBoundary(request, options);
    if (result.kind !== "refreshTokens") throw new Error("expected refreshTokens");
    expect(result.strippedCookieHeader).toBeNull();
  });

  it("does not refresh or call actions for cross-origin requests", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = jwt(now + 30, now - 3600); // near-expiry — would refresh if allowed
    const request = pageRequest({
      origin: "https://evil.example.com",
      cookie: `__Host-__convexAuthToken=${token}; __Host-__convexAuthRefreshToken=ref`,
    });
    const result = await handleAuthRequestBoundary(request, options);
    if (result.kind !== "refreshTokens") throw new Error("expected refreshTokens");
    expect(result.refreshTokens).toBeUndefined();
    // No Set-Cookie of any kind cross-origin — including the verifier.
    expect(result.landingVerifier).toBeUndefined();
    expect(actionMock).not.toHaveBeenCalled();
  });

  it("leaves same-origin requests untouched", async () => {
    const request = pageRequest({
      origin: "https://app.example.com",
      cookie: "__Host-__convexAuthToken=jwt",
    });
    const result = await handleAuthRequestBoundary(request, options);
    if (result.kind !== "refreshTokens") throw new Error("expected refreshTokens");
    expect(result.strippedCookieHeader).toBeUndefined();
  });
});
