import { httpActionGeneric, type HttpRouter } from "convex/server";
import { v } from "convex/values";
import { base64urlToBytes } from "./password.js";
import { getJwks, mintToken, verifyToken } from "./jwt.js";
import { parse } from "../helpers/index.js";
import { hashToken, isTokenExpired } from "./tokens.js";
import { handleUpdateSession } from "./updateSession.js";
import type { NativeEmailAndPasswordFunctionReferences } from "./provider.js";
import type { NativeMagicLinkFunctionReferences } from "./magicLink.js";
import {
  type NativeAuthSession,
  type NativeEmailAndPasswordComponentHandle,
  toNativeAuthUser,
} from "./types.js";
import { isAllowedRedirectUrl } from "./callback.js";
import { validateCsrfHeaders } from "./csrf.js";
import { setCookieHeader, clearCookieHeader, readCookie } from "./cookies.js";

const ACCESS_TOKEN_COOKIE = "convex-auth-token";
const REFRESH_TOKEN_COOKIE = "convex-auth-refresh-token";
const SESSION_ID_COOKIE = "convex-auth-session-id";
const TWO_FACTOR_PENDING_COOKIE = "convex-auth-two-factor";
const TWO_FACTOR_TRUSTED_DEVICE_COOKIE = "convex-auth-trusted-device";
const REFRESH_TOKEN_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

type NativeActionHandler<TReturn> = (ctx: unknown, args: unknown) => Promise<TReturn>;

function callAction<TReturn>(ctx: unknown, action: unknown, args: unknown): Promise<TReturn> {
  const actionFn = action as
    | { _handler?: NativeActionHandler<TReturn>; (ctx: unknown, args: unknown): Promise<TReturn> }
    | undefined;
  if (typeof actionFn !== "function") {
    throw new Error("Expected an action function");
  }
  const handler = actionFn._handler;
  if (typeof handler === "function") {
    return handler(ctx, args);
  }
  return actionFn(ctx, args);
}

function buildErrorRedirect(callbackURL: string, error: string): Response {
  const redirect = new URL(
    callbackURL,
    callbackURL.startsWith("http") ? undefined : "http://localhost",
  );
  redirect.searchParams.set("error", error);
  return new Response(null, {
    status: 302,
    headers: { Location: redirect.toString() },
  });
}

function buildTokenRedirect(callbackURL: string, token: string): Response {
  const redirect = new URL(
    callbackURL,
    callbackURL.startsWith("http") ? undefined : "http://localhost",
  );
  redirect.searchParams.set("token", token);
  return new Response(null, {
    status: 302,
    headers: { Location: redirect.toString() },
  });
}

function base64UrlDecode(value: string): string {
  try {
    return new TextDecoder().decode(base64urlToBytes(value));
  } catch {
    return "";
  }
}

function getTokenExpiry(token: string): number | null {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }
  const payload = parts[1];
  if (!payload) {
    return null;
  }
  try {
    const json = base64UrlDecode(payload);
    const parsed = JSON.parse(json) as { exp?: number };
    if (typeof parsed.exp !== "number") {
      return null;
    }
    return parsed.exp * 1000;
  } catch {
    return null;
  }
}

function buildTwoFactorVerifyResponse(
  request: Request,
  session: {
    token: string | null;
    refreshToken?: string;
    trustDeviceToken?: string;
    trustDeviceMaxAgeMs?: number;
  },
  trustDeviceToken?: string,
): Response {
  const secure = new URL(request.url).protocol === "https:";
  const headers = new Headers({ "Content-Type": "application/json" });

  if (session.token) {
    const expiry = getTokenExpiry(session.token);
    const maxAge = expiry ? Math.max(0, Math.floor((expiry - Date.now()) / 1000)) : undefined;
    headers.append(
      "Set-Cookie",
      setCookieHeader(ACCESS_TOKEN_COOKIE, session.token, maxAge, secure),
    );
    headers.append("Set-Cookie", clearCookieHeader(TWO_FACTOR_PENDING_COOKIE, secure));
  }
  if (session.refreshToken) {
    headers.append(
      "Set-Cookie",
      setCookieHeader(
        REFRESH_TOKEN_COOKIE,
        session.refreshToken,
        REFRESH_TOKEN_MAX_AGE_SECONDS,
        secure,
      ),
    );
  }
  const trustedToken = trustDeviceToken ?? session.trustDeviceToken;
  if (trustedToken) {
    const maxAge = session.trustDeviceMaxAgeMs
      ? Math.floor(session.trustDeviceMaxAgeMs / 1000)
      : undefined;
    headers.append(
      "Set-Cookie",
      setCookieHeader(TWO_FACTOR_TRUSTED_DEVICE_COOKIE, trustedToken, maxAge, secure),
    );
  }

  const responseBody = { success: true, ...session } as Record<string, unknown>;
  if (responseBody.user && typeof responseBody.user === "object" && responseBody.user !== null) {
    // user is already a plain object from toNativeAuthUser
  }
  return new Response(JSON.stringify(responseBody), {
    status: 200,
    headers,
  });
}

function errorStatusAndReason(error: unknown): { status: number; reason: string } {
  const message = error instanceof Error ? error.message : "unknown";
  const map: Record<string, { status: number; reason: string }> = {
    "Email and password authentication is disabled": { status: 400, reason: "auth_disabled" },
    "Sign up is disabled": { status: 400, reason: "sign_up_disabled" },
    "Invalid email": { status: 400, reason: "invalid_email" },
    "Password is too short": { status: 400, reason: "password_too_short" },
    "Password is too long": { status: 400, reason: "password_too_long" },
    "Password has been exposed in a data breach and cannot be used": {
      status: 400,
      reason: "breached_password",
    },
    "User already exists": { status: 400, reason: "user_already_exists" },
    "Invalid email or password": { status: 401, reason: "invalid_email_or_password" },
    "Email not verified": { status: 401, reason: "email_not_verified" },
    "Too many requests": { status: 429, reason: "too_many_requests" },
    "Failed to create session": { status: 500, reason: "session_creation_failed" },
    "Invalid session token": { status: 401, reason: "invalid_session" },
    "Captcha response is required": { status: 400, reason: "missing_captcha_response" },
    captcha_rejected: { status: 403, reason: "captcha_rejected" },
    missing_captcha_response: { status: 400, reason: "missing_captcha_response" },
    invalid_provider_response: { status: 400, reason: "captcha_verification_failed" },
  };
  return map[message] ?? { status: 500, reason: "unknown" };
}

function buildErrorResponse(status: number, reason: string): Response {
  return new Response(JSON.stringify({ message: reason, code: reason }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export type NativeAuthHttpOptions = {
  trustedOrigins?: string[];
  disableCSRFCheck?: boolean;
};

function checkCsrf(request: Request, options?: NativeAuthHttpOptions): Response | undefined {
  const result = validateCsrfHeaders(
    request,
    options?.trustedOrigins ?? [],
    options?.disableCSRFCheck,
  );
  if (!result.allowed) {
    return buildErrorResponse(result.status, result.reason);
  }
  return undefined;
}

export function addNativeAuthHttpRoutes(
  http: HttpRouter,
  component?: NativeEmailAndPasswordComponentHandle,
  actions?: NativeEmailAndPasswordFunctionReferences & Partial<NativeMagicLinkFunctionReferences>,
  options?: NativeAuthHttpOptions,
): void {
  http.route({
    path: "/.well-known/jwks.json",
    method: "GET",
    handler: httpActionGeneric(async () => {
      return new Response(JSON.stringify(await getJwks()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  });

  if (actions) {
    const signUpAction = httpActionGeneric(async (ctx, request) => {
      const csrf = checkCsrf(request, options);
      if (csrf) {
        return csrf;
      }

      const body = await request.json().catch(() => undefined);

      const captchaToken = request.headers.get("x-captcha-response") ?? undefined;

      let parsed: {
        email: string;
        password: string;
        name: string;
        image?: string;
        callbackURL?: string;
        rememberMe?: boolean;
        captchaToken?: string;
      };
      try {
        parsed = parse(
          v.object({
            email: v.string(),
            password: v.string(),
            name: v.string(),
            image: v.optional(v.string()),
            callbackURL: v.optional(v.string()),
            rememberMe: v.optional(v.boolean()),
            captchaToken: v.optional(v.string()),
          }),
          body,
        );
        if (captchaToken && !parsed.captchaToken) {
          parsed.captchaToken = captchaToken;
        }
      } catch {
        return new Response(JSON.stringify({ success: false, reason: "invalid_body" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      let session;
      try {
        session = await callAction<NativeAuthSession>(ctx, actions.signUp, parsed);
      } catch (error) {
        const { status, reason } = errorStatusAndReason(error);
        return buildErrorResponse(status, reason);
      }
      const secure = new URL(request.url).protocol === "https:";

      const headers = new Headers({ "Content-Type": "application/json" });
      if (session.token) {
        const expiry = getTokenExpiry(session.token);
        const maxAge = expiry ? Math.max(0, Math.floor((expiry - Date.now()) / 1000)) : undefined;
        headers.append(
          "Set-Cookie",
          setCookieHeader(ACCESS_TOKEN_COOKIE, session.token, maxAge, secure),
        );
      }
      if (session.refreshToken) {
        const maxAge = parsed.rememberMe ? REFRESH_TOKEN_MAX_AGE_SECONDS : undefined;
        headers.append(
          "Set-Cookie",
          setCookieHeader(REFRESH_TOKEN_COOKIE, session.refreshToken, maxAge, secure),
        );
      }

      return new Response(JSON.stringify(session), { status: 200, headers });
    });

    http.route({ path: "/api/auth/sign-up", method: "POST", handler: signUpAction });
    http.route({ path: "/api/auth/sign-up/email", method: "POST", handler: signUpAction });

    const signInAction = httpActionGeneric(async (ctx, request) => {
      const csrf = checkCsrf(request, options);
      if (csrf) {
        return csrf;
      }

      const body = await request.json().catch(() => undefined);

      let parsed: {
        email: string;
        password: string;
        callbackURL?: string;
        rememberMe?: boolean;
        trustedDeviceToken?: string;
      };
      try {
        parsed = parse(
          v.object({
            email: v.string(),
            password: v.string(),
            callbackURL: v.optional(v.string()),
            rememberMe: v.optional(v.boolean()),
            trustedDeviceToken: v.optional(v.string()),
          }),
          body,
        );
      } catch {
        return new Response(JSON.stringify({ success: false, reason: "invalid_body" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      parsed.trustedDeviceToken =
        parsed.trustedDeviceToken ?? readCookie(request, TWO_FACTOR_TRUSTED_DEVICE_COOKIE);

      let session;
      try {
        session = await callAction<NativeAuthSession>(ctx, actions.signIn, parsed);
      } catch (error) {
        const { status, reason } = errorStatusAndReason(error);
        return buildErrorResponse(status, reason);
      }
      const secure = new URL(request.url).protocol === "https:";

      const headers = new Headers({ "Content-Type": "application/json" });
      if (session.token) {
        const expiry = getTokenExpiry(session.token);
        const maxAge = expiry ? Math.max(0, Math.floor((expiry - Date.now()) / 1000)) : undefined;
        headers.append(
          "Set-Cookie",
          setCookieHeader(ACCESS_TOKEN_COOKIE, session.token, maxAge, secure),
        );
        if (session.twoFactorChallengeToken) {
          headers.append("Set-Cookie", clearCookieHeader(TWO_FACTOR_PENDING_COOKIE, secure));
        }
      }
      if (session.refreshToken) {
        const maxAge = parsed.rememberMe ? REFRESH_TOKEN_MAX_AGE_SECONDS : undefined;
        headers.append(
          "Set-Cookie",
          setCookieHeader(REFRESH_TOKEN_COOKIE, session.refreshToken, maxAge, secure),
        );
      }
      if (session.twoFactorChallengeToken) {
        const maxAge = session.twoFactorCookieMaxAgeMs
          ? Math.floor(session.twoFactorCookieMaxAgeMs / 1000)
          : undefined;
        headers.append(
          "Set-Cookie",
          setCookieHeader(
            TWO_FACTOR_PENDING_COOKIE,
            session.twoFactorChallengeToken,
            maxAge,
            secure,
          ),
        );
      }

      if (session.url) {
        headers.append("Location", session.url);
      }

      return new Response(JSON.stringify(session), { status: 200, headers });
    });

    http.route({ path: "/api/auth/sign-in", method: "POST", handler: signInAction });
    http.route({ path: "/api/auth/sign-in/email", method: "POST", handler: signInAction });

    http.route({
      path: "/api/auth/sign-out",
      method: "POST",
      handler: httpActionGeneric(async (ctx, request) => {
        const csrf = checkCsrf(request, options);
        if (csrf) {
          return csrf;
        }

        const body = await request.json().catch(() => undefined);

        let parsed: { token?: string; callbackURL?: string };
        try {
          parsed = parse(
            v.object({
              token: v.optional(v.string()),
              callbackURL: v.optional(v.string()),
            }),
            body,
          );
        } catch {
          parsed = {};
        }

        if (
          parsed.callbackURL &&
          !isAllowedRedirectUrl(
            parsed.callbackURL,
            new URL(request.url).origin,
            options?.trustedOrigins ?? [],
          )
        ) {
          return buildErrorResponse(400, "invalid_callback_url");
        }

        const token = parsed.token ?? readCookie(request, ACCESS_TOKEN_COOKIE);
        let result;
        try {
          result = token
            ? await callAction<{ success: boolean; redirect?: boolean; url?: string }>(
                ctx,
                actions.signOut,
                { token, callbackURL: parsed.callbackURL },
              )
            : { success: true, redirect: false as const };
        } catch (error) {
          const { status, reason } = errorStatusAndReason(error);
          return buildErrorResponse(status, reason);
        }

        const secure = new URL(request.url).protocol === "https:";
        const headers = new Headers({ "Content-Type": "application/json" });
        headers.append("Set-Cookie", clearCookieHeader(ACCESS_TOKEN_COOKIE, secure));
        headers.append("Set-Cookie", clearCookieHeader(REFRESH_TOKEN_COOKIE, secure));

        if (result.url) {
          headers.append("Location", result.url);
          return new Response(JSON.stringify(result), { status: 302, headers });
        }

        return new Response(JSON.stringify(result), { status: 200, headers });
      }),
    });

    http.route({
      path: "/api/auth/request-password-reset",
      method: "POST",
      handler: httpActionGeneric(async (ctx, request) => {
        const csrf = checkCsrf(request, options);
        if (csrf) {
          return csrf;
        }

        const body = await request.json().catch(() => undefined);
        const captchaToken = request.headers.get("x-captcha-response") ?? undefined;

        let parsed: { email: string; redirectTo?: string; captchaToken?: string };
        try {
          parsed = parse(
            v.object({
              email: v.string(),
              redirectTo: v.optional(v.string()),
              captchaToken: v.optional(v.string()),
            }),
            body,
          );
          if (captchaToken && !parsed.captchaToken) {
            parsed.captchaToken = captchaToken;
          }
        } catch {
          return new Response(JSON.stringify({ success: false, reason: "invalid_body" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        try {
          const result = await callAction(ctx, actions.sendPasswordReset, {
            email: parsed.email,
            redirectTo: parsed.redirectTo,
          });
          return new Response(JSON.stringify(result), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (error) {
          const { status, reason } = errorStatusAndReason(error);
          return buildErrorResponse(status, reason);
        }
      }),
    });

    http.route({
      path: "/api/auth/send-verification-email",
      method: "POST",
      handler: httpActionGeneric(async (ctx, request) => {
        const csrf = checkCsrf(request, options);
        if (csrf) {
          return csrf;
        }

        const body = await request.json().catch(() => undefined);
        let parsed: { email: string; callbackURL?: string };
        try {
          parsed = parse(
            v.object({
              email: v.string(),
              callbackURL: v.optional(v.string()),
            }),
            body,
          );
        } catch {
          return new Response(JSON.stringify({ success: false, reason: "invalid_body" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        try {
          const result = await callAction(ctx, actions.sendEmailVerification, {
            email: parsed.email,
            callbackURL: parsed.callbackURL,
          });
          return new Response(JSON.stringify(result), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (error) {
          const { status, reason } = errorStatusAndReason(error);
          return buildErrorResponse(status, reason);
        }
      }),
    });

    http.route({
      path: "/api/auth/two-factor/enable",
      method: "POST",
      handler: httpActionGeneric(async (ctx, request) => {
        const csrf = checkCsrf(request, options);
        if (csrf) {
          return csrf;
        }

        const body = await request.json().catch(() => undefined);
        let parsed: { password: string; issuer?: string };
        try {
          parsed = parse(
            v.object({
              password: v.string(),
              issuer: v.optional(v.string()),
            }),
            body,
          );
        } catch {
          return new Response(JSON.stringify({ success: false, reason: "invalid_body" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const token = readCookie(request, ACCESS_TOKEN_COOKIE);
        if (!token) {
          return new Response(JSON.stringify({ success: false, reason: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        let result;
        try {
          result = await callAction<{
            totpURI?: string;
            backupCodes?: string[];
            error?: string;
          }>(ctx, actions.twoFactorEnable, {
            token,
            password: parsed.password,
            issuer: parsed.issuer,
          });
        } catch (error) {
          const { status, reason } = errorStatusAndReason(error);
          return buildErrorResponse(status, reason);
        }

        if (result.error) {
          return buildErrorResponse(401, result.error);
        }

        return new Response(JSON.stringify({ success: true, ...result }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    });

    http.route({
      path: "/api/auth/two-factor/verify-totp",
      method: "POST",
      handler: httpActionGeneric(async (ctx, request) => {
        const csrf = checkCsrf(request, options);
        if (csrf) {
          return csrf;
        }

        const body = await request.json().catch(() => undefined);
        let parsed: { code: string; trustDevice?: boolean };
        try {
          parsed = parse(
            v.object({
              code: v.string(),
              trustDevice: v.optional(v.boolean()),
            }),
            body,
          );
        } catch {
          return new Response(JSON.stringify({ success: false, reason: "invalid_body" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const token =
          readCookie(request, TWO_FACTOR_PENDING_COOKIE) ??
          readCookie(request, ACCESS_TOKEN_COOKIE);
        if (!token) {
          return new Response(JSON.stringify({ success: false, reason: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        let session;
        try {
          session = await callAction<NativeAuthSession>(ctx, actions.twoFactorVerifyTOTP, {
            token,
            code: parsed.code,
            trustDevice: parsed.trustDevice,
          });
        } catch (error) {
          const { status, reason } = errorStatusAndReason(error);
          return buildErrorResponse(status, reason);
        }

        return buildTwoFactorVerifyResponse(request, session, session.trustDeviceToken);
      }),
    });

    http.route({
      path: "/api/auth/two-factor/verify-backup-code",
      method: "POST",
      handler: httpActionGeneric(async (ctx, request) => {
        const csrf = checkCsrf(request, options);
        if (csrf) {
          return csrf;
        }

        const body = await request.json().catch(() => undefined);
        let parsed: { code: string; trustDevice?: boolean };
        try {
          parsed = parse(
            v.object({
              code: v.string(),
              trustDevice: v.optional(v.boolean()),
            }),
            body,
          );
        } catch {
          return new Response(JSON.stringify({ success: false, reason: "invalid_body" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const token = readCookie(request, TWO_FACTOR_PENDING_COOKIE);
        if (!token) {
          return new Response(JSON.stringify({ success: false, reason: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        let session;
        try {
          session = await callAction<NativeAuthSession>(ctx, actions.twoFactorVerifyBackupCode, {
            token,
            code: parsed.code,
            trustDevice: parsed.trustDevice,
          });
        } catch (error) {
          const { status, reason } = errorStatusAndReason(error);
          return buildErrorResponse(status, reason);
        }

        return buildTwoFactorVerifyResponse(request, session, session.trustDeviceToken);
      }),
    });

    http.route({
      path: "/api/auth/two-factor/disable",
      method: "POST",
      handler: httpActionGeneric(async (ctx, request) => {
        const csrf = checkCsrf(request, options);
        if (csrf) {
          return csrf;
        }

        const body = await request.json().catch(() => undefined);
        let parsed: { password: string };
        try {
          parsed = parse(
            v.object({
              password: v.string(),
            }),
            body,
          );
        } catch {
          return new Response(JSON.stringify({ success: false, reason: "invalid_body" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const token = readCookie(request, ACCESS_TOKEN_COOKIE);
        if (!token) {
          return new Response(JSON.stringify({ success: false, reason: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        let result;
        try {
          result = await callAction<{ success: boolean }>(ctx, actions.twoFactorDisable, {
            token,
            password: parsed.password,
          });
        } catch (error) {
          const { status, reason } = errorStatusAndReason(error);
          return buildErrorResponse(status, reason);
        }

        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    });

    http.route({
      path: "/api/auth/two-factor/generate-backup-codes",
      method: "POST",
      handler: httpActionGeneric(async (ctx, request) => {
        const csrf = checkCsrf(request, options);
        if (csrf) {
          return csrf;
        }

        const body = await request.json().catch(() => undefined);
        let parsed: { password: string };
        try {
          parsed = parse(
            v.object({
              password: v.string(),
            }),
            body,
          );
        } catch {
          return new Response(JSON.stringify({ success: false, reason: "invalid_body" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const token = readCookie(request, ACCESS_TOKEN_COOKIE);
        if (!token) {
          return new Response(JSON.stringify({ success: false, reason: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        let result;
        try {
          result = await callAction<{ backupCodes: string[]; error?: string }>(
            ctx,
            actions.twoFactorGenerateBackupCodes,
            {
              token,
              password: parsed.password,
            },
          );
        } catch (error) {
          const { status, reason } = errorStatusAndReason(error);
          return buildErrorResponse(status, reason);
        }

        if (result.error) {
          return buildErrorResponse(401, result.error);
        }

        return new Response(JSON.stringify({ success: true, ...result }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    });

    const verifyMagicLinkAction = actions.verifyMagicLink;
    if (verifyMagicLinkAction) {
      http.route({
        path: "/api/auth/magic-link/verify",
        method: "GET",
        handler: httpActionGeneric(async (ctx, request) => {
          const url = new URL(request.url);
          const requestOrigin = url.origin;
          const token = url.searchParams.get("token") ?? "";
          const callbackURL = url.searchParams.get("callbackURL") ?? "/";
          const newUserCallbackURL = url.searchParams.get("newUserCallbackURL");
          const errorCallbackURL = url.searchParams.get("errorCallbackURL");

          if (!token) {
            return buildErrorRedirect(callbackURL, "INVALID_TOKEN");
          }

          if (!isAllowedRedirectUrl(callbackURL, requestOrigin, options?.trustedOrigins ?? [])) {
            return buildErrorResponse(400, "invalid_callback_url");
          }

          const redirectTarget = errorCallbackURL ?? callbackURL;

          let result;
          try {
            result = await callAction<NativeAuthSession>(ctx, verifyMagicLinkAction, {
              token,
              callbackURL,
              newUserCallbackURL: newUserCallbackURL ?? undefined,
              errorCallbackURL: errorCallbackURL ?? undefined,
            });
          } catch (error) {
            const reason = error instanceof Error ? error.message : "INVALID_TOKEN";
            return buildErrorRedirect(redirectTarget, reason);
          }

          if (!result.token) {
            return buildErrorRedirect(redirectTarget, "INVALID_TOKEN");
          }

          const expiry = getTokenExpiry(result.token);
          const tokenMaxAgeSeconds =
            expiry !== null ? Math.max(0, Math.floor((expiry - Date.now()) / 1000)) : undefined;

          const headers = new Headers();
          headers.append(
            "Set-Cookie",
            setCookieHeader(ACCESS_TOKEN_COOKIE, result.token, tokenMaxAgeSeconds),
          );
          headers.append(
            "Set-Cookie",
            setCookieHeader(
              REFRESH_TOKEN_COOKIE,
              result.refreshToken ?? "",
              REFRESH_TOKEN_MAX_AGE_SECONDS,
            ),
          );
          if (result.sessionId) {
            headers.append(
              "Set-Cookie",
              setCookieHeader(SESSION_ID_COOKIE, result.sessionId, REFRESH_TOKEN_MAX_AGE_SECONDS),
            );
          }

          const redirect = new URL(
            callbackURL,
            callbackURL.startsWith("http") ? undefined : "http://localhost",
          );
          redirect.searchParams.set("token", result.token);
          if (result.refreshToken) {
            redirect.searchParams.set("refreshToken", result.refreshToken);
          }
          if (result.sessionId) {
            redirect.searchParams.set("sessionId", result.sessionId);
          }
          headers.set("Location", redirect.toString());
          return new Response(null, {
            status: 302,
            headers,
          });
        }),
      });
    }
  }

  if (!component) {
    return;
  }

  http.route({
    pathPrefix: "/api/auth/reset-password/",
    method: "GET",
    handler: httpActionGeneric(async (ctx, request) => {
      const url = new URL(request.url);
      const requestOrigin = url.origin;
      const token = url.pathname.split("/").pop() ?? "";
      const callbackURL = url.searchParams.get("callbackURL");

      if (!callbackURL) {
        return new Response("Missing callbackURL", { status: 400 });
      }
      if (!isAllowedRedirectUrl(callbackURL, requestOrigin, options?.trustedOrigins ?? [])) {
        return new Response("Invalid callbackURL", { status: 400 });
      }

      const tokenHash = await hashToken(token);
      const code = await ctx.runQuery(component.native.codes.getVerificationCodeByTokenHash, {
        tokenHash,
        type: "password_reset",
      });

      if (!code || isTokenExpired(code.expiresAt)) {
        return buildErrorRedirect(callbackURL, "INVALID_TOKEN");
      }

      return buildTokenRedirect(callbackURL, token);
    }),
  });

  http.route({
    path: "/api/auth/verify-email",
    method: "GET",
    handler: httpActionGeneric(async (ctx, request) => {
      const url = new URL(request.url);
      const requestOrigin = url.origin;
      const token = url.searchParams.get("token") ?? "";
      const callbackURL = url.searchParams.get("callbackURL");

      if (
        callbackURL &&
        !isAllowedRedirectUrl(callbackURL, requestOrigin, options?.trustedOrigins ?? [])
      ) {
        return buildErrorResponse(400, "invalid_callback_url");
      }

      const tokenHash = await hashToken(token);
      const result = await ctx.runMutation(component.identity.verifyEmail, {
        tokenHash,
        provider: "password",
        issuer: "native",
      });

      if (!result.success) {
        if (callbackURL) {
          return buildErrorRedirect(
            callbackURL,
            result.reason === "expired" ? "EXPIRED_TOKEN" : "INVALID_TOKEN",
          );
        }
        return new Response(
          JSON.stringify({ success: false, reason: result.reason ?? "invalid" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (callbackURL) {
        return buildTokenRedirect(callbackURL, token);
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  });

  http.route({
    path: "/api/auth/update-session",
    method: "POST",
    handler: httpActionGeneric(async (ctx, request) => {
      const body = await request.json().catch(() => undefined);

      let parsed: { refreshToken: string };
      try {
        parsed = parse(v.object({ refreshToken: v.string() }), body);
      } catch {
        return new Response(JSON.stringify({ success: false, reason: "missing_refresh_token" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      try {
        const result = await handleUpdateSession(ctx, component, parsed.refreshToken);
        const secure = new URL(request.url).protocol === "https:";
        const headers = new Headers({ "Content-Type": "application/json" });
        if (result.token) {
          const expiry = getTokenExpiry(result.token);
          const maxAge = expiry ? Math.max(0, Math.floor((expiry - Date.now()) / 1000)) : undefined;
          headers.append(
            "Set-Cookie",
            setCookieHeader(ACCESS_TOKEN_COOKIE, result.token, maxAge, secure),
          );
        }
        if (result.refreshToken) {
          headers.append(
            "Set-Cookie",
            setCookieHeader(
              REFRESH_TOKEN_COOKIE,
              result.refreshToken,
              REFRESH_TOKEN_MAX_AGE_SECONDS,
              secure,
            ),
          );
        }
        if (result.twoFactorChallengeToken) {
          headers.append("Set-Cookie", clearCookieHeader(TWO_FACTOR_PENDING_COOKIE, secure));
        }
        if (result.trustDeviceToken) {
          const maxAge = result.trustDeviceMaxAgeMs
            ? Math.floor(result.trustDeviceMaxAgeMs / 1000)
            : undefined;
          headers.append(
            "Set-Cookie",
            setCookieHeader(
              TWO_FACTOR_TRUSTED_DEVICE_COOKIE,
              result.trustDeviceToken,
              maxAge,
              secure,
            ),
          );
        }
        return new Response(JSON.stringify({ success: true, ...result }), {
          status: 200,
          headers,
        });
      } catch {
        return new Response(JSON.stringify({ success: false, reason: "invalid_refresh_token" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
    }),
  });

  http.route({
    path: "/api/auth/convex/jwks",
    method: "GET",
    handler: httpActionGeneric(async () => {
      return new Response(JSON.stringify(await getJwks()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  });

  http.route({
    path: "/api/auth/convex/token",
    method: "GET",
    handler: httpActionGeneric(async (ctx, request) => {
      const token = readCookie(request, ACCESS_TOKEN_COOKIE);
      if (!token) {
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      let payload;
      try {
        payload = await verifyToken(token);
      } catch {
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      const userId = payload.sub;
      const sessionId = payload.sessionId;
      if (typeof userId !== "string" || typeof sessionId !== "string") {
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      const session = await ctx.runQuery(component.native.sessions.getSessionByToken, { token });
      if (!session || session.sessionId !== sessionId || (session.expiresAt ?? 0) < Date.now()) {
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      const user = await ctx.runQuery(component.native.users.getUserById, { userId });
      if (!user) {
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      const extra: Record<string, unknown> = {};
      if (typeof payload.identityId === "string") {
        extra.identityId = payload.identityId;
      }

      const convexToken = await mintToken(userId, sessionId, extra, {
        issuer: new URL(request.url).origin,
      });

      return new Response(JSON.stringify({ token: convexToken }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  });

  const sessionHandler = httpActionGeneric(async (ctx, request) => {
    const token = readCookie(request, ACCESS_TOKEN_COOKIE);
    if (!token) {
      return new Response(JSON.stringify({ user: null, sessionId: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    let payload;
    try {
      payload = await verifyToken(token);
    } catch {
      return new Response(JSON.stringify({ user: null, sessionId: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const userId = payload.sub;
    const sessionId = payload.sessionId;
    if (typeof userId !== "string" || typeof sessionId !== "string") {
      return new Response(JSON.stringify({ user: null, sessionId: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const session = await ctx.runQuery(component.native.sessions.getSessionByToken, { token });
    if (!session || session.sessionId !== sessionId || (session.expiresAt ?? 0) < Date.now()) {
      return new Response(JSON.stringify({ user: null, sessionId: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const user = await ctx.runQuery(component.native.users.getUserById, { userId });
    if (!user) {
      return new Response(JSON.stringify({ user: null, sessionId: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ user: toNativeAuthUser(user), sessionId }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });

  http.route({ path: "/api/auth/session", method: "GET", handler: sessionHandler });
  http.route({ path: "/api/auth/get-session", method: "GET", handler: sessionHandler });
}
