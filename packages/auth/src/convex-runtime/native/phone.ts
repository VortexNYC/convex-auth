import { action } from "../../component/_generated/server.js";
import type { FunctionReference, GenericActionCtx } from "convex/server";
import type { DataModel } from "../../component/_generated/dataModel.js";
import { v } from "convex/values";
import { generateEmailOtp, generateVerificationToken, hashToken } from "./tokens.js";
import { nativeAuthSessionValidator } from "./provider.js";
import {
  DEFAULT_RATE_LIMIT_MAX_ATTEMPTS,
  DEFAULT_RATE_LIMIT_WINDOW_MS,
  DEFAULT_REFRESH_TOKEN_TTL_MS,
  DEFAULT_SESSION_TTL_MS,
  isValidPhone,
  normalizePhone,
} from "./validation.js";
import { resolveSessionTtlMs } from "./sessionIssuer.js";
import type { PhoneOtpSender } from "../providers/twilio.js";
import { toNativeAuthUser, type NativeEmailAndPasswordComponentHandle } from "./types.js";

const PHONE_OTP_TTL_MS = 5 * 60 * 1000;

export type PhoneOtpType = "sign-in" | "phone-verification";

export type NativePhoneSendResult =
  | { status: "queued"; messageId: string }
  | { status: "queued"; messageId: "noop" }
  | { status: "not_configured"; reason: string }
  | { status: "failed"; reason: string };

export type NativePhoneVerifyResult =
  | {
      token: string | null;
      refreshToken: string;
      sessionId: string;
      user: ReturnType<typeof toNativeAuthUser>;
      userId: string;
      identityId?: string;
    }
  | { success: boolean; reason?: string };

export type NativePhoneConfig = {
  enabled?: boolean;
  /**
   * SMS sender — e.g. `createTwilioSmsOtpSender({...})` from
   * `@vortex-api/convex-auth/providers/twilio`, or any custom
   * `({ phone, otp, type }) => Promise<string>` implementation.
   */
  sendPhoneOtp: PhoneOtpSender;
  expiresInMs?: number;
  disableSignUp?: boolean;
  sessionTtlMs?: number;
  refreshTokenTtlMs?: number;
  /**
   * Rate limiting applied per normalized phone number on both OTP sends and
   * verify attempts. Enabled by default (5 attempts per 60s window) — SMS
   * sends cost money and a 6-digit code is brute-forceable without an
   * attempt bound. Pass `false` to disable.
   */
  rateLimit?:
    | {
        windowMs?: number;
        maxAttempts?: number;
      }
    | false;
};

export type NativePhoneActions = ReturnType<typeof nativePhone>;

export type NativePhoneFunctionReferences = {
  sendPhoneOtp: FunctionReference<"action", "public">;
  verifyPhoneOtp: FunctionReference<"action", "public">;
};

type SendPhoneOtpBody = {
  phone: string;
  type?: PhoneOtpType;
  name?: string;
};

type VerifyPhoneOtpBody = {
  phone: string;
  otp: string;
  type?: PhoneOtpType;
  rememberMe?: boolean;
};

function requirePhone(phone: string): string {
  const normalized = normalizePhone(phone);
  if (!normalized || !isValidPhone(normalized)) {
    throw new Error("Invalid phone number");
  }
  return normalized;
}

export function nativePhone(
  component: NativeEmailAndPasswordComponentHandle,
  config: NativePhoneConfig,
) {
  const enabled = config.enabled ?? true;
  const expiresInMs = config.expiresInMs ?? PHONE_OTP_TTL_MS;
  const disableSignUp = config.disableSignUp ?? false;
  const sessionTtlMs = config.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
  const refreshTokenTtlMs = config.refreshTokenTtlMs ?? DEFAULT_REFRESH_TOKEN_TTL_MS;
  const rateLimitConfig = config.rateLimit === false ? undefined : config.rateLimit;
  const rateLimitWindowMs = rateLimitConfig?.windowMs ?? DEFAULT_RATE_LIMIT_WINDOW_MS;
  const rateLimitMaxAttempts = rateLimitConfig?.maxAttempts ?? DEFAULT_RATE_LIMIT_MAX_ATTEMPTS;
  const rateLimitEnabled = config.rateLimit !== false;

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

  const sendPhoneOtp = action({
    args: {
      phone: v.string(),
      type: v.optional(v.string()),
      name: v.optional(v.string()),
    },
    returns: v.object({
      status: v.union(v.literal("queued"), v.literal("not_configured"), v.literal("failed")),
      reason: v.optional(v.string()),
      messageId: v.optional(v.string()),
    }),
    handler: async (ctx: GenericActionCtx<DataModel>, args: SendPhoneOtpBody) => {
      if (!enabled) {
        throw new Error("Phone authentication is disabled");
      }

      const type: PhoneOtpType = (args.type as PhoneOtpType) ?? "sign-in";
      const phone = requirePhone(args.phone);

      if (rateLimitEnabled) {
        await recordRateLimitAttempt(ctx, `send-phone-otp:${phone}`);
      }

      const otp = generateEmailOtp();
      const now = Date.now();
      const expiresAt = now + expiresInMs;

      if (type === "sign-in") {
        const otpHash = await hashToken(otp + phone);

        const metadata = JSON.stringify({
          phone,
          name: args.name,
        });

        await ctx.runMutation(component.native.verifiers.createVerifier, {
          verifierId: otpHash,
          type: "phone-otp",
          metadata,
          expiresAt,
        });
      } else if (type === "phone-verification") {
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
        /* The code is bound to the session user's stored number so a
         * verification OTP can never be harvested for a phone the user
         * does not already own. */
        if (normalizePhone(user.phoneNumber) !== phone) {
          throw new Error("Phone number does not match the account's phone number");
        }

        const tokenHash = await hashToken(otp + phone);
        await ctx.runMutation(component.native.codes.createVerificationCode, {
          userId: user._id,
          type: "phone_verification",
          tokenHash,
          expiresAt,
        });
      } else {
        throw new Error(`Unsupported phone OTP type: ${type}`);
      }

      const messageId = await config.sendPhoneOtp({ phone, otp, type });

      return { status: "queued" as const, messageId };
    },
  });

  const verifyPhoneOtp = action({
    args: {
      phone: v.string(),
      otp: v.string(),
      type: v.optional(v.string()),
      rememberMe: v.optional(v.boolean()),
    },
    returns: v.union(
      nativeAuthSessionValidator,
      v.object({
        success: v.boolean(),
        reason: v.optional(v.string()),
      }),
    ),
    handler: async (ctx: GenericActionCtx<DataModel>, args: VerifyPhoneOtpBody) => {
      if (!enabled) {
        throw new Error("Phone authentication is disabled");
      }

      const type: PhoneOtpType = (args.type as PhoneOtpType) ?? "sign-in";
      const phone = requirePhone(args.phone);

      if (rateLimitEnabled) {
        await recordRateLimitAttempt(ctx, `verify-phone-otp:${phone}`);
      }

      const otpHash = await hashToken(args.otp + phone);

      if (type === "sign-in") {
        const verifier = await ctx.runMutation(component.native.verifiers.consumeVerifier, {
          verifierId: otpHash,
        });
        if (!verifier) {
          throw new Error("INVALID_OTP");
        }

        let metadata: { phone?: string; name?: string };
        try {
          metadata = verifier.metadata ? JSON.parse(verifier.metadata) : {};
        } catch {
          throw new Error("INVALID_OTP");
        }

        if (normalizePhone(metadata.phone) !== phone) {
          throw new Error("INVALID_OTP");
        }

        const existingUser = await ctx.runQuery(component.native.users.getUserByPhoneNumber, {
          phoneNumber: phone,
        });
        if (!existingUser && disableSignUp) {
          throw new Error("SIGN_UP_DISABLED");
        }

        const now = Date.now();
        const sessionId = crypto.randomUUID();
        const refreshToken = generateVerificationToken();
        const refreshTokenHash = await hashToken(refreshToken);

        const result = await ctx.runMutation(component.identity.provisionFromIdentity, {
          identity: {
            identityId: `phone-otp:native:${phone}`,
            provider: "phoneOtp",
            issuer: "native",
            subject: phone,
            tokenIdentifier: phone,
            emailVerified: false,
          },
          user: {
            phoneNumber: phone,
            phoneNumberVerified: true,
            name: metadata.name,
            emailVerified: false,
          },
          allowLink: true,
          initialSession: {
            sessionId,
            sessionExpiresAt: now + resolveSessionTtlMs(args.rememberMe, sessionTtlMs),
            refreshTokenHash,
            refreshTokenExpiresAt: now + refreshTokenTtlMs,
          },
        });

        if (result.duplicate) {
          /* A phoneNumber collision means the number is bound to an account
           * that has no phoneOtp identity — provisioning refuses to link
           * (SMS proof alone is too weak to bind a pre-existing account;
           * phone numbers get recycled). */
          throw new Error("Phone number is already in use");
        }

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

      if (type === "phone-verification") {
        const result = await ctx.runMutation(component.identity.verifyPhone, {
          tokenHash: otpHash,
          phone,
        });
        return { success: result.success, reason: result.reason };
      }

      throw new Error(`Unsupported phone OTP type: ${type}`);
    },
  });

  return { sendPhoneOtp, verifyPhoneOtp };
}
