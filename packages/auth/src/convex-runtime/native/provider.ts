import { action } from "../../component/_generated/server.js";
import type { FunctionReference, GenericActionCtx } from "convex/server";
import type { DataModel } from "../../component/_generated/dataModel.js";
import { v } from "convex/values";
import {
  buildEmailVerificationUrl,
  createEmailVerificationEmailDraft,
} from "../account/emailVerificationEmail.js";
import { trimTrailingSlash } from "../account/emailShared.js";
import {
  buildPasswordResetUrl,
  createPasswordResetEmailDraft,
} from "../account/passwordResetEmail.js";
import { mintToken, verifyToken } from "./jwt.js";
import { checkPasswordBreach } from "./breach.js";
import { hashPassword, verifyPassword as verifyPasswordHash } from "./password.js";
import { generateVerificationToken, hashToken } from "./tokens.js";
import { handleUpdateSession } from "./updateSession.js";
import { decryptAccountToken, encryptAccountToken } from "./oauthCrypto.js";
import { buildTOTPURI, decodeBase32, encodeBase32, generateSecret, verifyTOTP } from "./totp.js";
import {
  type NativeAuthSession,
  type NativeAuthUser,
  type NativeEmailAndPasswordComponentHandle,
  type NativeUserDoc,
  nativeAuthUserValidator,
  toNativeAuthUser,
  type VerificationCodeType,
} from "./types.js";
import { verifyCaptchaResponse, type CaptchaConfig } from "./captcha.js";
export type { CaptchaConfig, CaptchaProvider } from "./captcha.js";

export type EmailDraft = {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type EmailSender = (draft: EmailDraft) => Promise<string>;

export type NativeEmailAndPasswordConfig = {
  /**
   * Origins allowed for `callbackURL` in verify-email and reset-password routes.
   * Defaults to `email.appOrigin` and the Convex site URL.
   */
  trustedOrigins?: string[];
  email?: {
    from: string;
    appOrigin?: string;
    verifyPath?: string;
    resetPath?: string;
    sendEmail: EmailSender;
    sendOnSignUp?: boolean;
    sendOnSignIn?: boolean;
  };
  enabled?: boolean;
  disableSignUp?: boolean;
  autoSignIn?: boolean;
  /** @deprecated use `email.sendOnSignUp` instead. */
  sendVerificationEmailOnSignUp?: boolean;
  /** @deprecated use `email.sendOnSignIn` instead. */
  sendVerificationEmailOnSignIn?: boolean;
  /**
   * When `true`, `signIn` rejects users whose email is not yet verified.
   * Default is `false` — apps must opt in to this gating.
   */
  requireVerifiedEmail?: boolean;
  verificationCodeTtlMs?: number;
  passwordResetCodeTtlMs?: number;
  sessionTtlMs?: number;
  refreshTokenTtlMs?: number;
  minPasswordLength?: number;
  maxPasswordLength?: number;
  /**
   * When `true` (default), `signUp` and `resetPassword` check new passwords
   * against the Have I Been Pwned k-Anonymity API and reject known-breached
   * passwords.
   */
  checkBreach?: boolean;
  /**
   * Rate limiting applied to `signIn` attempts per email address.
   */
  rateLimit?: {
    windowMs?: number;
    maxAttempts?: number;
  };
  /**
   * When `true` (default), `resetPassword` revokes all active sessions for the user.
   * Set to `false` to keep other sessions active after a successful reset.
   */
  revokeSessionsOnPasswordReset?: boolean;
  onExistingUserSignUp?: (data: { user: NativeAuthUser }) => Promise<void>;
  onPasswordReset?: (data: { user: NativeAuthUser }) => Promise<void>;
  /**
   * Optional CAPTCHA gating for sign-up and password-reset endpoints.
   * Supports the same providers as Better Auth's captcha plugin.
   */
  captcha?: CaptchaConfig;
};

export type NativeEmailAndPasswordActions = ReturnType<typeof nativeEmailAndPassword>;

export type NativeEmailAndPasswordFunctionReferences = {
  [K in keyof NativeEmailAndPasswordActions]: FunctionReference<"action", "public">;
};

type EmailSendResult =
  | { status: "queued"; emailId: string }
  | { status: "not_configured"; reason: string }
  | { status: "failed"; reason: string };

const DEFAULT_VERIFICATION_CODE_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_PASSWORD_RESET_CODE_TTL_MS = 60 * 60 * 1000;
const DEFAULT_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DONT_REMEMBER_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MIN_PASSWORD_LENGTH = 8;
const DEFAULT_MAX_PASSWORD_LENGTH = 128;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const DEFAULT_RATE_LIMIT_MAX_ATTEMPTS = 5;
const DEFAULT_TWO_FACTOR_BACKUP_CODES_COUNT = 10;
const DEFAULT_TWO_FACTOR_BACKUP_CODE_BYTES = 10;
const DEFAULT_TWO_FACTOR_SECRET_BYTES = 20;
const DEFAULT_TWO_FACTOR_PENDING_TTL_MS = 10 * 60 * 1000;
const DEFAULT_TRUST_DEVICE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// Common RFC-style email validation regex.
const EMAIL_REGEX =
  /^(?!\.)(?!.*\.\.)([A-Z0-9_+-]\.?)+[A-Z0-9_+-]@([A-Z0-9][A-Z0-9-]*\.)+[A-Z]{2,}$/i;

function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

async function requireCaptcha(
  config: CaptchaConfig | undefined,
  captchaToken: string | undefined,
): Promise<void> {
  if (!config) return;
  if (!captchaToken) {
    throw new Error("Captcha response is required");
  }
  const result = await verifyCaptchaResponse(config, captchaToken);
  if (!result.ok) {
    throw new Error(result.reason);
  }
}

function buildGenericDuplicateResponse(
  email: string,
  name: string,
  image: string | undefined,
  now: number,
): NativeAuthSession {
  const syntheticUser: NativeAuthUser = {
    id: crypto.randomUUID(),
    email,
    name,
    image,
    emailVerified: false,
    twoFactorEnabled: false,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
  return { token: null, user: syntheticUser };
}

function resolveSessionTtlMs(rememberMe: boolean | undefined, sessionTtlMs: number): number {
  return rememberMe === false ? DONT_REMEMBER_SESSION_TTL_MS : sessionTtlMs;
}

function validatePassword(
  password: string,
  minLength: number,
  maxLength: number,
): { valid: true } | { valid: false; reason: "too_short" | "too_long" } {
  if (password.length < minLength) {
    return { valid: false, reason: "too_short" };
  }
  if (password.length > maxLength) {
    return { valid: false, reason: "too_long" };
  }
  return { valid: true };
}

export const nativeAuthSessionValidator = v.object({
  token: v.union(v.string(), v.null()),
  refreshToken: v.optional(v.string()),
  user: nativeAuthUserValidator,
  userId: v.optional(v.string()),
  identityId: v.optional(v.string()),
  sessionId: v.optional(v.string()),
  redirect: v.optional(v.boolean()),
  url: v.optional(v.string()),
  twoFactorRedirect: v.optional(v.boolean()),
  twoFactorMethods: v.optional(v.array(v.string())),
  twoFactorChallengeToken: v.optional(v.string()),
  twoFactorCookieMaxAgeMs: v.optional(v.number()),
  trustDeviceToken: v.optional(v.string()),
  trustDeviceMaxAgeMs: v.optional(v.number()),
});

function resolveEmailConfig(args: NativeEmailAndPasswordConfig): {
  from?: string;
  appOrigin?: string;
  verifyPath: string;
  resetPath: string;
  sendEmail?: EmailSender;
  sendOnSignUp?: boolean;
  sendOnSignIn?: boolean;
} {
  const email = args.email;
  return {
    from: email?.from,
    appOrigin: email?.appOrigin,
    verifyPath: email?.verifyPath ?? "/verify-email",
    resetPath: email?.resetPath ?? "/reset-password",
    sendEmail: email?.sendEmail,
    sendOnSignUp: email?.sendOnSignUp ?? args.sendVerificationEmailOnSignUp,
    sendOnSignIn: email?.sendOnSignIn ?? args.sendVerificationEmailOnSignIn,
  };
}

export function nativeEmailAndPassword(
  component: NativeEmailAndPasswordComponentHandle,
  config: NativeEmailAndPasswordConfig = {},
) {
  const emailConfig = resolveEmailConfig(config);
  const verificationCodeTtlMs = config.verificationCodeTtlMs ?? DEFAULT_VERIFICATION_CODE_TTL_MS;
  const passwordResetCodeTtlMs =
    config.passwordResetCodeTtlMs ?? DEFAULT_PASSWORD_RESET_CODE_TTL_MS;
  const enabled = config.enabled ?? true;
  const disableSignUp = config.disableSignUp ?? false;
  const autoSignIn = config.autoSignIn ?? true;
  const sendOnSignUp = emailConfig.sendOnSignUp;
  const sendOnSignIn = emailConfig.sendOnSignIn ?? false;
  const sessionTtlMs = config.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
  const refreshTokenTtlMs = config.refreshTokenTtlMs ?? DEFAULT_REFRESH_TOKEN_TTL_MS;
  const requireVerifiedEmail = config.requireVerifiedEmail ?? false;
  const minPasswordLength = config.minPasswordLength ?? DEFAULT_MIN_PASSWORD_LENGTH;
  const maxPasswordLength = config.maxPasswordLength ?? DEFAULT_MAX_PASSWORD_LENGTH;
  const rateLimitWindowMs = config.rateLimit?.windowMs ?? DEFAULT_RATE_LIMIT_WINDOW_MS;
  const rateLimitMaxAttempts = config.rateLimit?.maxAttempts ?? DEFAULT_RATE_LIMIT_MAX_ATTEMPTS;
  const checkBreach = config.checkBreach ?? true;
  const onExistingUserSignUp = config.onExistingUserSignUp;
  const BREACH_ERROR_MESSAGE = "Password has been exposed in a data breach and cannot be used";

  const shouldReturnGenericDuplicateResponse = requireVerifiedEmail || autoSignIn === false;
  const shouldSkipAutoSignIn = shouldReturnGenericDuplicateResponse;
  const shouldSendVerificationEmail = sendOnSignUp ?? requireVerifiedEmail;
  const shouldSendVerificationEmailOnSignIn = sendOnSignIn;
  const revokeSessionsOnPasswordReset = config.revokeSessionsOnPasswordReset ?? true;

  async function createSessionAndRefreshToken(
    ctx: GenericActionCtx<DataModel>,
    args: {
      userId: string;
      identityId: string;
      rememberMe: boolean | undefined;
    },
  ): Promise<{ sessionId: string; token: string; refreshToken: string }> {
    const now = Date.now();
    const sessionId = crypto.randomUUID();
    const refreshToken = generateVerificationToken();
    const refreshTokenHash = await hashToken(refreshToken);
    const effectiveSessionTtlMs = resolveSessionTtlMs(args.rememberMe, sessionTtlMs);
    const expiresAt = now + effectiveSessionTtlMs;
    const token = await mintToken(
      args.userId,
      sessionId,
      { identityId: args.identityId },
      { expiresInSeconds: Math.floor(effectiveSessionTtlMs / 1000) },
    );

    await ctx.runMutation(component.native.sessions.createSessionAndRefreshToken, {
      sessionId,
      userId: args.userId,
      token,
      sessionExpiresAt: expiresAt,
      refreshTokenHash,
      refreshTokenExpiresAt: now + refreshTokenTtlMs,
    });

    return { sessionId, token, refreshToken };
  }

  const signUp = action({
    args: {
      email: v.string(),
      password: v.string(),
      name: v.string(),
      image: v.optional(v.string()),
      callbackURL: v.optional(v.string()),
      rememberMe: v.optional(v.boolean()),
      captchaToken: v.optional(v.string()),
    },
    returns: nativeAuthSessionValidator,
    handler: async (ctx, args) => {
      if (!enabled) {
        throw new Error("Email and password authentication is disabled");
      }
      if (disableSignUp) {
        throw new Error("Sign up is disabled");
      }

      await requireCaptcha(config.captcha, args.captchaToken);

      const now = Date.now();
      const normalizedEmail = args.email.trim().toLowerCase();
      if (!isValidEmail(normalizedEmail)) {
        throw new Error("Invalid email");
      }
      const passwordValidation = validatePassword(
        args.password,
        minPasswordLength,
        maxPasswordLength,
      );
      if (!passwordValidation.valid) {
        throw new Error(
          passwordValidation.reason === "too_short"
            ? "Password is too short"
            : "Password is too long",
        );
      }

      if (checkBreach) {
        const breachResult = await checkPasswordBreach(args.password);
        if (breachResult.breached) {
          throw new Error(BREACH_ERROR_MESSAGE);
        }
      }

      // Hash the password before the transaction so both the success and
      // duplicate paths perform the same slow work, mitigating timing attacks.
      const credentialHash = await hashPassword(args.password);

      const subject = crypto.randomUUID();
      const account = { credentialHash };

      let verificationToken: string | undefined;
      let verificationCode: { tokenHash: string; expiresAt: number } | undefined;
      if (shouldSendVerificationEmail) {
        verificationToken = generateVerificationToken();
        const tokenHash = await hashToken(verificationToken);
        verificationCode = {
          tokenHash,
          expiresAt: now + verificationCodeTtlMs,
        };
      }

      let initialSession:
        | {
            sessionId: string;
            sessionExpiresAt: number;
            refreshTokenHash: string;
            refreshTokenExpiresAt: number;
          }
        | undefined;
      let refreshToken: string | undefined;
      if (!shouldSkipAutoSignIn) {
        const sessionId = crypto.randomUUID();
        const effectiveSessionTtlMs = resolveSessionTtlMs(args.rememberMe, sessionTtlMs);
        refreshToken = generateVerificationToken();
        const refreshTokenHash = await hashToken(refreshToken);
        initialSession = {
          sessionId,
          sessionExpiresAt: now + effectiveSessionTtlMs,
          refreshTokenHash,
          refreshTokenExpiresAt: now + refreshTokenTtlMs,
        };
      }

      const result = await ctx.runMutation(component.identity.provisionFromIdentity, {
        identity: {
          identityId: subject,
          provider: "password",
          issuer: "native",
          subject,
          tokenIdentifier: subject,
          email: normalizedEmail,
          emailVerified: false,
          sessionId: null,
        },
        user: {
          email: normalizedEmail,
          name: args.name,
          image: args.image,
          emailVerified: false,
        },
        account,
        verificationCode,
        initialSession,
        allowLink: false,
      });

      if (result.duplicate) {
        if (result.user && onExistingUserSignUp) {
          await onExistingUserSignUp({ user: toNativeAuthUser(result.user) });
        }
        if (shouldReturnGenericDuplicateResponse) {
          return buildGenericDuplicateResponse(normalizedEmail, args.name, args.image, now);
        }
        throw new Error("User already exists");
      }

      if (!result.user || !result.identityId) {
        throw new Error("Failed to create user");
      }

      if (shouldSendVerificationEmail && verificationToken) {
        await sendVerificationEmail(ctx, {
          user: result.user,
          token: verificationToken,
          type: "email_verification",
          urlBuilder: (token) => {
            if (args.callbackURL) {
              const appOrigin = emailConfig.appOrigin?.trim() ?? "";
              if (!appOrigin) {
                return null;
              }
              const callback = args.callbackURL.startsWith("http")
                ? args.callbackURL
                : `${trimTrailingSlash(appOrigin)}${args.callbackURL}`;
              return `${trimTrailingSlash(appOrigin)}/api/auth/verify-email?token=${encodeURIComponent(token)}&callbackURL=${encodeURIComponent(callback)}`;
            }
            return buildEmailVerificationUrl({
              token,
              appOrigin: emailConfig.appOrigin,
              verifyPath: emailConfig.verifyPath,
            });
          },
          draftBuilder: async (params) =>
            createEmailVerificationEmailDraft({
              from: params.from,
              to: params.to,
              verifyUrl: params.url,
              expiresAt: params.expiresAt,
            }),
          expiresAt: verificationCode!.expiresAt,
        });
      }

      if (shouldSkipAutoSignIn) {
        return { token: null, user: toNativeAuthUser(result.user) };
      }

      if (!result.sessionId || !result.token || !refreshToken) {
        throw new Error("Failed to create session");
      }

      return {
        token: result.token,
        refreshToken,
        user: toNativeAuthUser(result.user),
        userId: result.userId,
        identityId: result.identityId,
        sessionId: result.sessionId,
      };
    },
  });

  const signIn = action({
    args: {
      email: v.string(),
      password: v.string(),
      callbackURL: v.optional(v.string()),
      rememberMe: v.optional(v.boolean()),
      trustedDeviceToken: v.optional(v.string()),
    },
    returns: nativeAuthSessionValidator,
    handler: async (ctx, args) => {
      if (!enabled) {
        throw new Error("Email and password authentication is disabled");
      }

      const normalizedEmail = args.email.trim().toLowerCase();
      if (!isValidEmail(normalizedEmail)) {
        throw new Error("Invalid email");
      }

      const windowStart = Math.floor(Date.now() / rateLimitWindowMs) * rateLimitWindowMs;
      const rateLimit = await ctx.runMutation(component.native.rateLimits.recordAttempt, {
        identifier: `sign-in:${normalizedEmail}`,
        windowStart,
        windowMs: rateLimitWindowMs,
        maxAttempts: rateLimitMaxAttempts,
      });
      if (!rateLimit.allowed) {
        throw new Error("Too many requests");
      }

      const auth = await ctx.runQuery(component.identity.getUserAndAccount, {
        email: normalizedEmail,
      });
      if (!auth) {
        await hashPassword(args.password);
        throw new Error("Invalid email or password");
      }
      const { user, identity, account } = auth;

      if (!account || !(await verifyPasswordHash(args.password, account.credentialHash))) {
        await hashPassword(args.password);
        throw new Error("Invalid email or password");
      }

      if (requireVerifiedEmail && !user.emailVerified) {
        if (shouldSendVerificationEmailOnSignIn) {
          await queueVerificationEmail(ctx, {
            email: normalizedEmail,
            type: "email_verification",
            urlBuilder: (token) =>
              buildEmailVerificationUrl({
                token,
                appOrigin: emailConfig.appOrigin,
                verifyPath: emailConfig.verifyPath,
              }),
            draftBuilder: async (params) =>
              createEmailVerificationEmailDraft({
                from: params.from,
                to: params.to,
                verifyUrl: params.url,
                expiresAt: params.expiresAt,
              }),
            ttlMs: verificationCodeTtlMs,
          });
        }
        throw new Error("Email not verified");
      }

      const result = await handleTwoFactorSignIn(
        ctx,
        user,
        identity._id,
        args.rememberMe,
        args.trustedDeviceToken,
      );

      return {
        ...result,
        redirect: !!args.callbackURL,
        url: args.callbackURL,
      };
    },
  });

  const signOut = action({
    args: {
      token: v.string(),
      callbackURL: v.optional(v.string()),
    },
    returns: v.object({
      success: v.boolean(),
      redirect: v.optional(v.boolean()),
      url: v.optional(v.string()),
    }),
    handler: async (ctx, args) => {
      const payload = await verifyToken(args.token);
      const sessionId = payload.sessionId;
      if (typeof sessionId !== "string") {
        throw new Error("Invalid session token");
      }
      await ctx.runMutation(component.native.sessions.revokeSession, {
        sessionId,
      });
      await ctx.runMutation(component.native.refreshTokens.revokeRefreshTokensForSession, {
        sessionId,
      });
      return {
        success: true,
        redirect: !!args.callbackURL,
        url: args.callbackURL,
      };
    },
  });

  const updateSession = action({
    args: { refreshToken: v.string() },
    returns: nativeAuthSessionValidator,
    handler: async (ctx, args) => {
      return await handleUpdateSession(ctx, component, args.refreshToken);
    },
  });

  async function sendVerificationEmail(
    ctx: GenericActionCtx<DataModel>,
    args: {
      user: { _id: string; email?: string };
      token: string;
      type: VerificationCodeType;
      urlBuilder: (token: string) => string | null;
      draftBuilder: (params: {
        from: string;
        to: string;
        url: string | null;
        expiresAt: number;
      }) => Promise<EmailDraft | { status: "not_configured"; reason: string }>;
      expiresAt: number;
      fallbackEmail?: string;
    },
  ): Promise<EmailSendResult> {
    const emailConfig = resolveEmailConfig(config);

    if (!emailConfig.from || !emailConfig.sendEmail) {
      return { status: "not_configured", reason: "missing_email_config" };
    }

    const url = args.urlBuilder(args.token);
    const draft = await args.draftBuilder({
      from: emailConfig.from,
      to: args.user.email ?? args.fallbackEmail ?? "",
      url,
      expiresAt: args.expiresAt,
    });

    if ("status" in draft) {
      return { status: "not_configured", reason: draft.reason };
    }

    if (url === null) {
      return { status: "not_configured", reason: "missing_url" };
    }

    try {
      const emailId = await emailConfig.sendEmail(draft);
      return { status: "queued", emailId };
    } catch (error) {
      return {
        status: "failed",
        reason: error instanceof Error ? error.message : "email_send_failed",
      };
    }
  }

  async function queueVerificationEmail(
    ctx: GenericActionCtx<DataModel>,
    args: {
      email: string;
      type: VerificationCodeType;
      urlBuilder: (token: string) => string | null;
      draftBuilder: (params: {
        from: string;
        to: string;
        url: string | null;
        expiresAt: number;
      }) => Promise<EmailDraft | { status: "not_configured"; reason: string }>;
      ttlMs: number;
    },
  ): Promise<EmailSendResult> {
    const now = Date.now();
    const emailConfig = resolveEmailConfig(config);

    if (!emailConfig.from || !emailConfig.sendEmail) {
      return { status: "not_configured", reason: "missing_email_config" };
    }

    const user = await ctx.runQuery(component.native.users.getUserByEmail, {
      email: args.email.toLowerCase().trim(),
    });

    if (!user) {
      return { status: "queued", emailId: "noop" };
    }

    const token = generateVerificationToken();
    const tokenHash = await hashToken(token);
    const expiresAt = now + args.ttlMs;

    await ctx.runMutation(component.native.codes.createVerificationCode, {
      userId: user._id,
      type: args.type,
      tokenHash,
      expiresAt,
    });

    return sendVerificationEmail(ctx, {
      user,
      token,
      type: args.type,
      urlBuilder: args.urlBuilder,
      draftBuilder: args.draftBuilder,
      expiresAt,
      fallbackEmail: args.email,
    });
  }

  const sendEmailVerification = action({
    args: {
      email: v.string(),
      callbackURL: v.optional(v.string()),
    },
    returns: v.object({
      status: v.union(v.literal("queued"), v.literal("not_configured"), v.literal("failed")),
      reason: v.optional(v.string()),
      emailId: v.optional(v.string()),
    }),
    handler: async (ctx, args) => {
      return queueVerificationEmail(ctx, {
        email: args.email,
        type: "email_verification",
        urlBuilder: (token) => {
          if (args.callbackURL) {
            const appOrigin = emailConfig.appOrigin?.trim() ?? "";
            if (!appOrigin) {
              return null;
            }
            const callback = args.callbackURL.startsWith("http")
              ? args.callbackURL
              : `${trimTrailingSlash(appOrigin)}${args.callbackURL}`;
            return `${trimTrailingSlash(appOrigin)}/api/auth/verify-email?token=${encodeURIComponent(token)}&callbackURL=${encodeURIComponent(callback)}`;
          }
          return buildEmailVerificationUrl({
            token,
            appOrigin: emailConfig.appOrigin,
            verifyPath: emailConfig.verifyPath,
          });
        },
        draftBuilder: async (params) =>
          createEmailVerificationEmailDraft({
            from: params.from,
            to: params.to,
            verifyUrl: params.url,
            expiresAt: params.expiresAt,
          }),
        ttlMs: verificationCodeTtlMs,
      });
    },
  });

  const verifyEmail = action({
    args: { token: v.string() },
    returns: v.object({
      success: v.boolean(),
      reason: v.optional(v.string()),
    }),
    handler: async (ctx, args) => {
      const tokenHash = await hashToken(args.token);
      const result = await ctx.runMutation(component.identity.verifyEmail, {
        tokenHash,
        provider: "password",
        issuer: "native",
      });
      if (!result.success) {
        return { success: false, reason: result.reason ?? "invalid" };
      }
      return { success: true };
    },
  });

  const sendPasswordReset = action({
    args: {
      email: v.string(),
      redirectTo: v.optional(v.string()),
      captchaToken: v.optional(v.string()),
    },
    returns: v.object({
      status: v.union(v.literal("queued"), v.literal("not_configured"), v.literal("failed")),
      reason: v.optional(v.string()),
      emailId: v.optional(v.string()),
    }),
    handler: async (ctx, args) => {
      await requireCaptcha(config.captcha, args.captchaToken);
      return queueVerificationEmail(ctx, {
        email: args.email,
        type: "password_reset",
        urlBuilder: (token) => {
          if (args.redirectTo) {
            const appOrigin = emailConfig.appOrigin?.trim() ?? "";
            if (!appOrigin) {
              return null;
            }
            const callbackURL = args.redirectTo.startsWith("http")
              ? args.redirectTo
              : `${trimTrailingSlash(appOrigin)}${args.redirectTo}`;
            return `${trimTrailingSlash(appOrigin)}/api/auth/reset-password/${encodeURIComponent(token)}?callbackURL=${encodeURIComponent(callbackURL)}`;
          }
          return buildPasswordResetUrl({
            token,
            appOrigin: emailConfig.appOrigin,
            resetPath: emailConfig.resetPath,
          });
        },
        draftBuilder: async (params) =>
          createPasswordResetEmailDraft({
            from: params.from,
            to: params.to,
            resetUrl: params.url,
            expiresAt: params.expiresAt,
          }),
        ttlMs: passwordResetCodeTtlMs,
      });
    },
  });

  const resetPassword = action({
    args: {
      token: v.string(),
      newPassword: v.string(),
    },
    returns: v.object({
      status: v.boolean(),
      reason: v.optional(v.string()),
    }),
    handler: async (ctx, args) => {
      const passwordValidation = validatePassword(
        args.newPassword,
        minPasswordLength,
        maxPasswordLength,
      );
      if (!passwordValidation.valid) {
        return {
          status: false,
          reason:
            passwordValidation.reason === "too_short" ? "password_too_short" : "password_too_long",
        };
      }

      const tokenHash = await hashToken(args.token);

      if (checkBreach) {
        const breachResult = await checkPasswordBreach(args.newPassword);
        if (breachResult.breached) {
          return { status: false, reason: "breached_password" };
        }
      }

      const credentialHash = await hashPassword(args.newPassword);

      const result = await ctx.runMutation(component.identity.resetPassword, {
        tokenHash,
        credentialHash,
        provider: "password",
        issuer: "native",
        revokeSessions: revokeSessionsOnPasswordReset,
      });

      if (!result.status) {
        return { status: false, reason: result.reason ?? "invalid" };
      }

      if (config.onPasswordReset && result.user) {
        await config.onPasswordReset({ user: toNativeAuthUser(result.user) });
      }

      return { status: true };
    },
  });

  const verifyPassword = action({
    args: {
      token: v.string(),
      password: v.string(),
    },
    returns: v.object({ success: v.boolean() }),
    handler: async (ctx, args) => {
      const payload = await verifyToken(args.token);
      const userId = payload.sub;
      const sessionId = payload.sessionId;
      if (typeof userId !== "string" || typeof sessionId !== "string") {
        return { success: false };
      }

      const session = await ctx.runQuery(component.native.sessions.getSessionByToken, {
        token: args.token,
      });
      if (!session || session.sessionId !== sessionId || (session.expiresAt ?? 0) < Date.now()) {
        return { success: false };
      }

      const identity = await ctx.runQuery(component.native.identities.getNativeIdentityByUser, {
        userId,
        provider: "password",
        issuer: "native",
      });
      if (!identity) {
        return { success: false };
      }

      const account = await ctx.runQuery(component.native.accounts.getAccountBySubject, {
        provider: "password",
        issuer: "native",
        subject: identity.subject,
      });
      if (!account) {
        return { success: false };
      }

      const valid = await verifyPasswordHash(args.password, account.credentialHash);
      return { success: valid };
    },
  });

  async function getNativePasswordAccount(ctx: GenericActionCtx<DataModel>, userId: string) {
    const identity = await ctx.runQuery(component.native.identities.getNativeIdentityByUser, {
      userId,
      provider: "password",
      issuer: "native",
    });
    if (!identity) return null;
    return await ctx.runQuery(component.native.accounts.getAccountBySubject, {
      provider: "password",
      issuer: "native",
      subject: identity.subject,
    });
  }

  async function verifyUserPassword(
    ctx: GenericActionCtx<DataModel>,
    userId: string,
    password: string,
  ) {
    const account = await getNativePasswordAccount(ctx, userId);
    if (!account) return false;
    return await verifyPasswordHash(password, account.credentialHash);
  }

  async function resolveSessionUser(ctx: GenericActionCtx<DataModel>, token: string) {
    const payload = await verifyToken(token);
    const userId = payload.sub;
    const sessionId = payload.sessionId;
    if (typeof userId !== "string" || typeof sessionId !== "string") {
      return null;
    }
    const session = await ctx.runQuery(component.native.sessions.getSessionByToken, { token });
    if (!session || session.sessionId !== sessionId || (session.expiresAt ?? 0) < Date.now()) {
      return null;
    }
    const user = await ctx.runQuery(component.native.users.getUserById, { userId });
    if (!user) return null;
    return { user, userId, session, payload };
  }

  async function generateBackupCodes(
    count = DEFAULT_TWO_FACTOR_BACKUP_CODES_COUNT,
  ): Promise<{ codes: string[]; hashes: string[] }> {
    const codes: string[] = [];
    const hashes: string[] = [];
    for (let i = 0; i < count; i++) {
      const code = encodeBase32(generateSecret(DEFAULT_TWO_FACTOR_BACKUP_CODE_BYTES));
      codes.push(code);
      hashes.push(await hashPassword(code));
    }
    return { codes, hashes };
  }

  const twoFactorEnable = action({
    args: {
      token: v.string(),
      password: v.string(),
      issuer: v.optional(v.string()),
    },
    returns: v.object({
      token: v.optional(v.string()),
      totpURI: v.optional(v.string()),
      backupCodes: v.optional(v.array(v.string())),
      error: v.optional(v.string()),
    }),
    handler: async (ctx, args) => {
      const resolved = await resolveSessionUser(ctx, args.token);
      if (!resolved) return { error: "unauthorized" };

      const passwordValid = await verifyUserPassword(ctx, resolved.userId, args.password);
      if (!passwordValid) return { error: "invalid_password" };

      const secret = generateSecret(DEFAULT_TWO_FACTOR_SECRET_BYTES);
      const secretPlain = encodeBase32(secret);
      const encryptedSecret = await encryptAccountToken(secretPlain);

      const { codes, hashes } = await generateBackupCodes();

      await ctx.runMutation(component.native.users.setTwoFactor, {
        userId: resolved.userId,
        twoFactorEnabled: false,
        twoFactorSecret: encryptedSecret,
        twoFactorBackupCodes: hashes,
      });

      const label = resolved.user.email ?? resolved.user.name ?? resolved.userId;
      const totpURI = buildTOTPURI(secretPlain, {
        issuer: args.issuer ?? "Convex",
        label,
      });

      return { token: args.token, totpURI, backupCodes: codes };
    },
  });

  const TWO_FACTOR_SESSION_ID = "__two_factor";

  async function resolveTwoFactorChallengeToken(ctx: GenericActionCtx<DataModel>, token: string) {
    const payload = await verifyToken(token);
    const userId = payload.sub;
    if (
      typeof userId !== "string" ||
      payload.sessionId !== TWO_FACTOR_SESSION_ID ||
      payload.twoFactor !== true
    ) {
      return null;
    }
    const tokenHash = await hashToken(token);
    const code = await ctx.runMutation(component.native.codes.consumeVerificationCode, {
      tokenHash,
      type: "two_factor_pending",
    });
    if (!code || (code.expiresAt ?? 0) < Date.now()) {
      return null;
    }
    const user = await ctx.runQuery(component.native.users.getUserById, { userId });
    if (!user) return null;
    const identityId = typeof payload.identityId === "string" ? payload.identityId : userId;
    const rememberMe = payload.rememberMe === true;
    return { user, userId, identityId, rememberMe };
  }

  async function verifyTwoFactorCode(
    ctx: GenericActionCtx<DataModel>,
    user: NativeUserDoc,
    code: string,
    method: "totp" | "backup_code",
  ): Promise<boolean> {
    if (!user.twoFactorSecret) return false;
    const secretPlain = await decryptAccountToken(user.twoFactorSecret);
    if (method === "totp") {
      return verifyTOTP(decodeBase32(secretPlain), code, undefined, 1);
    }
    if (!user.twoFactorBackupCodes) return false;
    for (const hash of user.twoFactorBackupCodes) {
      if (await verifyPasswordHash(code, hash)) {
        return true;
      }
    }
    return false;
  }

  async function consumeBackupCode(
    ctx: GenericActionCtx<DataModel>,
    user: NativeUserDoc,
    userId: string,
    code: string,
  ): Promise<boolean> {
    if (!user.twoFactorBackupCodes) return false;
    for (const hash of user.twoFactorBackupCodes) {
      if (await verifyPasswordHash(code, hash)) {
        const result = await ctx.runMutation(component.native.users.consumeBackupCode, {
          userId,
          backupCodeHash: hash,
        });
        return result.success;
      }
    }
    return false;
  }

  async function createTrustedDevice(
    ctx: GenericActionCtx<DataModel>,
    userId: string,
  ): Promise<{ trustDeviceToken: string; trustDeviceMaxAgeMs: number } | undefined> {
    const trustDeviceToken = generateVerificationToken();
    const tokenHash = await hashToken(trustDeviceToken);
    const trustDeviceMaxAgeMs = DEFAULT_TRUST_DEVICE_TTL_MS;
    await ctx.runMutation(component.native.codes.createVerificationCode, {
      userId,
      type: "two_factor_trusted_device",
      tokenHash,
      expiresAt: Date.now() + trustDeviceMaxAgeMs,
    });
    return { trustDeviceToken, trustDeviceMaxAgeMs };
  }

  async function finishTwoFactorVerify(
    ctx: GenericActionCtx<DataModel>,
    user: NativeUserDoc,
    userId: string,
    identityId: string,
    rememberMe: boolean | undefined,
    trustDevice: boolean | undefined,
  ): Promise<NativeAuthSession> {
    const { sessionId, token, refreshToken } = await createSessionAndRefreshToken(ctx, {
      userId,
      identityId,
      rememberMe,
    });
    let trustDeviceResult: { trustDeviceToken: string; trustDeviceMaxAgeMs: number } | undefined;
    if (trustDevice) {
      trustDeviceResult = await createTrustedDevice(ctx, userId);
    }
    return {
      token,
      refreshToken,
      user: toNativeAuthUser(user),
      userId,
      identityId,
      sessionId,
      trustDeviceToken: trustDeviceResult?.trustDeviceToken,
      trustDeviceMaxAgeMs: trustDeviceResult?.trustDeviceMaxAgeMs,
    };
  }

  const twoFactorVerifyTOTP = action({
    args: {
      token: v.string(),
      code: v.string(),
      trustDevice: v.optional(v.boolean()),
    },
    returns: nativeAuthSessionValidator,
    handler: async (ctx, args) => {
      const resolved = await resolveTwoFactorChallengeToken(ctx, args.token);
      if (resolved) {
        const valid = await verifyTwoFactorCode(ctx, resolved.user, args.code, "totp");
        if (!valid) throw new Error("Invalid two factor code");
        return await finishTwoFactorVerify(
          ctx,
          resolved.user,
          resolved.userId,
          resolved.identityId,
          resolved.rememberMe,
          args.trustDevice,
        );
      }

      const sessionResolved = await resolveSessionUser(ctx, args.token);
      if (!sessionResolved) throw new Error("Unauthorized");

      const user = await ctx.runQuery(component.native.users.getUserById, {
        userId: sessionResolved.userId,
      });
      if (!user?.twoFactorSecret) throw new Error("Not enrolled");

      const secretPlain = await decryptAccountToken(user.twoFactorSecret);
      const valid = await verifyTOTP(decodeBase32(secretPlain), args.code, undefined, 1);
      if (!valid) throw new Error("Invalid two factor code");

      await ctx.runMutation(component.native.users.setTwoFactor, {
        userId: sessionResolved.userId,
        twoFactorEnabled: true,
        twoFactorSecret: user.twoFactorSecret,
        twoFactorBackupCodes: user.twoFactorBackupCodes,
      });

      const updatedUser = await ctx.runQuery(component.native.users.getUserById, {
        userId: sessionResolved.userId,
      });

      return {
        token: null,
        user: toNativeAuthUser(updatedUser ?? user),
        userId: sessionResolved.userId,
        identityId: sessionResolved.payload.identityId as string | undefined,
      };
    },
  });

  const twoFactorVerifyBackupCode = action({
    args: {
      token: v.string(),
      code: v.string(),
      trustDevice: v.optional(v.boolean()),
    },
    returns: nativeAuthSessionValidator,
    handler: async (ctx, args) => {
      const resolved = await resolveTwoFactorChallengeToken(ctx, args.token);
      if (!resolved) throw new Error("Invalid two factor token");

      const consumed = await consumeBackupCode(ctx, resolved.user, resolved.userId, args.code);
      if (!consumed) throw new Error("Invalid two factor code");

      return await finishTwoFactorVerify(
        ctx,
        resolved.user,
        resolved.userId,
        resolved.identityId,
        resolved.rememberMe,
        args.trustDevice,
      );
    },
  });

  const twoFactorDisable = action({
    args: {
      token: v.string(),
      password: v.string(),
    },
    returns: v.object({ success: v.boolean() }),
    handler: async (ctx, args) => {
      const resolved = await resolveSessionUser(ctx, args.token);
      if (!resolved) return { success: false };

      const passwordValid = await verifyUserPassword(ctx, resolved.userId, args.password);
      if (!passwordValid) return { success: false };

      await ctx.runMutation(component.native.users.setTwoFactor, {
        userId: resolved.userId,
        twoFactorEnabled: false,
      });

      await ctx.runMutation(component.native.codes.revokeVerificationCodesForUser, {
        userId: resolved.userId,
        type: "two_factor_trusted_device",
      });

      return { success: true };
    },
  });

  const twoFactorGenerateBackupCodes = action({
    args: {
      token: v.string(),
      password: v.string(),
    },
    returns: v.object({
      backupCodes: v.array(v.string()),
      error: v.optional(v.string()),
    }),
    handler: async (ctx, args) => {
      const resolved = await resolveSessionUser(ctx, args.token);
      if (!resolved) return { error: "unauthorized", backupCodes: [] };

      const passwordValid = await verifyUserPassword(ctx, resolved.userId, args.password);
      if (!passwordValid) return { error: "invalid_password", backupCodes: [] };

      const user = await ctx.runQuery(component.native.users.getUserById, {
        userId: resolved.userId,
      });
      if (!user?.twoFactorEnabled || !user.twoFactorSecret) {
        return { error: "two_factor_not_enabled", backupCodes: [] };
      }

      const { codes, hashes } = await generateBackupCodes();
      await ctx.runMutation(component.native.users.setTwoFactor, {
        userId: resolved.userId,
        twoFactorEnabled: user.twoFactorEnabled,
        twoFactorSecret: user.twoFactorSecret,
        twoFactorBackupCodes: hashes,
      });

      return { backupCodes: codes };
    },
  });

  async function handleTwoFactorSignIn(
    ctx: GenericActionCtx<DataModel>,
    user: NativeUserDoc,
    identityId: string,
    rememberMe: boolean | undefined,
    trustedDeviceToken?: string,
  ): Promise<NativeAuthSession> {
    if (!user.twoFactorEnabled) {
      const { sessionId, token, refreshToken } = await createSessionAndRefreshToken(ctx, {
        userId: user._id,
        identityId,
        rememberMe,
      });
      return {
        token,
        refreshToken,
        user: toNativeAuthUser(user),
        userId: user._id,
        identityId,
        sessionId,
      };
    }

    if (trustedDeviceToken) {
      const tokenHash = await hashToken(trustedDeviceToken);
      const trusted = await ctx.runQuery(component.native.codes.getVerificationCodeByTokenHash, {
        tokenHash,
        type: "two_factor_trusted_device",
      });
      if (trusted && (trusted.expiresAt ?? 0) > Date.now() && trusted.userId === user._id) {
        const { sessionId, token, refreshToken } = await createSessionAndRefreshToken(ctx, {
          userId: user._id,
          identityId,
          rememberMe,
        });
        return {
          token,
          refreshToken,
          user: toNativeAuthUser(user),
          userId: user._id,
          identityId,
          sessionId,
        };
      }
    }

    const challengeToken = await mintToken(
      user._id,
      TWO_FACTOR_SESSION_ID,
      { identityId, rememberMe: rememberMe === true, twoFactor: true },
      { expiresInSeconds: Math.floor(DEFAULT_TWO_FACTOR_PENDING_TTL_MS / 1000) },
    );
    const tokenHash = await hashToken(challengeToken);
    await ctx.runMutation(component.native.codes.createVerificationCode, {
      userId: user._id,
      type: "two_factor_pending",
      tokenHash,
      expiresAt: Date.now() + DEFAULT_TWO_FACTOR_PENDING_TTL_MS,
    });

    return {
      token: null,
      user: toNativeAuthUser(user),
      userId: user._id,
      identityId,
      twoFactorRedirect: true,
      twoFactorMethods: ["totp"],
      twoFactorChallengeToken: challengeToken,
      twoFactorCookieMaxAgeMs: DEFAULT_TWO_FACTOR_PENDING_TTL_MS,
    };
  }

  const updateUser = action({
    args: {
      token: v.string(),
      name: v.optional(v.string()),
      image: v.optional(v.string()),
      metadataJson: v.optional(v.string()),
    },
    returns: v.object({ success: v.boolean(), error: v.optional(v.string()) }),
    handler: async (ctx, args) => {
      const resolved = await resolveSessionUser(ctx, args.token);
      if (!resolved) return { success: false, error: "unauthorized" };
      await ctx.runMutation(component.native.users.updateUser, {
        userId: resolved.userId,
        name: args.name,
        image: args.image,
        metadataJson: args.metadataJson,
      });
      return { success: true };
    },
  });

  const listSessions = action({
    args: { token: v.string() },
    returns: v.array(
      v.object({
        id: v.string(),
        token: v.string(),
        userId: v.string(),
        expiresAt: v.string(),
        ipAddress: v.optional(v.union(v.string(), v.null())),
        userAgent: v.optional(v.union(v.string(), v.null())),
        createdAt: v.string(),
        updatedAt: v.string(),
      }),
    ),
    handler: async (ctx, args) => {
      const resolved = await resolveSessionUser(ctx, args.token);
      if (!resolved) return [];
      const sessions = await ctx.runQuery(component.native.sessions.listSessionsByUser, {
        userId: resolved.userId,
      });
      const now = Date.now();
      return sessions
        .filter((s) => (s.expiresAt ?? 0) >= now && s.revokedAt === undefined)
        .map((s) => ({
          id: s.sessionId,
          token: s.token,
          userId: s.userId,
          expiresAt: new Date(s.expiresAt).toISOString(),
          ipAddress: s.ipAddress ?? null,
          userAgent: s.userAgent ?? null,
          createdAt: new Date(s.createdAt).toISOString(),
          updatedAt: new Date(s.updatedAt).toISOString(),
        }));
    },
  });

  const revokeSession = action({
    args: { token: v.string() },
    returns: v.object({ success: v.boolean() }),
    handler: async (ctx, args) => {
      const session = await ctx.runQuery(component.native.sessions.getSessionByToken, {
        token: args.token,
      });
      if (!session || session.revokedAt !== undefined) {
        return { success: true };
      }
      await ctx.runMutation(component.native.sessions.revokeSession, {
        sessionId: session.sessionId,
      });
      return { success: true };
    },
  });

  const revokeOtherSessions = action({
    args: { token: v.string() },
    returns: v.object({ success: v.boolean() }),
    handler: async (ctx, args) => {
      const resolved = await resolveSessionUser(ctx, args.token);
      if (!resolved) return { success: false };
      await ctx.runMutation(component.native.sessions.revokeSessionsForUser, {
        userId: resolved.userId,
        excludeSessionId: resolved.session.sessionId,
      });
      return { success: true };
    },
  });

  return {
    signUp,
    signIn,
    signOut,
    updateSession,
    sendEmailVerification,
    verifyEmail,
    sendPasswordReset,
    resetPassword,
    verifyPassword,
    updateUser,
    twoFactorEnable,
    twoFactorVerifyTOTP,
    twoFactorVerifyBackupCode,
    twoFactorDisable,
    twoFactorGenerateBackupCodes,
    listSessions,
    revokeSession,
    revokeOtherSessions,
  };
}
