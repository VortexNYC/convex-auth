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

  await validateCors(request);

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
    const response = NextResponse.redirect(redirectUrl);
    response.headers.set("Cache-Control", "private, no-store");
    if (cookieVerifier === null && !isCors) {
      setLandingVerifierCookie(response, generateLandingVerifier(), request.headers);
    }
    if (rejectionReason !== null) {
      logVerbose(`Rejected session params: ${rejectionReason}`, verbose);
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

  const refreshTokens = isCorsRequest(request) ? undefined : await getRefreshedTokens(options);
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

const REQUIRED_TOKEN_LIFETIME_MS = 60_000;
const MINIMUM_REQUIRED_TOKEN_LIFETIME_MS = 10_000;

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
