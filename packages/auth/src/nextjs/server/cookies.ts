import { cookies as nextCookies, headers as nextHeaders } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

/**
 * Before Next.js 15 introduced Async Request APIs
 * (https://nextjs.org/blog/next-15#async-request-apis-breaking-change) many
 * APIs were sync. Keep both call shapes working.
 */
type RememberNext14<F> = F extends (...args: infer Args) => infer Return
  ? (...args: Args) => Return | Awaited<Return>
  : never;

const cookies = nextCookies as RememberNext14<typeof nextCookies>;
const headers = nextHeaders as RememberNext14<typeof nextHeaders>;

export const TOKEN_COOKIE = "__convexAuthToken";
export const REFRESH_TOKEN_COOKIE = "__convexAuthRefreshToken";
export const TWO_FACTOR_PENDING_COOKIE = "__convexAuthTwoFactorPending";
export const TRUSTED_DEVICE_COOKIE = "__convexAuthTrustedDevice";
export const LANDING_VERIFIER_COOKIE = "__convexAuthLandingVerifier";

export async function getRequestCookies() {
  // maxAge doesn't matter for request cookies since they're only relevant for
  // the length of the request
  return getCookieStore(await headers(), await cookies(), {
    maxAge: null,
  });
}

export async function getRequestCookiesInMiddleware(request: NextRequest) {
  return getCookieStore(await headers(), request.cookies, { maxAge: null });
}

export async function getResponseCookies(
  response: NextResponse,
  cookieConfig: {
    maxAge: number | null;
  },
) {
  return getCookieStore(await headers(), response.cookies, cookieConfig);
}

export type AuthCookieStore = {
  token: string | null;
  refreshToken: string | null;
  readonly twoFactorPending: string | null;
  readonly trustedDevice: string | null;
  /**
   * The landing verifier — a CSRF binding nonce, not a credential. It is
   * non-HttpOnly (the client reads it to bind flow initiation) and is never
   * cleared by `setValue`-based auth-cookie writes.
   */
  readonly landingVerifier: string | null;
  setTwoFactorPending(value: string | null, maxAgeMs?: number): void;
  setTrustedDevice(value: string | null, maxAgeMs?: number): void;
};

function getCookieStore(
  requestHeaders: Headers,
  responseCookies: NextResponse["cookies"] | NextRequest["cookies"],
  cookieConfig: {
    maxAge: number | null;
  },
): AuthCookieStore {
  const isLocalhost = isLocalHost(requestHeaders.get("Host") ?? "");
  const prefix = isLocalhost ? "" : "__Host-";
  const tokenName = prefix + TOKEN_COOKIE;
  const refreshTokenName = prefix + REFRESH_TOKEN_COOKIE;
  const twoFactorPendingName = prefix + TWO_FACTOR_PENDING_COOKIE;
  const trustedDeviceName = prefix + TRUSTED_DEVICE_COOKIE;
  const landingVerifierName = prefix + LANDING_VERIFIER_COOKIE;
  function getValue(name: string) {
    return responseCookies.get(name)?.value ?? null;
  }
  const cookieOptions = getCookieOptions(isLocalhost, cookieConfig);
  function setValue(name: string, value: string | null, maxAgeMs?: number) {
    if (value === null) {
      // Only request cookies have a `size` property
      if ("size" in responseCookies) {
        responseCookies.delete(name);
      } else {
        // See https://github.com/vercel/next.js/issues/56632
        // for why .delete({}) doesn't work:
        responseCookies.set(name, "", {
          ...cookieOptions,
          maxAge: undefined,
          expires: 0,
        });
      }
    } else {
      responseCookies.set(name, value, {
        ...cookieOptions,
        maxAge: maxAgeMs !== undefined ? Math.floor(maxAgeMs / 1000) : cookieOptions.maxAge,
      });
    }
  }
  return {
    get token() {
      return getValue(tokenName);
    },
    set token(value: string | null) {
      setValue(tokenName, value);
    },
    get refreshToken() {
      return getValue(refreshTokenName);
    },
    set refreshToken(value: string | null) {
      setValue(refreshTokenName, value);
    },
    get twoFactorPending() {
      return getValue(twoFactorPendingName);
    },
    setTwoFactorPending(value, maxAgeMs) {
      setValue(twoFactorPendingName, value, maxAgeMs);
    },
    get trustedDevice() {
      return getValue(trustedDeviceName);
    },
    setTrustedDevice(value, maxAgeMs) {
      setValue(trustedDeviceName, value, maxAgeMs);
    },
    get landingVerifier() {
      // Empty reads as absent — an empty cookie must never satisfy the
      // strict landing check against an empty `landingVerifier` param.
      return getValue(landingVerifierName) || null;
    },
  };
}

/**
 * Write the landing verifier on a response. Non-HttpOnly — the client reads
 * it to bind OAuth/magic-link initiation to this browser — session-scoped,
 * and `Secure` everywhere except localhost.
 */
export function setLandingVerifierCookie(
  response: NextResponse,
  value: string,
  requestHeaders: Headers,
) {
  const isLocalhost = isLocalHost(requestHeaders.get("Host") ?? "");
  const prefix = isLocalhost ? "" : "__Host-";
  response.cookies.set(prefix + LANDING_VERIFIER_COOKIE, value, {
    httpOnly: false,
    secure: !isLocalhost,
    sameSite: "lax",
    path: "/",
  });
}

function getCookieOptions(isLocalhost: boolean, cookieConfig: { maxAge: number | null }) {
  // Safari does not send cookies with `secure: true` on http:// domains
  // including localhost, so set `secure: false` there.
  return {
    secure: !isLocalhost,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: cookieConfig.maxAge ?? undefined,
  } as const;
}

function isLocalHost(host: string) {
  // IPv6 hosts arrive bracketed (`[::1]:3000`); strip brackets before the
  // port split so the hostname survives.
  const hostname = host.startsWith("[")
    ? host.slice(1, host.indexOf("]"))
    : (host.split(":")[0] ?? "");
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost")
  );
}
