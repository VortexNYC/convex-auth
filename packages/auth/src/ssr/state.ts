import type { FunctionReference } from "convex/server";
import type { NativeAuthUser } from "../react/ConvexAuthProvider.js";
import { authCookieNames, isLocalHostRequest, parseAuthCookies } from "./cookies.js";
import type { AuthTransport } from "./transport.js";
import { convexHttpTransport } from "./transport.js";
import { decodeTokenClaims } from "./utils.js";

/**
 * Request-scoped auth state overrides.
 *
 * The request middleware cannot rewrite the incoming request's cookie jar the
 * way Next.js middleware can — TanStack Start hands downstream code the same
 * ambient `Request`. So when the boundary pass rotates a session (or kills
 * it), the middleware records the outcome here keyed by the request object,
 * and every session helper below consults it before trusting the cookies.
 */
const rotatedSessions = new WeakMap<Request, { token: string; refreshToken: string } | null>();
const corsStrippedRequests = new WeakSet<Request>();

export function recordRotatedSession(
  request: Request,
  tokens: { token: string; refreshToken: string } | null,
) {
  rotatedSessions.set(request, tokens);
}

export function recordCorsStrip(request: Request) {
  corsStrippedRequests.add(request);
}

/**
 * The effective auth cookies for this request: the rotation override when
 * the boundary pass produced one, else the parsed request cookies. A CORS-
 * stripped request reads as anonymous.
 */
export function effectiveAuthCookies(request: Request): {
  token: string | null;
  refreshToken: string | null;
} {
  if (corsStrippedRequests.has(request)) {
    return { token: null, refreshToken: null };
  }
  const rotated = rotatedSessions.get(request);
  if (rotated !== undefined) {
    return rotated === null
      ? { token: null, refreshToken: null }
      : { token: rotated.token, refreshToken: rotated.refreshToken };
  }
  const parsed = parseAuthCookies(request);
  return { token: parsed.token, refreshToken: parsed.refreshToken };
}

/**
 * Optimistic, request-boundary session check: reads the token cookie and
 * decodes its expiry without calling Convex. **This is not authorization** —
 * it is revocation-blind within the token lifetime. Use it for `beforeLoad`
 * UX guards; use `getConvexAuthSession` for a real answer.
 */
export function convexAuthCookieState(request: Request): {
  hasSessionCookie: boolean;
  tokenExpired: boolean | null;
} {
  const { token } = effectiveAuthCookies(request);
  if (token === null) {
    return { hasSessionCookie: false, tokenExpired: null };
  }
  const claims = decodeTokenClaims(token);
  return {
    hasSessionCookie: true,
    tokenExpired: claims?.exp === undefined ? null : claims.exp * 1000 <= Date.now(),
  };
}

export type VerifiedSession = {
  user: NativeAuthUser;
  sessionId: string | null;
} | null;

const sessionPromises = new WeakMap<Request, Promise<VerifiedSession>>();

/**
 * The verified session for the current request — the component's
 * `verifySession` query over HTTP transport. Revocation-aware: a session
 * whose JWT is still structurally valid resolves to `null` once revoked.
 * Memoized per request.
 */
export function getConvexAuthSession(
  request: Request,
  options: {
    actions: { verifySession: FunctionReference<"query", "public"> };
    transport?: AuthTransport;
    convexUrl?: string;
  },
): Promise<VerifiedSession> {
  let promise = sessionPromises.get(request);
  if (promise === undefined) {
    promise = fetchVerifiedSession(request, options);
    sessionPromises.set(request, promise);
  }
  return promise;
}

async function fetchVerifiedSession(
  request: Request,
  options: {
    actions: { verifySession: FunctionReference<"query", "public"> };
    transport?: AuthTransport;
    convexUrl?: string;
  },
): Promise<VerifiedSession> {
  const { token } = effectiveAuthCookies(request);
  if (token === null) {
    return null;
  }
  const transport = options.transport ?? convexHttpTransport(options.convexUrl);
  try {
    const result = (await transport.query(options.actions.verifySession, { token })) as {
      user?: NativeAuthUser;
      sessionId?: string;
    };
    if (result.user == null) {
      return null;
    }
    return { user: result.user, sessionId: result.sessionId ?? null };
  } catch {
    return null;
  }
}

export type ConvexAuthServerState = {
  token: string | null;
  refreshToken: null;
  user: NativeAuthUser | null;
  sessionId: string | null;
  /** Convenience for route guards — `true` only after `verifySession` passed. */
  isAuthenticated: boolean;
  _timeFetched: number;
};

/**
 * Resolve the full server state for seeding the client provider — the shape
 * `ConvexAuthProvider`'s `serverState` prop consumes. Verify first: a revoked
 * session resolves signed-out so a dead JWT is never seeded into the client
 * (default Convex auth checks signature+exp only, and a seeded-but-revoked
 * token would stay "live" on the websocket for its remaining lifetime).
 */
export async function getAuthServerState(
  request: Request,
  options: {
    actions: { verifySession: FunctionReference<"query", "public"> };
    transport?: AuthTransport;
    convexUrl?: string;
  },
): Promise<ConvexAuthServerState> {
  const { token } = effectiveAuthCookies(request);
  if (token === null) {
    return anonymousState();
  }
  const session = await getConvexAuthSession(request, options);
  if (session === null) {
    return anonymousState();
  }
  return {
    token,
    refreshToken: null,
    user: session.user,
    sessionId: session.sessionId,
    isAuthenticated: true,
    _timeFetched: Date.now(),
  };
}

function anonymousState(): ConvexAuthServerState {
  return {
    token: null,
    refreshToken: null,
    user: null,
    sessionId: null,
    isAuthenticated: false,
    _timeFetched: Date.now(),
  };
}

/**
 * The raw session JWT for authenticating Convex calls from server functions —
 * bind it to `ConvexHttpClient.setAuth` or a `fetchQuery` token option.
 */
export function getConvexAuthToken(request: Request): string | null {
  return effectiveAuthCookies(request).token;
}

export { authCookieNames, isLocalHostRequest };
