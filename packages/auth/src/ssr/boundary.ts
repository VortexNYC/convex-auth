import {
  appendAuthCookies,
  buildLandingVerifierSetCookie,
  generateLandingVerifier,
  isLocalHostRequest,
  parseAuthCookies,
  parseLandingVerifierCookie,
  stripAuthCookiesFromHeader,
} from "./cookies.js";
import type { AuthTransport } from "./transport.js";
import { decodeTokenClaims, isCorsRequest, logVerbose } from "./utils.js";
import type { FunctionReference } from "convex/server";

export type AuthBoundaryResult =
  | { kind: "redirect"; response: Response }
  | {
      kind: "refreshTokens";
      refreshTokens: { token: string; refreshToken: string } | null | undefined;
      /**
       * When a cross-origin request was detected, the auth cookies it
       * carried must not flow downstream. Carries the `Cookie` header value
       * with auth entries stripped (`null` when nothing remains) so the
       * adapter can rewrite the forwarded request.
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

export type AuthBoundaryOptions = {
  actions: { updateSession: FunctionReference<"action", "public"> };
  transport: AuthTransport;
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
  verbose?: boolean;
};

/**
 * The request-boundary auth pass every adapter runs before rendering:
 * land OAuth/magic-link session triples into cookies, and proactively
 * rotate the session when the access token is near expiry.
 *
 * Fetch-shaped: takes the incoming `Request`, returns either a redirect
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
  const requireLandingVerifier = options.requireLandingVerifier !== false;
  logVerbose(`Begin handleAuthRequestBoundary`, verbose, "ConvexAuthSsr");
  const requestUrl = new URL(request.url);
  const isNavigation =
    request.method === "GET" && request.headers.get("accept")?.includes("text/html") === true;
  const cookieVerifier = parseLandingVerifierCookie(request);

  const strippedCookieHeader = stripCookiesIfCors(request);

  const paramToken = requestUrl.searchParams.get("token");
  const paramRefreshToken = requestUrl.searchParams.get("refreshToken");
  if (paramToken !== null && paramRefreshToken !== null && isNavigation) {
    logVerbose(`Handling session params on navigation`, verbose, "ConvexAuthSsr");
    const redirectUrl = new URL(requestUrl);
    redirectUrl.searchParams.delete("token");
    redirectUrl.searchParams.delete("refreshToken");
    redirectUrl.searchParams.delete("sessionId");
    redirectUrl.searchParams.delete("landingVerifier");
    const paramVerifier = requestUrl.searchParams.get("landingVerifier") || null;
    const rejectionReason =
      strippedCookieHeader !== undefined
        ? "cross_origin"
        : requireLandingVerifier &&
            (paramVerifier === null || cookieVerifier === null || paramVerifier !== cookieVerifier)
          ? "landing_verifier_mismatch"
          : null;
    if (rejectionReason !== null) {
      redirectUrl.searchParams.set("error", rejectionReason);
    }
    const response = new Response(null, {
      status: 302,
      headers: {
        Location: redirectUrl.toString(),
        "Cache-Control": "private, no-store",
      },
    });
    if (cookieVerifier === null && strippedCookieHeader === undefined) {
      response.headers.append(
        "Set-Cookie",
        buildLandingVerifierSetCookie(generateLandingVerifier(), isLocalhost),
      );
    }
    if (rejectionReason !== null) {
      logVerbose(`Rejected session params: ${rejectionReason}`, verbose, "ConvexAuthSsr");
      return { kind: "redirect", response };
    }
    appendAuthCookies(
      response.headers,
      { token: paramToken, refreshToken: paramRefreshToken, twoFactorPending: null },
      { isLocalhost, maxAge: cookieConfig.maxAge },
    );
    logVerbose(
      `Wrote auth cookies, redirecting to ${redirectUrl.toString()}`,
      verbose,
      "ConvexAuthSsr",
    );
    return { kind: "redirect", response };
  }

  const refreshTokens =
    strippedCookieHeader === undefined
      ? await getRefreshedTokens(request, options, verbose)
      : undefined;
  const landingVerifier =
    isNavigation && cookieVerifier === null && strippedCookieHeader === undefined
      ? generateLandingVerifier()
      : undefined;
  return { kind: "refreshTokens", refreshTokens, strippedCookieHeader, landingVerifier };
}

/**
 * On a cross-origin request, return the `Cookie` header with auth entries
 * stripped — adapters that can rewrite the forwarded request apply it so
 * downstream never sees the cookies. `undefined` when the request is
 * same-origin (nothing to strip).
 */
function stripCookiesIfCors(request: Request): string | null | undefined {
  if (!isCorsRequest(request)) {
    return undefined;
  }
  return stripAuthCookiesFromHeader(request);
}

const REQUIRED_TOKEN_LIFETIME_MS = 60_000;
const MINIMUM_REQUIRED_TOKEN_LIFETIME_MS = 10_000;

async function getRefreshedTokens(
  request: Request,
  options: AuthBoundaryOptions,
  verbose: boolean,
) {
  const cookies = parseAuthCookies(request);
  const { token, refreshToken } = cookies;
  if (refreshToken === null && token === null) {
    logVerbose(`No tokens to refresh, returning undefined`, verbose, "ConvexAuthSsr");
    return undefined;
  }
  if (refreshToken === null || token === null) {
    logVerbose(
      `Refresh token null? ${refreshToken === null}, token null? ${token === null}, returning null`,
      verbose,
      "ConvexAuthSsr",
    );
    return null;
  }
  const claims = decodeTokenClaims(token);
  if (claims === null || claims.exp === undefined || claims.iat === undefined) {
    logVerbose(`Failed to decode token, returning null`, verbose, "ConvexAuthSsr");
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
      "ConvexAuthSsr",
    );
    return undefined;
  }
  try {
    const result = (await options.transport.action(options.actions.updateSession, {
      refreshToken,
    })) as { token?: string | null; refreshToken?: string | null };
    if (result.token === undefined) {
      throw new Error("Invalid `updateSession` action result for token refresh");
    }
    logVerbose(
      `Successfully refreshed tokens: is null? ${result.token === null}`,
      verbose,
      "ConvexAuthSsr",
    );
    if (result.token === null || typeof result.refreshToken !== "string") {
      return null;
    }
    return { token: result.token, refreshToken: result.refreshToken };
  } catch (error) {
    console.error(error);
    logVerbose(`Failed to refresh tokens, returning null`, verbose, "ConvexAuthSsr");
    return null;
  }
}
