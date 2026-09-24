import {
  appendAuthCookies,
  buildLandingVerifierSetCookie,
  generateLandingVerifier,
  isLocalHostRequest,
  parseAuthCookies,
  parseLandingVerifierCookie,
  stripAuthCookiesFromHeader,
  type AuthCookieReadValues,
  type AuthCookieValues,
} from "./cookies.js";
import type { AuthTransport } from "./transport.js";
import { decodeTokenClaims, isCorsRequest, logVerbose } from "./utils.js";
import type { FunctionReference } from "convex/server";

export type AuthBoundaryCoreResult<R extends Response = Response> =
  | { kind: "redirect"; response: R }
  | {
      kind: "refreshTokens";
      refreshTokens: { token: string; refreshToken: string } | null | undefined;
      /**
       * When a cross-origin request was detected, the auth cookies it
       * carried must not flow downstream. Carries the `Cookie` header value
       * with auth entries stripped (`null` when nothing remains) so the
       * adapter can rewrite the forwarded request. Absent when the adapter
       * strips cookies by mutating its own request jar instead.
       */
      strippedCookieHeader?: string | null;
      /**
       * A fresh landing verifier to Set-Cookie on the response, present when
       * a navigation arrived without one. The adapter must serialize it
       * non-HttpOnly (`buildLandingVerifierSetCookie` / equivalent) — the
       * client reads it to bind OAuth/magic-link initiation to this browser.
       */
      landingVerifier?: string;
    };

export type AuthBoundaryResult = AuthBoundaryCoreResult;

export type AuthBoundaryCoreOptions = {
  actions: { updateSession: FunctionReference<"action", "public"> };
  cookieConfig?: { maxAge: number | null };
  /**
   * Require session-triple landings (`?token=&refreshToken=`) to carry a
   * `landingVerifier` param matching the landing-verifier cookie minted at
   * flow initiation. This binds OAuth/magic-link landings to the browser
   * that started the flow, closing the cross-browser login-CSRF gap.
   *
   * Defaults to `true`. Set `false` only while a deployment predates
   * verifier threading, or when magic links must open in a different
   * browser than the one that requested them.
   */
  requireLandingVerifier?: boolean;
};

/**
 * The framework seams of the request boundary: how cookies are read, how
 * cross-origin auth cookies are kept off the forwarded request, how
 * redirects/cookie writes/verifier mints are applied, how the refresh action
 * is invoked, and where verbose logs go. The decision tree lives in
 * `runAuthBoundary` so adapters cannot drift.
 */
export type AuthBoundaryIO<R extends Response = Response> = {
  /**
   * The session cookie jar — token, refresh token, 2FA pending, trusted
   * device — used for the refresh decision.
   */
  readCookies(request: Request): AuthCookieReadValues | Promise<AuthCookieReadValues>;
  /**
   * The landing verifier carried by the request — read from the
   * request-bound jar, not the canonical session store (frameworks like
   * Next.js keep them distinct: `request.cookies` vs `cookies()`).
   */
  readLandingVerifier(request: Request): string | null | Promise<string | null>;
  /**
   * Called only on cross-origin requests. Keep the auth cookies the request
   * carried from reaching the app — either rewrite the forwarded `Cookie`
   * header (return the stripped header, `null` when nothing remains) or
   * clear them on the framework's own request jar (return `undefined`).
   */
  stripForwardedAuthCookies(
    request: Request,
  ): string | null | undefined | Promise<string | null | undefined>;
  redirect(url: URL): R;
  writeCookies(response: R, cookies: AuthCookieValues | null): void | Promise<void>;
  writeLandingVerifier(response: R, value: string, request: Request): void | Promise<void>;
  callAction(
    action: FunctionReference<"action", "public">,
    args: Record<string, unknown>,
  ): Promise<unknown>;
  log(message: string): void;
};

/**
 * The shared request-boundary auth pass: land OAuth/magic-link session
 * triples into cookies, and proactively rotate the session when the access
 * token is near expiry. Returns either a redirect (session triple landed or
 * rejected) or the refresh decision for the adapter to apply.
 */
export async function runAuthBoundary<R extends Response = Response>(
  request: Request,
  options: AuthBoundaryCoreOptions,
  io: AuthBoundaryIO<R>,
): Promise<AuthBoundaryCoreResult<R>> {
  io.log(`Begin request boundary`);
  const requestUrl = new URL(request.url);
  const isNavigation =
    request.method === "GET" && request.headers.get("accept")?.includes("text/html") === true;
  const requireLandingVerifier = options.requireLandingVerifier !== false;

  const isCors = isCorsRequest(request);
  const strippedCookieHeader = isCors ? await io.stripForwardedAuthCookies(request) : undefined;
  const cookieVerifier = await io.readLandingVerifier(request);

  const paramToken = requestUrl.searchParams.get("token");
  const paramRefreshToken = requestUrl.searchParams.get("refreshToken");
  if (paramToken !== null && paramRefreshToken !== null && isNavigation) {
    io.log(`Handling session params on navigation`);
    const redirectUrl = new URL(requestUrl);
    redirectUrl.searchParams.delete("token");
    redirectUrl.searchParams.delete("refreshToken");
    redirectUrl.searchParams.delete("sessionId");
    redirectUrl.searchParams.delete("landingVerifier");
    const paramVerifier = requestUrl.searchParams.get("landingVerifier") || null;
    const rejectionReason = isCors
      ? "cross_origin"
      : requireLandingVerifier &&
          (paramVerifier === null || cookieVerifier === null || paramVerifier !== cookieVerifier)
        ? "landing_verifier_mismatch"
        : null;
    if (rejectionReason !== null) {
      redirectUrl.searchParams.set("error", rejectionReason);
    }
    const response = io.redirect(redirectUrl);
    if (cookieVerifier === null && !isCors) {
      await io.writeLandingVerifier(response, generateLandingVerifier(), request);
    }
    if (rejectionReason !== null) {
      io.log(`Rejected session params: ${rejectionReason}`);
      return { kind: "redirect", response };
    }
    await io.writeCookies(response, {
      token: paramToken,
      refreshToken: paramRefreshToken,
      twoFactorPending: null,
    });
    io.log(`Wrote auth cookies, redirecting to ${redirectUrl.toString()}`);
    return { kind: "redirect", response };
  }

  const refreshTokens = isCors ? undefined : await getRefreshedTokens(request, options, io);
  const landingVerifier =
    isNavigation && cookieVerifier === null && !isCors ? generateLandingVerifier() : undefined;
  const result: AuthBoundaryCoreResult<R> = {
    kind: "refreshTokens",
    refreshTokens,
    landingVerifier,
  };
  if (result.kind === "refreshTokens" && strippedCookieHeader !== undefined) {
    result.strippedCookieHeader = strippedCookieHeader;
  }
  return result;
}

export type AuthBoundaryOptions = AuthBoundaryCoreOptions & {
  transport: AuthTransport;
  verbose?: boolean;
};

/**
 * The request-boundary auth pass every adapter runs before rendering,
 * fetch-shaped: takes the incoming `Request`, returns either a redirect
 * `Response` (session triple landed) or the refresh decision for the
 * adapter to apply (new tokens to write on the downstream response and —
 * for adapters that can — forward onto the request context).
 */
export async function handleAuthRequestBoundary(
  request: Request,
  options: AuthBoundaryOptions,
): Promise<AuthBoundaryResult> {
  const verbose = options.verbose ?? false;
  const cookieConfig = options.cookieConfig ?? { maxAge: null };
  const isLocalhost = isLocalHostRequest(request);
  const cookieOpts = { isLocalhost, maxAge: cookieConfig.maxAge };
  return runAuthBoundary(request, options, {
    readCookies: parseAuthCookies,
    readLandingVerifier: parseLandingVerifierCookie,
    stripForwardedAuthCookies: stripAuthCookiesFromHeader,
    redirect: (url) =>
      new Response(null, {
        status: 302,
        headers: {
          Location: url.toString(),
          "Cache-Control": "private, no-store",
        },
      }),
    writeCookies: (response, tokens) => appendAuthCookies(response.headers, tokens, cookieOpts),
    writeLandingVerifier: (response, value) =>
      response.headers.append("Set-Cookie", buildLandingVerifierSetCookie(value, isLocalhost)),
    callAction: (action, args) => options.transport.action(action, args),
    log: (message) => logVerbose(message, verbose, "ConvexAuthSsr"),
  });
}

const REQUIRED_TOKEN_LIFETIME_MS = 60_000;
const MINIMUM_REQUIRED_TOKEN_LIFETIME_MS = 10_000;

async function getRefreshedTokens<R extends Response>(
  request: Request,
  options: AuthBoundaryCoreOptions,
  io: AuthBoundaryIO<R>,
) {
  const cookies = await io.readCookies(request);
  const { token, refreshToken } = cookies;
  if (refreshToken === null && token === null) {
    io.log(`No tokens to refresh, returning undefined`);
    return undefined;
  }
  if (refreshToken === null || token === null) {
    io.log(
      `Refresh token null? ${refreshToken === null}, token null? ${token === null}, returning null`,
    );
    return null;
  }
  const claims = decodeTokenClaims(token);
  if (claims === null || claims.exp === undefined || claims.iat === undefined) {
    io.log(`Failed to decode token, returning null`);
    return null;
  }
  const totalTokenLifetimeMs = claims.exp * 1000 - claims.iat * 1000;
  const minimumExpiration =
    Date.now() +
    Math.min(
      REQUIRED_TOKEN_LIFETIME_MS,
      Math.max(MINIMUM_REQUIRED_TOKEN_LIFETIME_MS, totalTokenLifetimeMs / 10),
    );
  if (claims.exp * 1000 > minimumExpiration) {
    io.log(`Token expires far enough in the future, no need to refresh, returning undefined`);
    return undefined;
  }
  try {
    const result = (await io.callAction(options.actions.updateSession, {
      refreshToken,
    })) as { token?: string | null; refreshToken?: string | null };
    if (result.token === undefined) {
      throw new Error("Invalid `updateSession` action result for token refresh");
    }
    io.log(`Successfully refreshed tokens: is null? ${result.token === null}`);
    if (result.token === null || typeof result.refreshToken !== "string") {
      return null;
    }
    return { token: result.token, refreshToken: result.refreshToken };
  } catch (error) {
    console.error(error);
    io.log(`Failed to refresh tokens, returning null`);
    return null;
  }
}
