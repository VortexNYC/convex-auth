import { fetchAction } from "convex/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { runAuthBoundary, type AuthBoundaryCoreResult } from "../../ssr/boundary.js";
import {
  getRequestCookies,
  getRequestCookiesInMiddleware,
  setLandingVerifierCookie,
} from "./cookies.js";
import { getConvexNextjsOptions, logVerbose, setAuthCookies } from "./utils.js";
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
  const result: AuthBoundaryCoreResult<NextResponse> = await runAuthBoundary(request, options, {
    readCookies: () => getRequestCookies(),
    readLandingVerifier: async (req) =>
      (await getRequestCookiesInMiddleware(req as NextRequest)).landingVerifier,
    stripForwardedAuthCookies: async (req) => {
      const cookies = await getRequestCookiesInMiddleware(req as NextRequest);
      cookies.token = null;
      cookies.refreshToken = null;
      cookies.setTwoFactorPending(null);
      cookies.setTrustedDevice(null);
      return undefined;
    },
    redirect: (url) => {
      const response = NextResponse.redirect(url);
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    },
    writeCookies: (response, tokens) => setAuthCookies(response, tokens, cookieConfig),
    writeLandingVerifier: (response, value, req) =>
      setLandingVerifierCookie(response, value, req.headers),
    callAction: (action, args) => fetchAction(action, args, getConvexNextjsOptions(options)),
    log: (message) => logVerbose(message, verbose),
  });
  return result;
}
