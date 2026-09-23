import { fetchAction } from "convex/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { generateLandingVerifier } from "../../ssr/cookies.js";
import {
  getRequestCookies,
  getRequestCookiesInMiddleware,
  setLandingVerifierCookie,
} from "./cookies.js";
import {
  decodeTokenClaims,
  getConvexNextjsOptions,
  isCorsRequest,
  logVerbose,
  setAuthCookies,
} from "./utils.js";
import type { ConvexAuthNextjsMiddlewareOptions } from "./index.js";

export type AuthRequestResult =
  | { kind: "redirect"; response: NextResponse }
  | {
      kind: "refreshTokens";
      refreshTokens: { token: string; refreshToken: string } | null | undefined;
      /**
       * A fresh landing verifier to Set-Cookie on the response, present when
       * a navigation arrived without one. Written non-HttpOnly so the client
       * can read it and bind OAuth/magic-link initiation to this browser.
       */
      landingVerifier?: string;
    };

export async function handleAuthenticationInRequest(
  request: NextRequest,
  options: ConvexAuthNextjsMiddlewareOptions,
): Promise<AuthRequestResult> {
  const verbose = options.verbose ?? false;
  const cookieConfig = options.cookieConfig ?? { maxAge: null };
  const requireLandingVerifier = options.requireLandingVerifier !== false;
  logVerbose(`Begin handleAuthenticationInRequest`, verbose);
  const requestUrl = new URL(request.url);
  const isNavigation =
    request.method === "GET" && request.headers.get("accept")?.includes("text/html") === true;
  const cookieVerifier = (await getRequestCookiesInMiddleware(request)).landingVerifier;

  // Do not let a cross-origin request read auth cookies.
  await validateCors(request);

  // OAuth and magic-link flows land back on the app carrying a freshly minted
  // session in the query string (`?token=&refreshToken=&sessionId=`). Move the
  // pair into HttpOnly cookies and strip the params before the document
  // renders. This replaces client-side URL ingestion entirely in cookie mode.
  // Password-reset links also carry a lone `?token=`; the `refreshToken` param
  // discriminates the session-triple from it.
  const paramToken = requestUrl.searchParams.get("token");
  const paramRefreshToken = requestUrl.searchParams.get("refreshToken");
  if (paramToken !== null && paramRefreshToken !== null && isNavigation) {
    logVerbose(`Handling session params on navigation`, verbose);
    const redirectUrl = new URL(requestUrl);
    redirectUrl.searchParams.delete("token");
    redirectUrl.searchParams.delete("refreshToken");
    redirectUrl.searchParams.delete("sessionId");
    redirectUrl.searchParams.delete("landingVerifier");
    const isCors = isCorsRequest(request);
    const response = NextResponse.redirect(redirectUrl);
    // The landing redirect writes auth cookies — 302s are heuristically
    // cacheable, so pin them to the browser that earned them.
    response.headers.set("Cache-Control", "private, no-store");
    // Any landing redirect is a good moment to establish the verifier cookie
    // on a browser that lacks one — rejected landings self-heal this way.
    // Cross-origin requests get no Set-Cookie at all (the strip invariant).
    if (cookieVerifier === null && !isCors) {
      setLandingVerifierCookie(response, generateLandingVerifier(), request.headers);
    }
    // `get` returns "" for a bare `?landingVerifier=` — normalize to null
    // so empty param + empty cookie can never satisfy the strict check.
    const paramVerifier = requestUrl.searchParams.get("landingVerifier") || null;
    if (
      // A cross-origin request never lands a session — CORS-failed
      // responses still reach the browser's cookie store, so a credentialed
      // fetch carrying a triple would otherwise write auth cookies even in
      // verifier-compat mode.
      isCors ||
      (requireLandingVerifier &&
        (paramVerifier === null || cookieVerifier === null || paramVerifier !== cookieVerifier))
    ) {
      // The triple did not land in the browser that initiated the flow —
      // strip the params and let the app render signed-out rather than
      // write an attacker-controlled session into the victim's cookies.
      logVerbose(
        `Rejected session params: ${
          isCors
            ? "cross-origin request"
            : `landing verifier ${paramVerifier === null ? "absent" : "mismatch"}`
        }`,
        verbose,
      );
      return { kind: "redirect", response };
    }
    await setAuthCookies(
      response,
      { token: paramToken, refreshToken: paramRefreshToken, twoFactorPending: null },
      cookieConfig,
    );
    logVerbose(`Wrote auth cookies, redirecting to ${redirectUrl.toString()}`, verbose);
    return { kind: "redirect", response };
  }

  // Refresh the session proactively when the access token is near expiry —
  // skipped on cross-origin requests. `validateCors` already cleared the
  // request jar, but the skip is made explicit so the invariant does not
  // depend on cookie-mutation propagation through `next/headers`.
  const refreshTokens = isCorsRequest(request) ? undefined : await getRefreshedTokens(options);
  // Establish the verifier on same-origin navigations that lack one, so any
  // browser that renders the app carries it before page JS can run a
  // session-minting call through the proxy. Mint-if-absent only —
  // overwriting would break a flow in flight in another tab.
  const landingVerifier =
    isNavigation && cookieVerifier === null && !isCorsRequest(request)
      ? generateLandingVerifier()
      : undefined;
  return { kind: "refreshTokens", refreshTokens, landingVerifier };
}

async function validateCors(request: NextRequest) {
  if (isCorsRequest(request)) {
    const cookies = await getRequestCookiesInMiddleware(request);
    cookies.token = null;
    cookies.refreshToken = null;
    cookies.setTwoFactorPending(null);
    cookies.setTrustedDevice(null);
  }
}

const REQUIRED_TOKEN_LIFETIME_MS = 60_000; // 1 minute
const MINIMUM_REQUIRED_TOKEN_LIFETIME_MS = 10_000; // 10 seconds

async function getRefreshedTokens(options: ConvexAuthNextjsMiddlewareOptions) {
  const verbose = options.verbose ?? false;
  const cookies = await getRequestCookies();
  const { token, refreshToken } = cookies;
  if (refreshToken === null && token === null) {
    logVerbose(`No tokens to refresh, returning undefined`, verbose);
    return undefined;
  }
  if (refreshToken === null || token === null) {
    logVerbose(
      `Refresh token null? ${refreshToken === null}, token null? ${token === null}, returning null`,
      verbose,
    );
    return null;
  }
  const claims = decodeTokenClaims(token);
  if (claims === null || claims.exp === undefined || claims.iat === undefined) {
    logVerbose(`Failed to decode token, returning null`, verbose);
    return null;
  }
  const totalTokenLifetimeMs = claims.exp * 1000 - claims.iat * 1000;
  // Refresh when the token is valid for less than the next minute, or less
  // than 10% of its lifetime, whichever is larger — never less than 10s.
  const minimumExpiration =
    Date.now() +
    Math.min(
      REQUIRED_TOKEN_LIFETIME_MS,
      Math.max(MINIMUM_REQUIRED_TOKEN_LIFETIME_MS, totalTokenLifetimeMs / 10),
    );
  if (claims.exp * 1000 > minimumExpiration) {
    logVerbose(
      `Token expires far enough in the future, no need to refresh, returning undefined`,
      verbose,
    );
    return undefined;
  }
  try {
    const result = (await fetchAction(
      options.actions.updateSession,
      { refreshToken },
      getConvexNextjsOptions(options),
    )) as { token?: string | null; refreshToken?: string | null };
    if (result.token === undefined) {
      throw new Error("Invalid `updateSession` action result for token refresh");
    }
    logVerbose(`Successfully refreshed tokens: is null? ${result.token === null}`, verbose);
    if (result.token === null || typeof result.refreshToken !== "string") {
      return null;
    }
    return { token: result.token, refreshToken: result.refreshToken };
  } catch (error) {
    console.error(error);
    logVerbose(`Failed to refresh tokens, returning null`, verbose);
    return null;
  }
}
