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
  it("lands ?token=&refreshToken=&sessionId= into cookies and redirects stripped", async () => {
    const request = pageRequest(
      {},
      "https://app.example.com/dash?token=jwt-x&refreshToken=ref-y&sessionId=s1&other=keep",
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
