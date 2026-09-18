import "server-only";

import { fetchQuery } from "convex/nextjs";
import { getFunctionName } from "convex/server";
import { cache } from "react";
import type { NextMiddlewareResult } from "next/dist/server/web/types";
import {
  NextFetchEvent,
  NextMiddleware,
  NextRequest,
  NextResponse,
} from "next/server";
import { ReactNode } from "react";
import type { NativeAuthActions } from "../../react/ConvexAuthProvider.js";
import { ConvexAuthNextjsClientProvider } from "../client.js";
import { getRequestCookies, getRequestCookiesInMiddleware } from "./cookies.js";
import { proxyAuthActionToConvex, shouldProxyAuthAction } from "./proxy.js";
import { handleAuthenticationInRequest } from "./request.js";
import {
  decodeTokenClaims,
  getConvexNextjsOptions,
  logVerbose,
  setAuthCookies,
  setAuthCookiesInMiddleware,
} from "./utils.js";

/**
 * Actions the adapter calls on the Convex backend. Pass the `auth` export from
 * your `convex/auth.ts` (e.g. `api.auth`).
 */
export type ConvexAuthNextjsActions = NativeAuthActions;

/**
 * Wrap your app with this provider in your root `layout.tsx`. It reads the
 * auth cookies, resolves the session server-side, and hands the client
 * provider everything it needs for a no-flash first paint.
 */
export async function ConvexAuthNextjsServerProvider(props: {
  /**
   * The route path that handles authentication actions via the proxy. Must
   * match the `apiRoute` option to `convexAuthNextjsMiddleware`.
   *
   * Defaults to `/api/auth`.
   */
  apiRoute?: string;
  /**
   * The `auth` export from your `convex/auth.ts` — `api.auth`.
   */
  actions: ConvexAuthNextjsActions;
  /**
   * The URL of the Convex deployment to use for authentication.
   *
   * Defaults to `process.env.NEXT_PUBLIC_CONVEX_URL`.
   */
  convexUrl?: string;
  /**
   * Turn on debugging logs.
   */
  verbose?: boolean;
  children: ReactNode;
}) {
  const { apiRoute, actions, convexUrl, verbose, children } = props;
  const serverState = await convexAuthNextjsServerState({ actions, convexUrl });
  return (
    <ConvexAuthNextjsClientProvider
      serverState={serverState}
      apiRoute={apiRoute}
      actions={actions}
      verbose={verbose}
    >
      {children}
    </ConvexAuthNextjsClientProvider>
  );
}

/**
 * Retrieve the session token for authenticating calls to your Convex backend
 * from Server Components, Server Actions and Route Handlers.
 * @returns The token if the client is authenticated, otherwise `undefined`.
 */
export async function convexAuthNextjsToken() {
  return (await getRequestCookies()).token ?? undefined;
}

/**
 * Optimistic, request-boundary session check: reads the token cookie and
 * decodes its expiry without calling Convex. **This is not authorization** —
 * it is revocation-blind within the token lifetime. Use it for redirect
 * pre-filtering in middleware/proxy; use `isAuthenticatedNextjs` or
 * `verifySession` at the data boundary for a real answer.
 */
export function convexAuthNextjsCookieState(request: NextRequest): {
  hasSessionCookie: boolean;
  tokenExpired: boolean | null;
} {
  // `nextUrl.hostname` keeps IPv6 brackets (`[::1]`).
  const hostname = request.nextUrl.hostname.replace(/^\[|\]$/g, "");
  const isLocalhost =
    ["localhost", "127.0.0.1", "::1"].includes(hostname) ||
    hostname.endsWith(".localhost");
  const name = `${isLocalhost ? "" : "__Host-"}__convexAuthToken`;
  const token = request.cookies.get(name)?.value ?? null;
  if (token === null) {
    return { hasSessionCookie: false, tokenExpired: null };
  }
  const claims = decodeTokenClaims(token);
  return {
    hasSessionCookie: true,
    tokenExpired: claims?.exp === undefined ? null : claims.exp * 1000 <= Date.now(),
  };
}

/**
 * The verified session for the current request — the component's
 * `verifySession` query over HTTP transport. Revocation-aware: a session
 * whose JWT is still structurally valid resolves to `null` once revoked.
 *
 * Memoized per request via React `cache()` — call it freely in Server
 * Components, Server Actions and Route Handlers. In middleware use the
 * context's `isAuthenticated()` / `cookieState()` instead.
 *
 * ```ts
 * const session = await convexAuthNextjsSession({ actions: api.auth });
 * if (!session) redirect("/login");
 * ```
 */
export async function convexAuthNextjsSession(options: {
  actions: Pick<ConvexAuthNextjsActions, "verifySession">;
  convexUrl?: string;
}): Promise<{
  user: import("../../react/ConvexAuthProvider.js").NativeAuthUser;
  sessionId: string | null;
} | null> {
  const { token } = await getRequestCookies();
  if (token === null) {
    return null;
  }
  const functionName = getFunctionName(options.actions.verifySession);
  return fetchSessionCached(token, functionName, options.convexUrl);
}

const fetchSessionCached = cache(
  async (
    token: string,
    functionName: string,
    convexUrl: string | undefined,
  ): Promise<{
    user: import("../../react/ConvexAuthProvider.js").NativeAuthUser;
    sessionId: string | null;
  } | null> => {
    try {
      const result = (await fetchQuery(
        functionName as unknown as ConvexAuthNextjsActions["verifySession"],
        { token },
        getConvexNextjsOptions({ convexUrl }),
      )) as {
        user?: import("../../react/ConvexAuthProvider.js").NativeAuthUser;
        sessionId?: string;
      };
      if (result.user == null) {
        return null;
      }
      return { user: result.user, sessionId: result.sessionId ?? null };
    } catch {
      return null;
    }
  },
);

/**
 * Whether the client is authenticated — verified against the component's
 * `verifySession` query (revocation-aware), not just the JWT. Safe to call in
 * Server Actions, Route Handlers and Middleware.
 *
 * Avoid the pitfall of checking authentication state in layouts, since they
 * won't stop nested pages from rendering.
 */
export async function isAuthenticatedNextjs(options: {
  actions: Pick<ConvexAuthNextjsActions, "verifySession">;
  convexUrl?: string;
}) {
  return (await convexAuthNextjsSession(options)) !== null;
}

/**
 * In `convexAuthNextjsMiddleware`, you can use this context to get the token
 * and check if the client is authenticated in place of
 * `convexAuthNextjsToken` and `isAuthenticatedNextjs`.
 *
 * ```ts
 * export default convexAuthNextjsMiddleware(async (request, ctx) => {
 *   if (!(await ctx.convexAuth.isAuthenticated())) {
 *     return nextjsMiddlewareRedirect(request, "/login");
 *   }
 * }, { actions: api.auth });
 * ```
 */
export type ConvexAuthNextjsMiddlewareContext = {
  getToken: () => Promise<string | undefined>;
  isAuthenticated: () => Promise<boolean>;
  cookieState: () => { hasSessionCookie: boolean; tokenExpired: boolean | null };
};

/**
 * Options for the `convexAuthNextjsMiddleware` function.
 */
export type ConvexAuthNextjsMiddlewareOptions = {
  /**
   * The `auth` export from your `convex/auth.ts` — `api.auth`. The middleware
   * uses `verifySession` for verified checks and `updateSession` for
   * boundary refresh; the proxy uses the session-minting actions.
   */
  actions: ConvexAuthNextjsActions;
  /**
   * The URL of the Convex deployment to use for authentication.
   *
   * Defaults to `process.env.NEXT_PUBLIC_CONVEX_URL`.
   */
  convexUrl?: string;
  /**
   * The route path that handles authentication actions via the proxy. Must
   * match the `apiRoute` prop of `ConvexAuthNextjsServerProvider`.
   *
   * Defaults to `/api/auth`.
   */
  apiRoute?: string;
  /**
   * The cookie config to use for the auth cookies.
   *
   * `maxAge` is the number of seconds the cookie will be valid for. If this is
   * not set, the cookie will be a session cookie.
   */
  cookieConfig?: { maxAge: number | null };
  /**
   * Turn on debugging logs.
   */
  verbose?: boolean;
};

type ConvexAuthNextjsMiddlewareHandler = (
  request: NextRequest,
  ctx: {
    event: NextFetchEvent;
    convexAuth: ConvexAuthNextjsMiddlewareContext;
  },
) => NextMiddlewareResult | Promise<NextMiddlewareResult>;

/**
 * Use in your `middleware.ts` (or `proxy.ts` on Next.js 16+) to enable
 * server-side authentication: proxies auth actions, refreshes sessions near
 * expiry, and lands OAuth/magic-link redirects into HttpOnly cookies.
 */
export function convexAuthNextjsMiddleware(
  options: ConvexAuthNextjsMiddlewareOptions,
): NextMiddleware;
export function convexAuthNextjsMiddleware(
  /**
   * A custom handler, which you can use to decide which routes should be
   * accessible based on the client's authentication.
   */
  handler: ConvexAuthNextjsMiddlewareHandler,
  options: ConvexAuthNextjsMiddlewareOptions,
): NextMiddleware;
export function convexAuthNextjsMiddleware(
  handlerOrOptions:
    | ConvexAuthNextjsMiddlewareHandler
    | ConvexAuthNextjsMiddlewareOptions,
  maybeOptions?: ConvexAuthNextjsMiddlewareOptions,
): NextMiddleware {
  const handler =
    typeof handlerOrOptions === "function" ? handlerOrOptions : undefined;
  const options = (
    typeof handlerOrOptions === "function" ? maybeOptions : handlerOrOptions
  ) as ConvexAuthNextjsMiddlewareOptions;
  return async (request, event) => {
    const verbose = options.verbose ?? false;
    const cookieConfig = options.cookieConfig ?? { maxAge: null };
    if (cookieConfig.maxAge !== null && cookieConfig.maxAge <= 0) {
      throw new Error(
        "cookieConfig.maxAge must be null or a positive number of seconds",
      );
    }
    logVerbose(`Begin middleware for request with URL ${request.url}`, verbose);
    const requestUrl = new URL(request.url);
    // Proxy session-minting actions to the Convex backend
    const apiRoute = options?.apiRoute ?? "/api/auth";
    if (shouldProxyAuthAction(request, apiRoute)) {
      logVerbose(
        `Proxying auth action to Convex, path matches ${apiRoute} with or without trailing slash`,
        verbose,
      );
      return await proxyAuthActionToConvex(request, options);
    }
    logVerbose(
      `Not proxying auth action to Convex, path ${requestUrl.pathname} does not match ${apiRoute}`,
      verbose,
    );
    // Land session redirects into cookies, refresh tokens if necessary
    const authResult = await handleAuthenticationInRequest(request, options);

    // If redirecting, proceed — the middleware will run again on next request
    if (authResult.kind === "redirect") {
      logVerbose(
        `Redirecting to ${authResult.response.headers.get("Location")}`,
        verbose,
      );
      return authResult.response;
    }

    let response: Response | null = null;
    // Forward cookies to request for custom handler
    if (
      authResult.kind === "refreshTokens" &&
      authResult.refreshTokens !== undefined
    ) {
      logVerbose(`Forwarding cookies to request`, verbose);
      await setAuthCookiesInMiddleware(request, authResult.refreshTokens);
    }
    if (handler === undefined) {
      logVerbose(`No custom handler`, verbose);
      response = NextResponse.next({
        request: {
          headers: request.headers,
        },
      });
    } else {
      logVerbose(`Calling custom handler`, verbose);
      response =
        (await handler(request, {
          event,
          convexAuth: {
            getToken: async () => {
              const cookies = await getRequestCookiesInMiddleware(request);
              return cookies.token ?? undefined;
            },
            isAuthenticated: async () => {
              const cookies = await getRequestCookiesInMiddleware(request);
              if (cookies.token === null) {
                return false;
              }
              return (
                (await fetchSessionCached(
                  cookies.token,
                  getFunctionName(options.actions.verifySession),
                  options.convexUrl,
                )) !== null
              );
            },
            cookieState: () => convexAuthNextjsCookieState(request),
          },
        })) ??
        NextResponse.next({
          request: {
            headers: request.headers,
          },
        });
    }

    // Port the cookies from the auth middleware to the response. Mutating a
    // NextResponse directly preserves its body; `NextResponse.next(response)`
    // only forwards headers/status.
    if (
      authResult.kind === "refreshTokens" &&
      authResult.refreshTokens !== undefined
    ) {
      if (response instanceof NextResponse) {
        await setAuthCookies(response, authResult.refreshTokens, cookieConfig);
        return response;
      }
      const nextResponse = NextResponse.next(response);
      await setAuthCookies(nextResponse, authResult.refreshTokens, cookieConfig);
      return nextResponse;
    }

    return response;
  };
}

export { createRouteMatcher } from "./routeMatcher.js";
export type { RouteMatcherParam } from "./routeMatcher.js";

/**
 * Helper for redirecting to a different route from a Next.js middleware.
 *
 * ```ts
 * // Plain redirect
 * return nextjsMiddlewareRedirect(request, "/login");
 *
 * // Redirect with query params
 * return nextjsMiddlewareRedirect(request, "/login?next=/app/dashboard");
 * ```
 */
export function nextjsMiddlewareRedirect(
  /**
   * The incoming request handled by the middleware.
   */
  request: NextRequest,
  /**
   * The route to redirect to.
   */
  route: string,
) {
  const url = request.nextUrl.clone();

  // Parse the incoming route so we can split path & query correctly.
  // Prepend a dummy origin because URL() requires absolute URLs.
  const parsed = new URL(route, "http://dummy");

  url.pathname = parsed.pathname;
  url.search = "";
  parsed.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value);
  });

  return NextResponse.redirect(url);
}

type ServerState = {
  token: string | null;
  refreshToken: null;
  user: import("../../react/ConvexAuthProvider.js").NativeAuthUser | null;
  sessionId: string | null;
  _timeFetched: number;
};

async function convexAuthNextjsServerState(options: {
  actions: ConvexAuthNextjsActions;
  convexUrl?: string;
}): Promise<ServerState> {
  const { token } = await getRequestCookies();
  if (token === null) {
    return {
      token: null,
      refreshToken: null,
      user: null,
      sessionId: null,
      _timeFetched: Date.now(),
    };
  }
  // Resolve the user now so the client provider's first paint is already
  // authenticated. `verifySession` is revocation-aware — a revoked session
  // resolves unauthenticated even while its JWT is still structurally valid.
  const session = await fetchSessionCached(
    token,
    getFunctionName(options.actions.verifySession),
    options.convexUrl,
  );
  return {
    token,
    refreshToken: null,
    user: session?.user ?? null,
    sessionId: session?.sessionId ?? null,
    _timeFetched: Date.now(),
  };
}
