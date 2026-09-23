import { action } from "../../component/_generated/server.js";
import type { FunctionReference, GenericActionCtx } from "convex/server";
import type { DataModel } from "../../component/_generated/dataModel.js";
import { v } from "convex/values";
import { trimTrailingSlash } from "../account/emailShared.js";
import { generateVerificationToken, hashToken } from "./tokens.js";
import { nativeAuthSessionValidator } from "./provider.js";
import { toNativeAuthUser, type NativeEmailAndPasswordComponentHandle } from "./types.js";

// Common RFC-style email validation regex.
const EMAIL_REGEX =
  /^(?!\.)(?!.*\.\.)([A-Z0-9_+-]\.?)+[A-Z0-9_+-]@([A-Z0-9][A-Z0-9-]*\.)+[A-Z]{2,}$/i;

function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

const MAGIC_LINK_TOKEN_TTL_MS = 5 * 60 * 1000;
const DEFAULT_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type NativeAuthSendResult =
  | { status: "queued"; emailId: string }
  | { status: "not_configured"; reason: string }
  | { status: "failed"; reason: string };

export type MagicLinkSender = (data: {
  email: string;
  url: string;
  token: string;
  name?: string;
  metadata?: Record<string, string>;
}) => Promise<string>;

export type NativeMagicLinkConfig = {
  enabled?: boolean;
  appOrigin?: string;
  sendMagicLink: MagicLinkSender;
  expiresInMs?: number;
  disableSignUp?: boolean;
  sessionTtlMs?: number;
  refreshTokenTtlMs?: number;
};

export type NativeMagicLinkFunctionReferences = {
  [K in keyof NativeMagicLinkActions]: FunctionReference<"action", "public">;
};

type SignInMagicLinkBody = {
  email: string;
  name?: string;
  callbackURL?: string;
  newUserCallbackURL?: string;
  errorCallbackURL?: string;
  metadata?: Record<string, string>;
  /**
   * Landing verifier from the requesting browser's cookie. Stored on the
   * verifier record so the verify route can echo it onto the landing URL.
   */
  landingVerifier?: string;
};

type VerifyMagicLinkBody = {
  token: string;
  callbackURL?: string;
  newUserCallbackURL?: string;
  errorCallbackURL?: string;
  /**
   * Landing verifier the verifying browser presented. When provided it must
   * equal the verifier stored at request time — the site route omits it
   * (the app cookie is invisible on the site domain) and binds via the
   * landing URL instead.
   */
  landingVerifier?: string;
};

function resolveMagicLinkBaseUrl(config: NativeMagicLinkConfig): string {
  const appOrigin = config.appOrigin?.trim() ?? process.env.CONVEX_SITE_URL ?? "";
  if (!appOrigin) {
    throw new Error("Magic link: missing appOrigin or CONVEX_SITE_URL");
  }
  return trimTrailingSlash(appOrigin);
}

function buildMagicLinkUrl(
  baseUrl: string,
  token: string,
  callbackURL: string,
  newUserCallbackURL: string | undefined,
  errorCallbackURL: string | undefined,
): string {
  const url = new URL("/api/auth/magic-link/verify", baseUrl);
  url.searchParams.set("token", token);
  url.searchParams.set("callbackURL", callbackURL);
  if (newUserCallbackURL) {
    url.searchParams.set("newUserCallbackURL", newUserCallbackURL);
  }
  if (errorCallbackURL) {
    url.searchParams.set("errorCallbackURL", errorCallbackURL);
  }
  return url.toString();
}

export function nativeMagicLink(
  component: NativeEmailAndPasswordComponentHandle,
  config: NativeMagicLinkConfig,
) {
  const enabled = config.enabled ?? true;
  const expiresInMs = config.expiresInMs ?? MAGIC_LINK_TOKEN_TTL_MS;
  const disableSignUp = config.disableSignUp ?? false;
  const sessionTtlMs = config.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
  const refreshTokenTtlMs = config.refreshTokenTtlMs ?? DEFAULT_REFRESH_TOKEN_TTL_MS;

  const signInMagicLink = action({
    args: {
      email: v.string(),
      name: v.optional(v.string()),
      callbackURL: v.optional(v.string()),
      newUserCallbackURL: v.optional(v.string()),
      errorCallbackURL: v.optional(v.string()),
      metadata: v.optional(v.record(v.string(), v.string())),
      landingVerifier: v.optional(v.string()),
    },
    returns: v.object({
      status: v.union(v.literal("queued"), v.literal("not_configured"), v.literal("failed")),
      reason: v.optional(v.string()),
      emailId: v.optional(v.string()),
    }),
    handler: async (ctx: GenericActionCtx<DataModel>, args: SignInMagicLinkBody) => {
      if (!enabled) {
        throw new Error("Magic link authentication is disabled");
      }

      const normalizedEmail = args.email.trim().toLowerCase();
      if (!isValidEmail(normalizedEmail)) {
        throw new Error("Invalid email");
      }

      const token = generateVerificationToken();
      const tokenHash = await hashToken(token);
      const now = Date.now();
      const expiresAt = now + expiresInMs;

      const metadata = JSON.stringify({
        email: normalizedEmail,
        name: args.name,
        landingVerifier: args.landingVerifier,
      });

      await ctx.runMutation(component.native.verifiers.createVerifier, {
        verifierId: tokenHash,
        type: "magic-link",
        metadata,
        expiresAt,
      });

      const baseUrl = resolveMagicLinkBaseUrl(config);
      const callbackURL = args.callbackURL ?? "/";
      const url = buildMagicLinkUrl(
        baseUrl,
        token,
        callbackURL,
        args.newUserCallbackURL,
        args.errorCallbackURL,
      );

      const emailId = await config.sendMagicLink({
        email: normalizedEmail,
        url,
        token,
        name: args.name,
        metadata: args.metadata,
      });

      return { status: "queued" as const, emailId };
    },
  });

  const verifyMagicLink = action({
    args: {
      token: v.string(),
      callbackURL: v.optional(v.string()),
      newUserCallbackURL: v.optional(v.string()),
      errorCallbackURL: v.optional(v.string()),
      landingVerifier: v.optional(v.string()),
    },
    returns: nativeAuthSessionValidator,
    handler: async (ctx: GenericActionCtx<DataModel>, args: VerifyMagicLinkBody) => {
      if (!enabled) {
        throw new Error("Magic link authentication is disabled");
      }

      const tokenHash = await hashToken(args.token);
      const verifier = await ctx.runMutation(component.native.verifiers.consumeVerifier, {
        verifierId: tokenHash,
      });
      if (!verifier) {
        throw new Error("INVALID_TOKEN");
      }

      let metadata: { email?: string; name?: string; landingVerifier?: string };
      try {
        metadata = verifier.metadata ? JSON.parse(verifier.metadata) : {};
      } catch {
        throw new Error("INVALID_TOKEN");
      }

      // A presented verifier must equal the one bound at request time —
      // indistinguishable from an invalid token on purpose.
      if (args.landingVerifier !== undefined && metadata.landingVerifier !== args.landingVerifier) {
        throw new Error("INVALID_TOKEN");
      }

      const email = metadata.email?.trim().toLowerCase();
      if (!email || !isValidEmail(email)) {
        throw new Error("INVALID_TOKEN");
      }

      const existingUser = await ctx.runQuery(component.native.users.getUserByEmail, { email });
      if (!existingUser && disableSignUp) {
        throw new Error("SIGN_UP_DISABLED");
      }

      const now = Date.now();
      const sessionId = crypto.randomUUID();
      const refreshToken = generateVerificationToken();
      const refreshTokenHash = await hashToken(refreshToken);

      const result = await ctx.runMutation(component.identity.provisionFromIdentity, {
        identity: {
          identityId: `magic-link:native:${email}`,
          provider: "magicLink",
          issuer: "native",
          subject: email,
          tokenIdentifier: email,
          email,
          emailVerified: true,
        },
        user: {
          email,
          name: metadata.name,
          emailVerified: true,
        },
        allowLink: true,
        initialSession: {
          sessionId,
          sessionExpiresAt: now + sessionTtlMs,
          refreshTokenHash,
          refreshTokenExpiresAt: now + refreshTokenTtlMs,
        },
      });

      if (!result.user) {
        throw new Error("INVALID_TOKEN");
      }

      return {
        token: result.token ?? null,
        refreshToken,
        sessionId: result.sessionId ?? sessionId,
        user: toNativeAuthUser(result.user),
        userId: result.userId,
        identityId: result.identityId,
        landingVerifier: metadata.landingVerifier,
      };
    },
  });

  return { signInMagicLink, verifyMagicLink };
}

export type NativeMagicLinkActions = ReturnType<typeof nativeMagicLink>;
