import { action } from "../../component/_generated/server.js";
import type { FunctionReference, GenericActionCtx } from "convex/server";
import type { DataModel } from "../../component/_generated/dataModel.js";
import { v } from "convex/values";
import { generateEmailOtp, hashToken } from "./tokens.js";
import { hashPassword } from "./password.js";
import { nativeAuthSessionValidator } from "./provider.js";
import {
  toNativeAuthUser,
  type NativeEmailAndPasswordComponentHandle,
  type VerificationCodeType,
} from "./types.js";

/**
 * Common RFC-style email validation regex.
 */
const EMAIL_REGEX =
  /^(?!\.)(?!.*\.\.)([A-Z0-9_+-]\.?)+[A-Z0-9_+-]@([A-Z0-9][A-Z0-9-]*\.)+[A-Z]{2,}$/i;

function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

const EMAIL_OTP_TTL_MS = 5 * 60 * 1000;
const DEFAULT_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_MIN_PASSWORD_LENGTH = 8;
const DEFAULT_MAX_PASSWORD_LENGTH = 128;

export type EmailOtpType = "sign-in" | "email-verification" | "forget-password" | "change-email";

export type NativeAuthSendResult =
  | { status: "queued"; emailId: string }
  | { status: "not_configured"; reason: string }
  | { status: "failed"; reason: string };

export type NativeAuthVerifyResult = { success: boolean; reason?: string };
export type NativeAuthResetResult = { status: boolean; reason?: string };
export type NativeAuthChangeEmailResult = { status: boolean; reason?: string };

export type NativeAuthVerifyEmailOtpResult =
  | {
      token: string | null;
      refreshToken: string;
      sessionId: string;
      user: ReturnType<typeof toNativeAuthUser>;
      userId: string;
      identityId?: string;
    }
  | NativeAuthVerifyResult
  | NativeAuthResetResult
  | NativeAuthChangeEmailResult;

export type EmailOtpSender = (data: {
  email: string;
  otp: string;
  type: EmailOtpType;
}) => Promise<string>;

export type NativeEmailOtpConfig = {
  enabled?: boolean;
  sendVerificationOTP: EmailOtpSender;
  expiresInMs?: number;
  disableSignUp?: boolean;
  sessionTtlMs?: number;
  refreshTokenTtlMs?: number;
  minPasswordLength?: number;
  maxPasswordLength?: number;
};

export type NativeEmailOtpFunctionReferences = {
  [K in keyof NativeEmailOtpActions]: FunctionReference<"action", "public">;
};

type SendVerificationOtpBody = {
  email: string;
  type?: EmailOtpType;
  name?: string;
};

type VerifyEmailOtpBody = {
  email: string;
  otp: string;
  type?: EmailOtpType;
  newPassword?: string;
};

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

function toVerificationCodeType(type: EmailOtpType): VerificationCodeType {
  switch (type) {
    case "email-verification":
      return "email_verification";
    case "forget-password":
      return "password_reset";
    case "change-email":
      return "email_change";
    default:
      throw new Error(`Unsupported email OTP type: ${type}`);
  }
}

export function nativeEmailOtp(
  component: NativeEmailAndPasswordComponentHandle,
  config: NativeEmailOtpConfig,
) {
  const enabled = config.enabled ?? true;
  const expiresInMs = config.expiresInMs ?? EMAIL_OTP_TTL_MS;
  const disableSignUp = config.disableSignUp ?? false;
  const sessionTtlMs = config.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
  const refreshTokenTtlMs = config.refreshTokenTtlMs ?? DEFAULT_REFRESH_TOKEN_TTL_MS;
  const minPasswordLength = config.minPasswordLength ?? DEFAULT_MIN_PASSWORD_LENGTH;
  const maxPasswordLength = config.maxPasswordLength ?? DEFAULT_MAX_PASSWORD_LENGTH;

  const sendVerificationOtp = action({
    args: {
      email: v.string(),
      type: v.optional(v.string()),
      name: v.optional(v.string()),
    },
    returns: v.object({
      status: v.union(v.literal("queued"), v.literal("not_configured"), v.literal("failed")),
      reason: v.optional(v.string()),
      emailId: v.optional(v.string()),
    }),
    handler: async (ctx: GenericActionCtx<DataModel>, args: SendVerificationOtpBody) => {
      if (!enabled) {
        throw new Error("Email OTP authentication is disabled");
      }

      const type: EmailOtpType = (args.type as EmailOtpType) ?? "sign-in";
      const normalizedEmail = args.email.trim().toLowerCase();
      if (!isValidEmail(normalizedEmail)) {
        throw new Error("Invalid email");
      }

      const otp = generateEmailOtp();
      const now = Date.now();
      const expiresAt = now + expiresInMs;

      if (type === "sign-in") {
        const otpHash = await hashToken(otp + normalizedEmail);

        const metadata = JSON.stringify({
          email: normalizedEmail,
          name: args.name,
        });

        await ctx.runMutation(component.native.verifiers.createVerifier, {
          verifierId: otpHash,
          type: "email-otp",
          metadata,
          expiresAt,
        });
      } else {
        let userId: string | null = null;

        if (type === "change-email") {
          const identity = await ctx.auth.getUserIdentity();
          if (!identity) {
            throw new Error("UNAUTHORIZED");
          }
          const user = await ctx.runQuery(component.native.users.getUserById, {
            userId: identity.subject,
          });
          if (!user) {
            throw new Error("UNAUTHORIZED");
          }
          userId = identity.subject;
        } else {
          const user = await ctx.runQuery(component.native.users.getUserByEmail, {
            email: normalizedEmail,
          });
          if (!user) {
            /** Obscure the missing user to avoid email enumeration. */
            return { status: "queued" as const, emailId: "noop" };
          }
          userId = user._id;
        }

        const tokenHash = await hashToken(otp + normalizedEmail);
        await ctx.runMutation(component.native.codes.createVerificationCode, {
          userId,
          type: toVerificationCodeType(type),
          tokenHash,
          expiresAt,
        });
      }

      const emailId = await config.sendVerificationOTP({
        email: normalizedEmail,
        otp,
        type,
      });

      return { status: "queued" as const, emailId };
    },
  });

  const verifyEmailOtp = action({
    args: {
      email: v.string(),
      otp: v.string(),
      type: v.optional(v.string()),
      newPassword: v.optional(v.string()),
    },
    returns: v.union(
      nativeAuthSessionValidator,
      v.object({
        success: v.boolean(),
        reason: v.optional(v.string()),
      }),
      v.object({
        status: v.boolean(),
        reason: v.optional(v.string()),
      }),
    ),
    handler: async (ctx: GenericActionCtx<DataModel>, args: VerifyEmailOtpBody) => {
      if (!enabled) {
        throw new Error("Email OTP authentication is disabled");
      }

      const type: EmailOtpType = (args.type as EmailOtpType) ?? "sign-in";
      const normalizedEmail = args.email.trim().toLowerCase();
      if (!isValidEmail(normalizedEmail)) {
        throw new Error("Invalid email");
      }

      if (type === "sign-in") {
        const otpHash = await hashToken(args.otp + normalizedEmail);
        const verifier = await ctx.runMutation(component.native.verifiers.consumeVerifier, {
          verifierId: otpHash,
        });
        if (!verifier) {
          throw new Error("INVALID_OTP");
        }

        let metadata: { email?: string; name?: string };
        try {
          metadata = verifier.metadata ? JSON.parse(verifier.metadata) : {};
        } catch {
          throw new Error("INVALID_OTP");
        }

        const email = metadata.email?.trim().toLowerCase();
        if (!email || email !== normalizedEmail) {
          throw new Error("INVALID_OTP");
        }

        const existingUser = await ctx.runQuery(component.native.users.getUserByEmail, { email });
        if (!existingUser && disableSignUp) {
          throw new Error("SIGN_UP_DISABLED");
        }

        const now = Date.now();
        const sessionId = crypto.randomUUID();
        const refreshToken = generateEmailOtp();
        const refreshTokenHash = await hashToken(refreshToken);

        const result = await ctx.runMutation(component.identity.provisionFromIdentity, {
          identity: {
            identityId: `email-otp:native:${email}`,
            provider: "emailOtp",
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
          throw new Error("INVALID_OTP");
        }

        return {
          token: result.token ?? null,
          refreshToken,
          sessionId: result.sessionId ?? sessionId,
          user: toNativeAuthUser(result.user),
          userId: result.userId,
          identityId: result.identityId,
        };
      }

      const tokenHash = await hashToken(args.otp + normalizedEmail);

      if (type === "email-verification") {
        const result = await ctx.runMutation(component.identity.verifyEmail, {
          tokenHash,
          provider: "emailOtp",
          issuer: "native",
        });
        return { success: result.success, reason: result.reason };
      }

      if (type === "forget-password") {
        if (!args.newPassword) {
          return { status: false, reason: "missing_password" };
        }

        const passwordValidation = validatePassword(
          args.newPassword,
          minPasswordLength,
          maxPasswordLength,
        );
        if (!passwordValidation.valid) {
          return {
            status: false,
            reason:
              passwordValidation.reason === "too_short"
                ? "password_too_short"
                : "password_too_long",
          };
        }

        const credentialHash = await hashPassword(args.newPassword);
        const result = await ctx.runMutation(component.identity.resetPassword, {
          tokenHash,
          credentialHash,
          provider: "password",
          issuer: "native",
          revokeSessions: true,
        });

        if (result.status) {
          return { status: true };
        }

        /** A valid code with no existing password account can still set a
         * new password. */
        if (result.reason === "invalid") {
          const code = await ctx.runQuery(component.native.codes.getVerificationCodeByTokenHash, {
            tokenHash,
            type: "password_reset",
          });
          if (code && !code.consumedAt && code.expiresAt > Date.now()) {
            const user = await ctx.runQuery(component.native.users.getUserById, {
              userId: code.userId,
            });
            if (user) {
              const existingPasswordIdentity = await ctx.runQuery(
                component.native.identities.getNativeIdentityByUser,
                {
                  userId: user._id,
                  provider: "password",
                  issuer: "native",
                },
              );

              if (existingPasswordIdentity) {
                await ctx.runMutation(component.native.accounts.createAccount, {
                  userId: user._id,
                  provider: "password",
                  issuer: "native",
                  subject: existingPasswordIdentity.subject,
                  credentialHash,
                });
              } else {
                await ctx.runMutation(component.identity.provisionFromIdentity, {
                  identity: {
                    identityId: crypto.randomUUID(),
                    provider: "password",
                    issuer: "native",
                    subject: crypto.randomUUID(),
                    tokenIdentifier: crypto.randomUUID(),
                    email: normalizedEmail,
                    emailVerified: true,
                  },
                  user: {
                    email: normalizedEmail,
                    name: user.name,
                    emailVerified: true,
                  },
                  account: { credentialHash },
                  allowLink: true,
                });
              }

              await ctx.runMutation(component.native.codes.consumeVerificationCode, {
                tokenHash,
                type: "password_reset",
              });

              return { status: true };
            }
          }
        }

        return { status: false, reason: result.reason ?? "invalid" };
      }

      if (type === "change-email") {
        const result = await ctx.runMutation(component.identity.changeEmail, {
          tokenHash,
          newEmail: normalizedEmail,
        });
        return { status: result.status, reason: result.reason };
      }

      throw new Error(`Unsupported email OTP type: ${type}`);
    },
  });

  return { sendVerificationOtp, verifyEmailOtp };
}

export type NativeEmailOtpActions = ReturnType<typeof nativeEmailOtp>;
