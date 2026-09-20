import { NextRequest, NextResponse } from "next/server";
import type { NextjsOptions } from "convex/nextjs";
import {
  getRequestCookiesInMiddleware,
  getResponseCookies,
  type AuthCookieStore,
} from "./cookies.js";

export function jsonResponse(body: unknown, status = 200) {
  return new NextResponse(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

export type AuthCookieValues = {
  token?: string | null;
  refreshToken?: string | null;
  twoFactorPending?: string | null;
  twoFactorPendingMaxAgeMs?: number;
  trustedDevice?: string | null;
  trustedDeviceMaxAgeMs?: number;
};

/**
 * Write auth cookies on a response. `null` clears every auth cookie; a partial
 * object writes only the keys present.
 */
export async function setAuthCookies(
  response: NextResponse,
  tokens: AuthCookieValues | null,
  cookieConfig: { maxAge: number | null },
) {
  const responseCookies = await getResponseCookies(response, cookieConfig);
  writeAuthCookies(responseCookies, tokens);
}

function writeAuthCookies(store: AuthCookieStore, tokens: AuthCookieValues | null) {
  if (tokens === null) {
    store.token = null;
    store.refreshToken = null;
    store.setTwoFactorPending(null);
    store.setTrustedDevice(null);
    return;
  }
  if (tokens.token !== undefined) {
    store.token = tokens.token;
  }
  if (tokens.refreshToken !== undefined) {
    store.refreshToken = tokens.refreshToken;
  }
  if (tokens.twoFactorPending !== undefined) {
    store.setTwoFactorPending(tokens.twoFactorPending, tokens.twoFactorPendingMaxAgeMs);
  }
  if (tokens.trustedDevice !== undefined) {
    store.setTrustedDevice(tokens.trustedDevice, tokens.trustedDeviceMaxAgeMs);
  }
}

/**
 * Forward refreshed auth cookies from the middleware onto the request so the
 * downstream handler sees the new values.
 */
export async function setAuthCookiesInMiddleware(
  request: NextRequest,
  tokens: { token: string; refreshToken: string } | null,
) {
  const requestCookies = await getRequestCookiesInMiddleware(request);
  if (tokens === null) {
    requestCookies.token = null;
    requestCookies.refreshToken = null;
  } else {
    requestCookies.token = tokens.token;
    requestCookies.refreshToken = tokens.refreshToken;
  }
}

export function isCorsRequest(request: NextRequest) {
  const origin = request.headers.get("Origin");
  if (origin === null) {
    return false;
  }
  // A malformed Origin cannot be proven same-origin — treat as cross-origin.
  try {
    const originURL = new URL(origin);
    return (
      originURL.host !== request.headers.get("Host") ||
      originURL.protocol !== new URL(request.url).protocol
    );
  } catch {
    return true;
  }
}

export function logVerbose(message: string, verbose: boolean) {
  if (verbose) {
    console.debug(`[verbose] ${new Date().toISOString()} [ConvexAuthNextjs] ${message}`);
  }
}

/**
 * @param options - a subset of ConvexAuthNextjsMiddlewareOptions
 * @returns NextjsOptions
 */
export function getConvexNextjsOptions(options: { convexUrl?: string }): NextjsOptions {
  // If `convexUrl` is provided (even if it's undefined), pass it as the `url`
  // option. `convex/nextjs` falls back to `process.env.NEXT_PUBLIC_CONVEX_URL`.
  if (Object.hasOwn(options, "convexUrl")) {
    return {
      url: options.convexUrl,
    };
  }
  return {};
}

export function decodeTokenClaims(token: string): { exp?: number; iat?: number } | null {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) {
    return null;
  }
  const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (normalized.length % 4)) % 4;
  try {
    return JSON.parse(atob(normalized + "=".repeat(padding))) as {
      exp?: number;
      iat?: number;
    };
  } catch {
    return null;
  }
}
