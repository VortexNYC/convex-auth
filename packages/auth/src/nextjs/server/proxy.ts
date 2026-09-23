import "server-only";

import { fetchAction } from "convex/nextjs";
import { NextRequest } from "next/server";
import type { FunctionReference } from "convex/server";
import { validateCsrfHeaders } from "../../convex-runtime/native/csrf.js";
import type { NativeAuthActions } from "../../react/ConvexAuthProvider.js";
import { getRequestCookies } from "./cookies.js";
import {
  getConvexNextjsOptions,
  isCorsRequest,
  jsonResponse,
  logVerbose,
  setAuthCookies,
  type AuthCookieValues,
} from "./utils.js";

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
};

export async function proxyAuthActionToConvex(
  request: NextRequest,
  options: ConvexAuthProxyOptions,
) {
  const cookieConfig = options?.cookieConfig ?? { maxAge: null };
  const verbose = options?.verbose ?? false;
  if (request.method !== "POST") {
    return new Response("Invalid method", { status: 405 });
  }
  if (isCorsRequest(request)) {
    return new Response("Invalid origin", { status: 403 });
  }
  // Defense in depth under the CORS check: credentialed requests without a
  // matching Origin/Referer are rejected even when no Origin header is set.
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
    logVerbose(`Invalid intent ${String(intent)}, returning 400`, verbose);
    return new Response("Invalid intent", { status: 400 });
  }
  const action = options.actions[intent] as FunctionReference<"action"> | undefined;
  if (!action) {
    logVerbose(`Intent ${intent} is not configured, returning 400`, verbose);
    return new Response("Action not configured", { status: 400 });
  }

  const requestCookies = await getRequestCookies();
  const token = requestCookies.token ?? undefined;

  // Sign-out without a session cookie still clears any stale cookies and
  // succeeds — the action's `token` arg is a required string and would fail
  // validation on undefined.
  if (intent === "signOut" && token === undefined) {
    const response = jsonResponse({ success: true });
    await setAuthCookies(response, null, cookieConfig);
    return response;
  }

  // Server-side substitution: the browser sends placeholders for values that
  // live only in HttpOnly cookies.
  if (intent === "updateSession") {
    const refreshToken = requestCookies.refreshToken;
    if (refreshToken === null) {
      return jsonResponse({ error: "No refresh token" }, 401);
    }
    args.refreshToken = refreshToken;
  }
  if (intent === "signOut") {
    args.token = token;
  }
  if (intent === "twoFactorVerifyTOTP" || intent === "twoFactorVerifyBackupCode") {
    const pending = requestCookies.twoFactorPending;
    if (pending === null) {
      return jsonResponse({ error: "No two-factor challenge pending" }, 401);
    }
    args.token = pending;
  }
  if (intent === "signIn") {
    if (requestCookies.trustedDevice !== null) {
      args.trustedDeviceToken = requestCookies.trustedDevice;
    } else {
      // Never let a client-supplied trustedDeviceToken reach the action; the
      // HttpOnly cookie is the only trusted source for it.
      delete args.trustedDeviceToken;
    }
  }

  logVerbose(`Fetching action for intent ${intent}`, verbose);

  try {
    const result = await fetchAction(action, args as never, {
      ...getConvexNextjsOptions(options),
      ...(token !== undefined ? { token } : {}),
    });

    const cookiesToWrite = cookiesFromResult(result);
    const clientResult = stripConfidentialFields(result);
    const response = jsonResponse(clientResult);
    if (intent === "signOut") {
      // Sign-out always clears the auth cookies, whatever the action returned.
      await setAuthCookies(response, null, cookieConfig);
    } else if (cookiesToWrite !== undefined) {
      await setAuthCookies(response, cookiesToWrite, cookieConfig);
    }
    return response;
  } catch (error) {
    console.error(`Hit error while running proxy intent \`${intent}\`:`);
    console.error(error);
    const response = jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown error" },
      400,
    );
    // On mint failure the safest state is cleared cookies — a stale token
    // cookie would otherwise leave the client half-authenticated.
    if (intent === "updateSession" || intent === "signOut") {
      await setAuthCookies(response, null, cookieConfig);
    }
    return response;
  }
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
  // A minted session: write both tokens and clear any pending challenge.
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
  // A 2FA challenge instead of a session: stash the pending token AND clear
  // any existing session pair — a new sign-in supersedes the old session, and
  // leaving it would let the next server render resurrect it while the client
  // shows the challenge form.
  if (typeof r.twoFactorChallengeToken === "string") {
    return {
      token: null,
      refreshToken: null,
      twoFactorPending: r.twoFactorChallengeToken,
      twoFactorPendingMaxAgeMs: r.twoFactorCookieMaxAgeMs,
    };
  }
  // A session result with a null token means "signed out" from the action's
  // perspective (e.g. updateSession failing soft).
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

export function shouldProxyAuthAction(request: NextRequest, apiRoute: string) {
  // Handle both with and without trailing slash since this could be configured
  // either way (https://nextjs.org/docs/app/api-reference/next-config-js/trailingSlash).
  const requestUrl = new URL(request.url);
  if (apiRoute.endsWith("/")) {
    return requestUrl.pathname === apiRoute || requestUrl.pathname === apiRoute.slice(0, -1);
  }
  return requestUrl.pathname === apiRoute || requestUrl.pathname === apiRoute + "/";
}
