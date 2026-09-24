import { validateCsrfHeaders } from "../convex-runtime/native/csrf.js";
import type { NativeAuthActions } from "../react/ConvexAuthProvider.js";
import {
  appendAuthCookies,
  isLocalHostRequest,
  parseAuthCookies,
  type AuthCookieReadValues,
  type AuthCookieValues,
} from "./cookies.js";
import type { AuthTransport } from "./transport.js";
import { isCorsRequest, jsonResponse, logVerbose } from "./utils.js";

/**
 * Intents the proxy will execute. Each maps to a session-minting or
 * session-ending action; the server substitutes confidential fields
 * (refresh token, access token, 2FA pending token, trusted-device token)
 * from cookies so the browser never holds them.
 */
const SESSION_INTENTS = [
  "signUp",
  "signIn",
  "signInAnonymous",
  "linkAnonymousAccount",
  "verifyEmailOtp",
  "callback",
  "twoFactorVerifyTOTP",
  "twoFactorVerifyBackupCode",
  "verifyPasskeyAuthentication",
  "updateSession",
  "signOut",
] as const;

export type AuthProxyIntent = (typeof SESSION_INTENTS)[number];

type ProxyActions = Pick<NativeAuthActions, "signUp" | "signIn" | "signOut" | "updateSession"> &
  Partial<
    Pick<
      NativeAuthActions,
      | "signInAnonymous"
      | "linkAnonymousAccount"
      | "verifyEmailOtp"
      | "callback"
      | "twoFactorVerifyTOTP"
      | "twoFactorVerifyBackupCode"
      | "verifyPasskeyAuthentication"
    >
  >;

export type ConvexAuthProxyOptions = {
  convexUrl?: string;
  verbose?: boolean;
  cookieConfig?: { maxAge: number | null };
  actions: ProxyActions;
  transport: AuthTransport;
};

/**
 * The framework seams of the auth proxy: where cookies are read from, how a
 * JSON response is built, how auth cookies are written onto it, how the
 * component action is invoked, and where verbose logs go. Every adapter
 * (Next.js, TanStack Start, Hono, …) supplies these five bindings; the
 * request/response algorithm itself is shared in `runAuthProxy` so the
 * adapters cannot drift.
 */
export type AuthProxyIO<Action, R extends Response = Response> = {
  readCookies(request: Request): AuthCookieReadValues | Promise<AuthCookieReadValues>;
  jsonResponse(body: unknown, status?: number): R;
  writeCookies(response: R, cookies: AuthCookieValues | null): void | Promise<void>;
  callAction(
    action: Action,
    args: Record<string, unknown>,
    opts: { token?: string },
  ): Promise<unknown>;
  log(message: string): void;
};

export type AuthProxyOptions<Action> = {
  verbose?: boolean;
  cookieConfig?: { maxAge: number | null };
  actions: Partial<Record<AuthProxyIntent, Action>>;
};

/**
 * The shared auth-action proxy pipeline: `Request` in, `Response` out, auth
 * cookies applied through `io`. All intent gating, CSRF enforcement,
 * confidential-field substitution, and error mapping live here — adapters
 * only bind framework primitives.
 */
export async function runAuthProxy<Action, R extends Response = Response>(
  request: Request,
  options: AuthProxyOptions<Action>,
  io: AuthProxyIO<Action, R>,
): Promise<Response> {
  const cookieConfig = options?.cookieConfig ?? { maxAge: null };
  if (cookieConfig.maxAge !== null && cookieConfig.maxAge <= 0) {
    throw new Error("cookieConfig.maxAge must be a positive number of seconds, or null");
  }
  if (request.method !== "POST") {
    return new Response("Invalid method", { status: 405 });
  }
  if (isCorsRequest(request)) {
    return new Response("Invalid origin", { status: 403 });
  }
  const csrf = validateCsrfHeaders(request, []);
  if (!csrf.allowed) {
    return new Response(csrf.reason, { status: csrf.status });
  }

  const body = (await request.json().catch(() => null)) as {
    intent?: string;
    args?: Record<string, unknown>;
  } | null;
  const intent = body?.intent as AuthProxyIntent | undefined;
  const args: Record<string, unknown> = { ...body?.args };
  if (!intent || !SESSION_INTENTS.includes(intent)) {
    io.log(`Invalid intent ${String(intent)}, returning 400`);
    return new Response("Invalid intent", { status: 400 });
  }
  const action = options.actions[intent];
  if (!action) {
    io.log(`Intent ${intent} is not configured, returning 400`);
    return new Response("Action not configured", { status: 400 });
  }

  const requestCookies = await io.readCookies(request);
  const token = requestCookies.token ?? undefined;

  if (intent === "signOut" && token === undefined) {
    const response = io.jsonResponse({ success: true });
    await io.writeCookies(response, null);
    return response;
  }

  if (intent === "updateSession") {
    const refreshToken = requestCookies.refreshToken;
    if (refreshToken === null) {
      return io.jsonResponse({ error: "No refresh token" }, 401);
    }
    args.refreshToken = refreshToken;
  }
  if (intent === "signOut") {
    args.token = token;
  }
  if (intent === "twoFactorVerifyTOTP" || intent === "twoFactorVerifyBackupCode") {
    const pending = requestCookies.twoFactorPending;
    if (pending === null) {
      return io.jsonResponse({ error: "No two-factor challenge pending" }, 401);
    }
    args.token = pending;
  }
  if (intent === "signIn") {
    if (requestCookies.trustedDevice !== null) {
      args.trustedDeviceToken = requestCookies.trustedDevice;
    } else {
      delete args.trustedDeviceToken;
    }
  }
  if (intent === "signIn" || intent === "callback") {
    if (requestCookies.landingVerifier !== null) {
      args.landingVerifier = requestCookies.landingVerifier;
    } else {
      delete args.landingVerifier;
    }
  }

  io.log(`Fetching action for intent ${intent}`);

  try {
    const result = await io.callAction(
      action,
      args,
      token !== undefined && intent !== "updateSession" ? { token } : {},
    );

    const cookiesToWrite = cookiesFromResult(result);
    const clientResult = stripConfidentialFields(result);
    const response = io.jsonResponse(clientResult);
    if (intent === "signOut") {
      await io.writeCookies(response, null);
    } else if (cookiesToWrite !== undefined) {
      await io.writeCookies(response, cookiesToWrite);
    }
    return response;
  } catch (error) {
    console.error(`Hit error while running proxy intent \`${intent}\`:`);
    console.error(error);
    const response = io.jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown error" },
      400,
    );
    if (intent === "updateSession" || intent === "signOut") {
      await io.writeCookies(response, null);
    }
    return response;
  }
}

/**
 * The auth-action proxy as a fetch-shaped pipeline: `Request` in, `Response`
 * out, `Set-Cookie` headers on the response. Any adapter that can mount a
 * request handler (Next middleware, TanStack server route, a Route Handler)
 * can front this.
 */
export async function proxyAuthActionToConvex(
  request: Request,
  options: ConvexAuthProxyOptions,
): Promise<Response> {
  const cookieConfig = options?.cookieConfig ?? { maxAge: null };
  const cookieOpts = {
    isLocalhost: isLocalHostRequest(request),
    maxAge: cookieConfig.maxAge,
  };
  const verbose = options?.verbose ?? false;
  return runAuthProxy(request, options, {
    readCookies: parseAuthCookies,
    jsonResponse,
    writeCookies: (response, tokens) => appendAuthCookies(response.headers, tokens, cookieOpts),
    callAction: (action, args, opts) => options.transport.action(action, args, opts),
    log: (message) => logVerbose(message, verbose),
  });
}

type SessionResult = {
  token?: string | null;
  refreshToken?: string | null;
  sessionId?: string | null;
  twoFactorChallengeToken?: string | null;
  twoFactorCookieMaxAgeMs?: number;
  trustDeviceToken?: string | null;
  trustDeviceMaxAgeMs?: number;
  success?: boolean;
};

/**
 * Translate an action result into the cookie writes it implies. Returns
 * `undefined` when the result carries nothing cookie-worthy.
 */
function cookiesFromResult(result: unknown): AuthCookieValues | null | undefined {
  if (result === null || typeof result !== "object") {
    return undefined;
  }
  const r = result as SessionResult;
  if (typeof r.token === "string" && typeof r.refreshToken === "string") {
    return {
      token: r.token,
      refreshToken: r.refreshToken,
      twoFactorPending: null,
      ...(typeof r.trustDeviceToken === "string"
        ? {
            trustedDevice: r.trustDeviceToken,
            trustedDeviceMaxAgeMs: r.trustDeviceMaxAgeMs,
          }
        : {}),
    };
  }
  if (typeof r.twoFactorChallengeToken === "string") {
    return {
      token: null,
      refreshToken: null,
      twoFactorPending: r.twoFactorChallengeToken,
      twoFactorPendingMaxAgeMs: r.twoFactorCookieMaxAgeMs,
    };
  }
  if (r.token === null) {
    return null;
  }
  return undefined;
}

/**
 * The browser must never see confidential values — they live only in HttpOnly
 * cookies. Strip them from the JSON result.
 */
function stripConfidentialFields(result: unknown): unknown {
  if (result === null || typeof result !== "object") {
    return result;
  }
  const clone = { ...(result as Record<string, unknown>) };
  delete clone.refreshToken;
  delete clone.twoFactorChallengeToken;
  delete clone.trustDeviceToken;
  delete clone.trustDeviceMaxAgeMs;
  delete clone.twoFactorCookieMaxAgeMs;
  return clone;
}

export function shouldProxyAuthAction(request: Request, apiRoute: string) {
  const requestUrl = new URL(request.url);
  if (apiRoute.endsWith("/")) {
    return requestUrl.pathname === apiRoute || requestUrl.pathname === apiRoute.slice(0, -1);
  }
  return requestUrl.pathname === apiRoute || requestUrl.pathname === apiRoute + "/";
}
