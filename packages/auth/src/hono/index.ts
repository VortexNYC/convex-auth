import type { Context, MiddlewareHandler, Next } from "hono";
import type { NativeAuthActions } from "../react/ConvexAuthProvider.js";
import { handleAuthRequestBoundary } from "../ssr/boundary.js";
import { appendAuthCookies, buildLandingVerifierSetCookie } from "../ssr/cookies.js";
import { isLocalHostRequest } from "../ssr/cookies.js";
import { proxyAuthActionToConvex, shouldProxyAuthAction } from "../ssr/proxy.js";
import type { AuthTransport } from "../ssr/transport.js";
import { convexHttpTransport } from "../ssr/transport.js";
import {
  convexAuthCookieState as cookieStateFor,
  getAuthServerState as serverStateFor,
  getConvexAuthSession as sessionFor,
  getConvexAuthToken as tokenFor,
  recordCorsStrip,
  recordRotatedSession,
  type ConvexAuthServerState,
  type VerifiedSession,
} from "../ssr/state.js";

/**
 * Actions the adapter calls on the Convex backend. Pass the `auth` export
 * from your `convex/auth.ts` (e.g. `api.auth`).
 */
export type ConvexAuthHonoActions = NativeAuthActions;

export type ConvexAuthHonoOptions = {
  /**
   * The `auth` export from your `convex/auth.ts` — `api.auth`.
   */
  actions: ConvexAuthHonoActions;
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
 * Global request middleware — the SSR boundary. Register once at the app
 * level so every request gets the proxy intercept, session-triple landing,
 * rotation, and CORS strip:
 *
 * ```ts
 * import { Hono } from "hono";
 * import { convexAuthMiddleware } from "@vortex-api/convex-auth/hono";
 * import { api } from "./convex/_generated/api";
 *
 * const app = new Hono();
 * app.use("*", convexAuthMiddleware({ actions: api.auth }));
 * ```
 *
 * The same `Options` object covers the proxy handler, so a single
 * `convexAuthMiddleware` registration is the whole server surface — mount
 * `convexAuthProxyHandler` separately only if you are not using the
 * middleware.
 */
export function convexAuthMiddleware(options: ConvexAuthHonoOptions): MiddlewareHandler {
  const transport = options.transport ?? convexHttpTransport(options.convexUrl);
  const apiRoute = options.apiRoute ?? "/api/auth";
  const cookieConfig = options.cookieConfig ?? { maxAge: null };
  if (cookieConfig.maxAge !== null && cookieConfig.maxAge <= 0) {
    throw new Error("cookieConfig.maxAge must be a positive number of seconds, or null");
  }
  const verbose = options.verbose ?? false;

  return async (c: Context, next: Next) => {
    // Rotation/CORS bookkeeping is keyed on this Request object — middleware
    // that replaces `c.req.raw` downstream (e.g. body-limit) detaches the
    // helpers from the recorded outcome.
    const request = c.req.raw;

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

    if (result.kind === "redirect") {
      return result.response;
    }

    if (result.refreshTokens !== undefined) {
      recordRotatedSession(request, result.refreshTokens);
    }
    if (result.strippedCookieHeader !== undefined) {
      recordCorsStrip(request);
      try {
        if (result.strippedCookieHeader === null) {
          request.headers.delete("cookie");
        } else {
          request.headers.set("cookie", result.strippedCookieHeader);
        }
      } catch {}
    }

    await next();

    if (result.refreshTokens !== undefined || result.landingVerifier !== undefined) {
      const cookieOpts = {
        isLocalhost: isLocalHostRequest(request),
        maxAge: cookieConfig.maxAge,
      };
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
        applyCookies(c.res.headers);
      } catch {
        // Assign FIRST, then mutate — Hono's `c.res` setter merges the old
        // response's headers over the assigned one (old Set-Cookie values
        // would replace the auth cookies just written, and an old
        // Cache-Control would win over `private, no-store`).
        c.res = new Response(c.res.body, c.res);
        applyCookies(c.res.headers);
      }
    }
  };
}

/**
 * The auth-action proxy as a standalone Hono handler — the alternative to
 * the middleware intercept when you'd rather own the route explicitly:
 *
 * ```ts
 * app.post("/api/auth", convexAuthProxyHandler({ actions: api.auth }));
 * ```
 */
export function convexAuthProxyHandler(options: ConvexAuthHonoOptions) {
  const transport = options.transport ?? convexHttpTransport(options.convexUrl);
  const cookieConfig = options.cookieConfig ?? { maxAge: null };
  const verbose = options.verbose ?? false;
  return (c: Context): Promise<Response> =>
    proxyAuthActionToConvex(c.req.raw, {
      actions: options.actions,
      transport,
      cookieConfig,
      verbose,
      convexUrl: options.convexUrl,
    });
}

/**
 * The verified session for the current request — the component's
 * `verifySession` query over HTTP transport. Revocation-aware: a session
 * whose JWT is still structurally valid resolves to `null` once revoked.
 * Memoized per request.
 *
 * ```ts
 * app.get("/me", async (c) => {
 *   const session = await getConvexAuthSession(c, { actions: api.auth });
 *   if (session === null) return c.json({ error: "Unauthorized" }, 401);
 *   return c.json(session.user);
 * });
 * ```
 */
export function getConvexAuthSession(
  c: Context,
  options: {
    actions: Pick<ConvexAuthHonoActions, "verifySession">;
    transport?: AuthTransport;
    convexUrl?: string;
  },
): Promise<VerifiedSession> {
  return sessionFor(c.req.raw, options);
}

/**
 * The raw session JWT for authenticating Convex calls from route handlers —
 * bind it to `ConvexHttpClient.setAuth` or a `fetchQuery` token option.
 */
export function getConvexAuthToken(c: Context): string | null {
  return tokenFor(c.req.raw);
}

/**
 * Optimistic, request-boundary session check: reads the token cookie and
 * decodes its expiry without calling Convex. **This is not authorization** —
 * it is revocation-blind within the token lifetime. Use it for UX guards;
 * use `getConvexAuthSession` for a real answer.
 */
export function convexAuthCookieState(c: Context): {
  hasSessionCookie: boolean;
  tokenExpired: boolean | null;
} {
  return cookieStateFor(c.req.raw);
}

/**
 * Resolve the full server state for seeding a client provider — verify
 * first: a revoked session resolves signed-out so a dead JWT is never
 * seeded into the client.
 */
export function getAuthServerState(
  c: Context,
  options: {
    actions: Pick<ConvexAuthHonoActions, "verifySession">;
    transport?: AuthTransport;
    convexUrl?: string;
  },
): Promise<ConvexAuthServerState> {
  return serverStateFor(c.req.raw, options);
}

export type { ConvexAuthServerState, VerifiedSession };
