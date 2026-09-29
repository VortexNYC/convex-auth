import { action } from "../../component/_generated/server.js";
import type { FunctionReference, GenericActionCtx } from "convex/server";
import type { DataModel } from "../../component/_generated/dataModel.js";
import { v } from "convex/values";
import { generateVerificationToken, hashToken } from "./tokens.js";
import { nativeAuthSessionValidator } from "./provider.js";
import {
  DEFAULT_RATE_LIMIT_MAX_ATTEMPTS,
  DEFAULT_RATE_LIMIT_WINDOW_MS,
  DEFAULT_REFRESH_TOKEN_TTL_MS,
  DEFAULT_SESSION_TTL_MS,
  normalizeEmail,
} from "./validation.js";
import { resolveSessionTtlMs } from "./sessionIssuer.js";
import { errors as joseErrors } from "jose";
import { createGoogleProvider } from "./oauth.js";
import type { AccountLinkingConfig } from "./oauthHandlers.js";
import { toNativeAuthUser, type NativeEmailAndPasswordComponentHandle } from "./types.js";

const GOOGLE_ISSUER = "https://accounts.google.com";
const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_JWKS_CACHE_TTL_MS = 5 * 60 * 1000;

/* The Google provider fetches JWKS on every getUserInfo call — fine for the
 * low-frequency redirect callback, but One Tap fires once per prompt. Cache
 * the keyset for 5 minutes: long enough to stop fan-out, short enough that
 * Google's key rotation self-heals. */
function withGoogleJwksCache(fetchImpl: typeof fetch): typeof fetch {
  let cached: { keys: unknown; expiresAt: number } | undefined;
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url !== GOOGLE_JWKS_URL) return fetchImpl(input, init);
    if (cached && cached.expiresAt > Date.now()) {
      return new Response(JSON.stringify(cached.keys), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    const response = await fetchImpl(input, init);
    if (!response.ok) return response;
    const keys = await response.json();
    cached = { keys, expiresAt: Date.now() + GOOGLE_JWKS_CACHE_TTL_MS };
    return new Response(JSON.stringify(keys), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
}

export type NativeOneTapConfig = {
  enabled?: boolean;
  /** Google OAuth client ID — used as the `audience` check on the ID token. */
  clientId: string;
  /** Restrict to a Google Workspace hosted domain. */
  hd?: string;
  /** Maximum age in seconds for a Google ID token. */
  maxTokenAge?: number;
  /** Override fetch for testing. */
  fetchImpl?: typeof fetch;
  disableSignUp?: boolean;
  /** Only allow sign-in for accounts created through an explicit sign-up. */
  disableImplicitSignUp?: boolean;
  /** Require Google to report `email_verified` before signing in. */
  requireEmailVerification?: boolean;
  /** Treat Google as a trusted provider — verified claims may implicitly link. */
  trustedProvider?: boolean;
  sessionTtlMs?: number;
  refreshTokenTtlMs?: number;
  /**
   * Rate limiting on sign-in attempts. Enabled by default (5 attempts per
   * 60s window) and applied twice: once pre-verification keyed on the token
   * hash (caps replays before any crypto), once post-verification keyed on
   * the Google subject (caps per-account abuse). Pass `false` to disable.
   */
  rateLimit?:
    | {
        windowMs?: number;
        maxAttempts?: number;
      }
    | false;
  /** Inherited from `oauth.accountLinking` — same identity, same policy. */
  accountLinking?: AccountLinkingConfig;
  /** Inherited from `oauth.trustedProviders`. */
  trustedProviders?: string[];
};

export type NativeOneTapActions = ReturnType<typeof nativeOneTap>;

export type NativeOneTapFunctionReferences = {
  signInOneTap: FunctionReference<"action", "public">;
};

type SignInOneTapBody = {
  idToken: string;
  nonce?: string;
  rememberMe?: boolean;
};

export function nativeOneTap(
  component: NativeEmailAndPasswordComponentHandle,
  config: NativeOneTapConfig,
) {
  const enabled = config.enabled ?? true;
  const disableSignUp = config.disableSignUp ?? false;
  const sessionTtlMs = config.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
  const refreshTokenTtlMs = config.refreshTokenTtlMs ?? DEFAULT_REFRESH_TOKEN_TTL_MS;
  const rateLimitConfig = config.rateLimit === false ? undefined : config.rateLimit;
  const rateLimitWindowMs = rateLimitConfig?.windowMs ?? DEFAULT_RATE_LIMIT_WINDOW_MS;
  const rateLimitMaxAttempts = rateLimitConfig?.maxAttempts ?? DEFAULT_RATE_LIMIT_MAX_ATTEMPTS;
  const rateLimitEnabled = config.rateLimit !== false;

  /* The Google provider's id_token path already does the whole verification:
   * JWKS fetch, RS256 signature, iss/aud/exp, hosted domain. One Tap reuses
   * it verbatim — clientSecret is never exercised on this path. */
  const googleProvider = createGoogleProvider({
    clientId: config.clientId,
    clientSecret: "",
    hd: config.hd,
    maxTokenAge: config.maxTokenAge,
    fetchImpl: withGoogleJwksCache(config.fetchImpl ?? fetch),
  });

  const isTrustedProvider =
    config.trustedProvider === true || (config.trustedProviders?.includes("google") ?? false);

  async function recordRateLimitAttempt(ctx: GenericActionCtx<DataModel>, identifier: string) {
    const windowStart = Math.floor(Date.now() / rateLimitWindowMs) * rateLimitWindowMs;
    const rateLimit = await ctx.runMutation(component.native.rateLimits.recordAttempt, {
      identifier,
      windowStart,
      windowMs: rateLimitWindowMs,
      maxAttempts: rateLimitMaxAttempts,
    });
    if (!rateLimit.allowed) {
      throw new Error("Too many requests");
    }
  }

  const signInOneTap = action({
    args: {
      idToken: v.string(),
      nonce: v.optional(v.string()),
      rememberMe: v.optional(v.boolean()),
    },
    returns: nativeAuthSessionValidator,
    handler: async (ctx: GenericActionCtx<DataModel>, args: SignInOneTapBody) => {
      if (!enabled) {
        throw new Error("One Tap authentication is disabled");
      }
      /* An empty idToken would fall through the provider's `if (idToken)` into
       * the userinfo path and surface as an upstream error — reject early. */
      if (!args.idToken.trim()) {
        throw new Error("INVALID_ID_TOKEN");
      }

      /* Pre-verify bucket keyed on the credential itself: replays of the same
       * token — garbage, stolen, or retried — are capped before any crypto. */
      if (rateLimitEnabled) {
        await recordRateLimitAttempt(ctx, `one-tap-token:${await hashToken(args.idToken)}`);
      }

      let user: {
        id: string;
        name?: string;
        email?: string;
        image?: string;
        emailVerified: boolean;
      };
      let payload: Record<string, unknown>;
      try {
        const info = await googleProvider.getUserInfo({
          accessToken: "",
          idToken: args.idToken,
        });
        user = info.user;
        payload = info.data as Record<string, unknown>;
      } catch (err) {
        /* Signature/claim failures (bad aud, iss, exp, hd) are client errors;
         * JWKS fetch and network failures are upstream infra errors — let
         * those propagate rather than misreporting them as bad tokens. */
        const isTokenError =
          err instanceof joseErrors.JWTClaimValidationFailed ||
          err instanceof joseErrors.JWTExpired ||
          err instanceof joseErrors.JWTInvalid ||
          err instanceof joseErrors.JWSInvalid ||
          err instanceof joseErrors.JWSSignatureVerificationFailed ||
          err instanceof joseErrors.JOSEAlgNotAllowed ||
          /* A kid absent from the fetched set is a forged or rotated token —
           * the client should re-prompt, not the operator. */
          err instanceof joseErrors.JWKSNoMatchingKey ||
          (err instanceof Error &&
            err.message.startsWith("Google id_token hosted domain mismatch"));
        if (!isTokenError) throw err;
        throw new Error("INVALID_ID_TOKEN");
      }

      /* `String(payload.sub)` in the provider maps a missing claim to the
       * literal "undefined" — guard the claim, not the mapped string. */
      if (typeof payload.sub !== "string" || payload.sub.length === 0) {
        throw new Error("INVALID_ID_TOKEN");
      }

      /* Nonce is claim binding, not server-side replay protection: it proves
       * this credential was minted for the value the client initialized GIS
       * with. The client owns nonce issuance and freshness. */
      if (args.nonce !== undefined && payload.nonce !== args.nonce) {
        throw new Error("INVALID_ID_TOKEN");
      }

      if (rateLimitEnabled) {
        await recordRateLimitAttempt(ctx, `one-tap:${user.id}`);
      }

      if (config.requireEmailVerification && !user.emailVerified) {
        throw new Error("EMAIL_NOT_VERIFIED");
      }

      const existingAccount = await ctx.runQuery(component.native.accounts.getAccountBySubject, {
        provider: "google",
        issuer: GOOGLE_ISSUER,
        subject: user.id,
      });
      const normalizedEmail = normalizeEmail(user.email);
      const existingUserByEmail = normalizedEmail
        ? await ctx.runQuery(component.native.users.getUserByEmail, { email: normalizedEmail })
        : null;

      const isNewAccount = existingAccount === null;
      const isNewUser = isNewAccount && !existingUserByEmail;
      const isImplicitLink = isNewAccount && existingUserByEmail !== null;

      if (isNewUser && (disableSignUp || config.disableImplicitSignUp)) {
        throw new Error("SIGN_UP_DISABLED");
      }

      if (isImplicitLink) {
        const accountLinking = config.accountLinking;
        const requiresEmailVerification =
          accountLinking?.requiresEmailVerification === true ? true : !isTrustedProvider;
        if (
          (requiresEmailVerification && !user.emailVerified) ||
          accountLinking?.enabled === false ||
          accountLinking?.disableImplicitLinking === true
        ) {
          throw new Error("ACCOUNT_NOT_LINKED");
        }
      }

      const now = Date.now();
      const sessionId = crypto.randomUUID();
      const refreshToken = generateVerificationToken();
      const refreshTokenHash = await hashToken(refreshToken);

      const result = await ctx.runMutation(component.identity.provisionFromIdentity, {
        identity: {
          /* Identical to the redirect-OAuth identity — One Tap and the code
           * exchange resolve to the same account for the same Google sub. */
          identityId: `${GOOGLE_ISSUER}:${user.id}`,
          provider: "google",
          issuer: GOOGLE_ISSUER,
          subject: user.id,
          tokenIdentifier: `${GOOGLE_ISSUER}:${user.id}`,
          email: normalizedEmail,
          emailVerified: user.emailVerified,
          sessionId: null,
        },
        user: {
          name: user.name,
          email: normalizedEmail,
          image: user.image,
          emailVerified: user.emailVerified,
        },
        allowLink: true,
        allowUnverifiedEmailLink: isTrustedProvider,
        initialSession: {
          sessionId,
          sessionExpiresAt: now + resolveSessionTtlMs(args.rememberMe, sessionTtlMs),
          refreshTokenHash,
          refreshTokenExpiresAt: now + refreshTokenTtlMs,
        },
      });

      if (result.duplicate) {
        throw new Error("ACCOUNT_NOT_LINKED");
      }
      if (!result.identityId || !result.user) {
        throw new Error("INVALID_ID_TOKEN");
      }

      /* Keep the account row in lockstep with the redirect-OAuth path so a
       * later code exchange takes the update (not create) branch. */
      if (!existingAccount) {
        await ctx.runMutation(component.native.accounts.createAccount, {
          userId: result.userId,
          provider: "google",
          issuer: GOOGLE_ISSUER,
          subject: user.id,
          credentialHash: "",
        });
      }

      return {
        token: result.token ?? null,
        refreshToken,
        sessionId: result.sessionId ?? sessionId,
        user: toNativeAuthUser(result.user),
        userId: result.userId,
        identityId: result.identityId,
        createdUser: result.createdUser,
      };
    },
  });

  return { signInOneTap };
}
