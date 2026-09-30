import { action } from "../../component/_generated/server.js";
import type { FunctionReference } from "convex/server";
import { v } from "convex/values";
import { checkPasswordBreach } from "./breach.js";
import type { CaptchaConfig } from "./captcha.js";
import {
  hashPassword,
  padBcryptCompare,
  verifyPassword as verifyPasswordHash,
} from "./password.js";
import { generateVerificationToken, hashToken } from "./tokens.js";
import { createSessionIssuer, resolveSessionTtlMs } from "./sessionIssuer.js";
import { nativeAuthSessionValidator } from "./provider.js";
import {
  toNativeAuthUser,
  type NativeAuthUser,
  type NativeEmailAndPasswordComponentHandle,
} from "./types.js";
import {
  DEFAULT_MAX_PASSWORD_LENGTH,
  DEFAULT_MAX_USERNAME_LENGTH,
  DEFAULT_MIN_PASSWORD_LENGTH,
  DEFAULT_MIN_USERNAME_LENGTH,
  DEFAULT_RATE_LIMIT_MAX_ATTEMPTS,
  DEFAULT_RATE_LIMIT_WINDOW_MS,
  DEFAULT_REFRESH_TOKEN_TTL_MS,
  DEFAULT_SESSION_TTL_MS,
  isValidEmail,
  isValidUsername,
  normalizeEmail,
  normalizeUsername,
  requireCaptcha,
  validatePassword,
} from "./validation.js";

export type NativeUsernameConfig = {
  enabled?: boolean;
  disableSignUp?: boolean;
  autoSignIn?: boolean;
  minUsernameLength?: number;
  maxUsernameLength?: number;
  usernameValidator?: (username: string) => boolean | Promise<boolean>;
  minPasswordLength?: number;
  maxPasswordLength?: number;
  checkBreach?: boolean;
  requireVerifiedEmail?: boolean;
  sessionTtlMs?: number;
  refreshTokenTtlMs?: number;
  rateLimit?: {
    windowMs?: number;
    maxAttempts?: number;
  };
  captcha?: CaptchaConfig;
  onExistingUserSignUp?: (args: { user: NativeAuthUser }) => Promise<void> | void;
};

export type NativeUsernameActions = ReturnType<typeof nativeUsername>;

export type NativeUsernameFunctionReferences = {
  signUpUsername: FunctionReference<"action", "public">;
  signInUsername: FunctionReference<"action", "public">;
};

const BREACH_ERROR_MESSAGE = "Password has been exposed in a data breach and cannot be used";

export function nativeUsername(
  component: NativeEmailAndPasswordComponentHandle,
  config: NativeUsernameConfig = {},
) {
  const enabled = config.enabled ?? true;
  const disableSignUp = config.disableSignUp ?? false;
  const autoSignIn = config.autoSignIn ?? true;
  const minUsernameLength = config.minUsernameLength ?? DEFAULT_MIN_USERNAME_LENGTH;
  const maxUsernameLength = config.maxUsernameLength ?? DEFAULT_MAX_USERNAME_LENGTH;
  const minPasswordLength = config.minPasswordLength ?? DEFAULT_MIN_PASSWORD_LENGTH;
  const maxPasswordLength = config.maxPasswordLength ?? DEFAULT_MAX_PASSWORD_LENGTH;
  const checkBreach = config.checkBreach ?? true;
  const requireVerifiedEmail = config.requireVerifiedEmail ?? false;
  const sessionTtlMs = config.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
  const refreshTokenTtlMs = config.refreshTokenTtlMs ?? DEFAULT_REFRESH_TOKEN_TTL_MS;
  const rateLimitWindowMs = config.rateLimit?.windowMs ?? DEFAULT_RATE_LIMIT_WINDOW_MS;
  const rateLimitMaxAttempts = config.rateLimit?.maxAttempts ?? DEFAULT_RATE_LIMIT_MAX_ATTEMPTS;

  const { handleTwoFactorSignIn, rehashMigratedCredential } = createSessionIssuer(component, {
    sessionTtlMs,
    refreshTokenTtlMs,
  });

  async function resolveUsername(username: string): Promise<string> {
    const normalized = normalizeUsername(username);
    if (!normalized) {
      throw new Error("Username is required");
    }
    if (
      normalized.length < minUsernameLength ||
      normalized.length > maxUsernameLength ||
      !isValidUsername(normalized)
    ) {
      throw new Error("Invalid username");
    }
    if (config.usernameValidator && !(await config.usernameValidator(normalized))) {
      throw new Error("Invalid username");
    }
    return normalized;
  }

  const signUpUsername = action({
    args: {
      username: v.string(),
      password: v.string(),
      name: v.optional(v.string()),
      displayUsername: v.optional(v.string()),
      email: v.optional(v.string()),
      image: v.optional(v.string()),
      callbackURL: v.optional(v.string()),
      rememberMe: v.optional(v.boolean()),
      captchaToken: v.optional(v.string()),
    },
    returns: nativeAuthSessionValidator,
    handler: async (ctx, args) => {
      if (!enabled) {
        throw new Error("Username authentication is disabled");
      }
      if (disableSignUp) {
        throw new Error("Sign up is disabled");
      }

      await requireCaptcha(config.captcha, args.captchaToken);

      const now = Date.now();
      const username = await resolveUsername(args.username);
      const displayUsername = args.displayUsername?.trim() || args.username.trim();

      const normalizedEmail = normalizeEmail(args.email);
      if (args.email !== undefined && !(normalizedEmail && isValidEmail(normalizedEmail))) {
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

      const credentialHash = await hashPassword(args.password);

      let initialSession:
        | {
            sessionId: string;
            sessionExpiresAt: number;
            refreshTokenHash: string;
            refreshTokenExpiresAt: number;
          }
        | undefined;
      let refreshToken: string | undefined;
      if (autoSignIn) {
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

      const subject = crypto.randomUUID();
      const result = await ctx.runMutation(component.identity.provisionFromIdentity, {
        identity: {
          identityId: subject,
          provider: "username",
          issuer: "native",
          subject,
          tokenIdentifier: subject,
          emailVerified: false,
          sessionId: null,
        },
        user: {
          email: normalizedEmail,
          username,
          displayUsername,
          name: args.name,
          image: args.image,
          emailVerified: false,
        },
        account: { credentialHash },
        initialSession,
        allowLink: false,
      });

      if (result.duplicate) {
        if (result.user && config.onExistingUserSignUp) {
          await config.onExistingUserSignUp({ user: toNativeAuthUser(result.user) });
        }
        throw new Error(
          result.duplicateField === "username"
            ? "Username is already taken"
            : "User already exists",
        );
      }

      if (!result.user || !result.identityId) {
        throw new Error("Failed to create user");
      }

      if (!autoSignIn) {
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

  const signInUsername = action({
    args: {
      username: v.string(),
      password: v.string(),
      callbackURL: v.optional(v.string()),
      rememberMe: v.optional(v.boolean()),
      trustedDeviceToken: v.optional(v.string()),
      landingVerifier: v.optional(v.string()),
    },
    returns: nativeAuthSessionValidator,
    handler: async (ctx, args) => {
      if (!enabled) {
        throw new Error("Username authentication is disabled");
      }

      const username = normalizeUsername(args.username);
      if (!username) {
        throw new Error("Invalid username or password");
      }

      const windowStart = Math.floor(Date.now() / rateLimitWindowMs) * rateLimitWindowMs;
      const rateLimit = await ctx.runMutation(component.native.rateLimits.recordAttempt, {
        identifier: `sign-in:username:${username}`,
        windowStart,
        windowMs: rateLimitWindowMs,
        maxAttempts: rateLimitMaxAttempts,
      });
      if (!rateLimit.allowed) {
        throw new Error("Too many requests");
      }

      const auth = await ctx.runQuery(component.identity.getUserAndAccountByUsername, {
        username,
      });
      if (!auth) {
        await hashPassword(args.password);
        await padBcryptCompare(args.password);
        throw new Error("Invalid username or password");
      }
      const { user, identity, account } = auth;

      if (!account || !(await verifyPasswordHash(args.password, account.credentialHash))) {
        await hashPassword(args.password);
        await padBcryptCompare(args.password);
        throw new Error("Invalid username or password");
      }

      await rehashMigratedCredential(ctx, account, args.password);

      if (requireVerifiedEmail && user.email && !user.emailVerified) {
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
        landingVerifier: args.landingVerifier,
      };
    },
  });

  return { signUpUsername, signInUsername };
}
