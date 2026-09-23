import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import type { NativeAuthActions } from "../../react/ConvexAuthProvider.js";
import { handleAuthRequestBoundary } from "../../ssr/boundary.js";
import {
  appendAuthCookies,
  buildLandingVerifierSetCookie,
  isLocalHostRequest,
} from "../../ssr/cookies.js";
import { proxyAuthActionToConvex, shouldProxyAuthAction } from "../../ssr/proxy.js";
import type { AuthTransport } from "../../ssr/transport.js";
import { convexHttpTransport } from "../../ssr/transport.js";
import {
  getConvexAuthSession,
  recordCorsStrip,
  recordRotatedSession,
  type VerifiedSession,
} from "./state.js";

/**
 * Actions the adapter calls on the Convex backend. Pass the `auth` export
 * from your `convex/auth.ts` (e.g. `api.auth`).
 */
export type ConvexAuthTanstackStartActions = NativeAuthActions;

export type ConvexAuthTanstackStartOptions = {
  /**
   * The `auth` export from your `convex/auth.ts` — `api.auth`.
   */
  actions: ConvexAuthTanstackStartActions;
  /**
   * The URL of the Convex deployment to use for authentication.
   * Defaults to `CONVEX_URL`, then `VITE_CONVEX_URL`.
   */
  convexUrl?: string;
  /**
   * The route path that handles authentication actions via the proxy.
   * Defaults to `/api/auth`.
   */
  apiRoute?: string;
  /**
   * `maxAge` for the auth cookies in seconds; `null` = session cookies.
   */
  cookieConfig?: { maxAge: number | null };
  /**
   * Require session-triple landings (`?token=&refreshToken=`) to carry a
   * `landingVerifier` param matching the landing-verifier cookie minted at
   * flow initiation — binds OAuth/magic-link landings to the browser that
   * started the flow. Defaults to `true`; set `false` only for deployments
   * that predate verifier threading (e.g. magic links opened in a different
   * browser than the requesting one).
   */
  requireLandingVerifier?: boolean;
  /**
   * Inject a custom transport (tests); defaults to `ConvexHttpClient`.
   */
  transport?: AuthTransport;
  /**
   * Turn on debugging logs.
   */
  verbose?: boolean;
};

/**
 * The request pipeline `convexAuthRequestMiddleware` runs per request,
 * factored out so it can be driven directly (and unit-tested) without
 * TanStack's middleware machinery: proxy intercept → boundary pass →
 * record outcomes → decorate the downstream response.
 *
 * `next` resolves to the downstream handler's result — an object carrying
 * the `Response` being built (mutable headers). The result may arrive
 * synchronously or as a promise.
 */
export async function handleConvexAuthRequest<TNextResult extends { response: Response }>(
  request: Request,
  next: () => TNextResult | Promise<TNextResult>,
  options: ConvexAuthTanstackStartOptions,
): Promise<Response | TNextResult> {
  const transport = options.transport ?? convexHttpTransport(options.convexUrl);
  const apiRoute = options.apiRoute ?? "/api/auth";
  const cookieConfig = options.cookieConfig ?? { maxAge: null };
  if (cookieConfig.maxAge !== null && cookieConfig.maxAge <= 0) {
    throw new Error("cookieConfig.maxAge must be a positive number of seconds, or null");
  }
  const verbose = options.verbose ?? false;

  // Session-minting/ending actions proxy to the component.
  if (shouldProxyAuthAction(request, apiRoute)) {
    return await proxyAuthActionToConvex(request, {
      actions: options.actions,
      transport,
      cookieConfig,
      verbose,
      convexUrl: options.convexUrl,
    });
  }

  const result = await handleAuthRequestBoundary(request, {
    actions: { updateSession: options.actions.updateSession },
    transport,
    cookieConfig,
    requireLandingVerifier: options.requireLandingVerifier,
    verbose,
  });

  // Session-triple landed — redirect with cookies already on the response.
  if (result.kind === "redirect") {
    return result.response;
  }

  // Record the refresh outcome keyed by this request so downstream session
  // helpers see the effective session: a rotated pair (the request's
  // now-revoked cookie would fail verifySession), a dead session, or — for
  // cross-origin requests — a strip marker.
  if (result.refreshTokens !== undefined) {
    recordRotatedSession(request, result.refreshTokens);
  }
  if (result.strippedCookieHeader !== undefined) {
    recordCorsStrip(request);
    // Best-effort physical strip so even a raw `request.headers.get('cookie')`
    // downstream reads clean — and the protection survives if a future
    // TanStack version wraps/clones the request (breaking WeakMap identity).
    // Received Request headers are immutable on some runtimes; when `set`
    // throws, the WeakSet marker above still guards every session helper.
    try {
      if (result.strippedCookieHeader === null) {
        request.headers.delete("cookie");
      } else {
        request.headers.set("cookie", result.strippedCookieHeader);
      }
    } catch {
      // Immutable headers — recordCorsStrip still enforces.
    }
  }

  const res = await next();

  if (result.refreshTokens !== undefined || result.landingVerifier !== undefined) {
    const cookieOpts = { isLocalhost: isLocalHostRequest(request), maxAge: cookieConfig.maxAge };
    const applyCookies = (headers: Headers) => {
      if (result.refreshTokens !== undefined) {
        appendAuthCookies(headers, result.refreshTokens, cookieOpts);
      }
      if (result.landingVerifier !== undefined) {
        headers.append(
          "Set-Cookie",
          buildLandingVerifierSetCookie(result.landingVerifier, cookieOpts.isLocalhost),
        );
      }
      headers.set("Cache-Control", "private, no-store");
    };
    try {
      applyCookies(res.response.headers);
    } catch {
      // Immutable headers (redirects, proxied fetch responses): rebuild so the
      // rotated cookies still reach the browser instead of 500ing and losing
      // the session.
      const rebuilt = new Response(res.response.body, res.response);
      applyCookies(rebuilt.headers);
      return { ...res, response: rebuilt };
    }
  }
  return res;
}

/**
 * Global request middleware — the SSR boundary. Register in `src/start.ts`:
 *
 * ```ts
 * export const startInstance = createStart(() => ({
 *   requestMiddleware: [convexAuthRequestMiddleware({ actions: api.auth })],
 * }));
 * ```
 */
export function convexAuthRequestMiddleware(options: ConvexAuthTanstackStartOptions) {
  return createMiddleware().server(({ request, next }) =>
    handleConvexAuthRequest(request, next, options),
  );
}

/**
 * Function middleware that attaches the verified session to `context.session`
 * — the typed guard for protected server functions:
 *
 * ```ts
 * export const authedMiddleware = convexAuthFunctionMiddleware({ actions: api.auth });
 *
 * const getSecret = createServerFn()
 *   .middleware([authedMiddleware])
 *   .handler(async ({ context }) => {
 *     // context.session.user is typed and verified
 *   });
 * ```
 */
export function convexAuthFunctionMiddleware(
  options: Pick<ConvexAuthTanstackStartOptions, "actions" | "convexUrl" | "transport">,
) {
  return createMiddleware({ type: "function" }).server(async ({ next }) => {
    const session = await getConvexAuthSession(getRequest(), {
      actions: { verifySession: options.actions.verifySession },
      transport: options.transport,
      convexUrl: options.convexUrl,
    });
    if (session === null) {
      throw new Error("Unauthorized");
    }
    return next({ context: { session } });
  });
}

/**
 * Standalone verified lookup for server functions/routes that don't use the
 * middleware — same per-request memoization.
 */
export { getConvexAuthSession };
export type { VerifiedSession };
