/**
 * Framework-neutral cookie plumbing for SSR adapters. Pure Web APIs — no
 * Next.js or TanStack imports. Adapters parse auth cookies off the incoming
 * `Request` and append `Set-Cookie` header strings to the outgoing
 * `Response`'s headers.
 *
 * Cookie names match the Next.js adapter exactly so an app can move between
 * adapters (or run both) without orphaning sessions.
 */

export const TOKEN_COOKIE = "__convexAuthToken";
export const REFRESH_TOKEN_COOKIE = "__convexAuthRefreshToken";
export const TWO_FACTOR_PENDING_COOKIE = "__convexAuthTwoFactorPending";
export const TRUSTED_DEVICE_COOKIE = "__convexAuthTrustedDevice";
export const LANDING_VERIFIER_COOKIE = "__convexAuthLandingVerifier";

export type AuthCookieValues = {
  token?: string | null;
  refreshToken?: string | null;
  twoFactorPending?: string | null;
  twoFactorPendingMaxAgeMs?: number;
  trustedDevice?: string | null;
  trustedDeviceMaxAgeMs?: number;
};

export type AuthCookieReadValues = {
  token: string | null;
  refreshToken: string | null;
  twoFactorPending: string | null;
  trustedDevice: string | null;
  landingVerifier: string | null;
};

/**
 * Cookie attributes written on every auth cookie. `Secure` is dropped on
 * localhost because Safari (and plain-HTTP dev generally) refuses Secure
 * cookies over `http://` — matching the Next.js adapter's behavior.
 */
export function isLocalHost(host: string) {
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

export function isLocalHostRequest(request: Request) {
  return isLocalHost(request.headers.get("Host") ?? "");
}

export function authCookieNames(isLocalhost: boolean) {
  const prefix = isLocalhost ? "" : "__Host-";
  return {
    token: prefix + TOKEN_COOKIE,
    refreshToken: prefix + REFRESH_TOKEN_COOKIE,
    twoFactorPending: prefix + TWO_FACTOR_PENDING_COOKIE,
    trustedDevice: prefix + TRUSTED_DEVICE_COOKIE,
  };
}

export function landingVerifierCookieName(isLocalhost: boolean) {
  return (isLocalhost ? "" : "__Host-") + LANDING_VERIFIER_COOKIE;
}

export function parseLandingVerifierCookie(request: Request): string | null {
  const name = landingVerifierCookieName(isLocalHostRequest(request));
  return parseCookieHeader(request.headers.get("cookie")).get(name) || null;
}

export function buildLandingVerifierSetCookie(value: string, isLocalhost: boolean): string {
  const parts = [`${landingVerifierCookieName(isLocalhost)}=${value}`, "Path=/", "SameSite=Lax"];
  if (!isLocalhost) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

export function generateLandingVerifier(): string {
  return globalThis.crypto.randomUUID();
}

/**
 * Parse the auth cookies off an incoming request's `Cookie` header. Values
 * are returned raw — our tokens are base64url/JWT charset, so nothing is
 * percent-encoded on the write side either.
 */
export function parseAuthCookies(request: Request): AuthCookieReadValues {
  const isLocalhost = isLocalHostRequest(request);
  const names = authCookieNames(isLocalhost);
  const jar = parseCookieHeader(request.headers.get("cookie"));
  return {
    token: jar.get(names.token) ?? null,
    refreshToken: jar.get(names.refreshToken) ?? null,
    twoFactorPending: jar.get(names.twoFactorPending) ?? null,
    trustedDevice: jar.get(names.trustedDevice) ?? null,
    landingVerifier: jar.get(landingVerifierCookieName(isLocalhost)) ?? null,
  };
}

function parseCookieHeader(header: string | null): Map<string, string> {
  const jar = new Map<string, string>();
  if (header === null) {
    return jar;
  }
  for (const pair of header.split(";")) {
    const eq = pair.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (name !== "" && !jar.has(name)) {
      jar.set(name, value);
    }
  }
  return jar;
}

/**
 * Serialize a single auth cookie write. `value === null` emits a clear
 * (epoch expiry, no Max-Age) — matching what the Next.js adapter's
 * `response.cookies.set(name, "", {expires: 0})` produces.
 */
function serializeAuthCookie(
  name: string,
  value: string | null,
  opts: { secure: boolean; maxAgeSeconds?: number },
): string {
  const parts = [`${name}=${value === null ? "" : value}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (opts.secure) {
    parts.push("Secure");
  }
  if (value === null) {
    parts.push("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
  } else if (opts.maxAgeSeconds !== undefined) {
    parts.push(`Max-Age=${Math.floor(opts.maxAgeSeconds)}`);
  }
  return parts.join("; ");
}

/**
 * Build the `Set-Cookie` header strings for an auth-cookie write.
 * `tokens === null` clears every auth cookie; a partial object writes only
 * the keys present.
 */
export function buildAuthSetCookies(
  tokens: AuthCookieValues | null,
  opts: { isLocalhost: boolean; maxAge: number | null },
): string[] {
  const names = authCookieNames(opts.isLocalhost);
  const secure = !opts.isLocalhost;
  const baseMaxAge = opts.maxAge ?? undefined;
  const strings: string[] = [];
  const write = (name: string, value: string | null, maxAgeSeconds?: number) => {
    strings.push(serializeAuthCookie(name, value, { secure, maxAgeSeconds }));
  };

  if (tokens === null) {
    write(names.token, null);
    write(names.refreshToken, null);
    write(names.twoFactorPending, null);
    write(names.trustedDevice, null);
    return strings;
  }
  if (tokens.token !== undefined) {
    write(names.token, tokens.token, baseMaxAge);
  }
  if (tokens.refreshToken !== undefined) {
    write(names.refreshToken, tokens.refreshToken, baseMaxAge);
  }
  if (tokens.twoFactorPending !== undefined) {
    write(
      names.twoFactorPending,
      tokens.twoFactorPending,
      tokens.twoFactorPendingMaxAgeMs !== undefined
        ? tokens.twoFactorPendingMaxAgeMs / 1000
        : baseMaxAge,
    );
  }
  if (tokens.trustedDevice !== undefined) {
    write(
      names.trustedDevice,
      tokens.trustedDevice,
      tokens.trustedDeviceMaxAgeMs !== undefined ? tokens.trustedDeviceMaxAgeMs / 1000 : baseMaxAge,
    );
  }
  return strings;
}

/**
 * Append auth `Set-Cookie` headers onto a response's headers. The response
 * must have mutable headers — responses the adapter itself constructs are
 * fine; a framework-vended response may need cloning first.
 */
export function appendAuthCookies(
  headers: Headers,
  tokens: AuthCookieValues | null,
  opts: { isLocalhost: boolean; maxAge: number | null },
): void {
  for (const cookie of buildAuthSetCookies(tokens, opts)) {
    headers.append("Set-Cookie", cookie);
  }
}

/**
 * Strip auth cookies from a cloned request's `Cookie` header — the
 * fetch-shaped equivalent of clearing a framework cookie jar. Returns a new
 * `Cookie` header value with the auth entries removed (`null` when nothing
 * remains); callers decide how to apply it (some frameworks can mutate
 * `request.headers`, others must wrap the request).
 */
export function stripAuthCookiesFromHeader(request: Request): string | null {
  const isLocalhost = isLocalHostRequest(request);
  const names = new Set(Object.values(authCookieNames(isLocalhost)));
  const kept: string[] = [];
  for (const [name, value] of parseCookieHeader(request.headers.get("cookie"))) {
    if (!names.has(name)) {
      kept.push(`${name}=${value}`);
    }
  }
  return kept.length > 0 ? kept.join("; ") : null;
}
